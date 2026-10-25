<script setup lang="ts">
/**
 * 内部圈层：斜视切角。右前上方挖掉互成直角的一角，能同时看见切面和球面。
 * 外核半径按古登堡面深度 2900 km；地壳、岩石圈、软流层为看得见而加厚。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Demo3, DemoHex, hexToInt } from '@/demos/theme'

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()

const EARTH_R_KM = 6371
const GUTENBERG_KM = 2900
const INNER_KM = 1220
/** 世界单位中的地球半径 */
const R = 1.32

const rInner = (INNER_KM / EARTH_R_KM) * R
const rCore = ((EARTH_R_KM - GUTENBERG_KM) / EARTH_R_KM) * R

type Band = { r0: number; r1: number; radial?: boolean }

const BANDS: Band[] = [
  { r0: 0, r1: rInner, radial: true },
  { r0: rInner, r1: rCore, radial: true },
  { r0: rCore, r1: R * 0.8 },
  { r0: R * 0.8, r1: R * 0.9 },
  { r0: R * 0.9, r1: R * 0.962 },
  { r0: R * 0.962, r1: R },
]

type LabelMode = 'onDark' | 'onLight' | 'tag'

type FlowArrow = { group: THREE.Group; dir: THREE.Vector3; base: THREE.Vector3 }

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let earth: THREE.Group | null = null
let raf = 0
let disposed = false
let phase = 0
let lastT = 0
const flows: FlowArrow[] = []
let resizeObs: ResizeObserver | null = null

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** 铁镍核：中心白热，向外转为熔金，和岩浆红分开。径向贴图以地心为圆心。 */
function ironTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')!
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, '#fffdf8')
  grd.addColorStop(rInner / R, '#ffe9a8')
  grd.addColorStop(rCore / R, '#e88812')
  grd.addColorStop(1, '#e88812')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeLabel(text: string, mode: LabelMode, worldH: number) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 48
  const font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  ctx.font = font
  const tw = Math.ceil(ctx.measureText(text).width)
  const padX = mode === 'onLight' ? 8 : 22
  const logicalW = tw + padX * 2
  const logicalH = fontSize + (mode === 'onLight' ? 10 : 20)
  canvas.width = logicalW * 2
  canvas.height = logicalH * 2
  const g = canvas.getContext('2d')!
  g.setTransform(2, 0, 0, 2, 0, 0)
  g.font = font
  g.textBaseline = 'middle'
  if (mode === 'onDark') {
    g.fillStyle = 'rgba(8,12,18,0.84)'
    roundRect(g, 1, 1, logicalW - 2, logicalH - 2, 8)
    g.fill()
    g.fillStyle = DemoHex.ink
  } else if (mode === 'tag') {
    g.fillStyle = 'rgba(255,248,240,0.94)'
    roundRect(g, 1, 1, logicalW - 2, logicalH - 2, 8)
    g.fill()
    g.fillStyle = DemoHex.sphereLine
  } else {
    g.lineWidth = 8
    g.strokeStyle = 'rgba(255,248,240,0.92)'
    g.strokeText(text, padX, logicalH / 2 + 1)
    g.fillStyle = DemoHex.sphereLine
  }
  g.fillText(text, padX, logicalH / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  )
  spr.scale.set(worldH * (logicalW / logicalH), worldH, 1)
  spr.renderOrder = 20
  return spr
}

/**
 * 右前上方挖掉一角。墙面斜对观众，底面朝上，能同时看见两块切面。
 */
function biteFrame() {
  const wallN = new THREE.Vector3(0.78, 0.06, 0.62).normalize()
  const floorN = new THREE.Vector3(-0.05, 0.96, 0.12)
  floorN.addScaledVector(wallN, -floorN.dot(wallN)).normalize()
  const sideN = new THREE.Vector3().crossVectors(wallN, floorN)
  if (sideN.z < 0) sideN.negate()
  sideN.normalize()
  const center = wallN.clone().add(floorN).add(sideN).normalize()
  return {
    ax: wallN,
    ay: floorN,
    az: sideN,
    center,
    hinge: sideN,
    edgeA: floorN,
    edgeB: wallN,
    mouth: center,
    half: Math.PI / 4,
  }
}

const BITE = biteFrame()

function inBite(p: THREE.Vector3) {
  return p.dot(BITE.ax) > 1e-4 && p.dot(BITE.ay) > 1e-4 && p.dot(BITE.az) > 1e-4
}

/** 球面只挖右前四分之一，经纬与贴图仍是北极朝上。 */
function shellGeometry(radius: number) {
  const geo = new THREE.SphereGeometry(radius, 256, 168)
  const pos = geo.attributes.position
  const src = geo.index!
  const next: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const mid = new THREE.Vector3()
  for (let i = 0; i < src.count; i += 3) {
    a.fromBufferAttribute(pos, src.getX(i))
    b.fromBufferAttribute(pos, src.getX(i + 1))
    c.fromBufferAttribute(pos, src.getX(i + 2))
    mid.copy(a).add(b).add(c)
    if (!inBite(mid)) next.push(src.getX(i), src.getX(i + 1), src.getX(i + 2))
  }
  geo.setIndex(next)
  geo.computeVertexNormals()
  return geo
}

/** 两根棱之间的扇形环带，略向 toward 方向偏移，避免和球面抢深度。 */
function makeFan(
  rayA: THREE.Vector3,
  rayB: THREE.Vector3,
  toward: THREE.Vector3,
  r0: number,
  r1: number,
  mat: THREE.Material,
  radial = false,
) {
  const steps = 42
  const angle = rayA.angleTo(rayB)
  const axis = new THREE.Vector3().crossVectors(rayA, rayB).normalize()
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const dir = rayA.clone().applyAxisAngle(axis, (angle * i) / steps)
    const inner = dir.clone().multiplyScalar(Math.max(r0, 0.001))
    const outer = dir.clone().multiplyScalar(r1)
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z)
    if (radial) {
      uvs.push(
        0.5 + inner.x / (2 * R),
        0.5 + inner.y / (2 * R),
        0.5 + outer.x / (2 * R),
        0.5 + outer.y / (2 * R),
      )
    } else {
      const u = (i / steps) * 2.4
      uvs.push(u, 0, u, 1)
    }
    if (i < steps) {
      const v = i * 2
      indices.push(v, v + 1, v + 3, v, v + 3, v + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  if (axis.dot(toward) < 0) axis.negate()
  mesh.position.copy(axis).multiplyScalar(0.012)
  return mesh
}

function along(dir: THREE.Vector3, radius: number) {
  return dir.clone().normalize().multiplyScalar(radius)
}

function makeArrow(color: number, len: number, scale = 1) {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
  const headH = Math.min(0.14, len * 0.32) * scale
  const shaftLen = Math.max(0.08, len - headH / scale)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, shaftLen, 8), mat)
  shaft.position.y = shaftLen / 2
  shaft.renderOrder = 8
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.07 * scale, headH, 12), mat)
  head.position.y = shaftLen + headH / 2
  head.renderOrder = 8
  g.add(shaft, head)
  g.renderOrder = 8
  return g
}

function pointArrow(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  if (dir.lengthSq() < 1e-6) return
  dir.normalize()
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.position.copy(from)
}

function addFlow(from: THREE.Vector3, to: THREE.Vector3) {
  if (!earth) return
  const len = from.distanceTo(to)
  const outline = makeArrow(Demo3.sphereLine, len, 1.45)
  pointArrow(outline, from, to)
  outline.renderOrder = 7
  earth.add(outline)
  const group = makeArrow(Demo3.sphereRise, len)
  pointArrow(group, from, to)
  earth.add(group)
  flows.push({
    group,
    dir: to.clone().sub(from).normalize(),
    base: from.clone(),
  })
  flows.push({
    group: outline,
    dir: to.clone().sub(from).normalize(),
    base: from.clone(),
  })
}

function addCallout(
  text: string,
  anchor: THREE.Vector3,
  labelAt: THREE.Vector3 | null,
  mode: LabelMode,
  worldH = 0.1,
) {
  if (!earth) return
  const spr = makeLabel(text, mode, worldH)
  const pos = labelAt ?? anchor
  spr.position.copy(pos)
  earth.add(spr)
  if (!labelAt || labelAt.distanceTo(anchor) < 0.08) return
  const start = labelAt.clone().lerp(anchor, 0.22)
  const geo = new THREE.BufferGeometry().setFromPoints([start, anchor])
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color: hexToInt(DemoHex.ink),
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }),
  )
  line.renderOrder = 12
  earth.add(line)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 10, 8),
    new THREE.MeshBasicMaterial({
      color: hexToInt(DemoHex.ink),
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }),
  )
  dot.position.copy(anchor)
  dot.renderOrder = 16
  earth.add(dot)
}

function makeDim(from: THREE.Vector3, to: THREE.Vector3) {
  const g = new THREE.Group()
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  if (len < 1e-4) return g
  dir.normalize()
  const mat = new THREE.MeshBasicMaterial({
    color: hexToInt(DemoHex.ink),
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  })
  const headH = 0.09
  const shaftLen = Math.max(0.05, len - headH * 1.2)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, shaftLen, 6), mat)
  shaft.position.copy(from).add(to).multiplyScalar(0.5)
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const headA = new THREE.Mesh(new THREE.ConeGeometry(0.034, headH, 10), mat)
  headA.quaternion.copy(shaft.quaternion)
  headA.position.copy(to).addScaledVector(dir, -headH * 0.42)
  const headB = new THREE.Mesh(new THREE.ConeGeometry(0.034, headH, 10), mat)
  headB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate())
  headB.position.copy(from).addScaledVector(dir, headH * 0.42)
  g.renderOrder = 8
  shaft.renderOrder = 8
  headA.renderOrder = 8
  headB.renderOrder = 8
  g.add(shaft, headA, headB)
  return g
}

function disposeObj(obj: THREE.Object3D) {
  const mats = new Set<THREE.Material>()
  const geos = new Set<THREE.BufferGeometry>()
  const texs = new Set<THREE.Texture>()
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry && 'dispose' in mesh.geometry) geos.add(mesh.geometry as THREE.BufferGeometry)
    const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!mat) return
    const list = Array.isArray(mat) ? mat : [mat]
    for (const m of list) mats.add(m)
  })
  for (const m of mats) {
    const mapped = m as THREE.MeshBasicMaterial
    if (mapped.map) texs.add(mapped.map)
    m.dispose()
  }
  for (const g of geos) g.dispose()
  for (const t of texs) t.dispose()
}

function buildEarth() {
  if (!scene || !renderer) return
  const activeRenderer = renderer
  earth = new THREE.Group()
  scene.add(earth)

  const loader = new THREE.TextureLoader()
  const marble = loader.load('/textures/earth-blue-marble.jpg')
  marble.colorSpace = THREE.SRGBColorSpace
  marble.anisotropy = activeRenderer.capabilities.getMaxAnisotropy()
  marble.wrapS = THREE.RepeatWrapping
  marble.offset.x = 0.58

  const shell = new THREE.Mesh(
    shellGeometry(R),
    new THREE.MeshStandardMaterial({
      map: marble,
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.FrontSide,
    }),
  )
  earth.add(shell)

  const loadRock = (url: string) => {
    const tex = loader.load(url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = activeRenderer.capabilities.getMaxAnisotropy()
    return tex
  }
  // ambientCG CC0：土色沉积岩、岩浆岩、熔岩。地核无实拍，用铁镍熔融色。
  const strata = loadRock('/textures/rocks/strata-color.jpg')
  const igneous = loadRock('/textures/rocks/igneous-color.jpg')
  const lava = loadRock('/textures/rocks/lava-color.jpg')
  const iron = ironTexture()
  const bandLooks: { map: THREE.Texture; tint: string; radial?: boolean }[] = [
    { map: iron, tint: '#ffffff', radial: true },
    { map: iron, tint: '#ffffff', radial: true },
    { map: lava, tint: '#ff9a55' },
    { map: igneous, tint: '#e07038' },
    { map: igneous, tint: '#d9d0c4' },
    { map: strata, tint: '#ffffff' },
  ]

  const makeMats = (darken: number) =>
    BANDS.map((_, i) => {
      const look = bandLooks[i]!
      return new THREE.MeshBasicMaterial({
        map: look.map,
        color: new THREE.Color(look.tint).multiplyScalar(darken),
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -i,
      })
    })
  const faceMats = [makeMats(1), makeMats(0.74), makeMats(0.86)]

  const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [BITE.hinge, BITE.edgeA, BITE.edgeB],
    [BITE.hinge, BITE.edgeB, BITE.edgeA],
    [BITE.edgeA, BITE.edgeB, BITE.hinge],
  ]
  faces.forEach(([a, b, toward], fi) => {
    BANDS.forEach((band, i) => {
      earth!.add(makeFan(a, b, toward, band.r0, band.r1, faceMats[fi]![i]!, band.radial))
    })
  })

  const upper = BITE.edgeA.y >= BITE.edgeB.y ? BITE.edgeA : BITE.edgeB
  const lower = upper === BITE.edgeA ? BITE.edgeB : BITE.edgeA
  const wallN = new THREE.Vector3().crossVectors(BITE.hinge, upper)
  if (wallN.dot(lower) < 0) wallN.negate()
  wallN.normalize()

  camera!.updateMatrixWorld()
  const camDir = camera!.position.clone().normalize()
  const faceRays: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [BITE.hinge, BITE.edgeA, BITE.edgeB],
    [BITE.hinge, BITE.edgeB, BITE.edgeA],
    [BITE.edgeA, BITE.edgeB, BITE.hinge],
  ]
  let face = faceRays[0]!
  let faceDot = -Infinity
  for (const rays of faceRays) {
    const d = rays[2]!.dot(camDir)
    if (d > faceDot) {
      faceDot = d
      face = rays
    }
  }
  const mid = face[0]!.clone().add(face[1]!).normalize()

  const bandMid = (r0: number, r1: number) => along(mid, (r0 + r1) * 0.5)
  const rows = [
    { text: '地壳', anchor: bandMid(R * 0.962, R), mode: 'onDark' as const, h: 0.08 },
    { text: '岩石圈', anchor: bandMid(R * 0.9, R * 0.962), mode: 'onDark' as const, h: 0.08 },
    { text: '软流层', anchor: bandMid(R * 0.8, R * 0.9), mode: 'onDark' as const, h: 0.08 },
    { text: '地幔', anchor: bandMid(rCore, R * 0.8), mode: 'onDark' as const, h: 0.08 },
    { text: '外核', anchor: bandMid(rInner, rCore), mode: 'onDark' as const, h: 0.08 },
    { text: '内核', anchor: along(mid, rInner * 0.46), mode: 'onDark' as const, h: 0.076 },
  ].map((row) => {
    const ndc = row.anchor.clone().project(camera!)
    return { ...row, y: ndc.y, z: ndc.z }
  })
  rows.sort((a, b) => b.y - a.y)
  const gap = 0.11
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1]!.y - rows[i]!.y < gap) rows[i]!.y = rows[i - 1]!.y - gap
  }
  const bottom = rows[rows.length - 1]!.y
  if (bottom < -0.8) {
    const shift = -0.8 - bottom
    for (const row of rows) row.y += shift
  }
  for (const row of rows) {
    const at = new THREE.Vector3(0.68, THREE.MathUtils.clamp(row.y, -0.82, 0.84), row.z).unproject(camera!)
    addCallout(row.text, row.anchor, at, row.mode, row.h)
  }

  const groundDir = new THREE.Vector3(-0.78, 0.32, 0.12).normalize()
  const ground = groundDir.clone().multiplyScalar(R * 1.01)
  const groundNdc = ground.clone().project(camera!)
  const groundAt = new THREE.Vector3(groundNdc.x - 0.16, groundNdc.y + 0.06, groundNdc.z).unproject(camera!)
  addCallout('地面', ground, groundAt, 'onDark', 0.078)

  const radiusB = along(BITE.hinge, R * 0.98)
  earth.add(makeDim(along(BITE.hinge, 0.03), radiusB))
  const radiusNdc = radiusB.clone().project(camera!)
  addCallout(
    '6371千米',
    radiusB,
    new THREE.Vector3(radiusNdc.x - 0.06, radiusNdc.y - 0.16, radiusNdc.z).unproject(camera!),
    'tag',
    0.072,
  )

  const gutInner = along(lower, rCore)
  const gutOuter = along(lower, R * 0.98)
  earth.add(makeDim(gutInner, gutOuter))
  const gutNdc = gutInner.clone().project(camera!)
  addCallout(
    '2900千米',
    gutInner,
    new THREE.Vector3(gutNdc.x + 0.1, gutNdc.y - 0.14, gutNdc.z).unproject(camera!),
    'tag',
    0.072,
  )

  const lift = wallN.clone().multiplyScalar(0.05)
  addFlow(along(upper, rCore + 0.08).add(lift), along(upper, R * 0.82).add(lift))
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth || 800
  const h = Math.max(320, wrapRef.value.clientHeight || 600)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function setup() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  const w = wrapRef.value.clientWidth || 800
  const h = Math.max(320, wrapRef.value.clientHeight || 600)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(Demo3.canvas)

  camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 40)
  camera.position.set(-0.85, 1.55, 4.75)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.enablePan = false
  controls.target.set(0.02, -0.04, 0)
  controls.minDistance = 3.1
  controls.maxDistance = 8.2
  controls.minPolarAngle = 0.25
  controls.maxPolarAngle = Math.PI * 0.82
  controls.update()

  scene.add(new THREE.AmbientLight(Demo3.lightFill, 0.45))
  scene.add(new THREE.HemisphereLight(Demo3.lightHemiSky, Demo3.lightHemiGround, 0.72))
  const key = new THREE.DirectionalLight(Demo3.lightKey, 1.55)
  key.position.set(-2.2, 3.2, 3.4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(Demo3.lightFill, 0.55)
  fill.position.set(-2.6, 0.4, 1.6)
  scene.add(fill)

  buildEarth()
  lastT = performance.now()
  loop()
  resizeObs = new ResizeObserver(() => onResize())
  resizeObs.observe(wrapRef.value)
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  phase += dt
  const bob = Math.sin(phase * 1.45) * 0.035
  for (const flow of flows) {
    flow.group.position.copy(flow.base).addScaledVector(flow.dir, bob)
  }
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function teardown() {
  disposed = true
  cancelAnimationFrame(raf)
  resizeObs?.disconnect()
  resizeObs = null
  controls?.dispose()
  if (earth) {
    scene?.remove(earth)
    disposeObj(earth)
  }
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  controls = null
  earth = null
  flows.length = 0
}

onMounted(setup)
onUnmounted(teardown)
</script>

<template>
  <div class="cut">
    <div class="toolbar">
      <span class="hint">拖动旋转 · 壳为土色岩石、地幔为熔岩、地核为铁镍色 · 橙箭头为地幔物质上涌 · 壳与软流层厚度已夸张</span>
    </div>
    <div ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" />
    </div>
  </div>
</template>

<style scoped>
.cut {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--demo-canvas);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.hint {
  font-size: 12px;
  color: var(--text-400);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.globe {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
