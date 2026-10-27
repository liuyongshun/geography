import { allocateRouteSlot, DEFAULT_ROUTE_SEGMENTS, normalizeSegmentCount } from './everestRoutes'

export type Mottos = [string, string, string]
export type Gender = '男' | '女'
export type Student = { id: string; name: string; nameTag: string; gender: Gender; score: number; color: string; routeSlot: number; mottos: Mottos; avatar?: string; personality?: string; hobbies?: string }
export type Classroom = { id: string; name: string; students: Student[]; segments: number }
export type ClassroomStore = { version: 2; activeClassId: string; classes: Classroom[] }
export type ImportCandidate = { className: string; name: string; nameTag: string; gender: Gender | ''; score: number; avatar?: string; mottos: Mottos; personality?: string; hobbies?: string; include: boolean; error?: string }
export const PROFILE_TEXT_LIMIT = 120
export const normalizeProfileText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, PROFILE_TEXT_LIMIT) : ''
export const validProfileText = (value: unknown) => value === undefined || (typeof value === 'string' && value.length <= PROFILE_TEXT_LIMIT)
export const normalizeNameTag = (value: unknown) => String(value ?? '').trim()
export const validNameTag = (value: unknown) => Array.from(normalizeNameTag(value)).length <= 2
export const studentIdentity = (classKey: string, student: { name: string; nameTag?: string }) => JSON.stringify([classKey.trim(), student.name.trim(), normalizeNameTag(student.nameTag)])
export const studentLabel = (student: { name: string; nameTag?: string }) => `${student.name}${normalizeNameTag(student.nameTag) ? `（${normalizeNameTag(student.nameTag)}）` : ''}`
export function updateStudentNameTag(store: ClassroomStore, classId: string, studentId: string, rawTag: string): ClassroomStore {
  const nameTag = normalizeNameTag(rawTag)
  if (!validNameTag(nameTag)) throw new Error('重名标识最多2个字')
  const group = store.classes.find(item => item.id === classId)
  const member = group?.students.find(student => student.id === studentId)
  if (!group || !member) throw new Error('未找到队员')
  const identity = studentIdentity(classId, { ...member, nameTag })
  if (group.students.some(student => student.id !== studentId && studentIdentity(classId, student) === identity)) throw new Error('该班级已有相同姓名和重名标识的学生')
  // Preserve the record id so changing a label keeps scores, pictures and routes attached.
  return { ...store, classes: store.classes.map(item => item.id === classId ? { ...item, students: item.students.map(student => student.id === studentId ? { ...student, nameTag } : student) } : item) }
}
export function normalizeGender(value: unknown): Gender | '' {
  const text = String(value ?? '').trim().toLowerCase()
  return ['男', '男生', 'male', 'm'].includes(text) ? '男' : ['女', '女生', 'female', 'f'].includes(text) ? '女' : ''
}
export const defaultAvatarFor = (gender: unknown) => gender === '女' ? '/images/leaderboard/default-girl.png' : '/images/leaderboard/default-avatar.png'
export const avatarFor = (student: { avatar?: string; gender?: unknown }) => student.avatar || defaultAvatarFor(student.gender)
export function assertRoleAvailable(students: Student[], avatar: string | undefined, exceptId = '') {
  if (!avatar) return
  const owner = students.find(student => student.id !== exceptId && student.avatar === avatar)
  if (owner) throw new Error(`该角色图片已绑定给“${studentLabel(owner)}”，同班不能重复绑定`)
}
export function bindStudentRole(store: ClassroomStore, classId: string, studentId: string, gender: Gender, avatar?: string): ClassroomStore {
  if (!normalizeGender(gender)) throw new Error('请选择性别')
  const group = store.classes.find(item => item.id === classId)
  if (!group || !group.students.some(student => student.id === studentId)) throw new Error('未找到队员')
  if (avatar !== undefined && !isAvatar(avatar)) throw new Error('角色图片无效')
  assertRoleAvailable(group.students, avatar, studentId)
  return { ...store, classes: store.classes.map(item => item.id === classId ? { ...item, students: item.students.map(student => student.id === studentId ? { ...student, gender, avatar } : student) } : item) }
}
export const CLASSROOM_STORAGE_KEY = 'dili-everest-classrooms-v2'
export const CLASSROOM_COLORS = ['#5dd7ff', '#ffc95d', '#ff8e97', '#b394ff', '#73e0ac', '#ff9ed5']
export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const emptyMottos = (): Mottos => ['', '', '']
export function normalizeMottos(raw: unknown): Mottos {
  return [0, 1, 2].map(index => String(Array.isArray(raw) ? raw[index] ?? '' : '').trim().slice(0, 36)) as Mottos
}
export function isAvatar(value: unknown): value is string {
  return typeof value === 'string' && (/^\/images\/leaderboard\/materials\/[FM](0[1-9]|[12]\d|30)\.png$/.test(value) || (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(value) && value.length <= 500_000))
}
export function createClassroom(name: string, students: Student[] = [], segments = DEFAULT_ROUTE_SEGMENTS): Classroom {
  return { id: makeId(), name: name.trim().slice(0, 60), students, segments: normalizeSegmentCount(segments) }
}
export function loadClassrooms(storage: Pick<Storage, 'getItem'>, legacy: Student[], segments: number): ClassroomStore {
  const saved = storage.getItem(CLASSROOM_STORAGE_KEY)
  if (saved) {
    const value = JSON.parse(saved) as ClassroomStore
    if (value.version !== 2 || !Array.isArray(value.classes) || !value.classes.length) throw new Error('班级数据格式无效')
    const classes = value.classes.map(group => ({
      id: String(group.id), name: String(group.name).trim(), segments: normalizeSegmentCount(group.segments),
      students: group.students.map(student => ({ ...student, personality: normalizeProfileText(student.personality), hobbies: normalizeProfileText(student.hobbies), nameTag: normalizeNameTag(student.nameTag), gender: normalizeGender(student.gender) || '男' as Gender, score: Math.max(0, Math.floor(Number(student.score) || 0)), mottos: normalizeMottos(student.mottos), avatar: isAvatar(student.avatar) ? student.avatar : undefined })),
    }))
    return { version: 2, classes, activeClassId: classes.some(group => group.id === value.activeClassId) ? value.activeClassId : classes[0].id }
  }
  const group = createClassroom('默认班级', legacy.map(student => ({ ...student, nameTag: normalizeNameTag(student.nameTag), gender: normalizeGender(student.gender) || '男' })), segments)
  return { version: 2, activeClassId: group.id, classes: [group] }
}
export function classStatistics(group: Classroom) {
  const count = group.students.length
  const total = group.students.reduce((sum, student) => sum + student.score, 0)
  return { count, total, average: count ? total / count : 0, finished: group.students.filter(student => student.score >= group.segments).length }
}
export type RosterSnapshot = { classId: string; students: Student[] }
export function clearClassroomRoster(store: ClassroomStore, classId: string) {
  const group = store.classes.find(item => item.id === classId)
  if (!group) throw new Error('未找到班级')
  const snapshot: RosterSnapshot = { classId, students: group.students.map(student => ({ ...student, mottos: [...student.mottos] })) }
  return { snapshot, store: { ...store, classes: store.classes.map(item => item.id === classId ? { ...item, students: [] } : item) } }
}
export function restoreClassroomRoster(store: ClassroomStore, snapshot: RosterSnapshot): ClassroomStore {
  return { ...store, classes: store.classes.map(group => {
    if (group.id !== snapshot.classId) return group
    const students = [...group.students]
    for (const member of snapshot.students) {
      // Keep new entries/edits, matching the full classroom/name/tag identity.
      if (students.some(student => student.id === member.id || studentIdentity(group.id, student) === studentIdentity(group.id, member))) continue
      const occupied = students.map(student => student.routeSlot)
      students.push({ ...member, avatar: students.some(student => member.avatar && student.avatar === member.avatar) ? undefined : member.avatar, mottos: [...member.mottos], routeSlot: occupied.includes(member.routeSlot) ? allocateRouteSlot(occupied) : member.routeSlot })
    }
    return { ...group, students }
  }) }
}

/** CSV/TSV parser supporting quoted fields, escaped quotes and embedded newlines. */
export function parseDelimited(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '')
  const first = cleaned.split(/\r?\n/, 1)[0]
  const delimiter = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes('，') ? '，' : first.includes(';') ? ';' : '\t'
  const rows: string[][] = [], row: string[] = []
  let field = '', quoted = false
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '"') {
      if (quoted && cleaned[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (ch === delimiter && !quoted) { row.push(field.trim()); field = '' }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      row.push(field.trim()); if (row.some(Boolean)) rows.push([...row]); row.length = 0; field = ''
      if (ch === '\r' && cleaned[i + 1] === '\n') i++
    } else field += ch
  }
  if (quoted) throw new Error('文字名单有未闭合的引号，请检查后重试')
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}
const aliases = {
  nameTag: ['重名标识', '标识', '姓名标识', 'nametag'],
  gender: ['性别', '男女', 'gender', 'sex'],
  name: ['姓名', '学生姓名', '用户名称', '用户名', '名字', 'name'],
  className: ['班级', '班别', 'class', 'classname'],
  score: ['分数', '积分', '得分', 'score'],
  avatar: ['图片', '头像', '照片', 'avatar', 'image', 'photo'],
  personality: ['性格', '性格特点', 'personality'],
  hobbies: ['爱好', '兴趣', '兴趣爱好', 'hobbies', 'hobby'],
  motto0: ['主座右铭', '座右铭', 'motto'], motto1: ['次要座右铭1', '次要1'], motto2: ['次要座右铭2', '次要2'],
}
type Column = keyof typeof aliases
function columnsFor(row: string[]) {
  const result: Partial<Record<Column, number>> = {}
  row.forEach((cell, index) => {
    const key = cell.replace(/[\s（）()＊*]/g, '').toLowerCase()
    for (const [field, names] of Object.entries(aliases)) if (names.includes(key)) result[field as Column] = index
  })
  return result
}
export function recognizeRows(rows: string[][], defaultClass: string, requireHeader = false): ImportCandidate[] {
  const headerIndex = rows.slice(0, 20).findIndex(row => columnsFor(row).name !== undefined)
  if (headerIndex < 0 && requireHeader) return []
  const columns = headerIndex >= 0 ? columnsFor(rows[headerIndex]) : undefined
  const result: ImportCandidate[] = []
  const add = (name: string, className = defaultClass, rawScore = '', avatar?: string, mottos = emptyMottos(), rawGender = '', rawTag = '', personality?: string, hobbies?: string) => {
    const cleaned = name.replace(/^\s*\d+[.、)）]\s*/, '').trim()
    if (!cleaned) return
    const score = rawScore.trim() ? Number(rawScore) : 0
    const gender = normalizeGender(rawGender)
    const nameTag = normalizeNameTag(rawTag)
    const error = !validNameTag(nameTag) ? '重名标识最多2个字' : !Number.isFinite(score) || score < 0 || !Number.isInteger(score) ? '分数须为非负整数' : cleaned.length > 60 ? '姓名过长' : !gender ? '请选择性别' : !validProfileText(personality) || !validProfileText(hobbies) ? '性格和爱好各最多120字' : undefined
    result.push({ name: cleaned, nameTag, gender, className: className.trim() || defaultClass, score: Number.isFinite(score) ? score : 0, avatar, mottos, personality, hobbies, include: !error || error === '请选择性别' || error === '重名标识最多2个字', error })
  }
  for (const row of rows.slice(headerIndex + 1)) {
    if (columns) {
      const read = (key: Column) => columns[key] === undefined ? '' : String(row[columns[key]!] ?? '').trim()
      add(read('name'), read('className') || defaultClass, read('score'), isAvatar(read('avatar')) ? read('avatar') : undefined, normalizeMottos([read('motto0'), read('motto1'), read('motto2')]), read('gender'), read('nameTag'), columns.personality === undefined ? undefined : read('personality'), columns.hobbies === undefined ? undefined : read('hobbies'))
    } else {
      const cells = row.flatMap(cell => cell.trim().split(/[\t ]+/)).filter(Boolean)
      const genderIndex = cells.findIndex(cell => normalizeGender(cell))
      if (genderIndex >= 0) {
        const gender = cells.splice(genderIndex, 1)[0]
        const score = cells.length > 1 && /^\d+$/.test(cells[cells.length - 1]) ? cells.pop()! : ''
        const name = cells.pop() ?? ''
        add(name, cells.join(' ') || defaultClass, score, undefined, emptyMottos(), gender)
      }
      else if (cells.length === 2 && /^\d+$/.test(cells[0])) add(cells[1])
      else if (cells.length === 2 && /^\d+$/.test(cells[1])) add(cells[0], defaultClass, cells[1])
      else cells.forEach(cell => cell.split(/^[\u3400-\u9fff·]{1,12}(?:[ \u3000]+[\u3400-\u9fff·]{1,12})+$/.test(cell) ? /[ \u3000]+/ : /[、；;]+/).forEach(name => add(name)))
    }
  }
  return result
}
export function importCandidates(store: ClassroomStore, candidates: ImportCandidate[], overwrite = false) {
  const classes = store.classes.map(group => ({ ...group, students: group.students.map(student => ({ ...student })) }))
  let added = 0, updated = 0, skipped = 0
  for (const candidate of candidates) {
    if (!candidate.include || candidate.error) continue
    const name = candidate.name.trim(), className = candidate.className.trim()
    const gender = normalizeGender(candidate.gender)
    const nameTag = normalizeNameTag(candidate.nameTag)
    if (!validNameTag(nameTag)) throw new Error('重名标识最多2个字')
    if (!validProfileText(candidate.personality) || !validProfileText(candidate.hobbies)) throw new Error('性格和爱好各最多120字')
    if (!gender || !name || !className || !Number.isInteger(candidate.score) || candidate.score < 0) throw new Error('请修正预览中的姓名、性别、班级或分数')
    let group = classes.find(item => item.name === className)
    if (!group) { group = createClassroom(className); classes.push(group) }
    const existing = group.students.find(student => studentIdentity(group!.id, student) === studentIdentity(group!.id, { name, nameTag }))
    if (existing) {
      if (overwrite) { assertRoleAvailable(group.students, candidate.avatar, existing.id); existing.gender = gender; existing.score = candidate.score; if (isAvatar(candidate.avatar)) existing.avatar = candidate.avatar; if (candidate.mottos.some(Boolean)) existing.mottos = [...candidate.mottos]; if (candidate.personality !== undefined) existing.personality = normalizeProfileText(candidate.personality); if (candidate.hobbies !== undefined) existing.hobbies = normalizeProfileText(candidate.hobbies); updated++ }
      else skipped++
      continue
    }
    assertRoleAvailable(group.students, candidate.avatar)
    group.students.push({ id: makeId(), name, nameTag, gender, score: candidate.score, personality: normalizeProfileText(candidate.personality), hobbies: normalizeProfileText(candidate.hobbies), color: CLASSROOM_COLORS[group.students.length % CLASSROOM_COLORS.length], routeSlot: allocateRouteSlot(group.students.map(student => student.routeSlot)), mottos: [...candidate.mottos], avatar: isAvatar(candidate.avatar) ? candidate.avatar : undefined })
    added++
  }
  return { store: { ...store, classes }, added, updated, skipped }
}
