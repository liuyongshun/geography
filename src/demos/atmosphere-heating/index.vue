<script setup lang="ts">
/**
 * 大气受热过程 · 临边空间场景
 *
 * 空间评估：
 * 1. 空间关系是核心：短波自上而下穿过平流层臭氧和对流层，地面长波向上，大气逆辐射向下。
 * 2. 换视角能看见气块厚度、云层反射折返和射线是否停在某一层。
 * 3. 真实质感：Blue Marble 昼夜地表、日面、写实云；气层厚度按教学放大。
 * 4. 单场景、受控轨道相机、箭头数量有限，桌面与窄屏可接受。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { Demo3, DemoHex } from '@/demos/theme'
import { configureEarthRenderer, createRealisticEarth, type RealisticEarth } from '@/engine/realisticEarth'
import { makeSunBillboard } from '@/engine/sunVisual'

const props = defineProps<{ stepId: string; demo: DemoEntry }>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const focus = ref<'all' | 'ozone' | 'vapor' | 'scatter' | 'reflect'>('all')
const mode = ref<'normal' | 'more'>('normal')
const playing = ref(true)

const focuses = [
  { id: 'all', label: '全部' },
  { id: 'ozone', label: '臭氧吸收' },
  { id: 'vapor', label: '水汽吸收' },
  { id: 'scatter', label: '散射' },
  { id: 'reflect', label: '反射' },
] as const

const title = computed(() => {
  if (props.stepId === 'weaken') return '大气削弱作用'
  if (props.stepId === 'sun-ground') return '太阳暖大地'
  if (props.stepId === 'ground-air') return '大地暖大气'
  return mode.value === 'more' ? '保温作用增强' : '大气还大地'
})

const hint = computed(() => {
  if (props.stepId === 'weaken') {
    if (focus.value === 'ozone') return '平流层臭氧选择性吸收紫外线'
    if (focus.value === 'vapor') return '对流层水汽、二氧化碳选择性吸收太阳红外光'
    if (focus.value === 'scatter') return '空气分子和微小尘埃选择性散射蓝光、紫光'
    if (focus.value === 'reflect') return '云层和较大尘埃反射太阳辐射，无选择性'
    return '吸收、散射有选择性；云层反射无选择性'
  }
  if (props.stepId === 'sun-ground') return '未被削弱的短波穿过大气，地面吸收后增温'
  if (props.stepId === 'ground-air') return '地面放出长波辐射，对流层水汽和二氧化碳吸收'
  if (mode.value === 'more') return '温室气体增多：射向太空的长波减少，逆辐射增强'
  return '大气以逆辐射把热量还给地面'
})

const R = 100
const FOV = 32
const SUN_DRAW = 5.6
const EARTH_YAW = 1.35
const SECTOR = 0.36

type Poly = { points: THREE.Vector3[]; lens: number[]; total: number }
type Runner = {
  arrow: THREE.Group
  poly: Poly
  phase: number
  period: number
  mats: THREE.MeshBasicMaterial[]
  tip: number
}
type Beam = {
  id: string
  tubes: THREE.Mesh[]
  upper?: THREE.Mesh[]
  runners: Runner[]
  markers: THREE.Mesh[]
  presence: Record<string, number>
  focuses: string[]
  opacity: number
  limitU: number
  pulse: 'uv' | 'ir' | 'ground' | ''
}
type Tag = {
  sprite: THREE.Sprite
  baseW: number
  baseH: number
  opacity: number
  gate: () => number
}
type Pose = { pos: THREE.Vector3; target: THREE.Vector3 }

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let root: THREE.Group | null = null
let earth: RealisticEarth | null = null
let sunLook: ((c: THREE.Camera) => void) | null = null
let sunDispose: (() => void) | null = null
let cloudTexture: THREE.Texture | null = null
let tropoMat: THREE.MeshBasicMaterial | null = null
let ozoneMat: THREE.MeshBasicMaterial | null = null
let groundSkin: THREE.MeshBasicMaterial | null = null
let groundDisc: THREE.MeshBasicMaterial | null = null
let dustMat: THREE.PointsMaterial | null = null
let coarseMat: THREE.PointsMaterial | null = null
const beams: Beam[] = []
const tags: Tag[] = []
const clouds: THREE.Sprite[] = []
const normal = new THREE.Vector3()
const east = new THREE.Vector3()
const side = new THREE.Vector3()
const blendFromPos = new THREE.Vector3()
const blendFromTarget = new THREE.Vector3()
const blendToPos = new THREE.Vector3()
const blendToTarget = new THREE.Vector3()
let camMix = 1
let dragging = false
let disposed = false
let raf = 0
let clock = 0
let lastStamp = 0
let uvPulse = 0
let irPulse = 0
let groundPulse = 0
let warmMix = 0
let groundGlow = 0
let resizeObs: ResizeObserver | null = null
const tropoBase = new THREE.Color(Demo3.cold)
const warmColor = new THREE.Color(Demo3.warm)

function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function damp(current: number, target: number, dt: number, speed = 6) {
  return current + (target - current) * (1 - Math.exp(-dt * speed))
}

function at(h: number, e = 0, s = 0) {
  return normal
    .clone()
    .addScaledVector(east, e / R)
    .addScaledVector(side, s / R)
    .normalize()
    .multiplyScalar(R + h)
}

function pose(e: number, up: number, s: number, lookH: number, lookE = 0, lookS = 0): Pose {
  const target = at(lookH, lookE, lookS)
  return {
    target,
    pos: target
      .clone()
      .addScaledVector(east, e)
      .addScaledVector(normal, up)
      .addScaledVector(side, s),
  }
}

function desiredPose(): Pose {
  if (props.stepId === 'weaken' && focus.value !== 'all') {
    if (focus.value === 'ozone') return pose(-42, 34, 90, 22, -14, 2)
    if (focus.value === 'vapor') return pose(-36, 26, 86, 9, 14, 0)
    if (focus.value === 'scatter') return pose(-40, 28, 84, 10, 0, 2)
    return pose(-30, 26, 88, 12, 18, 2)
  }
  if (props.stepId === 'sun-ground') return pose(-40, 24, 86, 6, 0, 0)
  if (props.stepId === 'ground-air') return pose(-34, 22, 84, 11, -6, 0)
  if (props.stepId === 'return') return pose(-28, 26, 88, 12, 8, 0)
  return pose(-46, 30, 92, 14, -6, 0)
}

function startBlend() {
  if (!camera || !controls) return
  blendFromPos.copy(camera.position)
  blendFromTarget.copy(controls.target)
  const next = desiredPose()
  blendToPos.copy(next.pos)
  blendToTarget.copy(next.target)
  camMix = 0
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function makeLabel(text: string, color: string, boxed = false) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 22
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  const cssW = tw + 18
  const cssH = fontSize + 12
  const ratio = 2
  canvas.width = cssW * ratio
  canvas.height = cssH * ratio
  const g = canvas.getContext('2d')!
  g.scale(ratio, ratio)
  g.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  g.fillStyle = 'rgba(7,11,22,0.82)'
  roundRect(g, 1, 1, cssW - 2, cssH - 2, 6)
  g.fill()
  if (boxed) {
    g.strokeStyle = color
    g.lineWidth = 1.5
    roundRect(g, 1.5, 1.5, cssW - 3, cssH - 3, 6)
    g.stroke()
  }
  g.fillStyle = color
  g.textBaseline = 'middle'
  g.fillText(text, 9, cssH / 2 + 0.5)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  spr.renderOrder = 24
  const px = 0.042
  return { sprite: spr, baseW: cssW * px, baseH: cssH * px }
}

function addTag(text: string, pos: THREE.Vector3, color: string, gate: () => number, boxed = false) {
  const { sprite, baseW, baseH } = makeLabel(text, color, boxed)
  sprite.position.copy(pos)
  root!.add(sprite)
  tags.push({ sprite, baseW, baseH, opacity: gate(), gate })
}

function annulusSector(inner: number, outer: number, a0: number, a1: number, seg = 28) {
  const shape = new THREE.Shape()
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg
    const x = Math.sin(a) * outer
    const y = Math.cos(a) * outer
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg
    shape.lineTo(Math.sin(a) * inner, Math.cos(a) * inner)
  }
  shape.closePath()
  return shape
}

function makeBand(innerH: number, outerH: number, color: number, opacity: number) {
  const shape = annulusSector(R + innerH, R + outerH, -SECTOR, SECTOR)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: false, steps: 1 })
  geo.translate(0, 0, -9)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, normal, side))
  mesh.renderOrder = 2
  root!.add(mesh)
  return mat
}

function makePoly(points: THREE.Vector3[]): Poly {
  const lens = [0]
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1]! + points[i]!.distanceTo(points[i - 1]!))
  return { points, lens, total: lens[lens.length - 1] ?? 0 }
}

function samplePoly(poly: Poly, dist: number) {
  const d = THREE.MathUtils.clamp(dist, 0, Math.max(0, poly.total - 1e-4))
  let i = 1
  while (i < poly.lens.length - 1 && poly.lens[i]! < d) i++
  const span = poly.lens[i]! - poly.lens[i - 1]!
  const t = span < 1e-5 ? 0 : (d - poly.lens[i - 1]!) / span
  const a = poly.points[i - 1]!
  const b = poly.points[i]!
  return {
    pos: a.clone().lerp(b, t),
    tan: b.clone().sub(a).normalize(),
  }
}

function pointAtRadius(start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (start.clone().lerp(end, mid).length() > radius) lo = mid
    else hi = mid
  }
  return start.clone().lerp(end, (lo + hi) / 2)
}

function colorMat(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  })
}

function makeTube(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
  const dir = b.clone().sub(a)
  const len = Math.max(0.2, dir.length())
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8, 1, true), mat)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  mesh.renderOrder = 6
  return mesh
}

function makeArrow(color: number, shaft: number, head: number) {
  const mat = colorMat(color)
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, shaft, 10), mat)
  body.position.y = shaft / 2
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.95, head, 12), mat)
  tip.position.y = shaft + head / 2
  g.add(body, tip)
  g.renderOrder = 7
  return { g, mat, tipLen: shaft + head }
}

function addBeam(
  id: string,
  segments: THREE.Vector3[][],
  color: number,
  presence: Record<string, number>,
  focusesOn: string[],
  opts?: { upperFrom?: number; pulse?: Beam['pulse']; count?: number; period?: number },
) {
  const poly = makePoly(segments.flat())
  const beam: Beam = {
    id,
    tubes: [],
    runners: [],
    markers: [],
    presence,
    focuses: focusesOn,
    opacity: 0,
    limitU: 1,
    pulse: opts?.pulse ?? '',
  }
  const tubeMat = colorMat(color)
  const upperMat = opts?.upperFrom != null ? colorMat(color) : null
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const upper = upperMat != null && i > (opts?.upperFrom ?? 0)
      const mesh = makeTube(seg[i - 1]!, seg[i]!, 0.16, upper ? upperMat! : tubeMat)
      root!.add(mesh)
      if (upper) {
        beam.upper = beam.upper ?? []
        beam.upper.push(mesh)
      } else beam.tubes.push(mesh)
    }
  }
  const count = opts?.count ?? (poly.total > 80 ? 3 : poly.total > 26 ? 2 : 1)
  const head = Math.min(3.5, poly.total * 0.22)
  const shaft = Math.min(11, Math.max(3.2, poly.total * 0.18))
  const fit = shaft + head > poly.total * 0.8 ? (poly.total * 0.8) / (shaft + head) : 1
  for (let i = 0; i < count; i++) {
    const arrow = makeArrow(color, shaft * fit, head * fit)
    root!.add(arrow.g)
    beam.runners.push({
      arrow: arrow.g,
      poly,
      phase: i / count,
      period: opts?.period ?? (poly.total > 40 ? 4.2 : 3.1),
      mats: [arrow.mat],
      tip: arrow.tipLen,
    })
  }
  const end = poly.points[poly.points.length - 1]!
  if (opts?.pulse) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), colorMat(color))
    marker.position.copy(end)
    marker.renderOrder = 8
    root!.add(marker)
    beam.markers.push(marker)
  }
  beams.push(beam)
  return beam
}

function targetOpacity(beam: Beam) {
  const step = props.stepId
  let o = beam.presence[step] ?? 0
  if (step === 'weaken' && focus.value !== 'all' && (beam.presence.weaken ?? 0) > 0) {
    o = beam.focuses.includes(focus.value) ? 1 : 0.08
  }
  if (beam.id === 'escape') o = step === 'return' ? (mode.value === 'more' ? 0.22 : 0.92) : o
  if (beam.id === 'back') o = step === 'return' ? (mode.value === 'more' ? 1 : 0.7) : o
  if (beam.id === 'backMore') o = step === 'return' && mode.value === 'more' ? 0.95 : 0
  return o
}

function beamOpacity(id: string) {
  return beams.find((b) => b.id === id)?.opacity ?? 0
}

function shown(id: string) {
  const o = beamOpacity(id)
  return o > 0.4 ? o : 0
}

function addStars() {
  const n = 140
  const pos = new Float32Array(n * 3)
  let seed = 20261024
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1
    const t = rnd() * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const radius = 380 + rnd() * 80
    pos[i * 3] = Math.cos(t) * r * radius
    pos[i * 3 + 1] = z * radius
    pos[i * 3 + 2] = Math.sin(t) * r * radius
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: Demo3.earthPrime,
      size: 1.35,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  pts.renderOrder = 0
  root!.add(pts)
}

function addDust(count: number, size: number, color: number, h0: number, h1: number, spread: number) {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const p = at(h0 + Math.random() * (h1 - h0), (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 8)
    pos[i * 3] = p.x
    pos[i * 3 + 1] = p.y
    pos[i * 3 + 2] = p.z
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    toneMapped: false,
  })
  root!.add(new THREE.Points(geo, mat))
  return mat
}

function front(p: THREE.Vector3, lift = 0) {
  return p.clone().addScaledVector(side, 14).addScaledVector(normal, lift)
}

function buildScene(sunCenter: THREE.Vector3) {
  tropoMat = makeBand(1.1, 15.6, Demo3.cold, 0.2)
  ozoneMat = makeBand(18.4, 24.2, Demo3.coldSoft, 0.34)
  makeBand(25.2, 33.5, Demo3.air, 0.12)
  groundSkin = makeBand(0.18, 0.62, Demo3.warm, 0.05)

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(8.2, 48),
    new THREE.MeshBasicMaterial({
      color: Demo3.warm,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  groundDisc = disc.material
  disc.position.copy(at(0.85))
  disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  disc.renderOrder = 4
  root!.add(disc)

  const loader = new THREE.TextureLoader()
  loader.load('/textures/weather/cloud-realistic.png', (tex) => {
    if (disposed) {
      tex.dispose()
      return
    }
    tex.colorSpace = THREE.SRGBColorSpace
    cloudTexture = tex
    for (const spr of clouds) {
      const mat = spr.material
      mat.map = tex
      mat.needsUpdate = true
    }
  })

  const cloudSpots: Array<[number, number, number, number]> = [
    [11, 16, 4, 1.2],
    [9, -30, 2, 0.82],
    [12, -8, -4, 0.66],
  ]
  for (const [h, e, s, sc] of cloudSpots) {
    const mat = new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      alphaTest: 0.18,
    })
    const spr = new THREE.Sprite(mat)
    spr.position.copy(at(h, e, s))
    spr.scale.set(30 * sc, 12 * sc, 1)
    spr.userData.base = spr.position.clone()
    spr.userData.phase = Math.random() * Math.PI * 2
    spr.renderOrder = 5
    root!.add(spr)
    clouds.push(spr)
  }

  dustMat = addDust(48, 0.55, Demo3.cold, 3, 14, 36)
  coarseMat = addDust(14, 1.15, Demo3.cloud, 8, 13, 18)

  const groundPoint = at(0.9)
  const rayStart = (target: THREE.Vector3) => {
    const dir = target.clone().sub(sunCenter).normalize()
    return sunCenter.clone().addScaledVector(dir, SUN_DRAW + 0.8)
  }

  const uvEnd = at(21.2, -18, 1)
  const irEnd = at(8.4, 18, -2)
  const arriveStart = rayStart(groundPoint)
  const scatterPoint = pointAtRadius(arriveStart, groundPoint, R + 8.2)

  addBeam('uv', [[rayStart(uvEnd), uvEnd]], Demo3.cold, { weaken: 1 }, ['ozone'], {
    pulse: 'uv',
  })
  addBeam('ir', [[rayStart(irEnd), irEnd]], Demo3.warm, { weaken: 1 }, ['vapor'], {
    pulse: 'ir',
  })
  addBeam(
    'arrive',
    [[arriveStart, groundPoint]],
    Demo3.lift,
    { weaken: 0.72, 'sun-ground': 1, 'ground-air': 0.22, return: 0.1 },
    [],
    { pulse: 'ground', count: 3 },
  )

  const inDir = groundPoint.clone().sub(sunCenter).normalize()
  const p1 = new THREE.Vector3().crossVectors(inDir, normal).normalize()
  const p2 = new THREE.Vector3().crossVectors(inDir, p1).normalize()
  const branchDirs = [p1, p1.clone().negate(), p2, p1.clone().multiplyScalar(0.6).add(p2).normalize()]
  const branches = branchDirs.filter((d) => d.dot(normal) > -0.05).slice(0, 4)
  for (const dir of branches) {
    const end = scatterPoint.clone().addScaledVector(dir, 13)
    addBeam('scatter', [[scatterPoint.clone(), end]], Demo3.cold, { weaken: 1 }, ['scatter'], {
      count: 1,
      period: 2.8,
    })
  }

  const cloudCenter = at(11, 16, 4)
  const toCloud = cloudCenter.clone().sub(sunCenter).normalize()
  const hit = cloudCenter.clone().addScaledVector(toCloud, -8)
  const reflected = toCloud.clone().sub(normal.clone().multiplyScalar(2 * toCloud.dot(normal)))
  reflected.addScaledVector(normal, 0.85).normalize()
  const bounceEnd = hit.clone().addScaledVector(reflected, 22)
  addBeam('reflect', [[rayStart(hit), hit, bounceEnd]], Demo3.cloud, { weaken: 1 }, ['reflect'], { count: 2 })

  const ups = [
    [-10, 0],
    [-3, 2],
    [5, -1],
  ]
  for (const [e, s] of ups) {
    addBeam('up', [[at(1.3, e, s), at(13.2, e, s)]], Demo3.warm, { 'ground-air': 1, return: 0.38 }, [], {
      count: 1,
      period: 3.6,
    })
  }

  const escA = at(13.5, 2, -2)
  const escB = at(23, 8, -1)
  const escC = at(58, 18, 2)
  addBeam('escape', [[escA, escB, escC]], Demo3.warm, { return: 0.9 }, [], { upperFrom: 1, count: 2 })

  const backs = [
    [12, 1],
    [20, -2],
  ]
  for (const [e, s] of backs) {
    addBeam('back', [[at(13.4, e, s), at(1.5, e, s)]], Demo3.warm, { return: 0.75 }, [], { count: 1, period: 3.4 })
  }
  for (const [e, s] of [
    [2, 3],
    [16, 2],
  ] as Array<[number, number]>) {
    addBeam('backMore', [[at(14, e, s), at(1.5, e, s)]], Demo3.warm, {}, [], { count: 1, period: 3.2 })
  }

  addTag('地面', front(at(2.4, -6, 6)), DemoHex.inkMuted, () => 0.85)
  addTag('对流层 · 水汽、CO₂', front(at(8, -10, 8)), DemoHex.cold, () => 0.92)
  addTag('平流层 · 臭氧', front(at(30, -34, 0)), DemoHex.coldSoft, () => 0.92)
  addTag(
    '短波辐射',
    pointAtRadius(arriveStart, groundPoint, R + 18).addScaledVector(east, -16).addScaledVector(side, 5),
    DemoHex.lift,
    () => (props.stepId === 'sun-ground' ? 1 : 0),
  )
  addTag('臭氧吸收紫外', front(uvEnd, 3).addScaledVector(east, -16), DemoHex.cold, () => shown('uv'))
  addTag(
    '水汽吸收红外',
    irEnd.clone().addScaledVector(east, -12).addScaledVector(normal, 4),
    DemoHex.warm,
    () => shown('ir'),
  )
  addTag('散射蓝紫光', front(scatterPoint, 2).addScaledVector(east, -14), DemoHex.cold, () => shown('scatter'))
  addTag('云层反射', front(hit, 4), DemoHex.ink, () => shown('reflect'))
  addTag('太阳暖大地', front(at(3.2, -6, 2)), DemoHex.lift, () => (props.stepId === 'sun-ground' ? 1 : 0))
  addTag('地面长波', front(at(6, -12, 2)), DemoHex.warm, () => (props.stepId === 'ground-air' ? 1 : 0))
  addTag('大气吸收', front(at(14, -6, 0), 1), DemoHex.warm, () => (props.stepId === 'ground-air' ? 1 : 0))
  addTag('大地暖大气', front(at(16.5, -16, 2)), DemoHex.warm, () => (props.stepId === 'ground-air' ? 1 : 0))
  addTag('大气辐射', front(escB, 2), DemoHex.warm, () => (props.stepId === 'return' ? shown('escape') : 0))
  addTag('大气逆辐射', front(at(8, 22, 2)), DemoHex.warm, () =>
    props.stepId === 'return' ? Math.max(shown('back'), shown('backMore')) : 0,
  )
  addTag('大气还大地', front(at(3.4, 14, 2)), DemoHex.warm, () => (props.stepId === 'return' ? 1 : 0))
  addTag('大气保温作用', front(at(5, 0, 4)), DemoHex.warm, () => (props.stepId === 'return' ? 1 : 0), true)
  addTag('温室气体增多', front(at(18, -4, 2)), DemoHex.warm, () =>
    props.stepId === 'return' && mode.value === 'more' ? 1 : 0,
  )
}

function setupScene() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  const w = wrapRef.value.clientWidth || 800
  const h = Math.max(320, wrapRef.value.clientHeight || 480)

  const lat = THREE.MathUtils.degToRad(24)
  const lon = THREE.MathUtils.degToRad(35)
  normal.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize()
  east.crossVectors(new THREE.Vector3(0, 1, 0), normal)
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
  east.normalize()
  side.crossVectors(east, normal).normalize()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(Demo3.canvas)
  camera = new THREE.PerspectiveCamera(FOV, w / h, 0.4, 2200)
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h, false)
  configureEarthRenderer(renderer, 1.12)

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 42
  controls.maxDistance = 280
  controls.addEventListener('start', () => {
    dragging = true
    camMix = 1
  })
  controls.addEventListener('end', () => {
    dragging = false
  })

  root = new THREE.Group()
  scene.add(root)
  addStars()

  const opening = desiredPose()
  camera.position.copy(opening.pos)
  controls.target.copy(opening.target)
  controls.update()

  camera.updateMatrixWorld()
  const view = opening.target.clone().sub(opening.pos).normalize()
  const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0))
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()
  const up = new THREE.Vector3().crossVectors(right, view).normalize()
  const dist = opening.pos.distanceTo(opening.target)
  // 与气柱差不多远，落在画面左上方，避免贴到镜头前变成满屏日面。
  const sunCenter = opening.target
    .clone()
    .addScaledVector(right, -dist * 0.18)
    .addScaledVector(up, dist * 0.16)
    .addScaledVector(normal, 10)
  if (sunCenter.length() < R + 30) sunCenter.addScaledVector(normal, 36)

  const sun = makeSunBillboard(SUN_DRAW)
  sun.group.position.copy(sunCenter)
  root.add(sun.group)
  sunLook = sun.lookAt
  sunDispose = sun.dispose

  const worldSun = sunCenter.clone().normalize()
  earth = createRealisticEarth(renderer, R, worldSun.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -EARTH_YAW), {
    segments: 96,
    atmosphereScale: 1.05,
    atmosphereStrength: 0.95,
    nightIntensity: 1.15,
  })
  earth.surface.rotation.y = EARTH_YAW
  earth.atmosphere.rotation.y = EARTH_YAW
  root.add(earth.surface, earth.atmosphere)

  buildScene(sunCenter)
  for (const beam of beams) beam.opacity = targetOpacity(beam)
  clock = 0
  lastStamp = performance.now()
  loop()
}

function updateBeams(dt: number) {
  const enhanced = props.stepId === 'return' && mode.value === 'more'
  for (const beam of beams) {
    const limit = beam.id === 'escape' && enhanced ? 0.46 : 1
    beam.limitU = limit
    beam.opacity = damp(beam.opacity, targetOpacity(beam), dt, 5.5)
    const show = beam.opacity > 0.025
    for (const tube of beam.tubes) {
      const mat = tube.material as THREE.MeshBasicMaterial
      mat.opacity = beam.opacity * 0.34
      tube.visible = show
    }
    for (const tube of beam.upper ?? []) {
      const mat = tube.material as THREE.MeshBasicMaterial
      mat.opacity = beam.opacity * (enhanced ? 0.08 : 0.34)
      tube.visible = show && mat.opacity > 0.02
    }
    for (const runner of beam.runners) {
      const u = ((clockSec() / runner.period + runner.phase) % 1)
      const fade = smoothstep(0, 0.07, u) * (1 - smoothstep(0.9, 1, u))
      const dist = u * beam.limitU * runner.poly.total
      const { pos, tan } = samplePoly(runner.poly, dist)
      runner.arrow.position.copy(pos).addScaledVector(tan, -runner.tip)
      if (tan.lengthSq() > 0) runner.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
      const o = beam.opacity * fade
      for (const mat of runner.mats) mat.opacity = o
      runner.arrow.visible = o > 0.03
      if (beam.pulse && u * beam.limitU > 0.86 && fade > 0.35) {
        if (beam.pulse === 'uv') uvPulse = 1
        if (beam.pulse === 'ir') irPulse = 1
        if (beam.pulse === 'ground') groundPulse = 1
      }
    }
    for (const marker of beam.markers) {
      const mat = marker.material as THREE.MeshBasicMaterial
      const pulse = beam.pulse === 'uv' ? uvPulse : beam.pulse === 'ir' ? irPulse : groundPulse
      mat.opacity = beam.opacity * (0.45 + pulse * 0.55)
      const s = 1 + pulse * 0.45
      marker.scale.setScalar(s)
      marker.visible = beam.opacity > 0.04
    }
  }
}

function clockSec() {
  return clock
}

function loop() {
  if (disposed || !renderer || !scene || !camera || !controls) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, lastStamp ? (now - lastStamp) / 1000 : 0.016)
  lastStamp = now
  if (playing.value) clock += dt

  if (!dragging && camMix < 1) {
    camMix = Math.min(1, camMix + dt / 0.85)
    const k = camMix * camMix * (3 - 2 * camMix)
    camera.position.lerpVectors(blendFromPos, blendToPos, k)
    controls.target.lerpVectors(blendFromTarget, blendToTarget, k)
  }
  controls.update()
  if (sunLook) sunLook(camera)

  uvPulse = Math.max(0, uvPulse - dt * 0.85)
  irPulse = Math.max(0, irPulse - dt * 0.85)
  groundPulse = Math.max(0, groundPulse - dt * 0.7)
  updateBeams(dt)

  const step = props.stepId
  const warmTarget =
    step === 'ground-air' ? 0.42 : step === 'return' ? (mode.value === 'more' ? 0.82 : 0.38) : 0
  warmMix = damp(warmMix, warmTarget, dt, 3.2)
  if (tropoMat) tropoMat.color.copy(tropoBase).lerp(warmColor, warmMix)
  if (ozoneMat) ozoneMat.opacity = 0.3 + uvPulse * 0.35 + (step === 'weaken' && focus.value === 'ozone' ? 0.18 : 0)

  const glowTarget =
    step === 'sun-ground'
      ? 0.62
      : step === 'ground-air'
        ? 0.5
        : step === 'return'
          ? mode.value === 'more'
            ? 0.88
            : 0.4
          : focus.value === 'all'
            ? 0.16
            : 0.05
  groundGlow = damp(groundGlow, glowTarget + groundPulse * 0.22, dt, 3.5)
  if (groundDisc) groundDisc.opacity = groundGlow
  if (groundSkin) groundSkin.opacity = 0.08 + groundGlow * 0.55

  if (dustMat) {
    const on = step === 'weaken' && (focus.value === 'all' || focus.value === 'scatter')
    dustMat.opacity = damp(dustMat.opacity, on ? 0.75 : 0.08, dt, 4)
  }
  if (coarseMat) {
    const on = step === 'weaken' && (focus.value === 'all' || focus.value === 'reflect')
    coarseMat.opacity = damp(coarseMat.opacity, on ? 0.8 : 0.06, dt, 4)
  }

  clouds.forEach((spr, i) => {
    const base = spr.userData.base as THREE.Vector3
    spr.position.copy(base).addScaledVector(normal, Math.sin(clock * 0.7 + i) * 0.28)
  })

  const distRef = 110
  for (const tag of tags) {
    tag.opacity = damp(tag.opacity, tag.gate(), dt, 6)
    const mat = tag.sprite.material
    mat.opacity = tag.opacity
    tag.sprite.visible = tag.opacity > 0.04
    const dist = camera.position.distanceTo(tag.sprite.position)
    const k = THREE.MathUtils.clamp(dist / distRef, 0.7, 1.7)
    tag.sprite.scale.set(tag.baseW * k, tag.baseH * k, 1)
  }

  renderer.render(scene, camera)
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = wrapRef.value.clientHeight
  if (w < 2 || h < 2) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function disposeObj(obj: THREE.Object3D) {
  const maps = new Set<THREE.Texture>()
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry?.dispose()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((m) => m.dispose())
    } else if (child instanceof THREE.Sprite) {
      const m = child.material
      if (m.map && m.map !== cloudTexture) maps.add(m.map)
      m.dispose()
    }
  })
  maps.forEach((t) => t.dispose())
}

function teardown() {
  disposed = true
  cancelAnimationFrame(raf)
  resizeObs?.disconnect()
  resizeObs = null
  controls?.dispose()
  controls = null
  if (root) {
    const sunObj = root.getObjectByName('sun-realistic')
    if (sunObj) root.remove(sunObj)
    disposeObj(root)
    scene?.remove(root)
  }
  sunDispose?.()
  sunDispose = null
  sunLook = null
  earth?.disposeTextures()
  earth = null
  cloudTexture?.dispose()
  cloudTexture = null
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  root = null
  beams.length = 0
  tags.length = 0
  clouds.length = 0
  tropoMat = null
  ozoneMat = null
  groundSkin = null
  groundDisc = null
  dustMat = null
  coarseMat = null
}

watch(
  () => props.stepId,
  () => {
    focus.value = 'all'
    startBlend()
  },
)
watch(focus, () => startBlend())

onMounted(() => {
  setupScene()
  if (wrapRef.value) {
    resizeObs = new ResizeObserver(() => onResize())
    resizeObs.observe(wrapRef.value)
  }
})
onUnmounted(teardown)
</script>

<template>
  <div class="wrap">
    <div class="toolbar" data-dili-chrome>
      <span class="hint">{{ hint }}</span>
      <div v-if="props.stepId === 'weaken'" class="chips">
        <button
          v-for="item in focuses"
          :key="item.id"
          type="button"
          class="btn"
          :class="{ on: focus === item.id }"
          @click="focus = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-else-if="props.stepId === 'return'" class="chips">
        <button type="button" class="btn" :class="{ on: mode === 'normal' }" @click="mode = 'normal'">自然保温</button>
        <button type="button" class="btn" :class="{ on: mode === 'more' }" @click="mode = 'more'">温室效应增强</button>
      </div>
      <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? '暂停' : '继续' }}
      </button>
    </div>
    <div ref="wrapRef" class="stage">
      <canvas ref="canvasRef" />
      <aside class="hud" data-dili-chrome>
        <p class="hud-title">{{ title }}</p>
        <p class="hud-desc">临边视角 · 大气厚度已放大 · 拖拽可环视</p>
        <p class="legend">
          <i class="swatch lift" />短波
          <i class="swatch cold" />紫外 / 散射
          <i class="swatch warm" />长波
          <i class="swatch ink" />反射
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--demo-canvas);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.hint {
  font-size: 12px;
  color: var(--text-400);
  margin-right: auto;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.btn.on {
  border-color: var(--demo-accent, var(--demo-cold));
  color: var(--demo-ink);
  background: rgba(74, 163, 217, 0.14);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 320px;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.hud {
  position: absolute;
  left: 14px;
  top: 12px;
  pointer-events: none;
}
.hud-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--demo-ink-muted);
}
.hud-desc,
.legend {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--demo-ink-dim);
}
.legend {
  display: flex;
  align-items: center;
  gap: 4px 8px;
}
.swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
.swatch.lift {
  background: var(--demo-lift);
}
.swatch.cold {
  background: var(--demo-cold);
}
.swatch.warm {
  background: var(--demo-warm);
}
.swatch.ink {
  background: var(--demo-ink);
}
</style>
