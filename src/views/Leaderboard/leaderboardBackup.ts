import { isAvatar, validNameTag, validProfileText, type ClassroomStore } from './leaderboardData'
import type { Material } from './materialLibrary'

export type LeaderboardBackup = {
  format: 'dili-leaderboard-backup'; version: 1; exportedAt: string
  roster: ClassroomStore; materials: Material[]
}

// 完整备份必须严格检查，不能像旧缓存迁移一样静默修正或丢弃字段。
export function parseBackup(text: string): LeaderboardBackup {
  const data = JSON.parse(text.replace(/^\uFEFF/, '')) as LeaderboardBackup
  const fail = () => { throw new Error('数据文件格式无效，请选择本程序导出的完整 JSON 备份') }
  const label = (value: unknown, max = 60): value is string => typeof value === 'string' && !!value.trim() && value.length <= max
  if (!data || data.format !== 'dili-leaderboard-backup' || data.version !== 1 || !data.roster || !Array.isArray(data.materials)) return fail()
  const roster = data.roster
  if (roster.version !== 2 || !Array.isArray(roster.classes) || !roster.classes.length) return fail()
  const classIds = new Set<string>()
  for (const group of roster.classes) {
    if (!group || !label(group.id, 200) || classIds.has(group.id) || !label(group.name) || !Number.isInteger(group.segments) || group.segments < 1 || group.segments > 1000 || !Array.isArray(group.students)) return fail()
    classIds.add(group.id)
    const ids = new Set<string>()
    const names = new Set<string>()
    const avatars = new Set<string>()
    for (const student of group.students) {
      if (!student || !label(student.id, 200) || ids.has(student.id) || !label(student.name) || typeof student.nameTag !== 'string' || !validNameTag(student.nameTag) || !['男', '女'].includes(student.gender) || !Number.isSafeInteger(student.score) || student.score < 0 || typeof student.color !== 'string' || !Number.isFinite(student.routeSlot) || student.routeSlot < 0 || student.routeSlot >= 4 || !Array.isArray(student.mottos) || student.mottos.length !== 3 || student.mottos.some(motto => typeof motto !== 'string' || motto.length > 36)) return fail()
      const identity = JSON.stringify([student.name.trim(), student.nameTag.trim()])
      if (!validProfileText(student.personality) || !validProfileText(student.hobbies)) return fail()
      if (names.has(identity)) return fail()
      if (student.avatar !== undefined && (!isAvatar(student.avatar) || avatars.has(student.avatar))) return fail()
      ids.add(student.id); names.add(identity)
      if (student.avatar) avatars.add(student.avatar)
    }
  }
  if (!classIds.has(roster.activeClassId)) return fail()
  const materialIds = new Set<string>()
  for (const material of data.materials) {
    if (!material || !label(material.id, 200) || materialIds.has(material.id) || !label(material.name, 500) || material.custom !== true || !['男', '女', '通用'].includes(material.gender) || !isAvatar(material.src) || !material.src.startsWith('data:image/')) return fail()
    materialIds.add(material.id)
  }
  return data
}

export function createBackup(roster: ClassroomStore, materials: Material[]): LeaderboardBackup {
  return parseBackup(JSON.stringify({ format: 'dili-leaderboard-backup', version: 1, exportedAt: new Date().toISOString(), roster, materials: materials.filter(item => item.custom) }))
}

export function downloadBackup(backup: LeaderboardBackup, suffix = '') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `攀登榜完整数据${suffix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
