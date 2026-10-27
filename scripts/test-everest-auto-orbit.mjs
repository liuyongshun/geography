import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const source = readFileSync(new URL('../src/views/Leaderboard/everestAutoOrbit.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { AUTO_ORBIT_SPEED, ORBIT_RESUME_DELAY_MS, EverestAutoOrbit } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const orbit = new EverestAutoOrbit()
assert.equal(orbit.tick(1000), 0)
assert.equal(orbit.tick(1050), .05)
orbit.beginInteraction()
assert.equal(orbit.canRotate(100000), false, 'manual dragging suspends auto orbit')
orbit.endInteraction(1100)
assert.equal(orbit.canRotate(1100 + ORBIT_RESUME_DELAY_MS - 1), false)
assert.equal(orbit.canRotate(1100 + ORBIT_RESUME_DELAY_MS), true)
orbit.resetClock()
assert.equal(orbit.tick(500000), 0, 'returning from a hidden tab must not catch up missed rotation')
assert.equal(orbit.tick(510000), .1, 'a slow frame cannot jump by seconds of rotation')
function positionAfter(seconds, fps) {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(100, 40, 0)
  const controls = new OrbitControls(camera)
  controls.autoRotate = true
  controls.autoRotateSpeed = AUTO_ORBIT_SPEED
  for (let i = 0; i < seconds * fps; i++) controls.update(1 / fps)
  return camera.position
}
const at30 = positionAfter(15, 30), at60 = positionAfter(15, 60)
assert.ok(at30.distanceTo(at60) < 1e-7, 'rotation speed is independent of frame rate')
assert.ok(Math.abs(at30.x) < 1e-7 && Math.abs(Math.abs(at30.z) - 100) < 1e-7, 'fifteen seconds rotates a quarter turn')
assert.ok(positionAfter(60, 30).distanceTo(new THREE.Vector3(100, 40, 0)) < 1e-7, 'one revolution takes one minute')
console.log('PASS: one-minute orbit, equal speed at 30/60fps, drag pause and delayed resume, hidden-tab reset, bounded frame delta.')
