import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const routes = url(compile('../src/views/Leaderboard/everestRoutes.ts'))
const data = url(compile('../src/views/Leaderboard/leaderboardData.ts').replace("'./everestRoutes'", `'${routes}'`))
const catalog = url(compile('../src/views/Leaderboard/materialCatalog.ts'))
const library = await import(url(compile('../src/views/Leaderboard/materialLibrary.ts').replace("'./materialCatalog'", `'${catalog}'`)))
const { builtInMaterials, randomMaterial, fillMissingMaterials } = library
const { createClassroom, loadClassrooms, bindStudentRole, isAvatar, avatarFor } = await import(data)
assert.equal(builtInMaterials.length, 60)
for (const gender of ['男', '女']) assert.equal(builtInMaterials.filter(item => item.gender === gender).length, 30)
assert.equal(new Set(builtInMaterials.map(item => item.src)).size, 60)
for (const item of builtInMaterials) {
  const bytes = readFileSync(new URL(`../public${item.src}`, import.meta.url))
  assert.equal(bytes.readUInt32BE(16), 384)
  assert.equal(bytes.readUInt32BE(20), 384)
  assert.equal(bytes[25], 6, 'optimized PNGs must retain RGBA')
  assert.ok(isAvatar(item.src))
}
assert.equal(isAvatar('/images/leaderboard/materials/F31.png'), false)
assert.equal(isAvatar('https://example.com/avatar.png'), false)
const members = Array.from({ length: 64 }, (_, i) => ({ id: `s${i}`, name: `学生${i}`, nameTag: '', gender: i % 2 ? '女' : '男', score: i, color: '#fff', routeSlot: i / 64 * 4, mottos: ['', '', ''] }))
const group = createClassroom('测试班', members)
const original = { version: 2, activeClassId: group.id, classes: [group] }
const assigned = fillMissingMaterials(original, builtInMaterials)
const students = assigned.classes[0].students
assert.equal(students.filter(student => student.avatar).length, 60)
assert.equal(new Set(students.map(student => student.avatar).filter(Boolean)).size, 60)
assert.equal(students.filter(student => !student.avatar).length, 4)
for (const student of students) {
  assert.equal(student.score, Number(student.id.slice(1)))
  if (student.avatar) assert.equal(builtInMaterials.find(item => item.src === student.avatar).gender, student.gender)
  else assert.ok(avatarFor(student).includes('default-'))
}
assert.ok(original.classes[0].students.every(student => !student.avatar), 'allocation must not mutate previous state')
assert.equal(randomMaterial('男', students, builtInMaterials), undefined)
const common = { id: 'custom', name: '通用', gender: '通用', src: 'data:image/png;base64,AAAA', custom: true }
assert.equal(randomMaterial('男', students, [...builtInMaterials, common]), common.src)
assert.equal(randomMaterial('女', [...students, { avatar: common.src }], [...builtInMaterials, common]), undefined)
const reserved = { ...original, classes: [{ ...group, students: [{ ...members[0] }, { ...members[2], avatar: builtInMaterials.find(item => item.gender === '男').src }] }] }
const filled = fillMissingMaterials(reserved, builtInMaterials)
assert.notEqual(filled.classes[0].students[0].avatar, filled.classes[0].students[1].avatar, 'reserve existing roles even when their owner appears later')
const reloaded = loadClassrooms({ getItem: () => JSON.stringify(assigned) }, [], 50)
assert.deepEqual(reloaded.classes[0].students.map(student => student.avatar), students.map(student => student.avatar))
assert.throws(() => bindStudentRole(assigned, group.id, students[2].id, '男', students[0].avatar), /同班不能重复/)

// Built-in identity survives embedded-picture Excel round-trip, so it cannot be reused as a second role.
const require = createRequire(import.meta.url)
const excelSource = compile('../src/views/Leaderboard/leaderboardExcel.ts').replace("'./leaderboardData'", `'${data}'`).replace(/import\(['"]exceljs['"]\)/g, `import('${pathToFileURL(require.resolve('exceljs')).href}')`).replace(/import\(['"]jszip['"]\)/g, `import('${pathToFileURL(require.resolve('jszip')).href}')`)
const { exportClassrooms, readExcelCandidates } = await import(url(excelSource))
const previousFetch = globalThis.fetch
globalThis.fetch = async path => new Response(readFileSync(new URL(`../public${path}`, import.meta.url)))
try {
  const exported = await exportClassrooms([{ ...group, students: students.slice(0, 2) }])
  const parsed = await readExcelCandidates(new File([exported], 'materials.xlsx'), group.name)
  assert.deepEqual(parsed.map(student => [student.name, student.avatar]).sort(), students.slice(0, 2).map(student => [student.name, student.avatar]).sort())
} finally { globalThis.fetch = previousFetch }
console.log('PASS: 60 RGBA assets, gender filtering, class uniqueness, exhaustion fallback, generic uploads, reservation, persistence, binding protection and XLSX identity round-trip.')
