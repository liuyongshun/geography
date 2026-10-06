<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import { makeSunBillboard } from '@/engine/sunVisual'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const svgRef = ref<SVGSVGElement | null>(null)
const playing = ref(true)
const progress = ref(0)
const active = ref<string>('igneous')
const tourIdx = ref(0)

const W = 780
const H = 440

type NodeId = 'magma' | 'igneous' | 'sediment' | 'sedimentary' | 'metamorphic'

const PHASES: Array<{ t: number; title: string; note: string }> = [
  { t: 0.0, title: '表层与深层', note: '表层低温低压风化；深层高温高压岩浆' },
  { t: 0.16, title: '喷出作用', note: '岩浆喷出地表，冷凝成喷出岩' },
  { t: 0.34, title: '侵入作用', note: '岩浆在地下冷凝，形成侵入岩' },
  { t: 0.5, title: '风化搬运', note: '崩解、分解、溶解后搬运沉积' },
  { t: 0.66, title: '埋藏成岩', note: '沉积物压实胶结 → 沉积岩' },
  { t: 0.82, title: '变质作用', note: '高温高压 → 变质岩' },
  { t: 1.0, title: '重熔', note: '再次熔融，回到岩浆' },
]

const NODES: Array<{ id: NodeId; label: string; sub: string; x: number; y: number; fill: string }> = [
  { id: 'magma', label: '岩浆', sub: '熔融物质', x: 390, y: 78, fill: '#e85d04' },
  { id: 'igneous', label: '岩浆岩', sub: '冷凝结晶', x: 130, y: 200, fill: '#c44536' },
  { id: 'metamorphic', label: '变质岩', sub: '高温高压', x: 390, y: 218, fill: '#7b2d8e' },
  { id: 'sedimentary', label: '沉积岩', sub: '固结成岩', x: 650, y: 200, fill: '#e09f3e' },
  { id: 'sediment', label: '沉积物', sub: '风化产物', x: 390, y: 348, fill: '#c9a227' },
]

const EDGES: Array<{ from: NodeId; to: NodeId; label: string }> = [
  { from: 'magma', to: 'igneous', label: '冷凝' },
  { from: 'igneous', to: 'sediment', label: '风化侵蚀' },
  { from: 'sediment', to: 'sedimentary', label: '固结成岩' },
  { from: 'sedimentary', to: 'metamorphic', label: '变质' },
  { from: 'igneous', to: 'metamorphic', label: '变质' },
  { from: 'metamorphic', to: 'magma', label: '重熔' },
  { from: 'sedimentary', to: 'magma', label: '重熔' },
  { from: 'metamorphic', to: 'sediment', label: '风化侵蚀' },
]

const TOUR: Array<{ from: NodeId; to: NodeId }> = [
  { from: 'magma', to: 'igneous' },
  { from: 'igneous', to: 'sediment' },
  { from: 'sediment', to: 'sedimentary' },
  { from: 'sedimentary', to: 'metamorphic' },
  { from: 'metamorphic', to: 'magma' },
]

const TYPE_CARDS = [
  {
    id: 'igneous' as const,
    name: '岩浆岩',
    how: '岩浆冷凝结晶而成',
    eg: '花岗岩 · 玄武岩',
    tex: '/textures/rocks/igneous-color.jpg',
    fill: '#c44536',
  },
  {
    id: 'sedimentary' as const,
    name: '沉积岩',
    how: '沉积物固结成岩',
    eg: '砂岩 · 石灰岩',
    tex: '/textures/rocks/strata-color.jpg',
    fill: '#e09f3e',
  },
  {
    id: 'metamorphic' as const,
    name: '变质岩',
    how: '原岩经变质作用',
    eg: '片麻岩 · 大理岩',
    tex: '/textures/rocks/gneiss-color.jpg',
    fill: '#7b2d8e',
  },
]

const isProcess = computed(() => props.stepId === 'process')
const isTypes = computed(() => props.stepId === 'types')
const isCycle = computed(() => props.stepId === 'cycle')

const phaseInfo = computed(() => {
  const p = progress.value
  let cur = PHASES[0]!
  for (const ph of PHASES) {
    if (p >= ph.t - 0.001) cur = ph
  }
  return cur
})

const hint = computed(() => {
  if (isProcess.value) return `地质切面 · ${phaseInfo.value.title} · ${phaseInfo.value.note}`
  if (isTypes.value) return '点三大类岩石，看成因与贴图示意（ambientCG · CC0）'
  return playing.value ? '主循环自动巡游 · 点节点可聚焦旁路' : '已暂停 · 点「演示循环」继续'
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let root: THREE.Group | null = null
let lavaGlow: THREE.Mesh | null = null
let eruption: THREE.Points | null = null
let weather: THREE.Points | null = null
let igneousMesh: THREE.Mesh | null = null
let sedimentMesh: THREE.Mesh | null = null
let sedimentaryMesh: THREE.Mesh | null = null
let metamorphicMesh: THREE.Mesh | null = null
let magmaChamber: THREE.Mesh | null = null
let cone: THREE.Mesh | null = null
let magmaFlow: THREE.Points | null = null
const magmaPaths: Array<{ pts: Array<[number, number]>; len: number }> = []
const magmaFlowS: number[] = []
const magmaFlowPath: number[] = []
let labels: THREE.Sprite[] = []
let texLava: THREE.Texture | null = null
let texIgneous: THREE.Texture | null = null
let texSed: THREE.Texture | null = null
let texMeta: THREE.Texture | null = null
let texGrass: THREE.Texture | null = null
let texGrassN: THREE.Texture | null = null
let texSand: THREE.Texture | null = null
let texStrata: THREE.Texture | null = null
let texStrataN: THREE.Texture | null = null
let texGneiss: THREE.Texture | null = null
let sunBillboard: ReturnType<typeof makeSunBillboard> | null = null
const processArrows: Array<{ g: THREE.Group; t0: number; t1: number }> = []
let raf = 0
let disposed = false
let lastT = 0
let phase = 0
let tourTimer = 0
let processReady = false

function disposeObj(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose()
      const m = child.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    } else if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
  })
}

function makeLabel(text: string, color: string = DemoHex.ink, scale = 0.65) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 24
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  canvas.width = tw + 20
  canvas.height = fontSize + 14
  const g = canvas.getContext('2d')!
  g.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  g.fillStyle = 'rgba(8,12,18,0.82)'
  g.beginPath()
  const r = 7
  const w = canvas.width
  const h = canvas.height
  g.moveTo(r, 0)
  g.arcTo(w, 0, w, h, r)
  g.arcTo(w, h, 0, h, r)
  g.arcTo(0, h, 0, 0, r)
  g.arcTo(0, 0, w, 0, r)
  g.closePath()
  g.fill()
  g.fillStyle = color
  g.textBaseline = 'middle'
  g.fillText(text, 10, canvas.height / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  spr.scale.set((canvas.width / 64) * 8.5 * scale, (canvas.height / 64) * 8.5 * scale, 1)
  spr.renderOrder = 20
  return spr
}

function makeArrow(color: number, len = 12) {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false })
  const shaftH = Math.max(2.4, len - 3.4)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, shaftH, 14, 1, false), mat)
  shaft.position.y = shaftH / 2
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.82, 3.2, 16), mat)
  head.position.y = shaftH + 1.35
  g.add(shaft, head)
  return g
}

function pointArrow(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  if (dir.lengthSq() < 1e-6) return
  dir.normalize()
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.position.copy(from)
}

function addProcessArrow(color: number, from: THREE.Vector3, to: THREE.Vector3, t0: number, t1: number, len?: number) {
  const a = makeArrow(color, len ?? from.distanceTo(to))
  pointArrow(a, from, to)
  processArrows.push({ g: a, t0, t1 })
  root?.add(a)
  return a
}

function pathLength(pts: Array<[number, number]>) {
  let L = 0
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  }
  return L
}

function resamplePath(pts: Array<[number, number]>, step = 0.85) {
  const out: Array<[number, number]> = [pts[0]!]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0]
    const ay = pts[i - 1]![1]
    const bx = pts[i]![0]
    const by = pts[i]![1]
    const seg = Math.hypot(bx - ax, by - ay)
    if (seg < 1e-6) continue
    let t = step - acc
    while (t < seg) {
      const k = t / seg
      out.push([ax + (bx - ax) * k, ay + (by - ay) * k])
      t += step
    }
    acc = (acc + seg) % step
  }
  out.push(pts[pts.length - 1]!)
  return out
}

function pointOnPath(pts: Array<[number, number]>, s: number): [number, number] {
  const total = pathLength(pts)
  let d = ((s % 1) + 1) % 1 * total
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0]
    const ay = pts[i - 1]![1]
    const bx = pts[i]![0]
    const by = pts[i]![1]
    const seg = Math.hypot(bx - ax, by - ay)
    if (d <= seg || i === pts.length - 1) {
      const k = seg < 1e-6 ? 0 : d / seg
      return [ax + (bx - ax) * k, ay + (by - ay) * k]
    }
    d -= seg
  }
  return pts[pts.length - 1]!
}

/** 中心线 → 两端收窄的河状条带 */
function magmaRibbon(center: Array<[number, number]>, w0: number, w1: number) {
  const pts = resamplePath(chaikin(center, 2, false), 0.7)
  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []
  for (let i = 0; i < pts.length; i++) {
    const t = i / Math.max(1, pts.length - 1)
    const ease = t * t * (3 - 2 * t)
    const w = Math.max(0.22, w0 * (1 - ease) + w1 * ease)
    const i0 = Math.max(0, i - 1)
    const i1 = Math.min(pts.length - 1, i + 1)
    const dx = pts[i1]![0] - pts[i0]![0]
    const dy = pts[i1]![1] - pts[i0]![1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    left.push([pts[i]![0] + nx * w, pts[i]![1] + ny * w])
    right.push([pts[i]![0] - nx * w, pts[i]![1] - ny * w])
  }
  return [...left, ...right.reverse()]
}

function chaikin(pts: Array<[number, number]>, rounds = 2, closed = true) {
  let cur = pts
  for (let r = 0; r < rounds; r++) {
    const n = cur.length
    if (n < 3) return cur
    const next: Array<[number, number]> = []
    if (!closed) next.push(cur[0]!)
    const count = closed ? n : n - 1
    for (let i = 0; i < count; i++) {
      const a = cur[i]!
      const b = cur[(i + 1) % n]!
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    if (!closed) next.push(cur[n - 1]!)
    cur = next
  }
  return cur
}

function extrudePoly(
  pts: Array<[number, number]>,
  depth: number,
  material: THREE.Material,
  uvx = 0.045,
  uvy = 0.07,
  bevel = 0.55,
  smoothRounds = 2,
) {
  const smooth = chaikin(pts, smoothRounds, true)
  const shape = new THREE.Shape()
  shape.moveTo(smooth[0]![0], smooth[0]![1])
  for (let i = 1; i < smooth.length; i++) shape.lineTo(smooth[i]![0], smooth[i]![1])
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 10,
    bevelEnabled: bevel > 0.01,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelOffset: 0,
    bevelSegments: 3,
  })
  geo.translate(0, 0, -depth / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    uv[i * 2] = pos.getX(i) * uvx
    uv[i * 2 + 1] = pos.getY(i) * uvy
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

function rockMat(map: THREE.Texture | null, color = 0xffffff, normal: THREE.Texture | null = null) {
  return new THREE.MeshStandardMaterial({
    color,
    map: map ?? null,
    normalMap: normal ?? null,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
}

function makeTree(x: number, y: number, z: number, s = 1) {
  const g = new THREE.Group()
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.92 })
  const leaf = new THREE.MeshStandardMaterial({
    color: 0xb7c86a,
    map: texGrass,
    roughness: 0.9,
  })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.4 * s, 2.5 * s, 12), bark)
  trunk.position.y = 1.2 * s
  const a = new THREE.Mesh(new THREE.SphereGeometry(1.55 * s, 16, 12), leaf)
  a.position.set(0, 3.15 * s, 0)
  a.scale.set(1.05, 0.9, 1)
  const b = new THREE.Mesh(new THREE.SphereGeometry(1.15 * s, 14, 10), leaf)
  b.position.set(0.7 * s, 3.55 * s, 0.15 * s)
  const c = new THREE.Mesh(new THREE.SphereGeometry(1.05 * s, 14, 10), leaf)
  c.position.set(-0.65 * s, 3.4 * s, -0.2 * s)
  g.add(trunk, a, b, c)
  g.position.set(x, y, z)
  g.rotation.y = (x + z) * 0.15
  return g
}

function loadTextures(): Promise<void> {
  const loader = new THREE.TextureLoader()
  const load = (url: string, srgb: boolean) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.anisotropy = 8
          resolve(t)
        },
        undefined,
        reject,
      )
    })
  return Promise.all([
    load('/textures/rocks/lava-color.jpg', true),
    load('/textures/rocks/igneous-color.jpg', true),
    load('/textures/rocks/strata-color.jpg', true),
    load('/textures/rocks/gneiss-color.jpg', true),
    load('/textures/rocks/grass-color.jpg', true),
    load('/textures/rocks/grass-normal.jpg', false),
    load('/textures/rocks/sand-color.jpg', true),
    load('/textures/rocks/strata-normal.jpg', false),
  ]).then(([lava, ig, sed, meta, grass, grassN, sand, strataN]) => {
    texLava = lava
    texIgneous = ig
    texSed = sed
    texMeta = meta
    texGrass = grass
    texGrassN = grassN
    texSand = sand
    texStrata = sed
    texStrataN = strataN
    texGneiss = meta
  })
}

function clearRoot() {
  if (!root) return
  while (root.children.length) {
    const c = root.children[0]!
    root.remove(c)
    disposeObj(c)
  }
  lavaGlow = null
  eruption = null
  weather = null
  igneousMesh = null
  sedimentMesh = null
  sedimentaryMesh = null
  metamorphicMesh = null
  magmaChamber = null
  cone = null
  magmaFlow = null
  magmaPaths.length = 0
  magmaFlowS.length = 0
  magmaFlowPath.length = 0
  labels = []
  processArrows.length = 0
  sunBillboard = null
}

function buildProcessScene() {
  if (!root || !scene) return
  clearRoot()
  const D = 22
  const magmaMat = new THREE.MeshStandardMaterial({
    color: 0xffc078,
    map: texLava,
    emissive: 0xff3a08,
    emissiveMap: texLava,
    emissiveIntensity: 1.35,
    roughness: 0.42,
    metalness: 0.08,
    side: THREE.DoubleSide,
  })

  const skyTex = (() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const g = c.getContext('2d')!
    const grd = g.createLinearGradient(0, 0, 0, 256)
    grd.addColorStop(0, '#5aa4d8')
    grd.addColorStop(0.45, '#9eccea')
    grd.addColorStop(1, '#e4f1fa')
    g.fillStyle = grd
    g.fillRect(0, 0, 4, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 110),
    new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false }),
  )
  sky.position.set(10, 36, -22)
  root.add(sky)

  sunBillboard = makeSunBillboard(6.2)
  sunBillboard.group.position.set(-54, 40, 12)
  root.add(sunBillboard.group)

  const soil = extrudePoly(
    [
      [-50, 8],
      [-49, 10.2],
      [-42, 13.2],
      [-28, 14.6],
      [-14, 16.2],
      [-2, 15.4],
      [10, 15.8],
      [22, 17.4],
      [32, 15.2],
      [38, 11.4],
      [38, 8],
    ],
    D,
    rockMat(texGrass, 0xc5d48a, texGrassN),
    0.08,
    0.08,
    0.45,
  )
  root.add(soil)

  // 沉积岩层
  sedimentaryMesh = extrudePoly(
    [
      [-78, 8.2],
      [-50, 8.4],
      [-28, 10.6],
      [-8, 12],
      [12, 11.2],
      [28, 13],
      [38, 10],
      [52, 7.2],
      [70, 5.6],
      [82, 5],
      [82, -5.2],
      [58, -6.4],
      [28, -6.8],
      [-8, -5.6],
      [-40, -4.8],
      [-78, -3.8],
    ],
    D,
    rockMat(texSand, 0xf2e2c4),
    0.04,
    0.1,
    0.5,
  )
  root.add(sedimentaryMesh)

  const sed2 = extrudePoly(
    [
      [-78, -3.8],
      [-40, -4.8],
      [-8, -5.6],
      [28, -6.8],
      [58, -6.4],
      [82, -5.2],
      [82, -13.6],
      [50, -14.8],
      [18, -15.2],
      [-20, -14.2],
      [-78, -12.6],
    ],
    D,
    rockMat(texStrata, 0xe8c8a0, texStrataN),
    0.038,
    0.11,
    0.5,
  )
  root.add(sed2)

  // 变质岩层
  metamorphicMesh = extrudePoly(
    [
      [-78, -12.6],
      [-20, -14.2],
      [18, -15.2],
      [50, -14.8],
      [82, -13.6],
      [82, -24],
      [-78, -24],
    ],
    D,
    rockMat(texGneiss, 0xd8c8d4),
    0.05,
    0.08,
    0.45,
  )
  root.add(metamorphicMesh)

  magmaChamber = extrudePoly(
    [
      [48.5, -7.2],
      [52.2, -6.1],
      [56.8, -6.6],
      [59.4, -8.8],
      [58.6, -11.8],
      [54.2, -13.4],
      [49.4, -12.6],
      [46.8, -9.8],
    ],
    3.4,
    magmaMat,
    0.07,
    0.07,
    0.55,
  )
  magmaChamber.position.z = 11.15
  root.add(magmaChamber)

  {
    const crust = extrudePoly(
      [
        [47.2, -6.6],
        [52.4, -5.3],
        [57.8, -5.9],
        [61.2, -8.6],
        [60.2, -12.6],
        [54.4, -14.6],
        [48.4, -13.8],
        [45.4, -10.2],
      ],
      3.0,
      new THREE.MeshStandardMaterial({
        color: 0x5a2a18,
        map: texLava,
        roughness: 0.72,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
      0.07,
      0.07,
      0.4,
    )
    crust.position.z = 10.85
    root.add(crust)
  }

  const addVein = (center: Array<[number, number]>, w0: number, w1: number) => {
    const smooth = chaikin(center, 2, false)
    magmaPaths.push({ pts: resamplePath(smooth, 0.75), len: pathLength(smooth) })
    const mesh = extrudePoly(magmaRibbon(center, w0, w1), 3.2, magmaMat, 0.08, 0.08, 0.12, 1)
    mesh.position.z = 11.15
    root!.add(mesh)
    return mesh
  }

  // 干流：岩浆房 → 火口（始终走山体中轴）
  addVein(
    [
      [53.2, -6.4],
      [52.4, -1.5],
      [53.0, 5],
      [51.8, 12],
      [53.2, 19],
      [52.0, 25.5],
      [52.6, 30.2],
      [52.4, 33.2],
    ],
    1.85,
    0.72,
  )
  // 山体内分枝，不穿出锥体
  addVein(
    [
      [52.2, 6],
      [47.6, 8.2],
      [44.4, 8.6],
      [42.6, 6.8],
    ],
    0.82,
    0.22,
  )
  addVein(
    [
      [52.8, 8.5],
      [57.6, 9.8],
      [61.4, 8.4],
      [63.2, 6.2],
    ],
    0.78,
    0.2,
  )
  addVein(
    [
      [52.2, 14.5],
      [47.4, 17],
      [44.8, 19.4],
      [43.6, 17.6],
    ],
    0.74,
    0.2,
  )
  addVein(
    [
      [52.8, 16],
      [57.2, 18.4],
      [60.4, 17.2],
      [62.0, 14.6],
    ],
    0.72,
    0.2,
  )
  addVein(
    [
      [52.2, 23.8],
      [48.8, 26.4],
      [47.0, 28.2],
    ],
    0.58,
    0.16,
  )
  addVein(
    [
      [52.6, 24.6],
      [55.8, 27.2],
      [57.4, 28.6],
    ],
    0.55,
    0.16,
  )
  addVein(
    [
      [52.4, 2.2],
      [47.2, 3.4],
      [44.0, 2.6],
    ],
    0.86,
    0.22,
  )
  addVein(
    [
      [53.2, 3],
      [57.8, 4],
      [61.0, 3.2],
    ],
    0.8,
    0.2,
  )

  {
    const nFlow = 170
    const pos = new Float32Array(nFlow * 3)
    const sum = magmaPaths.reduce((s, p) => s + p.len, 0) || 1
    for (let i = 0; i < nFlow; i++) {
      let r = Math.random() * sum
      let idx = 0
      for (let k = 0; k < magmaPaths.length; k++) {
        r -= magmaPaths[k]!.len
        if (r <= 0) {
          idx = k
          break
        }
        idx = k
      }
      magmaFlowPath.push(idx)
      magmaFlowS.push(Math.random())
      const xy = pointOnPath(magmaPaths[idx]!.pts, magmaFlowS[i]!)
      pos[i * 3] = xy[0]
      pos[i * 3 + 1] = xy[1]
      pos[i * 3 + 2] = 12.2 + (Math.random() - 0.5) * 0.6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    magmaFlow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffd08a,
        size: 0.72,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    )
    root.add(magmaFlow)
  }

  igneousMesh = extrudePoly(
    [
      [43.2, 2.4],
      [47.6, 6.6],
      [50.4, 5.2],
      [49.6, 0.6],
      [45.8, -0.8],
    ],
    3.2,
    rockMat(texIgneous, 0xf0c8a8),
    0.06,
    0.06,
    0.45,
  )
  igneousMesh.position.z = 10.95
  root.add(igneousMesh)

  cone = extrudePoly(
    [
      [38, 8],
      [41, 14],
      [44.5, 21],
      [48, 27.5],
      [50.5, 32],
      [53, 33.2],
      [56, 31.5],
      [60, 24],
      [66, 16],
      [72, 10],
      [78, 6.2],
      [78, 0],
      [38, 0],
    ],
    D,
    rockMat(texIgneous, 0xd4b090, texStrataN),
    0.055,
    0.055,
    0.55,
  )
  root.add(cone)

  lavaGlow = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 32),
    new THREE.MeshBasicMaterial({
      map: texLava,
      color: 0xffaa55,
      transparent: true,
      opacity: 0.95,
    }),
  )
  lavaGlow.rotation.x = -Math.PI / 2
  lavaGlow.position.set(52, 34.8, 0)
  root.add(lavaGlow)

  {
    const n = 220
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 52 + (Math.random() - 0.5) * 5
      pos[i * 3 + 1] = 35 + Math.random() * 16
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    eruption = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xff8a2a, size: 1.05, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    root.add(eruption)
  }

  // 湖泊
  const lake = extrudePoly(
    [
      [-78, 10],
      [-66, 10.5],
      [-56, 10.3],
      [-50.5, 9.6],
      [-49.2, 8.7],
      [-50.4, 8.15],
      [-78, 8.15],
    ],
    D * 0.92,
    new THREE.MeshStandardMaterial({
      color: 0x5eb0d8,
      roughness: 0.18,
      metalness: 0.08,
      transparent: true,
      opacity: 0.82,
    }),
    0.03,
    0.03,
    0.35,
  )
  lake.position.z = 0.4
  root.add(lake)

  root.add(makeTree(-12, 15.2, 8, 1.1))
  root.add(makeTree(2, 14.6, -6, 0.95))
  root.add(makeTree(14, 16.2, 6, 1.15))
  root.add(makeTree(-28, 14.4, 4, 0.85))

  {
    const n = 90
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -8 + Math.random() * 36
      pos[i * 3 + 1] = 14 + Math.random() * 6
      pos[i * 3 + 2] = -8 + Math.random() * 16
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    weather = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xc9a86a, size: 0.85, transparent: true, opacity: 0.7, depthWrite: false }),
    )
    sedimentMesh = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ visible: false }))
    root.add(weather, sedimentMesh)
  }

  // 太阳辐射
  addProcessArrow(0x5aaa4a, new THREE.Vector3(-52, 36, 14), new THREE.Vector3(-52, 22, 14), 0.0, 0.22, 14)
  addProcessArrow(0x5aaa4a, new THREE.Vector3(-40, 36, 14), new THREE.Vector3(-40, 22, 14), 0.0, 0.22, 14)
  addProcessArrow(0x5aaa4a, new THREE.Vector3(-28, 36, 14), new THREE.Vector3(-28, 22, 14), 0.0, 0.22, 14)
  // 风化侵蚀
  addProcessArrow(0x5aaa4a, new THREE.Vector3(8, 24, 16), new THREE.Vector3(8, 14, 16), 0.42, 0.62, 11)
  addProcessArrow(0x5aaa4a, new THREE.Vector3(18, 24, 16), new THREE.Vector3(18, 14, 16), 0.42, 0.62, 11)
  // 搬运沉积
  addProcessArrow(0x4aa3d9, new THREE.Vector3(-8, 18, 16), new THREE.Vector3(-42, 10, 16), 0.48, 0.68, 16)
  // 埋藏成岩
  addProcessArrow(0x5aaa4a, new THREE.Vector3(-58, 6, 16), new THREE.Vector3(-58, -6, 16), 0.55, 0.75, 12)
  addProcessArrow(0x5aaa4a, new THREE.Vector3(-46, 6, 16), new THREE.Vector3(-46, -6, 16), 0.55, 0.75, 12)
  // 变质
  addProcessArrow(0x6ec8f0, new THREE.Vector3(-10, 2, 16), new THREE.Vector3(-10, -16, 16), 0.7, 0.9, 16)
  addProcessArrow(0x6ec8f0, new THREE.Vector3(8, 2, 16), new THREE.Vector3(8, -16, 16), 0.7, 0.9, 16)
  // 喷出
  addProcessArrow(0xf0d078, new THREE.Vector3(52, 8, 16), new THREE.Vector3(52, 28, 16), 0.12, 0.4, 18)
  addProcessArrow(0xf0d078, new THREE.Vector3(52, 6, 16), new THREE.Vector3(45, 8, 16), 0.28, 0.5, 12)
  addProcessArrow(0xff6a1a, new THREE.Vector3(44, -16, 16), new THREE.Vector3(50, -12, 16), 0.86, 1.0, 10)

  const labDefs: Array<[string, string, number, number, number, number]> = [
    ['太阳辐射能', DemoHex.lift, -38, 38, 16, 0.52],
    ['表层环境 · 低温低压', DemoHex.inkMuted, 6, 28, 16, 0.48],
    ['搬运 · 沉积', DemoHex.coldSoft, -40, 14, 16, 0.48],
    ['埋藏及成岩', DemoHex.lift, -52, 2, 16, 0.48],
    ['沉积岩', '#e09f3e', -26, 2, 16, 0.52],
    ['变质作用', DemoHex.cold, 2, -8, 16, 0.48],
    ['变质岩', '#c9a0e8', 2, -18, 16, 0.52],
    ['岩浆岩（喷出岩）', DemoHex.warm, 70, 24, 16, 0.48],
    ['岩浆岩（侵入岩）', DemoHex.warm, 40, 7, 16, 0.48],
    ['喷出作用', DemoHex.lift, 64, 14, 16, 0.46],
    ['侵入作用', DemoHex.lift, 40, 1, 16, 0.46],
    ['岩浆 · 深层高温高压', '#ff9f43', 64, -10, 16, 0.5],
  ]
  for (const [text, color, x, y, z, sc] of labDefs) {
    const s = makeLabel(text, color, sc)
    s.position.set(x, y, z)
    root.add(s)
    labels.push(s)
  }

  applyProcessVisibility(progress.value)
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function applyProcessVisibility(p: number) {
  const mag = smoothstep(0, 0.18, p)
  const erupt = smoothstep(0.08, 0.36, p)
  const wea = smoothstep(0.38, 0.62, p)
  const rem = smoothstep(0.86, 1, p)

  if (magmaChamber) {
    const pulse = 1 + 0.012 * Math.sin(phase * 1.15)
    magmaChamber.scale.set(pulse, pulse, 1)
    const mat = magmaChamber.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.55 + mag * 0.4 + rem * 0.3
  }
  if (eruption) {
    const mat = eruption.material as THREE.PointsMaterial
    mat.opacity = erupt * 0.9
    eruption.visible = erupt > 0.04
  }
  if (lavaGlow) {
    const mat = lavaGlow.material as THREE.MeshBasicMaterial
    mat.opacity = 0.4 + erupt * 0.55
  }
  if (weather) {
    const mat = weather.material as THREE.PointsMaterial
    mat.opacity = wea * 0.75
    weather.visible = wea > 0.04
  }
  if (cone) {
    const mat = cone.material as THREE.MeshStandardMaterial
    mat.emissive = new THREE.Color(0x331100)
    mat.emissiveIntensity = erupt * 0.22
  }

  for (const item of processArrows) {
    const fade = 0.1
    const env =
      smoothstep(item.t0 - fade, item.t0 + fade * 0.6, p) * (1 - smoothstep(item.t1 - fade * 0.6, item.t1 + fade, p))
    const live = 0.2 + env * 0.8
    item.g.scale.setScalar(0.96 + env * 0.08 + env * 0.03 * Math.sin(phase * 2.2))
    item.g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (m && 'opacity' in m) {
        m.transparent = true
        m.opacity = live
      }
    })
  }
}

function tickEruption(dt: number) {
  if (!eruption) return
  const pos = eruption.geometry.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const on = progress.value > 0.12 && progress.value < 0.4
  for (let i = 0; i < arr.length / 3; i++) {
    if (!on) continue
    arr[i * 3]! += (Math.random() - 0.5) * 0.8 * dt
    arr[i * 3 + 1]! += (10 + Math.random() * 8) * dt
    arr[i * 3 + 2]! += (Math.random() - 0.5) * 0.8 * dt
    if (arr[i * 3 + 1]! > 58) {
      arr[i * 3] = 52 + (Math.random() - 0.5) * 5
      arr[i * 3 + 1] = 35
      arr[i * 3 + 2] = (Math.random() - 0.5) * 5
    }
  }
  pos.needsUpdate = true
}

function tickMagmaFlow(dt: number) {
  if (!magmaFlow || magmaPaths.length === 0) return
  const pos = magmaFlow.geometry.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const erupt = smoothstep(0.08, 0.4, progress.value)
  const speed = 0.07 + erupt * 0.16
  const mat = magmaFlow.material as THREE.PointsMaterial
  mat.opacity = 0.45 + erupt * 0.5
  for (let i = 0; i < magmaFlowS.length; i++) {
    magmaFlowS[i] = (magmaFlowS[i]! + speed * dt) % 1
    const path = magmaPaths[magmaFlowPath[i]!]
    if (!path) continue
    const xy = pointOnPath(path.pts, magmaFlowS[i]!)
    arr[i * 3] = xy[0]
    arr[i * 3 + 1] = xy[1]
  }
  pos.needsUpdate = true
}

function tickWeather(dt: number) {
  if (!weather) return
  const pos = weather.geometry.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const on = progress.value > 0.42 && progress.value < 0.7
  for (let i = 0; i < arr.length / 3; i++) {
    if (!on) continue
    arr[i * 3 + 1]! -= (1.6 + Math.random() * 2.2) * dt
    arr[i * 3]! -= (1.8 + Math.random()) * dt
    if (arr[i * 3 + 1]! < 8) {
      arr[i * 3] = -8 + Math.random() * 36
      arr[i * 3 + 1] = 14 + Math.random() * 6
      arr[i * 3 + 2] = -8 + Math.random() * 16
    }
  }
  pos.needsUpdate = true
}

function setupThree() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(300, wrapRef.value.clientHeight)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9eccea)
  scene.fog = new THREE.FogExp2(0x9eccea, 0.0038)

  camera = new THREE.PerspectiveCamera(36, w / h, 1, 700)
  camera.position.set(12, 10, 136)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.22

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.enablePan = false
  controls.target.set(12, 4, 0)
  controls.minDistance = 90
  controls.maxDistance = 240
  controls.maxPolarAngle = Math.PI * 0.52
  controls.minPolarAngle = Math.PI * 0.28

  scene.add(new THREE.AmbientLight(0xfff4e6, 0.75))
  scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x6a5340, 0.85))
  const key = new THREE.DirectionalLight(0xfff2d8, 1.15)
  key.position.set(-40, 80, 70)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xc5dcf0, 0.55)
  fill.position.set(50, 24, 40)
  scene.add(fill)

  root = new THREE.Group()
  scene.add(root)

  loadTextures()
    .then(() => {
      if (disposed) return
      processReady = true
      if (isProcess.value) buildProcessScene()
    })
    .catch(() => {
      processReady = true
      if (isProcess.value) buildProcessScene()
    })

  lastT = performance.now()
  loop()
}

function loop() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  phase += dt

  if (isProcess.value && playing.value) {
    progress.value += dt * 0.038
    if (progress.value > 1) progress.value = 0
  }

  if (isProcess.value && processReady) {
    applyProcessVisibility(progress.value)
    tickEruption(dt)
    tickMagmaFlow(dt)
    tickWeather(dt)
    if (sunBillboard && camera) sunBillboard.lookAt(camera)
  }

  controls?.update()
  if (isProcess.value) renderer.render(scene, camera)
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(300, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function teardownThree() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  if (root) {
    clearRoot()
    scene?.remove(root)
  }
  ;[texLava, texIgneous, texSed, texMeta, texGrass, texGrassN, texSand, texStrataN, texGneiss].forEach((t) => t?.dispose())
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  root = null
}

/* —— D3：类型 / 循环 —— */
function related(id: string) {
  return EDGES.filter((e) => e.from === id || e.to === id)
}

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#rc-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'rc-anim')
    .text(`
      .rc-flow { stroke-dasharray: 8 10; animation: rc-dash 3.2s linear infinite; }
      .rc-flow-hi { stroke-dasharray: 7 8; animation: rc-dash 1.8s linear infinite; }
      @keyframes rc-dash { to { stroke-dashoffset: -36; } }
    `)
}

function marker(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>, id: string, color: string) {
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 12 12')
    .attr('refX', 10)
    .attr('refY', 6)
    .attr('markerWidth', 11)
    .attr('markerHeight', 11)
    .attr('orient', 'auto')
    .attr('markerUnits', 'userSpaceOnUse')
    .append('path')
    .attr('d', 'M 1 1.5 L 11 6 L 1 10.5 Z')
    .attr('fill', color)
}

function quadAt(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number) {
  const u = 1 - t
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by }
}

function curvePath(ax: number, ay: number, bx: number, by: number, rA = 40, rB = 40) {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const bulge = Math.min(42, len * 0.2)
  const cx = (ax + bx) / 2 + nx * bulge
  const cy = (ay + by) / 2 + ny * bulge
  const t0 = Math.min(0.2, (rA + 2) / len)
  const t1 = 1 - Math.min(0.22, (rB + 6) / len)
  const p0 = quadAt(ax, ay, cx, cy, bx, by, t0)
  const p1 = quadAt(ax, ay, cx, cy, bx, by, t1)
  const mid = quadAt(ax, ay, cx, cy, bx, by, (t0 + t1) / 2)
  return { d: `M ${p0.x} ${p0.y} Q ${cx} ${cy} ${p1.x} ${p1.y}`, lx: mid.x + nx * 14, ly: mid.y + ny * 14 }
}

function drawTypes() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', DemoHex.canvas).attr('rx', 12)
  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('三大类岩石')
  svg.append('text').attr('x', 24).attr('y', 46).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('贴图示意 · ambientCG CC0 · 非岩性鉴定')

  const hi = active.value
  const cardW = 210
  const gap = 28
  const startX = (W - (cardW * 3 + gap * 2)) / 2
  const cardY = 70

  TYPE_CARDS.forEach((card, i) => {
    const x = startX + i * (cardW + gap)
    const on = hi === card.id
    const patId = `rc-tex-${card.id}`
    defs
      .append('pattern')
      .attr('id', patId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', cardW - 32)
      .attr('height', 100)
      .append('image')
      .attr('href', card.tex)
      .attr('width', cardW - 32)
      .attr('height', 100)
      .attr('preserveAspectRatio', 'xMidYMid slice')

    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('click', () => {
        active.value = card.id
      })
    g.append('rect')
      .attr('x', x)
      .attr('y', cardY)
      .attr('width', cardW)
      .attr('height', 280)
      .attr('rx', 12)
      .attr('fill', on ? '#121c2e' : DemoHex.panel)
      .attr('stroke', on ? card.fill : '#1e2f48')
      .attr('stroke-width', on ? 2 : 1)
      .attr('opacity', !TYPE_CARDS.some((c) => c.id === hi) || on ? 1 : 0.55)
    g.append('rect')
      .attr('x', x + 16)
      .attr('y', cardY + 16)
      .attr('width', cardW - 32)
      .attr('height', 100)
      .attr('rx', 8)
      .attr('fill', `url(#${patId})`)
      .attr('stroke', '#1a2740')
    g.append('circle').attr('cx', x + 28).attr('cy', cardY + 140).attr('r', 7).attr('fill', card.fill)
    g.append('text').attr('x', x + 44).attr('y', cardY + 144).attr('fill', DemoHex.ink).attr('font-size', 13).attr('font-weight', 600).text(card.name)
    g.append('text').attr('x', x + 20).attr('y', cardY + 176).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('成因')
    g.append('text').attr('x', x + 20).attr('y', cardY + 196).attr('fill', DemoHex.inkMuted).attr('font-size', 11).text(card.how)
    g.append('text').attr('x', x + 20).attr('y', cardY + 228).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('常见')
    g.append('text').attr('x', x + 20).attr('y', cardY + 248).attr('fill', DemoHex.inkMuted).attr('font-size', 11).text(card.eg)
  })

  const cur = TYPE_CARDS.find((c) => c.id === hi) ?? TYPE_CARDS[0]!
  svg.append('rect').attr('x', 24).attr('y', 372).attr('width', W - 48).attr('height', 44).attr('rx', 8).attr('fill', DemoHex.panel).attr('stroke', '#1e2f48')
  svg.append('text').attr('x', 40).attr('y', 398).attr('fill', cur.fill).attr('font-size', 11).attr('font-weight', 600).text(cur.name)
  svg.append('text').attr('x', 110).attr('y', 398).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('在「形成过程」「循环路径」中看转化关系')
}

function drawCycle() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'rc-on', DemoHex.accent)
  marker(defs, 'rc-hi', DemoHex.lift)

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', DemoHex.canvas).attr('rx', 12)
  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('岩石圈物质循环')
  svg.append('text').attr('x', 24).attr('y', 46).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('岩浆 → 岩浆岩 → 沉积物 → 沉积岩 → 变质岩 → 重熔')

  const hi = active.value
  const tour = TOUR[tourIdx.value]!
  const by = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, (typeof NODES)[number]>
  const rel = related(hi)

  const isEdgeOn = (e: (typeof EDGES)[number]) => {
    const isTour = e.from === tour.from && e.to === tour.to
    if (playing.value) return isTour
    return isTour || rel.some((r) => r.from === e.from && r.to === e.to)
  }

  for (const e of EDGES) {
    if (!isEdgeOn(e)) continue
    const a = by[e.from]
    const b = by[e.to]
    if (!a || !b) continue
    const isTour = e.from === tour.from && e.to === tour.to
    const { d, lx, ly } = curvePath(a.x, a.y, b.x, b.y, 40, 40)
    const stroke = isTour ? DemoHex.lift : DemoHex.accent
    svg
      .append('path')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', stroke)
      .attr('stroke-width', isTour ? 2.6 : 2.2)
      .attr('marker-end', isTour ? 'url(#rc-hi)' : 'url(#rc-on)')
      .attr('class', isTour ? 'rc-flow-hi' : 'rc-flow')
    const tw = e.label.length * 10 + 12
    svg.append('rect').attr('x', lx - tw / 2).attr('y', ly - 9).attr('width', tw).attr('height', 16).attr('rx', 4).attr('fill', DemoHex.canvasFog).attr('opacity', 0.9)
    svg.append('text').attr('x', lx).attr('y', ly + 3).attr('text-anchor', 'middle').attr('fill', stroke).attr('font-size', 10).attr('font-weight', isTour ? 600 : 500).text(e.label)
  }

  for (const n of NODES) {
    const onTour = n.id === tour.from || n.id === tour.to
    const linked = playing.value ? onTour : n.id === hi || rel.some((r) => r.from === n.id || r.to === n.id)
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('click', () => {
        active.value = n.id
        playing.value = false
      })
    g.append('circle').attr('cx', n.x).attr('cy', n.y).attr('r', linked ? 38 : 32).attr('fill', n.fill).attr('opacity', linked ? 0.95 : 0.28).attr('stroke', linked ? '#f2f7fc' : 'transparent').attr('stroke-width', 2)
    g.append('text').attr('x', n.x).attr('y', n.y - 2).attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 12).attr('font-weight', 600).text(n.label)
    g.append('text').attr('x', n.x).attr('y', n.y + 14).attr('text-anchor', 'middle').attr('fill', 'rgba(255,255,255,0.75)').attr('font-size', 9).text(n.sub)
  }

  const fromN = by[tour.from]
  const toN = by[tour.to]
  const edge = EDGES.find((e) => e.from === tour.from && e.to === tour.to)
  svg.append('rect').attr('x', 24).attr('y', 392).attr('width', W - 48).attr('height', 32).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', '#1e2f48')
  svg.append('text').attr('x', 40).attr('y', 412).attr('fill', DemoHex.lift).attr('font-size', 10).attr('font-weight', 600).text('当前环节')
  svg.append('text').attr('x', 100).attr('y', 412).attr('fill', DemoHex.inkMuted).attr('font-size', 10).text(`${fromN.label} → ${toN.label}（${edge?.label ?? ''}） · ${tourIdx.value + 1}/${TOUR.length}`)
}

function redraw2d() {
  if (isTypes.value) drawTypes()
  else if (isCycle.value) drawCycle()
}

function tickTour() {
  if (!playing.value || !isCycle.value) return
  tourIdx.value = (tourIdx.value + 1) % TOUR.length
  active.value = TOUR[tourIdx.value]!.to
}

function startTour() {
  stopTour()
  if (!isCycle.value) return
  tourTimer = window.setInterval(tickTour, 2200)
}
function stopTour() {
  if (tourTimer) {
    clearInterval(tourTimer)
    tourTimer = 0
  }
}

watch([active, tourIdx, playing, () => props.stepId], () => {
  if (!isProcess.value) redraw2d()
})

watch(
  () => props.stepId,
  (id) => {
    if (id === 'process') {
      playing.value = true
      progress.value = 0
      stopTour()
      if (processReady) buildProcessScene()
    } else if (id === 'types') {
      playing.value = false
      stopTour()
      if (!TYPE_CARDS.some((c) => c.id === active.value)) active.value = 'igneous'
      requestAnimationFrame(redraw2d)
    } else {
      playing.value = true
      tourIdx.value = 0
      active.value = 'magma'
      startTour()
      requestAnimationFrame(redraw2d)
    }
  },
)

watch(playing, (on) => {
  if (isCycle.value) {
    if (on) startTour()
    else stopTour()
  }
})

onMounted(() => {
  setupThree()
  window.addEventListener('resize', onResize)
  if (isCycle.value) {
    playing.value = true
    startTour()
  }
  if (!isProcess.value) requestAnimationFrame(redraw2d)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  stopTour()
  teardownThree()
  d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <template v-if="isProcess">
        <label class="ctrl">
          <span>进程</span>
          <input v-model.number="progress" type="range" min="0" max="1" step="0.01" @pointerdown="playing = false" />
        </label>
        <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
          {{ playing ? '暂停过程' : '播放过程' }}
        </button>
      </template>
      <div v-else-if="isTypes" class="chips">
        <button
          v-for="c in TYPE_CARDS"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ on: active === c.id }"
          @click="active = c.id"
        >
          {{ c.name }}
        </button>
      </div>
      <button v-else type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? '暂停巡游' : '演示循环' }}
      </button>
    </div>

    <div v-show="isProcess" ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud">
        <p class="hud-kicker">岩石圈物质循环 · 地质切面（课堂示意）</p>
        <p class="hud-title">{{ phaseInfo.title }}</p>
        <p class="hud-desc">{{ phaseInfo.note }}</p>
        <div class="hud-tags">
          <span class="tag surface">表层环境 · 低温低压</span>
          <span class="tag deep">深层环境 · 高温高压</span>
        </div>
      </aside>
    </div>
    <svg
      v-show="!isProcess"
      ref="svgRef"
      class="canvas"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
    />
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.hint {
  font-size: 12px;
  color: var(--text-400);
  margin-right: auto;
}
.ctrl {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-500);
}
.ctrl input[type='range'] {
  width: 150px;
}
.chips {
  display: flex;
  gap: 6px;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--demo-accent);
  color: var(--demo-accent-soft);
  background: var(--demo-accent-on);
}
.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.btn.on {
  border-color: var(--demo-accent);
  color: var(--demo-accent-soft);
  background: var(--demo-accent-on);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 320px;
}
.globe {
  display: block;
  width: 100%;
  height: 100%;
}
.hud {
  position: absolute;
  left: 14px;
  top: 14px;
  pointer-events: none;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(12, 22, 34, 0.42);
  backdrop-filter: blur(8px);
  max-width: 280px;
}
.hud-kicker {
  margin: 0 0 4px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(226, 236, 246, 0.72);
}
.hud-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: #f4f8fc;
}
.hud-desc {
  margin: 4px 0 0;
  font-size: 11px;
  color: rgba(226, 236, 246, 0.82);
}
.hud-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
}
.tag.surface {
  background: rgba(90, 170, 74, 0.28);
  color: #d8f0c8;
}
.tag.deep {
  background: rgba(232, 93, 4, 0.28);
  color: #ffd2b0;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
