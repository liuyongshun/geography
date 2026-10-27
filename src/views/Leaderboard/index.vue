<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EverestTerrain from './EverestTerrain.vue'
import ClassroomManager from './ClassroomManager.vue'
import DataBackup from './DataBackup.vue'
import StudentProfileSettings from './StudentProfileSettings.vue'
import { rosterStorage, saveRoster, storageError, saving } from './portableStorage'
import type { LeaderboardBackup } from './leaderboardBackup'
import MaterialLibrary from './MaterialLibrary.vue'
import { builtInMaterials, fillMissingMaterials, loadCustomMaterials, randomMaterial, type Material } from './materialLibrary'
import { CLASSROOM_STORAGE_KEY, loadClassrooms, avatarFor, bindStudentRole, normalizeGender, normalizeNameTag, validNameTag, studentIdentity, studentLabel, type ClassroomStore, type Student, type Gender } from './leaderboardData'
import { allocateRouteSlot, DEFAULT_ROUTE_SEGMENTS, normalizeSegmentCount, routeStep } from './everestRoutes'

/** 每人最多 3 条：索引 0 为主座右铭，1–2 为次要 */
type Mottos = [string, string, string]

const STORAGE_KEY = 'dili-everest-leaderboard-v1'
const SEGMENTS_STORAGE_KEY = 'dili-everest-route-segments-v1'
const ZERO_DEFAULTS_MIGRATION_KEY = 'dili-everest-zero-defaults-v1'
const MOTTO_MAX_LEN = 36
const colors = ['#5dd7ff', '#ffc95d', '#ff8e97', '#b394ff', '#73e0ac', '#ff9ed5']
const sampleNames = ['林星辰', '陈知远', '周语桐', '王子墨', '李沐阳', '赵安然', '孙晓彤', '刘子航', '黄诗涵', '吴乐言']
const sampleMottos: Record<string, Mottos> = {
  林星辰: ['一步一步，也能登顶', '坚持比速度更重要', ''],
  陈知远: ['换个角度，风景不同', '', ''],
  周语桐: ['目标相同，路径自选', '慢慢来比较快', ''],
  王子墨: ['今日又前进一段', '', ''],
  李沐阳: ['山高路远，心向峰顶', '不惧寒风', ''],
}

function emptyMottos(): Mottos { return ['', '', ''] }

function normalizeMottos(raw: unknown): Mottos {
  const list = Array.isArray(raw) ? raw : []
  return [0, 1, 2].map((index) => String(list[index] ?? '').trim().slice(0, MOTTO_MAX_LEN)) as Mottos
}

function makeSample(): Student[] {
  return sampleNames.map((name, index) => ({
    id: `sample-${index}`,
    name,
    nameTag: '',
    gender: '男',
    score: 0,
    color: colors[index % colors.length],
    routeSlot: (index + .5) / sampleNames.length * 4,
    mottos: sampleMottos[name] ? normalizeMottos(sampleMottos[name]) : emptyMottos(),
  }))
}

function loadStudents(): Student[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const members = JSON.parse(saved) as Array<Partial<Student>>
      const migrateDefaults = localStorage.getItem(ZERO_DEFAULTS_MIGRATION_KEY) !== '1'
      const oldDefaults = [28, 24, 20, 17, 15, 13, 11, 9, 7, 5]
      const loaded = members.map((student, index) => {
        const sampleIndex = Number(String(student.id ?? '').match(/^sample-(\d+)$/)?.[1] ?? -1)
        const untouchedDefault = migrateDefaults && sampleNames[sampleIndex] === student.name && student.score === oldDefaults[sampleIndex]
        return {
          id: String(student.id ?? `${Date.now()}-${index}`),
          name: String(student.name ?? `同学${index + 1}`),
          nameTag: normalizeNameTag(student.nameTag),
          score: untouchedDefault ? 0 : Number(student.score) || 0,
          color: String(student.color ?? colors[index % colors.length]),
          routeSlot: Number.isFinite(student.routeSlot) && (student.routeSlot as number) >= 0 && (student.routeSlot as number) < 4
            ? student.routeSlot as number : (index + .5) / members.length * 4,
          mottos: normalizeMottos(student.mottos),
          avatar: student.avatar,
          gender: normalizeGender(student.gender) || '男',
        }
      })
      localStorage.setItem(ZERO_DEFAULTS_MIGRATION_KEY, '1')
      return loaded
    }
    localStorage.setItem(ZERO_DEFAULTS_MIGRATION_KEY, '1')
  } catch {
    // 忽略损坏的本地缓存，回退到示例班级。
  }
  return makeSample()
}

function loadRoster() {
  const legacy = loadStudents()
  try { return loadClassrooms(rosterStorage, legacy, loadSegmentCount()) }
  catch {
    // Preserve unreadable data before recovering to the existing single-class roster.
    const raw = localStorage.getItem(CLASSROOM_STORAGE_KEY)
    if (raw) localStorage.setItem(`${CLASSROOM_STORAGE_KEY}-recovery-${Date.now()}`, raw)
    return loadClassrooms({ getItem: () => null }, legacy, loadSegmentCount())
  }
}
const materials = ref<Material[]>([...builtInMaterials])
const materialsReady = ref(false)
const roster = ref<ClassroomStore>(fillMissingMaterials(loadRoster(), materials.value))
const currentClass = computed(() => roster.value.classes.find(group => group.id === roster.value.activeClassId) ?? roster.value.classes[0])
const students = computed<Student[]>({ get: () => currentClass.value.students, set: value => { currentClass.value.students = value } })
function loadSegmentCount() {
  try { return normalizeSegmentCount(Number(localStorage.getItem(SEGMENTS_STORAGE_KEY) ?? DEFAULT_ROUTE_SEGMENTS)) }
  catch { return DEFAULT_ROUTE_SEGMENTS }
}
const segmentCount = computed({ get: () => currentClass.value.segments, set: value => { currentClass.value.segments = value } })
const segmentDraft = ref<number | string>(segmentCount.value)
function applySegments() {
  if (String(segmentDraft.value).trim() === '' || !Number.isFinite(Number(segmentDraft.value))) {
    segmentDraft.value = segmentCount.value
    return
  }
  segmentCount.value = normalizeSegmentCount(Number(segmentDraft.value))
  segmentDraft.value = segmentCount.value
}
const stepFor = (score: number) => routeStep(score, segmentCount.value)
const selectedId = ref(students.value[0]?.id ?? '')
const newName = ref('')
const newNameTag = ref('')
const newGender = ref<Gender | ''>('')
const importMessage = ref('')
const showAddEntry = ref(false)
const showMottoEditor = ref(false)
const showRanking = ref(false)
const showStudentDetails = ref(false)
const showManagement = ref(false)
const showBackup = ref(false)
const showMaterials = ref(false)
const boostedId = ref('')
const mottoDraft = ref<Mottos>(emptyMottos())
let boostTimer = 0

const ranked = computed(() => [...students.value].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN')))
const selected = computed(() => students.value.find((student) => student.id === selectedId.value) ?? ranked.value[0])
const selectedRank = computed(() => ranked.value.findIndex(student => student.id === selected.value?.id) + 1)
const selectedMottos = computed(() => (selected.value?.mottos ?? []).map((text, index) => ({ text: text.trim(), index })).filter(motto => motto.text))
onMounted(async () => {
  try {
    materials.value.push(...await loadCustomMaterials())
    roster.value = fillMissingMaterials(roster.value, materials.value)
  } catch { importMessage.value = '自定义素材暂时无法读取，内置60张仍可使用。' }
  finally { materialsReady.value = true }
})
function addMaterials(items: Material[]) { materials.value.push(...items) }
function restoreBackup(backup: LeaderboardBackup) {
  materials.value = [...builtInMaterials, ...backup.materials]
  roster.value = backup.roster
  selectedId.value = currentClass.value.students[0]?.id ?? ''
  showStudentDetails.value = false
}
function bindMaterial(src: string) {
  if (!selected.value) return
  try {
    roster.value = bindStudentRole(roster.value, currentClass.value.id, selected.value.id, selected.value.gender, src)
    importMessage.value = '角色图片已保存'
  } catch (error) { importMessage.value = error instanceof Error ? error.message : '绑定失败' }
}
function randomizeSelected() {
  if (!selected.value) return
  const avatar = randomMaterial(selected.value.gender, students.value.filter(student => student.id !== selected.value!.id), materials.value)
  roster.value = bindStudentRole(roster.value, currentClass.value.id, selected.value.id, selected.value.gender, avatar)
  importMessage.value = avatar ? '已随机分配未占用的素材' : '该性别可用素材已用尽，使用兜底图'
}
function randomizeClass() {
  const group = { ...currentClass.value, students: students.value.map(student => ({ ...student, avatar: undefined })) }
  currentClass.value.students = fillMissingMaterials({ ...roster.value, classes: [group] }, materials.value).classes[0].students
  importMessage.value = '已按性别随机分配全班角色，超出素材数量的队员使用兜底图'
}
function openStudent(id: string) {
  if (!students.value.some(student => student.id === id)) return
  selectedId.value = id
  showRanking.value = true
  showStudentDetails.value = true
  showAddEntry.value = false
  showMottoEditor.value = false
}
function closeRanking() { showRanking.value = false; showStudentDetails.value = false }
function toggleRanking() { if (showRanking.value) closeRanking(); else showRanking.value = true }

watch(roster, async value => {
  try { await saveRoster(value) }
  catch (error) { storageError.value = String(error) }
}, { deep: true, immediate: true })
watch(() => currentClass.value.id, () => {
  selectedId.value = students.value[0]?.id ?? ''
  segmentDraft.value = segmentCount.value
  showStudentDetails.value = false
  showAddEntry.value = false; showMottoEditor.value = false; boostedId.value = ''; importMessage.value = ''
})
watch(() => students.value.map(student => student.id).join('|'), () => {
  if (!students.value.some(student => student.id === selectedId.value)) selectedId.value = students.value[0]?.id ?? ''
  if (!students.value.length) { showMottoEditor.value = false; showStudentDetails.value = false; boostedId.value = '' }
})
watch(segmentCount, value => { segmentDraft.value = value })
watch(selectedId, () => {
  if (!showMottoEditor.value || !selected.value) return
  mottoDraft.value = [...selected.value.mottos] as Mottos
})

onBeforeUnmount(() => {
  window.clearTimeout(boostTimer)
})

function openMottoEditor() {
  if (!selected.value) return
  showAddEntry.value = false
  mottoDraft.value = [...selected.value.mottos] as Mottos
  showMottoEditor.value = !showMottoEditor.value
}

function saveMottos() {
  if (!selected.value) return
  selected.value.mottos = normalizeMottos(mottoDraft.value)
  showMottoEditor.value = false
  importMessage.value = `已保存 ${studentLabel(selected.value)} 的座右铭`
}

function addStudent(name = newName.value) {
  const trimmed = name.trim()
  if (!trimmed) return
  if (!newGender.value) { importMessage.value = '请先选择学生性别'; return }
  const nameTag = normalizeNameTag(newNameTag.value)
  if (!validNameTag(nameTag)) { importMessage.value = '重名标识最多2个字'; return }
  const key = studentIdentity(currentClass.value.id, { name: trimmed, nameTag })
  const existing = students.value.find(student => studentIdentity(currentClass.value.id, student) === key)
  if (existing) {
    selectedId.value = existing.id
    importMessage.value = `“${studentLabel(existing)}”已在当前班级中，请使用不同的重名标识`
    return
  }
  const student: Student = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: trimmed,
    nameTag,
    gender: newGender.value,
    avatar: randomMaterial(newGender.value, students.value, materials.value),
    score: 0,
    color: colors[students.value.length % colors.length],
    routeSlot: allocateRouteSlot(students.value.map(student => student.routeSlot)),
    mottos: emptyMottos(),
  }
  students.value.push(student)
  selectedId.value = student.id
  newName.value = ''
  newNameTag.value = ''
  newGender.value = ''
  showAddEntry.value = false
  importMessage.value = `已加入 ${studentLabel(student)}`
}

function addPoint(student: Student | undefined) {
  if (!student || student.score >= segmentCount.value) return
  student.score = stepFor(student.score) + 1
  selectedId.value = student.id
  boostedId.value = student.id
  window.clearTimeout(boostTimer)
  boostTimer = window.setTimeout(() => { boostedId.value = '' }, 1100)
}

</script>

<template>
  <main class="leaderboard-page">
    <section class="game-grid">
      <section class="terrain-stage" aria-label="珠穆朗玛峰真实地形"><EverestTerrain :students="students" :segment-count="segmentCount" :selected-id="selectedId" :boosted-id="boostedId" @select="openStudent" /></section>

      <aside class="control-panel">
        <select v-model="roster.activeClassId" class="class-selector" aria-label="当前班级"><option v-for="group in roster.classes" :key="group.id" :value="group.id">{{ group.name }}</option></select>
        <div class="panel-title"><span>队员操作</span><small>点击山旁人物或排行切换</small></div>
        <div v-if="selected" class="selected-card">
          <img :src="avatarFor(selected)" class="custom-avatar" :alt="`${studentLabel(selected)}的角色图片`" />
          <div><strong>{{ studentLabel(selected) }}</strong><p>{{ stepFor(selected.score) === segmentCount ? '已登顶' : `第 ${stepFor(selected.score)} / ${segmentCount} 段` }}</p></div>
          <b>{{ selected.score }}<small>分</small></b>
        </div>
        <span v-else class="empty-class">当前班级0人 · 可加入或导入队员</span>
        <button class="point-button" type="button" :disabled="!selected || selected.score >= segmentCount" @click="addPoint(selected)">
          <span>{{ selected && selected.score >= segmentCount ? '✓' : '＋1' }}</span> {{ selected && selected.score >= segmentCount ? '成功登顶' : '前进一段' }}
        </button>
        <label class="segment-setting" title="设置1～1000段。保留所有积分，按新段数重新定位；每1分前进1段。">线路段数
          <input v-model="segmentDraft" type="number" min="1" max="1000" step="1" aria-label="线路总段数" @change="applySegments" @keydown.enter="applySegments" />
        </label>

        <div class="member-tools" aria-label="队员管理">
          <button class="tool-entry" type="button" @click="showBackup = true">数据备份</button>
          <button class="tool-entry" type="button" :aria-expanded="showMaterials" @click="showMaterials = !showMaterials; showAddEntry = false; showMottoEditor = false; showManagement = false">素材库</button>
          <button class="tool-entry" type="button" :aria-expanded="showManagement" @click="showManagement = !showManagement; showAddEntry = false; showMottoEditor = false">班级与录入</button>
          <button class="tool-entry" type="button" :aria-expanded="showRanking" @click="toggleRanking">{{ showRanking ? '收起排行' : '查看排行' }}</button>
          <button class="tool-entry" type="button" :disabled="!selected" :aria-expanded="showMottoEditor" @click="openMottoEditor">座右铭</button>
          <button class="tool-entry" type="button" :aria-expanded="showAddEntry" @click="showAddEntry = !showAddEntry; showMottoEditor = false">
            <span>＋</span> 加入队员
          </button>
        </div>
        <MaterialLibrary v-if="showMaterials" :materials="materials" :students="students" :selected="selected" :ready="materialsReady" @close="showMaterials = false" @add="addMaterials" @bind="bindMaterial" @random="randomizeSelected" @random-all="randomizeClass" />
        <form v-if="showAddEntry" class="add-row compact-add" aria-label="加入队员" @submit.prevent="addStudent()">
          <input id="student-name" v-model="newName" aria-label="学生姓名" maxlength="60" autofocus placeholder="学生姓名" autocomplete="off" />
          <select v-model="newGender" aria-label="新队员性别"><option disabled value="">性别</option><option>男</option><option>女</option></select>
          <input v-model="newNameTag" maxlength="2" aria-label="新队员重名标识" title="重名标识，选填，最多2个字" placeholder="标识（选填）" autocomplete="off" />
          <button type="submit" class="add-submit" :disabled="!newName.trim() || !newGender">加入</button>
          <button type="button" class="add-close" aria-label="关闭加入队员" @click="showAddEntry = false">×</button>
        </form>
        <div v-if="showMottoEditor && selected" class="motto-editor" role="dialog" :aria-label="`${studentLabel(selected)}的座右铭`">
          <p class="motto-editor-title">{{ studentLabel(selected) }} · 座右铭 <small>1主2次，最多3条</small></p>
          <label>主座右铭<input v-model="mottoDraft[0]" type="text" maxlength="36" placeholder="中间轮播与头顶优先展示" /></label>
          <label>次要 1<input v-model="mottoDraft[1]" type="text" maxlength="36" placeholder="可选" /></label>
          <label>次要 2<input v-model="mottoDraft[2]" type="text" maxlength="36" placeholder="可选" /></label>
          <div class="motto-editor-actions">
            <button type="button" class="motto-cancel" @click="showMottoEditor = false">取消</button>
            <button type="button" class="motto-save" @click="saveMottos">保存</button>
          </div>
        </div>
        <p v-if="saving" class="import-message" role="status">正在保存数据，请勿拔出U盘…</p>
        <p v-if="storageError" class="import-message" role="alert">修改尚未保存：{{ storageError }} 可通过“数据备份”导出当前数据。</p>
        <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
      </aside>
    </section>

    <div v-if="showRanking" class="ranking-popovers" :class="{ 'with-student': showStudentDetails && selected }">
    <aside v-if="showStudentDetails && selected" class="student-profile" role="dialog" :aria-label="`${studentLabel(selected)}的人物资料`">
      <header class="profile-heading"><span>队员资料</span><button class="panel-close" type="button" aria-label="关闭人物资料" @click="showStudentDetails = false">×</button></header>
      <div class="profile-portrait" :style="{ '--profile-color': selected.color }"><img :src="avatarFor(selected)" :alt="`${studentLabel(selected)}的人物形象`" /></div>
      <h2>{{ studentLabel(selected) }}</h2><p class="profile-class">{{ currentClass.name }} · {{ selected.gender }}生</p>
      <div class="profile-stats"><span><b>{{ selectedRank }}</b>班级排名</span><span><b>{{ selected.score }}<small>分</small></b>当前积分</span><span><b>{{ stepFor(selected.score) }}<small>/{{ segmentCount }}</small></b>攀登进度</span></div>
      <StudentProfileSettings :key="`${currentClass.id}:${selected.id}`" :student="selected" @save="details => Object.assign(selected!, details)" />
      <section class="profile-mottos" aria-label="队员座右铭"><h3>座右铭</h3><template v-if="selectedMottos.length"><blockquote v-for="motto in selectedMottos" :key="motto.index" :class="{ 'primary-motto': motto.index === 0 }"><small>{{ motto.index === 0 ? '主座右铭' : `座右铭 ${motto.index + 1}` }}</small><p>{{ motto.text }}</p></blockquote></template><p v-else class="profile-no-motto">这位同学还没有设置座右铭。</p></section>
    </aside>
    <section class="ranking-panel" aria-label="班级攀登榜单">
      <div class="ranking-head"><div><p class="eyebrow">LIVE RANKING</p><h2>今日攀登排行</h2></div><button class="panel-close" type="button" aria-label="关闭榜单和人物资料" @click="closeRanking">×</button></div>
      <p class="ranking-hint">{{ currentClass.name }} · 同分按姓名排序</p>
      <div class="ranking-list">
        <p v-if="!ranked.length" class="empty-class">该班暂无队员，可在“班级与录入”添加名单。</p>
        <button v-for="(student, index) in ranked" :key="student.id" type="button" class="rank-row" :class="{ active: selected?.id === student.id }" @click="openStudent(student.id)">
          <span class="rank-no" :class="{ podium: index < 3 }">{{ index + 1 }}</span>
          <img :src="avatarFor(student)" class="mini-avatar custom-mini-avatar" :alt="`${studentLabel(student)}的角色图片`" />
          <strong>{{ studentLabel(student) }}</strong>
          <span class="progress"><i :style="{ width: `${stepFor(student.score) / segmentCount * 100}%`, background: student.color }" /></span>
          <b>{{ student.score }} <small>分</small></b>
          <span class="rank-add" @click.stop="addPoint(student)">{{ student.score >= segmentCount ? '登顶' : '＋1' }}</span>
        </button>
      </div>
    </section>
    </div>
    <div v-if="showManagement" class="management-backdrop" @click="showManagement = false" />
    <ClassroomManager v-if="showManagement" v-model="roster" :selected-id="selectedId" :materials="materials" @close="showManagement = false" />
    <DataBackup v-if="showBackup" :roster="roster" :materials="materials" :ready="materialsReady" @close="showBackup = false" @restore="restoreBackup" />
  </main>
</template>

<style scoped>
.leaderboard-page { min-height: 100%; padding: clamp(20px, 3vw, 46px); background: radial-gradient(circle at 50% -20%, #224985 0, #0c1b39 38%, #071126 75%); color: #f8fbff; }
.eyebrow { color:#8ed4ff; letter-spacing:.15em; font-size:11px; font-weight:800; }
.game-grid { max-width:1420px; margin:auto; display:grid; grid-template-columns:minmax(0,1.65fr) minmax(300px,.7fr); gap:18px; }
.mountain-panel { position:relative; min-height:600px; overflow:hidden; border:1px solid rgba(184,227,255,.2); border-radius:26px; background:linear-gradient(#132e60 0%,#4876a9 47%,#9ac0db 72%,#d9ecf2 100%); box-shadow:0 20px 50px rgba(0,0,0,.26); isolation:isolate; }
.sky { position:absolute; inset:0 0 40% 0; background:linear-gradient(#10234d,#4e82b7); }.moon{position:absolute;top:9%;right:12%;width:52px;height:52px;border-radius:50%;background:#f8efb9;box-shadow:0 0 30px #fff5b5}.star{position:absolute;color:#fff5bd;font-size:22px}.s1{top:19%;left:15%}.s2{top:10%;left:36%}.s3{top:30%;right:28%}
.peak { position:absolute; bottom:7%; clip-path:polygon(50% 0,100% 100%,0 100%); }.peak-back{width:86%;height:73%;left:-18%;background:#496d91;opacity:.78}.peak-main{width:80%;height:87%;left:10%;background:linear-gradient(110deg,#587a96 0 46%,#284b70 46% 100%);filter:drop-shadow(0 10px 6px rgba(0,0,0,.2));}.snow-cap{position:absolute;inset:0;background:linear-gradient(135deg,transparent 42%,#f3fbff 42% 55%,transparent 55%),linear-gradient(225deg,transparent 46%,#dceaf1 46% 57%,transparent 57%);clip-path:polygon(50% 0,82% 42%,65% 34%,54% 44%,42% 31%,25% 42%);}
.summit { position:absolute; top:5.5%; left:48%; display:grid; place-items:center; color:#143965; text-align:center; font-size:10px; font-weight:900; z-index:2; }.summit b{font-size:26px;color:#fff1a7;filter:drop-shadow(0 0 8px #fff1a7)}
.route { position:absolute; inset:14% 0 8% 0; z-index:1; }.route::after{content:'';position:absolute;left:50%;bottom:0;width:3px;height:100%;background:repeating-linear-gradient(to top,#ffe394 0 8px,transparent 8px 17px);transform:skewX(-18deg);opacity:.8}.route i{position:absolute;left:48.2%;width:11px;height:11px;border-radius:50%;background:#ffe394;box-shadow:0 0 0 5px rgba(255,227,148,.18)}
.basecamp{position:absolute;bottom:0;left:0;right:0;height:10%;z-index:2;padding:15px 24px;background:linear-gradient(90deg,#24514c,#426747);color:#e6f3de;font-weight:900;letter-spacing:.12em;font-size:11px}.basecamp small{display:block;opacity:.75;margin-top:3px;letter-spacing:.04em}
.climber { position:absolute; transform:translate(-50%, 0); width:78px; border:0; background:transparent; cursor:pointer; display:grid; justify-items:center; transition:bottom .75s cubic-bezier(.17,.9,.32,1), filter .2s, transform .2s; padding:0; z-index:4; }.climber:hover,.climber.selected{transform:translate(-50%,-5px);filter:drop-shadow(0 0 12px rgba(255,255,255,.9))}.climber.boosted{animation:boost .6s ease-in-out 2}.avatar,.large-avatar,.mini-avatar{display:block;background-image:url('/images/leaderboard/chibi-climber-8frames.png');background-size:400% 200%;background-repeat:no-repeat}.avatar{width:62px;height:76px}.climber-name{max-width:92px;padding:2px 6px;border-radius:99px;background:rgba(6,19,41,.82);color:white;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.climber-score{position:absolute;right:0;top:56px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#ffdc6d;color:#283247;font-size:10px;font-weight:900}
@keyframes boost{50%{transform:translate(-50%,-22px) scale(1.16)}}
.control-panel,.ranking-panel{border:1px solid rgba(184,227,255,.16);border-radius:22px;background:rgba(10,25,53,.78);box-shadow:0 18px 42px rgba(0,0,0,.18);}.control-panel{padding:22px}.panel-title{display:flex;justify-content:space-between;align-items:baseline;font-weight:800}.panel-title small{font-size:11px;color:#88a8c4;font-weight:400}.selected-card{display:flex;align-items:center;gap:10px;margin:18px 0 12px;padding:12px;border-radius:16px;background:rgba(98,177,233,.12);border:1px solid rgba(142,212,255,.18)}.large-avatar{width:64px;height:70px;flex:0 0 64px}.selected-card strong{font-size:17px}.selected-card p{color:#92b2cf;font-size:11px;margin-top:3px}.selected-card>b{margin-left:auto;color:#ffe18a;font-size:22px}.selected-card b small{font-size:11px;margin-left:2px}.point-button{width:100%;padding:14px;border:0;border-radius:14px;background:linear-gradient(135deg,#ffd86b,#f2a946);color:#483214;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 8px 22px rgba(238,171,57,.25)}.point-button span{font-size:21px;margin-right:6px}.point-button:active{transform:translateY(1px)}.member-tools{display:flex;align-items:center;gap:6px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(184,227,255,.1)}.tool-entry{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:4px 9px;border:1px solid rgba(134,191,230,.2);border-radius:8px;background:rgba(62,125,170,.1);color:#a9cbe2;font-size:11px;line-height:1;cursor:pointer;transition:color .18s,border-color .18s,background .18s}.tool-entry:hover{color:#e6f6ff;border-color:rgba(142,212,255,.42);background:rgba(75,155,208,.18)}.tool-entry span{color:#81cfff;font-size:15px}.import-entry input{display:none}.compact-add{margin-top:9px}.add-row{display:flex;gap:6px}.add-row input{min-width:0;flex:1;border:1px solid #365271;border-radius:9px;background:#08162e;color:#eef7ff;padding:8px 10px;font-size:12px}.add-row button{border:0;border-radius:9px;background:#4b9bd0;color:#fff;padding:0 12px;font-size:12px;font-weight:800;cursor:pointer}.import-message{margin-top:7px;color:#a7d7a9;font-size:10px;line-height:1.4}.reset{margin-left:auto;border:0;background:transparent;color:#6f91ad;font-size:10px;cursor:pointer}.reset:hover{color:#b8d5ea}
.ranking-panel{max-width:1420px;margin:18px auto 0;padding:20px}.ranking-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:15px}.ranking-head h2{font-size:22px;margin-top:3px}.ranking-head>span{color:#819fba;font-size:11px}.ranking-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.rank-row{display:grid;grid-template-columns:26px 40px minmax(60px,1fr) minmax(70px,1fr) 42px 34px;gap:8px;align-items:center;width:100%;padding:7px 9px;border:1px solid transparent;border-radius:13px;background:rgba(255,255,255,.035);color:#e8f4ff;text-align:left;cursor:pointer}.rank-row:hover,.rank-row.active{border-color:rgba(143,216,255,.34);background:rgba(77,160,214,.12)}.rank-no{color:#8ca9c3;text-align:center;font-weight:900}.rank-no.podium{color:#ffe28b}.mini-avatar{width:36px;height:40px}.rank-row strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.progress{height:6px;border-radius:6px;background:#203957;overflow:hidden}.progress i{display:block;height:100%;border-radius:inherit}.rank-row>b{color:#ffe18a;font-size:13px}.rank-row b small{font-size:10px;color:#a6c2d9}.rank-add{justify-self:end;padding:4px 7px;border-radius:7px;background:#295d8b;color:#dbf3ff;font-size:11px;font-weight:900}.rank-add:hover{background:#3878ae}
@media (max-width:900px){.game-grid{grid-template-columns:1fr}.mountain-panel{min-height:520px}.ranking-list{grid-template-columns:1fr}}@media (max-width:560px){.leaderboard-page{padding:16px}.mountain-panel{min-height:460px}.climber{width:58px}.avatar{transform:scale(.8);transform-origin:bottom}.climber-name{font-size:9px}.rank-row{grid-template-columns:22px 34px minmax(45px,1fr) 44px 32px;gap:5px}.progress,.rank-add{display:none}}
/* The mountain owns the viewport; secondary controls stay in a compact dock. */
.leaderboard-page{position:relative;height:100%;min-height:0;padding:0;overflow:hidden}
.game-grid{display:block;height:100%;max-width:none;margin:0}.terrain-stage{height:100%}
.control-panel{position:absolute;bottom:15px;left:18px;right:18px;z-index:1200;display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:14px;background:#0b192de8;backdrop-filter:blur(14px);box-shadow:0 8px 30px #050c1866}
.panel-title{display:none}.selected-card{margin:0;padding:0 10px 0 0;background:none;border:0;border-radius:0;gap:7px;min-width:170px}.large-avatar{width:32px;height:39px;flex-basis:32px}.selected-card strong{font-size:12px}.selected-card p{font-size:9px}.selected-card>b{font-size:18px;margin-left:12px}.point-button{width:auto;padding:8px 13px;border-radius:9px;font-size:11px;box-shadow:none;white-space:nowrap}.point-button span{font-size:16px}.member-tools{margin:0 0 0 auto;padding:0;border:0;gap:6px}.tool-entry{font-size:10px}.reset{font-size:9px}.add-row{position:absolute;bottom:calc(100% + 10px);right:0;width:250px;padding:10px;border-radius:10px;background:#0b192df5;border:1px solid #8ed4ff33}.motto-editor{position:absolute;bottom:calc(100% + 10px);right:0;width:280px;display:grid;gap:8px;padding:12px;border-radius:10px;background:#0b192df5;border:1px solid #8ed4ff33}.motto-editor-title{margin:0;font-size:12px;font-weight:700;color:#e8f4ff}.motto-editor-title small{margin-left:6px;font-weight:400;color:#88a8c4}.motto-editor label{display:grid;gap:4px;font-size:10px;color:#a9cbe2}.motto-editor input{width:100%;box-sizing:border-box;border:1px solid #365271;border-radius:8px;background:#08162e;color:#eef7ff;padding:7px 9px;font-size:12px}.motto-editor-actions{display:flex;justify-content:flex-end;gap:6px}.motto-cancel,.motto-save{border:0;border-radius:8px;padding:6px 12px;font-size:11px;cursor:pointer}.motto-cancel{background:transparent;color:#8aa6bf}.motto-save{background:#4b9bd0;color:#fff;font-weight:800}.import-message{position:absolute;bottom:calc(100% + 4px);left:12px;background:#0b192df5;border-radius:7px;padding:7px 10px}
.ranking-panel{position:absolute;right:18px;top:76px;bottom:94px;z-index:1200;width:285px;max-width:calc(100% - 36px);margin:0;padding:14px;overflow:auto;background:#0b192df5;backdrop-filter:blur(14px);border-radius:14px}.ranking-head{margin-bottom:10px}.ranking-head h2{font-size:15px}.ranking-head>span,.eyebrow{font-size:9px}.ranking-list{grid-template-columns:1fr;gap:5px}.rank-row{grid-template-columns:20px 28px minmax(45px,1fr) 38px 28px;gap:5px;padding:5px}.rank-row strong{font-size:11px}.mini-avatar{width:28px;height:33px}.progress{display:none}.rank-add{padding:4px;font-size:10px}.rank-row>b{font-size:11px}
@media(max-width:760px){.control-panel{left:10px;right:10px;bottom:10px;flex-wrap:wrap;gap:6px;padding:7px 9px}.selected-card{min-width:140px;flex:1}.point-button{font-size:10px;padding:7px}.member-tools{width:100%;justify-content:flex-end}.reset{margin-left:4px}.ranking-panel{bottom:119px;right:10px}.selected-card p{display:none}}
.segment-setting{display:flex;align-items:center;gap:6px;font-size:10px;color:#a9cbe2;white-space:nowrap}.segment-setting input{width:58px;padding:5px 6px;border:1px solid #86bfe633;border-radius:7px;background:#09172b;color:#ecf5ff;font-size:11px;font-variant-numeric:tabular-nums}
@media(max-width:1050px){.control-panel{flex-wrap:wrap}.member-tools{flex-wrap:wrap}.segment-setting{margin-left:auto}}
.class-selector{max-width:135px;border:1px solid #86bfe63d;border-radius:8px;background:#10243a;color:#d3e8f5;padding:6px 8px;font-size:11px;min-width:85px}.custom-avatar{width:32px;height:39px;object-fit:contain;flex-shrink:0}.custom-mini-avatar{background:none;object-fit:contain}
.management-backdrop{position:absolute;inset:0;background:#020a1655;z-index:1550}
.empty-class{color:#9db6cc;font-size:11px;line-height:1.6}
.add-row.compact-add{display:grid;grid-template-columns:minmax(85px,1.3fr) 68px minmax(90px,1fr) 52px 24px;align-items:center;gap:7px;box-sizing:border-box;width:min(420px,calc(100vw - 100px));margin:0;padding:9px;border:1px solid #8ebcde40;border-radius:12px;background:#102238fa;box-shadow:0 8px 24px #030b1866}
.add-row.compact-add input,.add-row.compact-add select{box-sizing:border-box;display:block;width:100%;min-width:0;height:34px;border:1px solid #6e96b647;border-radius:7px;background:#08182bb3;color:#edf6ff;padding:0 8px;font:inherit;font-size:12px;outline:none;transition:border-color .15s,box-shadow .15s}.add-row.compact-add input::placeholder{color:#819bb0}.add-row.compact-add input:focus,.add-row.compact-add select:focus{border-color:#69c9f3;box-shadow:0 0 0 2px #53b6e819}.add-row.compact-add .add-submit{height:34px;padding:0 10px;border:1px solid #9bdfff24;border-radius:7px;background:#59b8e4;color:#071f33;font-size:12px;font-weight:700;white-space:nowrap}.add-row.compact-add .add-submit:hover:enabled{background:#83d3f6}.add-row.compact-add .add-submit:disabled{background:#274761;color:#7295af;border-color:#799eb51a;cursor:default}.add-row.compact-add .add-close{display:grid;place-items:center;width:24px;height:30px;padding:0;background:transparent;border:0;color:#94afc5;font-size:20px;font-weight:400;line-height:1}.add-row.compact-add .add-close:hover{color:#fff}
@media(max-width:460px){.add-row.compact-add{width:calc(100vw - 94px);grid-template-columns:minmax(60px,1fr) 55px minmax(66px,.85fr) 42px 18px;gap:4px;padding:7px}.add-row.compact-add input,.add-row.compact-add select{font-size:11px;padding:0 5px}.add-row.compact-add .add-submit{padding:0 7px}.add-row.compact-add .add-close{width:18px}}
.ranking-popovers{position:absolute;top:76px;right:18px;bottom:94px;z-index:1200;display:flex;justify-content:flex-end;align-items:flex-start;gap:12px;width:315px;max-width:calc(100% - 36px);pointer-events:none}.ranking-popovers.with-student{width:580px}.ranking-popovers>.ranking-panel{position:relative;inset:auto;box-sizing:border-box;flex:1;min-width:0;width:auto;max-width:none;height:100%;margin:0;pointer-events:auto}.ranking-popovers .ranking-head{align-items:center;gap:6px}.ranking-hint{margin:-3px 0 12px;color:#819fba;font-size:10px;line-height:1.5}.panel-close{display:grid;place-items:center;flex-shrink:0;width:25px;height:25px;padding:0;border:1px solid #aacde424;border-radius:7px;background:#9bc8eb0a;color:#9db8cc;font-size:19px;line-height:1;cursor:pointer}.panel-close:hover{color:#edf8ff;background:#9bc8eb1c}.student-profile{box-sizing:border-box;flex:0 0 248px;min-width:0;max-height:100%;padding:15px;border:1px solid #a3c8e333;border-radius:14px;background:linear-gradient(155deg,#172c43fa,#0b192dfc);box-shadow:0 14px 40px #030d1e66;overflow:auto;pointer-events:auto}.profile-heading{display:flex;align-items:center;justify-content:space-between;color:#a0bdd3;font-size:11px;letter-spacing:.05em}.profile-portrait{display:grid;place-items:center;height:180px;margin:8px 0 12px;border-radius:11px;background:radial-gradient(ellipse at 50% 80%,color-mix(in srgb,var(--profile-color) 17%,transparent),transparent 67%)}.profile-portrait img{display:block;width:145px;height:170px;max-width:100%;object-fit:contain;filter:drop-shadow(0 8px 12px #020b2055)}.student-profile h2{margin:0;color:#f0f6fc;font-size:19px;font-weight:650;text-align:center;overflow-wrap:anywhere}.profile-class{margin:6px 0 16px;text-align:center;color:#93aec4;font-size:11px;overflow-wrap:anywhere}.profile-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:12px 0;border-top:1px solid #aacde41c;border-bottom:1px solid #aacde41c}.profile-stats>span{display:grid;gap:6px;text-align:center;color:#839fb6;font-size:9px}.profile-stats b{color:#e9d697;font-size:17px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}.profile-stats small{margin-left:2px;font-size:10px;font-weight:400;color:#a8bdcc}.profile-mottos{padding-top:15px}.profile-mottos h3{margin:0 0 10px;color:#bed3e3;font-size:12px;font-weight:500}.profile-mottos blockquote{margin:0 0 8px;padding:10px 11px;border-left:2px solid #78a9cb44;border-radius:0 8px 8px 0;background:#bddcff06}.profile-mottos blockquote.primary-motto{border-left-color:#84cef0;background:#7ec5ed0c}.profile-mottos blockquote small{color:#7f9fb9;font-size:9px}.profile-mottos blockquote p{margin:5px 0 0;color:#d9e8f3;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.profile-no-motto{margin:0;color:#7895ae;font-size:11px;line-height:1.8}
@media(max-width:760px){.ranking-popovers{right:10px;bottom:119px;max-width:calc(100% - 20px);gap:8px}.ranking-popovers.with-student{width:580px}.student-profile{flex-basis:44%;padding:12px}.profile-portrait{height:145px}.profile-portrait img{height:140px;width:120px}.student-profile h2{font-size:16px}.ranking-popovers>.ranking-panel{padding:11px}.ranking-popovers .ranking-head h2{font-size:13px}}
@media(max-width:460px){.student-profile{padding:9px}.profile-portrait{height:115px}.profile-portrait img{height:110px;width:90px}.profile-stats b{font-size:14px}.profile-stats>span{font-size:8px}.ranking-popovers .rank-row{grid-template-columns:16px 22px minmax(0,1fr) 30px 22px;gap:3px;padding:5px 3px}.ranking-popovers .mini-avatar{width:22px}.ranking-popovers .rank-row strong{font-size:10px}.ranking-popovers .ranking-head h2{font-size:11px}.profile-mottos blockquote{padding:7px}.profile-mottos blockquote p{font-size:11px}}
</style>
