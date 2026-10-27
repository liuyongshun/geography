import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import * as THREE from 'three'

const source = readFileSync(new URL('../src/views/Leaderboard/everestTerrainMesh.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace(/from ['"]three['"]/, `from '${pathToFileURL(resolve('node_modules/three/build/three.module.js')).href}'`)
const { createStableEverestTerrain, createTerrainOcclusion } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
const core = JSON.parse(readFileSync(new URL('../public/terrain/everest/metadata.json', import.meta.url)))
const context = JSON.parse(readFileSync(new URL('../public/terrain/everest/context/metadata.json', import.meta.url)))
const bytes = readFileSync(new URL('../public/terrain/everest/height-u16.bin', import.meta.url))
const contextBytes = readFileSync(new URL('../public/terrain/everest/context/height-u16.bin', import.meta.url))
const scale = 180 / core.widthMeters
const surface = (u, v) => {
  const x = Math.min(core.gridSize - 1, Math.max(0, u * (core.gridSize - 1)))
  const y = Math.min(core.gridSize - 1, Math.max(0, v * (core.gridSize - 1)))
  const col = Math.floor(x), row = Math.floor(y)
  const read = (c, r) => bytes.readUInt16LE((Math.min(core.gridSize - 1, r) * core.gridSize + Math.min(core.gridSize - 1, c)) * 2)
  const top = read(col, row) * (1 - (x - col)) + read(col + 1, row) * (x - col)
  const bottom = read(col, row + 1) * (1 - (x - col)) + read(col + 1, row + 1) * (x - col)
  const q = top * (1 - (y - row)) + bottom * (y - row)
  return new THREE.Vector3((u - .5) * 180, q / 65535 * (core.maxElevation - core.minElevation) * scale, (v - .5) * core.heightMeters * scale)
}
const terrain = createStableEverestTerrain(core, context, contextBytes.buffer.slice(contextBytes.byteOffset, contextBytes.byteOffset + contextBytes.byteLength), new THREE.Texture(), surface)
assert.equal(terrain.material.transparent, false, 'terrain must not use overlapping alpha passes')
assert.equal(terrain.material.depthWrite, true)
let maxVertices = 0, area = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
const seams = new Map()
let coreVertices = 0
for (const geometry of terrain.geometries) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv')
  maxVertices = Math.max(maxVertices, positions.count)
  assert.ok(positions.count < 65536, 'each patch must fit 16-bit GPU indices')
  assert.ok(geometry.index.array instanceof Uint16Array)
  for (const index of geometry.index.array) assert.ok(index < positions.count)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  area += (box.max.x - box.min.x) * (box.max.z - box.min.z)
  minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x)
  minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z)
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    assert.ok(Number.isFinite(x + y + z))
    const key = `${x},${z}`, value = [y, normals.getX(i), normals.getY(i), normals.getZ(i)]
    if (seams.has(key)) assert.deepEqual(value, seams.get(key), 'shared patch edges must have identical heights and normals')
    else seams.set(key, value)
    const u = uv.getX(i), v = 1 - uv.getY(i)
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      assert.ok(Math.abs(y - surface(u, v).y) < .005, 'preserve the real summit DEM')
      coreVertices++
    }
  }
}
assert.ok(Math.abs(area / ((maxX - minX) * (maxZ - minZ)) - 1) < 1e-6, 'patches must cover the surface once without gaps or overlap')
assert.ok(coreVertices >= core.gridSize ** 2)
console.log(`PASS: one opaque surface, ${terrain.geometries.length} non-overlapping Uint16 patches, max ${maxVertices} vertices/patch; unchanged core DEM and seamless shared normals.`)
const ridgePositions = new Float32Array(3 * 2 * 3)
for (let row = 0; row < 2; row++) ridgePositions[(row * 3 + 1) * 3 + 1] = 5
const ridgeOccludes = createTerrainOcclusion([0, 1, 2], [0, 1], ridgePositions)
const vec = (x, y, z = .5) => new THREE.Vector3(x, y, z)
assert.equal(ridgeOccludes(vec(-1, 2), vec(2, 1)), true, 'a ridge hides a member behind it')
assert.equal(ridgeOccludes(vec(3, 2), vec(0, 1)), true, 'occlusion works from the opposite direction')
assert.equal(ridgeOccludes(vec(-1, 8), vec(2, 6)), false, 'members above the ridge remain visible')
assert.equal(ridgeOccludes(vec(-1, 2), vec(0, 1)), false, 'foreground members remain visible')
assert.equal(ridgeOccludes(vec(0, 8), vec(0, 1)), false, 'vertical sight lines avoid division by zero')
assert.equal(ridgeOccludes(vec(-2, 1, -1), vec(-1, 1, -1)), false, 'rays outside the surface are unobstructed')
// Compare the accelerated heightfield test to intersections against the actual
// rendered triangles, including the surrounding terrain and patch seams.
terrain.group.updateMatrixWorld(true)
const raycaster = new THREE.Raycaster()
let hidden = 0, shown = 0
for (let i = 0; i < 32; i++) {
  const angle = i * 2.399963229728653
  const origin = vec(Math.cos(angle) * 240, 80, Math.sin(angle) * 240)
  const target = surface(((i * 37) % 101) / 100, ((i * 53) % 101) / 100)
  target.y += 1
  const distance = origin.distanceTo(target)
  raycaster.set(origin, target.clone().sub(origin).normalize())
  raycaster.far = distance - .2
  const expected = raycaster.intersectObject(terrain.group, true).length > 0
  assert.equal(terrain.isOccluded(origin, target), expected, `terrain sight-line ${i} must agree with rendered triangles`)
  if (expected) hidden++; else shown++
}
assert.ok(hidden > 0 && shown > 0)
console.log(`PASS: ridge/front/above/reversed/vertical sight lines; ${hidden} hidden and ${shown} visible real-terrain anchors match triangle raycasts.`)
terrain.geometries.forEach(geometry => geometry.dispose())
terrain.material.dispose(); terrain.backgroundGeometry.dispose(); terrain.backgroundMaterial.dispose()
