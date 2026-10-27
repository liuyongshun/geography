<script setup lang="ts">
import { computed, ref } from 'vue'
import { CLASSROOM_STORAGE_KEY, type ClassroomStore } from './leaderboardData'
import { createBackup, downloadBackup, parseBackup, type LeaderboardBackup } from './leaderboardBackup'
import { replaceBrowserMaterials, type Material } from './materialLibrary'
import { replacePortableBackup, storagePath, saving, storageError } from './portableStorage'

const props = defineProps<{ roster: ClassroomStore; materials: Material[]; ready: boolean }>()
const emit = defineEmits<{ close: []; restore: [backup: LeaderboardBackup] }>()
const pending = ref<LeaderboardBackup>()
const busy = ref(false), notice = ref('')
const count = computed(() => pending.value?.roster.classes.reduce((sum, group) => sum + group.students.length, 0) ?? 0)
function exportData() {
  try { downloadBackup(createBackup(props.roster, props.materials)); notice.value = '完整备份已生成，请保留下载的 JSON 文件。' }
  catch (error) { notice.value = String(error) }
}
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''; pending.value = undefined; notice.value = ''
  if (!file) return
  busy.value = true
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('文件超过100MB，请检查是否选择了正确的数据备份')
    pending.value = parseBackup(await file.text())
  } catch (error) { notice.value = `未导入：${String(error)}` }
  finally { busy.value = false }
}
async function restore() {
  if (!pending.value) return
  busy.value = true
  try {
    const previous = createBackup(props.roster, props.materials)
    // 替换前自动下载当前数据，用户可以随时还原。
    downloadBackup(previous, '-导入前备份')
    const next = pending.value
    if (!await replacePortableBackup(next)) {
      const oldRoster = localStorage.getItem(CLASSROOM_STORAGE_KEY)
      localStorage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify(next.roster))
      try { await replaceBrowserMaterials(next.materials) }
      catch (error) {
        if (oldRoster === null) localStorage.removeItem(CLASSROOM_STORAGE_KEY)
        else localStorage.setItem(CLASSROOM_STORAGE_KEY, oldRoster)
        throw error
      }
    }
    emit('restore', next)
    pending.value = undefined
    notice.value = '完整数据已导入并保存；已同时生成导入前备份。'
  } catch (error) { notice.value = `导入失败：${String(error)}` }
  finally { busy.value = false }
}
</script>

<template>
  <div class="backup-overlay" @click.self="!busy && emit('close')">
    <section class="backup-dialog" role="dialog" aria-modal="true" aria-label="数据备份与迁移">
      <header><h2>数据备份与迁移</h2><button type="button" :disabled="busy" aria-label="关闭数据备份" @click="emit('close')">×</button></header>
      <p>保存位置</p><code>{{ storagePath }}</code>
      <p>完整备份包含全部班级、姓名、分数、性格、爱好、座右铭、路线位置、线路段数和自定义素材。换电脑时可导入此文件恢复。</p>
      <div class="backup-actions">
        <button type="button" :disabled="busy || !ready" @click="exportData">导出完整数据</button>
        <label :class="{ disabled: busy || !ready }">导入完整数据<input type="file" accept=".json,application/json" :disabled="busy || !ready" @change="chooseFile" /></label>
      </div>
      <div v-if="pending" class="backup-preview">
        <strong>待导入：{{ pending.roster.classes.length }} 个班级 · {{ count }} 位队员 · {{ pending.materials.length }} 张自定义素材</strong>
        <p>将替换当前全部班级和自定义素材。确认后会先下载当前数据备份，再执行导入。</p>
        <button type="button" :disabled="busy || saving" @click="restore">{{ busy ? '正在导入…' : '确认替换并导入' }}</button>
        <button type="button" :disabled="busy" @click="pending = undefined">取消导入</button>
      </div>
      <p v-if="storageError" role="alert">尚未保存：{{ storageError }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p class="backup-tip">从U盘运行时，请连同 exe 和整个 data 文件夹一起携带，等待保存完成后关闭程序再拔出U盘。</p>
    </section>
  </div>
</template>

<style scoped>
.backup-overlay{position:fixed;inset:0;z-index:1000;background:#020817b8;display:grid;place-items:center;padding:20px}.backup-dialog{width:560px;max-width:100%;max-height:85vh;overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #8ed4ff55;border-radius:16px;background:#0b192f;color:#deedf8;box-shadow:0 20px 80px #0008;font-size:14px;line-height:1.7}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:19px;margin:0}button,.backup-actions label{padding:9px 14px;border:1px solid #aacde444;border-radius:8px;background:#193a55;color:#deedf8;font:inherit;cursor:pointer}header button{font-size:22px;padding:0 10px}code{display:block;overflow-wrap:anywhere;padding:12px;background:#0003;border-radius:8px;font-size:12px}.backup-actions{display:flex;gap:10px;flex-wrap:wrap}.backup-actions input{display:none}button:disabled,.disabled{opacity:.45;cursor:default}.backup-preview{padding:16px;margin-top:18px;border:1px solid #e4bb6855;border-radius:10px}.backup-preview button{margin-right:8px}.backup-tip{color:#8eabc1;font-size:12px}[role=alert]{color:#ffc5b0}
</style>
