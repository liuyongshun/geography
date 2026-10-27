import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/views/Leaderboard/everestRoutes.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { createClimbMotion, advanceClimbMotion, buildRoute, perimeterPoint, routePosition, routeVertices, routeStep, allocateRouteSlot, normalizeSegmentCount, DEFAULT_ROUTE_SEGMENTS, EDGES_PER_SEGMENT } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
for (const target of [1, 25, 50, 1000]) {
  const motion = createClimbMotion(target)
  assert.equal(motion.step, 0, 'entry starts at the route origin')
  for (let frame = 0; frame < 30; frame++) advanceClimbMotion(motion, target, 1 / 30, false)
  assert.equal(motion.step, 0, 'wait for the character image before starting entry')
  let previous = 0
  for (let frame = 0; frame < 105; frame++) {
    advanceClimbMotion(motion, target, 1 / 30)
    assert.ok(motion.step >= previous && motion.step <= target, 'entry follows the route without reversing or overshooting')
    if (frame === 29) assert.ok(motion.step > 0 && motion.step < target)
    previous = motion.step
  }
  assert.equal(motion.step, target)
  assert.equal(motion.arrivalElapsed, undefined)
}
const zero = createClimbMotion(0)
assert.equal(advanceClimbMotion(zero, 0, .1), false)
for (let frame = 0; frame < 4; frame++) advanceClimbMotion(zero, 1, .1)
assert.equal(zero.step, 1, 'ordinary +1 movement keeps its previous speed')
const rebuilt = createClimbMotion(50, 23)
advanceClimbMotion(rebuilt, 50, 0)
assert.equal(rebuilt.step, 23, 'segment/route rebuilds do not replay entry from zero')
const metadata = JSON.parse(readFileSync(new URL('../public/terrain/everest/metadata.json', import.meta.url)))
const bytes = readFileSync(new URL('../public/terrain/everest/height-u16.bin', import.meta.url))
const size = metadata.gridSize
let highest = 0
for (let i = 1; i < size ** 2; i++) if (bytes.readUInt16LE(i * 2) > bytes.readUInt16LE(highest * 2)) highest = i
const summit = [(highest % size) / (size - 1), Math.floor(highest / size) / (size - 1)]
const surface = (u, v) => {
  const x = u * (size - 1), y = v * (size - 1)
  const col = Math.floor(x), row = Math.floor(y)
  const read = (c, r) => bytes.readUInt16LE((Math.min(size - 1, r) * size + Math.min(size - 1, c)) * 2)
  const top = read(col, row) * (1 - (x - col)) + read(col + 1, row) * (x - col)
  const bottom = read(col, row + 1) * (1 - (x - col)) + read(col + 1, row + 1) * (x - col)
  return { x: (u - .5) * metadata.widthMeters, y: metadata.minElevation + (top * (1 - (y - row)) + bottom * (y - row)) / 65535 * (metadata.maxElevation - metadata.minElevation), z: (v - .5) * metadata.heightMeters }
}
for (const total of [1, 10, 50, 100, 200, 1000]) {
for (let member = 0; member < 10; member++) {
  const start = perimeterPoint((member + .5) / 10 * 4)
  const stations = buildRoute(start, summit, surface, total)
  assert.equal(stations.length, total + 1, 'N segments must have N+1 endpoints')
  assert.deepEqual(stations[0], start)
  assert.deepEqual(stations[total], summit)
  for (const step of [0, 1, Math.floor(total / 2), total - 1, total]) {
    assert.deepEqual(routePosition(stations, step, surface), surface(...stations[step]))
  }
  assert.notDeepEqual(routePosition(stations, 0, surface), routePosition(stations, 1, surface))
  const vertices = routeVertices(stations, surface)
  assert.equal(vertices.length, total * EDGES_PER_SEGMENT * 2 * 3)
  assert.ok(vertices.every(Number.isFinite), 'all routes must follow valid terrain')
  assert.deepEqual(routePosition(stations, total + 1, surface), surface(...summit), 'past the final step stays at summit')
}
}
assert.equal(routeStep(-1), 0)
assert.equal(DEFAULT_ROUTE_SEGMENTS, 50)
assert.equal(routeStep(49), 49)
assert.equal(routeStep(50), 50)
assert.equal(routeStep(150), 50)
assert.equal(routeStep(99, 100), 99)
assert.equal(routeStep(NaN), 0)
assert.equal(normalizeSegmentCount(NaN), 50)
assert.equal(normalizeSegmentCount(0), 1)
assert.equal(normalizeSegmentCount(5000), 1000)
const slots = Array.from({ length: 10 }, (_, i) => (i + .5) / 10 * 4)
const original = [...slots]
for (let i = 0; i < 50; i++) {
  const next = allocateRouteSlot(slots)
  assert.ok(!slots.includes(next), 'each new member needs a distinct start')
  slots.push(next)
}
assert.deepEqual(slots.slice(0, original.length), original, 'adding members must preserve existing starts')
assert.deepEqual(JSON.parse(JSON.stringify(slots)), slots, 'assigned starts survive persistence')
console.log('PASS: default 50; 1/10/50/100/200/1000 segments; +1 and summit boundaries; 50 automatic allocations preserve existing routes.')
