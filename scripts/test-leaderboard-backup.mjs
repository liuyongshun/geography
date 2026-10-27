import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const routes = url(compile('../src/views/Leaderboard/everestRoutes.ts'))
const data = url(compile('../src/views/Leaderboard/leaderboardData.ts').replace("'./everestRoutes'", `'${routes}'`))
const backupUrl = url(compile('../src/views/Leaderboard/leaderboardBackup.ts').replace("'./leaderboardData'", `'${data}'`))
const { createBackup, parseBackup } = await import(backupUrl)
const roster = { version: 2, activeClassId: 'c1', classes: [
  { id: 'c1', name: '高一1班', segments: 100, students: [{ id: 's1', name: '小明', nameTag: '', gender: '男', score: 18, routeSlot: 1.2, color: '#fff', mottos: ['加油', '坚持', ''], avatar: 'data:image/png;base64,AAAA' }] },
  { id: 'c2', name: '高一2班', segments: 50, students: [] },
] }
const materials = [{ id: 'm1', name: '角色一', gender: '通用', custom: true, src: 'data:image/png;base64,AAAA' }]
roster.classes[0].students[0].personality = '开朗、细心'
roster.classes[0].students[0].hobbies = '阅读、篮球'
const backup = createBackup(roster, materials)
assert.deepEqual(parseBackup(`\uFEFF${JSON.stringify(backup)}`), backup)
assert.deepEqual(backup.roster, roster)
assert.deepEqual(backup.materials, materials)
const legacyBackup = structuredClone(backup)
delete legacyBackup.roster.classes[0].students[0].personality
delete legacyBackup.roster.classes[0].students[0].hobbies
assert.doesNotThrow(() => parseBackup(JSON.stringify(legacyBackup)), 'old complete backups remain importable')
assert.throws(() => parseBackup('{broken'))
for (const mutate of [
  item => { item.version = 2 },
  item => { item.roster.classes[0].students[0].score = -1 },
  item => { item.roster.classes[0].segments = 1001 },
  item => { item.roster.classes[0].students[0].routeSlot = 4 },
  item => { item.roster.classes[0].students[0].avatar = 'https://example.com/x.png' },
  item => { item.roster.activeClassId = 'missing' },
  item => { item.roster.classes.push(item.roster.classes[0]) },
  item => { item.roster.classes[0].students.push(item.roster.classes[0].students[0]) },
  item => { item.materials[0].src = 'javascript:alert(1)' },
  item => { item.roster.classes[0].students[0].personality = '长'.repeat(121) },
  item => { item.roster.classes[0].students[0].hobbies = { invalid: true } },
]) {
  const invalid = structuredClone(backup); mutate(invalid)
  assert.throws(() => parseBackup(JSON.stringify(invalid)))
}

// 使用延迟写入的原生命令替身，验证磁盘优先、迁移、队列和失败后的重试。
let native = true, disk = backup, fail = false
let writes = [], inflight = 0, maximum = 0
globalThis.__backupTest = {
  isTauri: () => native,
  async invoke(command, args) {
    if (command === 'read_portable_data') return { path: 'E:\\地理过程\\data\\leaderboard.json', data: disk }
    inflight++; maximum = Math.max(maximum, inflight)
    await new Promise(resolve => setTimeout(resolve, 5))
    inflight--
    if (fail) throw new Error('U盘不可写')
    disk = structuredClone(args.data); writes.push(disk)
  },
}
const tauri = url('export const {isTauri,invoke} = globalThis.__backupTest')
const vue = url('export const ref = value => ({value})')
const storageSource = compile('../src/views/Leaderboard/portableStorage.ts')
  .replace("'@tauri-apps/api/core'", `'${tauri}'`).replace("'vue'", `'${vue}'`)
  .replace("'./leaderboardData'", `'${data}'`).replace("'./leaderboardBackup'", `'${backupUrl}'`)
const storage = await import(url(storageSource))
globalThis.localStorage = { getItem: () => { throw new Error('不应该读取旧缓存') } }
await storage.initializePortableStorage(() => { throw new Error('已有文件不能迁移旧素材') })
assert.deepEqual(JSON.parse(storage.rosterStorage.getItem('dili-everest-classrooms-v2')), roster)
assert.deepEqual(storage.portableMaterials(), materials)
const next = structuredClone(roster)
next.classes[0].students[0].score = 19
const first = storage.saveRoster(next)
next.classes[0].students[0].score = 20
const second = storage.saveRoster(next)
await Promise.all([first, second])
assert.equal(maximum, 1)
assert.deepEqual(writes.map(item => item.roster.classes[0].students[0].score), [19, 20])
assert.equal(disk.roster.classes[0].students[0].score, 20)
assert.equal(storage.saving.value, false)
fail = true
await assert.rejects(storage.saveRoster(next), /U盘不可写/)
assert.match(storage.storageError.value, /U盘不可写/)
fail = false
await storage.saveRoster(next)
assert.equal(storage.storageError.value, '')
await storage.replacePortableBackup(backup)
assert.deepEqual(disk, backup)
assert.deepEqual(storage.portableMaterials(), materials)

disk = null; writes = []
const migration = await import(url(`${storageSource}\n// 新实例：首次迁移`))
await migration.initializePortableStorage(async () => materials)
await migration.saveRoster(roster)
assert.deepEqual(disk.materials, materials)
assert.deepEqual(disk.roster, roster)

native = false
let browserSaved
globalThis.localStorage = { setItem: (key, value) => { browserSaved = value }, getItem: () => browserSaved }
await migration.saveRoster(roster)
assert.deepEqual(JSON.parse(browserSaved), roster)
assert.equal(await migration.replacePortableBackup(backup), false)
delete globalThis.__backupTest
console.log('PASS: full backup round-trip, strict rejection, disk priority, legacy material migration, serialized score saves, write failure/retry, replacement and browser fallback.')
