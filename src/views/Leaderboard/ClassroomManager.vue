<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { studentIdentity, studentLabel, normalizeNameTag, validNameTag, updateStudentNameTag, avatarFor, bindStudentRole, normalizeGender, classStatistics, clearClassroomRoster, createClassroom, importCandidates, parseDelimited, recognizeRows, restoreClassroomRoster, type ClassroomStore, type ImportCandidate, type RosterSnapshot, type Gender } from './leaderboardData'
import { downloadBlob, exportClassrooms, createImportTemplate, normalizeAvatar, readExcelCandidates } from './leaderboardExcel'
import { validProfileText } from './leaderboardData'
import { fillMissingMaterials, type Material } from './materialLibrary'

const props = defineProps<{ modelValue: ClassroomStore; selectedId: string; materials: Material[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: ClassroomStore]; close: [] }>()
const active = computed(() => props.modelValue.classes.find(group => group.id === props.modelValue.activeClassId) ?? props.modelValue.classes[0])
const bindingId = ref(props.selectedId)
const selected = computed(() => active.value.students.find(student => student.id === bindingId.value) ?? active.value.students[0])
const tagDraft = ref('')
watch(() => [selected.value?.id, selected.value?.nameTag], () => { tagDraft.value = selected.value?.nameTag ?? '' }, { immediate: true })
function saveNameTag() {
  if (!selected.value) return
  try {
    replace(updateStudentNameTag(props.modelValue, active.value.id, selected.value.id, tagDraft.value))
    notice.value = '重名标识已保存，原有积分、图片、路线和座右铭已保留'
  } catch (error) { notice.value = error instanceof Error ? error.message : '保存失败' }
}
watch(() => active.value.id, () => { bindingId.value = active.value.students[0]?.id ?? '' })
watch(() => props.selectedId, id => { bindingId.value = id })
const newClassName = ref(''), renameDraft = ref('')
const text = ref(''), notice = ref(''), busy = ref('')
const preview = ref<ImportCandidate[]>([]), overwrite = ref(false)
const confirmClearId = ref('')
const confirmRosterId = ref('')
const rosterUndo = ref<RosterSnapshot>()
const undo = ref<{ id: string; scores: Record<string, number> }>()
const stats = computed(() => classStatistics(active.value))
const included = computed(() => preview.value.filter(row => row.include))
const invalid = computed(() => included.value.some(row => row.error || !row.name.trim() || !row.className.trim() || !Number.isInteger(row.score) || row.score < 0))
watch(() => active.value.id, () => { renameDraft.value = active.value.name; confirmClearId.value = ''; confirmRosterId.value = '' }, { immediate: true })
function replace(value: ClassroomStore) { emit('update:modelValue', value) }
function switchClass(id: string) { replace({ ...props.modelValue, activeClassId: id }) }
function addClass() {
  const name = newClassName.value.trim()
  if (!name) return
  if (props.modelValue.classes.some(group => group.name === name)) { notice.value = '已有同名班级'; return }
  const group = createClassroom(name)
  replace({ ...props.modelValue, activeClassId: group.id, classes: [...props.modelValue.classes, group] })
  newClassName.value = ''; notice.value = `已创建 ${name}`
}
function renameClass() {
  const name = renameDraft.value.trim()
  if (!name || props.modelValue.classes.some(group => group.id !== active.value.id && group.name === name)) { notice.value = '班级名称不能为空或重复'; return }
  replace({ ...props.modelValue, classes: props.modelValue.classes.map(group => group.id === active.value.id ? { ...group, name } : group) })
  notice.value = '班级名称已保存'
}
function validatePreview() {
  for (const row of preview.value) row.error = !validNameTag(row.nameTag) ? '重名标识最多2个字' : !row.name.trim() || !row.className.trim() ? '姓名和班级不能为空' : !normalizeGender(row.gender) ? '请选择性别' : !Number.isInteger(row.score) || row.score < 0 ? '分数须为非负整数' : row.name.length > 60 || row.className.length > 60 ? '姓名或班级名称过长' : undefined
  for (const row of preview.value) if (!row.error && (!validProfileText(row.personality) || !validProfileText(row.hobbies))) row.error = '性格和爱好各最多120字'
  const roles = new Map<string, Map<string, { key: string; label: string }>>()
  for (const group of props.modelValue.classes) roles.set(group.name, new Map(group.students.filter(student => student.avatar).map(student => [student.avatar!, { key: studentIdentity(group.name, student), label: studentLabel(student) }])))
  for (const row of preview.value) {
    if (!row.include || row.error || !row.avatar) continue
    const className = row.className.trim()
    const key = studentIdentity(className, row)
    const existing = props.modelValue.classes.find(group => group.name === className)?.students.find(student => studentIdentity(className, student) === key)
    if (existing && !overwrite.value) continue
    const used = roles.get(className) ?? new Map<string, { key: string; label: string }>()
    roles.set(className, used)
    const owner = used.get(row.avatar)
    if (owner && owner.key !== key) row.error = `角色已绑定给${owner.label}`
    else used.set(row.avatar, { key, label: studentLabel(row) })
  }
}
watch(overwrite, validatePreview)
function recognizeText() {
  try {
    preview.value = recognizeRows(parseDelimited(text.value), active.value.name)
    validatePreview()
    notice.value = preview.value.length ? `识别到 ${preview.value.length} 行，请核对后确认导入` : '没有识别到姓名'
  } catch (error) { notice.value = String(error instanceof Error ? error.message : error) }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  busy.value = '正在识别名单…'
  try {
    if (/\.xlsx$/i.test(file.name)) preview.value = await readExcelCandidates(file, active.value.name)
    else if (/\.(csv|txt|tsv)$/i.test(file.name)) {
      if (file.size > 20 * 1024 * 1024) throw new Error('名单文件请小于20MB')
      const buffer = await file.arrayBuffer()
      let content = new TextDecoder('utf-8').decode(buffer)
      if (content.includes('\ufffd')) content = new TextDecoder('gb18030').decode(buffer)
      preview.value = recognizeRows(parseDelimited(content), active.value.name)
    } else throw new Error('支持.xlsx、.csv、.tsv、.txt；旧版.xls请另存为.xlsx')
    validatePreview()
    notice.value = preview.value.length ? `识别到 ${preview.value.length} 行，请核对班级、性别、角色图片与分数` : '未识别到名单，请使用模板中的表头'
  } catch (error) { notice.value = error instanceof Error ? error.message : '读取文件失败，请检查格式' }
  finally { busy.value = ''; input.value = '' }
}
function confirmImport() {
  validatePreview()
  if (!included.value.length || invalid.value) return
  try {
    const result = importCandidates(props.modelValue, preview.value, overwrite.value)
    replace(fillMissingMaterials(result.store, props.materials))
    notice.value = `已新增 ${result.added} 人，更新 ${result.updated} 人，跳过唯一标识相同 ${result.skipped} 人。路线已自动分配。`
    preview.value = []; text.value = ''
  } catch (error) { notice.value = error instanceof Error ? error.message : '导入失败' }
}
function clearScores() {
  const group = props.modelValue.classes.find(item => item.id === confirmClearId.value)
  if (!group) return
  undo.value = { id: group.id, scores: Object.fromEntries(group.students.map(student => [student.id, student.score])) }
  replace({ ...props.modelValue, classes: props.modelValue.classes.map(item => item.id === group.id ? { ...item, students: item.students.map(student => ({ ...student, score: 0 })) } : item) })
  confirmClearId.value = ''; notice.value = `${group.name} 的积分已清零，名单、图片和座右铭已保留`
}
function undoClear() {
  const snapshot = undo.value
  if (!snapshot) return
  replace({ ...props.modelValue, classes: props.modelValue.classes.map(group => group.id === snapshot.id ? { ...group, students: group.students.map(student => ({ ...student, score: student.score === 0 ? snapshot.scores[student.id] ?? 0 : student.score })) } : group) })
  undo.value = undefined; notice.value = '已恢复清零前的分数'
}
function clearRoster() {
  if (!confirmRosterId.value) return
  const group = props.modelValue.classes.find(item => item.id === confirmRosterId.value)
  if (!group) return
  const result = clearClassroomRoster(props.modelValue, group.id)
  rosterUndo.value = result.snapshot
  if (undo.value?.id === group.id) undo.value = undefined
  replace(result.store)
  confirmRosterId.value = ''
  notice.value = `${group.name} 的名单已清空，人数为0；班级和线路段数已保留。关闭本窗口前可撤销。`
}
function undoRosterClear() {
  if (!rosterUndo.value) return
  replace(restoreClassroomRoster(props.modelValue, rosterUndo.value))
  rosterUndo.value = undefined
  notice.value = '已恢复清空前的队员、图片、积分和路线；清空后新增的队员也已保留。'
}
async function changePhoto(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], member = selected.value
  if (!file || !member) return
  const classId = active.value.id
  busy.value = '正在处理图片…'
  try {
    const avatar = await normalizeAvatar(file)
    replace(bindStudentRole(props.modelValue, classId, member.id, member.gender, avatar))
    notice.value = `已将角色图片绑定给 ${studentLabel(member)}`
  } catch (error) { notice.value = error instanceof Error ? error.message : '图片读取失败' }
  finally { busy.value = ''; input.value = '' }
}
function changeGender(event: Event) {
  const member = selected.value
  if (!member) return
  try { replace(bindStudentRole(props.modelValue, active.value.id, member.id, (event.target as HTMLSelectElement).value as Gender, member.avatar)) }
  catch (error) { notice.value = error instanceof Error ? error.message : '更新失败' }
}
function resetRole() {
  const member = selected.value
  if (!member) return
  replace(bindStudentRole(props.modelValue, active.value.id, member.id, member.gender))
  notice.value = `已恢复 ${studentLabel(member)} 的默认${member.gender}生角色`
}
async function download(all: boolean) {
  busy.value = '正在生成含图片的Excel…'
  const groups = all ? [...props.modelValue.classes] : [active.value]
  const title = all ? '全部班级' : active.value.name.replace(/[\\/:*?"<>|]/g, '_')
  try {
    const response = await fetch('/images/leaderboard/default-avatar.png')
    if (!response.ok) throw new Error('默认人物图片加载失败')
    const avatar = await normalizeAvatar(await response.blob())
    const girlResponse = await fetch('/images/leaderboard/default-girl.png')
    if (!girlResponse.ok) throw new Error('默认女生图片加载失败')
    const girl = await normalizeAvatar(await girlResponse.blob())
    const blob = await exportClassrooms(groups, avatar, girl)
    downloadBlob(blob, `${title}-攀登榜-${new Date().toLocaleDateString('sv-SE')}.xlsx`)
    notice.value = 'Excel已生成，包含姓名、性别、性格、爱好、嵌入角色图片和分数'
  } catch (error) { notice.value = error instanceof Error ? error.message : '导出失败' }
  finally { busy.value = '' }
}
async function downloadTemplate() {
  busy.value = '正在生成模板…'
  try { downloadBlob(await createImportTemplate(), '攀登榜名单导入模板.xlsx') }
  catch (error) { notice.value = error instanceof Error ? error.message : '模板生成失败' }
  finally { busy.value = '' }
}
</script>

<template>
  <section class="classroom-manager" role="dialog" aria-modal="true" aria-label="班级与名单管理">
    <header class="manager-heading"><div><small>CLASSROOMS</small><h2>班级与名单</h2></div><button type="button" class="close" aria-label="关闭班级管理" @click="emit('close')">×</button></header>
    <div class="manager-body">
      <aside class="class-list">
        <button v-for="group in modelValue.classes" :key="group.id" type="button" class="class-card" :class="{ active: group.id === active.id }" @click="switchClass(group.id)"><strong>{{ group.name }}</strong><small>{{ group.students.length }}人 · {{ classStatistics(group).total }}分</small></button>
        <form class="new-class" @submit.prevent="addClass"><input v-model="newClassName" maxlength="60" aria-label="新班级名称" placeholder="新班级名称" /><button type="submit">新增班级</button></form>
      </aside>
      <div class="class-content">
        <div class="class-name"><input v-model="renameDraft" maxlength="60" aria-label="当前班级名称" /><button type="button" @click="renameClass">保存名称</button></div>
        <div class="class-stats"><span>人数 <b>{{ stats.count }}</b></span><span>总分 <b>{{ stats.total }}</b></span><span>平均分 <b>{{ stats.average.toFixed(1) }}</b></span><span>已登顶 <b>{{ stats.finished }}</b></span></div>
        <div class="class-actions">
          <button type="button" :disabled="!!busy" @click="download(false)">导出当前班级Excel</button><button type="button" :disabled="!!busy" @click="download(true)">导出全部班级</button>
          <button type="button" :disabled="!!busy" @click="downloadTemplate">下载Excel模板</button>
          <button type="button" class="danger" :disabled="!!busy || !active.students.length" @click="confirmClearId = active.id; confirmRosterId = ''">当前班级积分清零</button>
          <button type="button" class="danger" :disabled="!!busy || !active.students.length" @click="confirmRosterId = active.id; confirmClearId = ''">清空当前班级名单（人数归零）</button>
          <button v-if="undo" type="button" @click="undoClear">撤销上次清零</button>
          <button v-if="rosterUndo" type="button" @click="undoRosterClear">撤销清空名单</button>
        </div>
        <div v-if="confirmClearId" class="clear-confirm"><p>将“{{ active.name }}”的{{ stats.count }}位队员积分归零，保留名单、图片和座右铭。</p><button type="button" class="danger" @click="clearScores">确认清零当前班级</button><button type="button" @click="confirmClearId = ''">取消</button></div>
        <div v-if="confirmRosterId" class="clear-confirm"><p>将清空“{{ active.name }}”的{{ stats.count }}位队员，人数变为0。姓名、图片、积分、座右铭及人物路线都会移除；班级、线路段数和其他班级保留。建议先导出Excel备份，关闭本窗口前可撤销。</p><button type="button" class="danger" @click="clearRoster">确认清空当前班级名单</button><button type="button" @click="confirmRosterId = ''">取消</button></div>
        <section v-if="selected" class="role-binding" aria-label="按班级绑定角色">
          <h3>姓名与角色绑定 · {{ active.name }}</h3>
          <div class="photo-tool"><label>队员 <select v-model="bindingId" aria-label="绑定角色的队员"><option v-for="student in active.students" :key="student.id" :value="student.id">{{ studentLabel(student) }}</option></select></label><label>性别 <select :value="selected.gender" aria-label="队员性别" @change="changeGender"><option>男</option><option>女</option></select></label><img :src="avatarFor(selected)" :alt="`${studentLabel(selected)}绑定的角色`" /><label class="file-button">上传并绑定角色<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="!!busy" @change="changePhoto" /></label><button type="button" :disabled="!!busy || !selected.avatar" @click="resetRole">恢复默认角色</button></div>
          <div class="identity-tool"><label>重名标识 <input v-model="tagDraft" maxlength="2" aria-label="队员重名标识" placeholder="选填，最多2个字" /></label><button type="button" :disabled="!!busy" @click="saveNameTag">保存标识</button><small>唯一标识：{{ active.name }} ＋ {{ selected.name }} ＋ {{ normalizeNameTag(selected.nameTag) || '（空）' }}。同班同名学生请填写不同标识。</small></div>
          <small>同班自定义角色图片不能重复绑定，其他班级可复用。未绑定时按性别显示默认男生或女生形象。</small>
        </section>
        <section class="roster-import" aria-label="分步名单录入">
          <h3>1. 录入名单</h3><p>粘贴文字或选择Excel/CSV。姓名、性别必填；自动识别班级、角色图片、分数、性格和爱好，未填分数为0。性格、爱好选填，各最多120字。</p>
          <textarea v-model="text" aria-label="批量文字名单" placeholder="班级&#9;姓名&#9;重名标识&#9;性别&#9;分数&#10;高一1班&#9;张三&#9;甲&#9;男&#9;0&#10;高一1班&#9;张三&#9;乙&#9;女&#9;0" />
          <div class="import-actions"><button type="button" :disabled="!!busy || !text.trim()" @click="recognizeText">识别文字名单</button><label class="file-button">选择Excel/CSV<input type="file" accept=".xlsx,.csv,.tsv,.txt" :disabled="!!busy" @change="readFile" /></label><small>未填班级时归入“{{ active.name }}”。同名可存在于不同班级。</small></div>
          <template v-if="preview.length">
            <h3>2. 核对识别结果</h3><p>按“班级＋姓名＋重名标识”匹配。标识选填，最多2个字；同名学生可用不同标识区分。唯一标识相同的已有队员默认跳过。</p>
            <div class="preview-scroll"><table><thead><tr><th>导入</th><th>班级</th><th>姓名</th><th>重名标识</th><th>性别</th><th>图片</th><th>分数</th><th>性格</th><th>爱好</th><th>检查</th></tr></thead><tbody><tr v-for="(row, index) in preview" :key="index"><td><input v-model="row.include" type="checkbox" :aria-label="`导入第${index + 1}行`" @change="validatePreview" /></td><td><input v-model="row.className" maxlength="60" :aria-label="`第${index + 1}行班级`" @input="validatePreview" /></td><td><input v-model="row.name" maxlength="60" :aria-label="`第${index + 1}行姓名`" @input="validatePreview" /></td><td><input v-model="row.nameTag" maxlength="2" :aria-label="`第${index + 1}行重名标识`" @input="validatePreview" /></td><td><select v-model="row.gender" :aria-label="`第${index + 1}行性别`" @change="validatePreview"><option value="">请选择</option><option>男</option><option>女</option></select></td><td><img :src="avatarFor(row)" alt="队员角色预览" /></td><td><input v-model.number="row.score" type="number" min="0" step="1" :aria-label="`第${index + 1}行分数`" @input="validatePreview" /></td><td><input v-model="row.personality" maxlength="120" aria-label="导入队员性格" @input="validatePreview" /></td><td><input v-model="row.hobbies" maxlength="120" aria-label="导入队员爱好" @input="validatePreview" /></td><td :class="{ warning: row.error }">{{ row.error || '可导入' }}</td></tr></tbody></table></div>
            <label class="overwrite"><input v-model="overwrite" type="checkbox" />更新唯一标识相同队员的性别、分数、图片、座右铭、性格和爱好（不勾选则保留现有数据；未提供性格/爱好列时保留原值，提供空白列时清空对应资料）</label>
            <h3>3. 确认导入</h3><button type="button" class="primary" :disabled="!!busy || !included.length || invalid" @click="confirmImport">确认导入{{ included.length }}人并自动分配路线</button>
          </template>
        </section>
        <p class="manager-notice" role="status">{{ busy || notice }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.identity-tool{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}.identity-tool input{width:130px}.identity-tool small{flex-basis:100%;overflow-wrap:anywhere}
.role-binding{margin-top:18px;padding:12px;border:1px solid #8eacc328;border-radius:10px}.role-binding h3{font-size:13px;margin:0 0 10px}.role-binding .photo-tool{margin-top:0}.role-binding small{display:block;margin-top:10px;color:#9db6cc;line-height:1.6}.role-binding .photo-tool img{width:52px;height:66px}.classroom-manager select{border:1px solid #7897b14d;border-radius:7px;background:#08172a;color:#e8f2fb;padding:6px;font:inherit;max-width:180px}.preview-scroll table{min-width:620px}
.classroom-manager{position:absolute;inset:18px 18px 100px;z-index:1600;display:flex;flex-direction:column;border:1px solid #9abbd044;border-radius:18px;background:#0d1c30fa;color:#e7f1fa;box-shadow:0 22px 60px #0008;overflow:hidden;font-size:12px}.manager-heading{display:flex;justify-content:space-between;align-items:center;padding:16px 22px;border-bottom:1px solid #8eacc328}.manager-heading small{font-size:9px;letter-spacing:.15em;color:#8eb3cb}.manager-heading h2{font-size:19px;margin:3px 0}.close{font-size:24px!important;padding:0 8px!important}.manager-body{display:grid;grid-template-columns:185px minmax(0,1fr);min-height:0;flex:1}.class-list{padding:14px;overflow:auto;background:#08142666;border-right:1px solid #8eacc328}.class-card{display:grid!important;text-align:left;gap:5px;width:100%;padding:11px!important;margin-bottom:7px}.class-card small{font-size:10px;color:#9cb8cc}.class-card.active{border-color:#7acbf0!important;background:#21415e!important}.new-class{display:grid;gap:7px;margin-top:16px}.class-content{padding:18px 22px;overflow:auto}.classroom-manager input,.classroom-manager textarea{box-sizing:border-box;border:1px solid #7897b14d;border-radius:7px;background:#08172a;color:#e8f2fb;padding:7px 9px;font:inherit;min-width:0}.classroom-manager button,.file-button,.class-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #86bfe63d;border-radius:8px;background:#25476466;color:#cae4f4;padding:7px 10px;font:inherit;text-decoration:none;cursor:pointer}.classroom-manager button:disabled{opacity:.4;cursor:default}.class-name{display:flex;gap:8px}.class-name input{font-size:16px;max-width:260px;font-weight:600}.class-stats{display:flex;gap:24px;margin:16px 0;color:#9db6cc}.class-stats b{color:#f7df9b;margin-left:5px;font-size:17px}.class-actions{display:flex;flex-wrap:wrap;gap:7px}.danger{color:#ffb3b0!important;border-color:#d879794d!important;background:#773d3d33!important}.clear-confirm{padding:10px 12px;margin:12px 0;background:#743f3f33;border:1px solid #d879794d;border-radius:9px}.clear-confirm p{margin:0 0 8px}.clear-confirm button{margin-right:7px}.photo-tool{display:flex;align-items:center;gap:8px;margin-top:15px;flex-wrap:wrap}.photo-tool img{width:32px;height:32px;object-fit:contain}.photo-tool small{color:#91a9be;font-size:10px}.file-button input{display:none}.roster-import{margin-top:20px;padding-top:15px;border-top:1px solid #8eacc328}.roster-import h3{font-size:13px;margin:14px 0 7px}.roster-import p{color:#9db6cc;font-size:11px;line-height:1.7;margin:6px 0}.roster-import textarea{width:100%;height:105px;resize:vertical;line-height:1.7}.import-actions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px}.import-actions small{font-size:10px;color:#91a9be}.preview-scroll{max-height:240px;overflow:auto;margin:10px 0}.preview-scroll table{width:100%;border-collapse:collapse;text-align:left;font-size:11px}.preview-scroll th{position:sticky;top:0;background:#24415b;padding:7px;z-index:1}.preview-scroll td{padding:5px;border-bottom:1px solid #8eacc322}.preview-scroll td input:not([type=checkbox]){width:100%;max-width:170px;font-size:11px;padding:5px}.preview-scroll td:nth-child(5){width:75px}.preview-scroll img{width:30px;height:30px;object-fit:contain}.warning{color:#ffaf9a}.overwrite{display:flex;gap:6px;align-items:center;color:#bdcedc;font-size:11px}.primary{background:#356d90!important;color:white!important}.manager-notice{font-size:11px;color:#b9d9a8;margin-top:14px;line-height:1.6;min-height:18px}
@media(max-width:760px){.classroom-manager{inset:10px 10px 126px}.manager-body{grid-template-columns:1fr;overflow:auto;display:block}.class-list{display:flex;flex-wrap:wrap;gap:5px;overflow:visible;border-right:0;border-bottom:1px solid #8eacc328;padding:10px}.class-card{width:auto;padding:7px!important;margin:0}.new-class{display:flex;margin:0;width:100%}.new-class input{flex:1;width:100px}.class-content{padding:12px;overflow:visible}.class-stats{gap:12px;flex-wrap:wrap}.class-actions{font-size:10px}.manager-heading{padding:12px 16px}.class-name input{width:160px}}
</style>
