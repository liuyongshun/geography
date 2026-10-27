import { isTauri, invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { CLASSROOM_STORAGE_KEY, type ClassroomStore } from './leaderboardData'
import { createBackup, parseBackup, type LeaderboardBackup } from './leaderboardBackup'
import type { Material } from './materialLibrary'

export const storagePath = ref('当前电脑的浏览器存储（可导出完整备份迁移）')
export const storageError = ref('')
export const saving = ref(false)
let snapshot: LeaderboardBackup | undefined
let customMaterials: Material[] = []
let queue: Promise<void> = Promise.resolve()
let pendingWrites = 0

export async function initializePortableStorage(loadLegacyMaterials: () => Promise<Material[]>) {
  if (!isTauri()) return
  const result = await invoke<{ path: string; data: unknown }>('read_portable_data')
  storagePath.value = result.path
  if (result.data !== null) {
    snapshot = parseBackup(JSON.stringify(result.data))
    customMaterials = snapshot.materials
  } else {
    // 在页面第一次保存名单之前读入旧素材，保证迁移文件包含完整素材库。
    customMaterials = await loadLegacyMaterials()
  }
}

export const rosterStorage = {
  getItem(key: string): string | null {
    if (isTauri() && snapshot && key === CLASSROOM_STORAGE_KEY) return JSON.stringify(snapshot.roster)
    return localStorage.getItem(key)
  },
}

export function portableMaterials(): Material[] | undefined {
  return isTauri() ? customMaterials : undefined
}

async function writeSnapshot(next: LeaderboardBackup) {
  pendingWrites++
  saving.value = true
  const task = queue.then(async () => {
    await invoke('write_portable_data', { data: next })
    storageError.value = ''
  })
  // 后一次仍然可以重试；保留队列顺序，避免旧分数覆盖新分数。
  queue = task.catch(() => {})
  try { await task }
  catch (error) { storageError.value = String(error); throw error }
  finally { saving.value = --pendingWrites > 0 }
}

export async function saveRoster(roster: ClassroomStore) {
  if (!isTauri()) { localStorage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify(roster)); return }
  snapshot = createBackup(roster, customMaterials)
  await writeSnapshot(snapshot)
}

export async function savePortableMaterials(items: Material[]): Promise<boolean> {
  if (!isTauri()) return false
  const merged = new Map(customMaterials.map(item => [item.id, item]))
  for (const item of items) merged.set(item.id, item)
  const nextMaterials = [...merged.values()]
  if (!snapshot) throw new Error('请先打开攀登榜，再添加素材')
  const next = createBackup(snapshot.roster, nextMaterials)
  customMaterials = nextMaterials; snapshot = next
  await writeSnapshot(next)
  return true
}

export async function replacePortableBackup(backup: LeaderboardBackup): Promise<boolean> {
  if (!isTauri()) return false
  await writeSnapshot(backup)
  snapshot = backup; customMaterials = backup.materials
  return true
}
