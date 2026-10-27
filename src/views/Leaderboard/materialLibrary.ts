import { materialCatalog } from './materialCatalog'
import type { ClassroomStore, Gender, Student } from './leaderboardData'

export type Material = { id: string; name: string; gender: Gender | '通用'; src: string; custom?: boolean }
export const builtInMaterials: Material[] = materialCatalog.map(item => ({ ...item }))

/** A role may be reused in another classroom, but never within the same classroom. */
export function randomMaterial(gender: Gender, students: Pick<Student, 'avatar'>[], materials: Material[], random = Math.random): string | undefined {
  const used = new Set(students.map(student => student.avatar).filter(Boolean))
  const available = [...new Set(materials.filter(item => item.gender === gender || item.gender === '通用').map(item => item.src))].filter(src => !used.has(src))
  return available.length ? available[Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))] : undefined
}

export function fillMissingMaterials(store: ClassroomStore, materials: Material[]): ClassroomStore {
  return { ...store, classes: store.classes.map(group => {
    // Reserve all existing roles before assigning any unbound students.
    const students = group.students.map(student => ({ ...student }))
    for (const student of students) if (!student.avatar) student.avatar = randomMaterial(student.gender, students, materials)
    return { ...group, students }
  }) }
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dili-leaderboard-materials-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('materials', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('素材库被其他窗口占用，请关闭其他窗口后重试'))
  })
}
export async function loadCustomMaterials(): Promise<Material[]> {
  const { portableMaterials } = await import('./portableStorage')
  const portable = portableMaterials()
  if (portable) return portable
  return loadBrowserCustomMaterials()
}
export async function loadBrowserCustomMaterials(): Promise<Material[]> {
  const db = await openLibrary()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('materials', 'readonly').objectStore('materials').getAll()
      request.onsuccess = () => resolve(request.result.filter((item: Material) => item.custom && ['男', '女', '通用'].includes(item.gender) && /^data:image\/(png|jpeg);base64,/.test(item.src)))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
export async function saveCustomMaterials(items: Material[]): Promise<void> {
  const { savePortableMaterials } = await import('./portableStorage')
  if (await savePortableMaterials(items)) return
  const db = await openLibrary()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('materials', 'readwrite')
      for (const item of items) transaction.objectStore('materials').put(item)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('素材保存已中止'))
    })
  } finally { db.close() }
}

/** 完整导入使用单次事务替换，失败时 IndexedDB 自动回滚。 */
export async function replaceBrowserMaterials(items: Material[]): Promise<void> {
  const db = await openLibrary()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('materials', 'readwrite')
      const store = transaction.objectStore('materials')
      store.clear()
      for (const item of items) store.put(item)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('素材导入已中止'))
    })
  } finally { db.close() }
}
