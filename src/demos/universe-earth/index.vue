<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import { GalaxyGeometry, GalaxyShader } from 'threejs-galaxy-shader'
import { createGalaxyNebulaMaterial, hiiRgb, spectralRgb } from '@/engine/galaxyNebula'
import { makeSunBillboard } from '@/engine/sunVisual'
import { configureEarthRenderer, createRealisticEarth, type RealisticEarth } from '@/engine/realisticEarth'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const canvasRef = ref<HTMLCanvasElement>()
const playing = ref(true)
let scenePress: { x: number; y: number } | null = null

function onScenePointerDown(event: PointerEvent) {
  if (event.button === 0) scenePress = { x: event.clientX, y: event.clientY }
}

function onScenePointerUp(event: PointerEvent) {
  if (!scenePress || event.button !== 0) return
  const moved = Math.hypot(event.clientX - scenePress.x, event.clientY - scenePress.y)
  scenePress = null
  if (moved < 6) playing.value = !playing.value
}
const focusBody = ref<string | 'all'>('all')
const speed = ref(1)
/** 亮星中文/Bayer 名标注 */
const showStarNames = ref(true)
/** 放宽到更暗的具名星 */
const showMoreStarNames = ref(false)
/** 银河系课：斜视（参考构图）/ 俯视 / 侧视 */
const galaxyView = ref<'oblique' | 'top' | 'edge'>('oblique')

/** 教学压缩：轨道对数映射；贴图见 public/textures/planets */
type PlanetDef = {
  id: string
  name: string
  au: number
  /** 相对地球的夸张半径 */
  size: number
  color: number
  tex: string
  ring?: boolean
  group: 'inner' | 'outer'
}

const PLANETS: PlanetDef[] = [
  // size 为相对地球的教学夸张比（非真实半径比）
  { id: 'mercury', name: '水星', au: 0.39, size: 0.72, color: 0xb0a090, tex: '/textures/planets/mercury.jpg', group: 'inner' },
  { id: 'venus', name: '金星', au: 0.72, size: 1.15, color: 0xe8c878, tex: '/textures/planets/venus.jpg', group: 'inner' },
  { id: 'earth', name: '地球', au: 1, size: 1.2, color: 0x4a90c8, tex: '/textures/earth-blue-marble.jpg', group: 'inner' },
  { id: 'mars', name: '火星', au: 1.52, size: 0.9, color: 0xc45a3a, tex: '/textures/planets/mars.jpg', group: 'inner' },
  { id: 'jupiter', name: '木星', au: 5.2, size: 2.15, color: 0xd4a574, tex: '/textures/planets/jupiter.jpg', group: 'outer' },
  { id: 'saturn', name: '土星', au: 9.54, size: 1.9, color: 0xe8d4a0, tex: '/textures/planets/saturn.jpg?v=cassini-bjj', ring: true, group: 'outer' },
  { id: 'uranus', name: '天王星', au: 19.2, size: 1.4, color: 0x7ec8d4, tex: '/textures/planets/uranus.jpg', group: 'outer' },
  { id: 'neptune', name: '海王星', au: 30.1, size: 1.35, color: 0x3a6ab8, tex: '/textures/planets/neptune.jpg', group: 'outer' },
]

const EARTH_R = 5.4
const SUN_R = 20
/** 水星→海王星映射到可视环带，保证八轨同屏 */
const ORBIT_R_IN = 30
const ORBIT_R_OUT = 235
const AU_IN = 0.39
const AU_OUT = 30.1

/** 轨道半径（场景单位，对数压缩） */
function orbitRadius(au: number) {
  const t = Math.log(Math.max(au, AU_IN) / AU_IN) / Math.log(AU_OUT / AU_IN)
  return ORBIT_R_IN + Math.min(1, Math.max(0, t)) * (ORBIT_R_OUT - ORBIT_R_IN)
}

/** 全系外缘（含标签余量），用于取景 */
function systemFitRadius() {
  return ORBIT_R_OUT * 0.98
}

const isGalaxy = computed(() => props.stepId === 'galaxy')

const stepTitle = computed(() => {
  if (props.stepId === 'galaxy') return '银河系 · 星系云图'
  if (props.stepId === 'structure') return '内行星 · 外行星 · 小行星带'
  if (props.stepId === 'earth') return '地球在太阳系中的位置'
  return '太阳系结构'
})
const stepHint = computed(() => {
  if (props.stepId === 'galaxy') return '银盘 · 旋臂 · 银心 · 太阳系约在猎户支臂'
  if (props.stepId === 'structure') return '火星与木星之间为小行星带 · 轨道与大小为教学夸张'
  if (props.stepId === 'earth') return '日地距离适中 · 有液态水与适宜温度的条件之一'
  return '八大行星近共面同向 · 哈雷彗星轨道倾角约 162°（逆行）'
})

type PlanetRuntime = {
  def: PlanetDef
  root: THREE.Group
  mesh: THREE.Mesh
  label: THREE.Sprite
  orbitLine: THREE.Line
  phase: number
  radius: number
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let sunLookAt: ((c: THREE.Camera) => void) | null = null
let disposables: THREE.Object3D[] = []
let planets: PlanetRuntime[] = []
let solarEarth: RealisticEarth | null = null
let asteroidPoints: THREE.Points | null = null
let asteroidBeltRoot: THREE.Group | null = null
let beltLabel: THREE.Sprite | null = null
let beltLabelAngle = 0.85
let halleyRoot: THREE.Group | null = null
let halleyOrbit: THREE.Line | null = null
let halleyLabel: THREE.Sprite | null = null
/** 彗尾广告牌（绕尾轴朝向相机，避免侧视变细线） */
let halleyTailBoard: THREE.Object3D | null = null
let halleyPhase = 0.12
const _halleyCamLocal = new THREE.Vector3()
let starFieldRoot: THREE.Group | null = null
let starLabelGroup: THREE.Group | null = null
let skyTexture: THREE.Texture | null = null
let systemRoot: THREE.Group | null = null
let galaxyRoot: THREE.Group | null = null
let galaxyCloudTex: THREE.Texture | null = null
/** threejs-galaxy-shader 点云材质 */
let galaxyShaderMat: THREE.ShaderMaterial | null = null
/** 盘面星云气体（fBm） */
let galaxyNebulaMat: THREE.ShaderMaterial | null = null
let galaxySpin = 0
let galaxyElapsed = 0
let composer: EffectComposer | null = null
let bloomPass: UnrealBloomPass | null = null
let raf = 0
let disposed = false
let lastT = 0
/** 进入银河系课前的色调映射，退出时还原 */
let savedToneMapping: THREE.ToneMapping = THREE.NoToneMapping
let savedExposure = 1

/** 场景单位 / kpc（银盘外缘约 16.5 kpc → ~300） */
const GALAXY_SCALE = 18
const GALAXY_DISK_R = 16.5 * GALAXY_SCALE

function addDisposable(obj: THREE.Object3D) {
  disposables.push(obj)
  return obj
}

function disposeObj(obj: THREE.Object3D) {
  const disposeTextures = obj.userData.disposeEarthTextures as (() => void) | undefined
  disposeTextures?.()
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
    obj.geometry.dispose()
    const m = obj.material
    if (Array.isArray(m)) m.forEach((x) => x.dispose())
    else m.dispose()
  } else if (obj instanceof THREE.Sprite) {
    const m = obj.material as THREE.SpriteMaterial
    m.map?.dispose()
    m.dispose()
  }
}

function teardown() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  controls = null
  for (const obj of disposables) disposeObj(obj)
  disposables = []
  planets = []
  solarEarth = null
  asteroidPoints = null
  asteroidBeltRoot = null
  beltLabel = null
  halleyRoot = null
  halleyOrbit = null
  halleyLabel = null
  halleyTailBoard = null
  skyTexture?.dispose()
  skyTexture = null
  galaxyCloudTex?.dispose()
  galaxyCloudTex = null
  galaxyShaderMat?.dispose()
  galaxyShaderMat = null
  galaxyNebulaMat?.dispose()
  galaxyNebulaMat = null
  starFieldRoot?.removeFromParent()
  starFieldRoot = null
  starLabelGroup = null
  systemRoot = null
  galaxyRoot = null
  sunLookAt = null
  composer = null
  bloomPass = null
  if (renderer) {
    renderer.toneMapping = savedToneMapping
    renderer.toneMappingExposure = savedExposure
  }
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
}

function makeLabelSprite(text: string, scale = 0.55, tone: 'default' | 'star' = 'default') {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 26
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  canvas.width = tw + 28
  canvas.height = 44
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  if (tone === 'star') {
    // 深空标注：半透明底 + 暖金字，贴近参考云图
    ctx.fillStyle = 'rgba(4, 8, 18, 0.55)'
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8)
    ctx.fill()
    ctx.fillStyle = '#f0d090'
  } else {
    ctx.fillStyle = 'rgba(8,14,24,0.72)'
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8)
    ctx.fill()
    ctx.fillStyle = DemoHex.ink
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 14, canvas.height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    }),
  )
  spr.renderOrder = 20
  spr.scale.set((canvas.width / 80) * scale, (canvas.height / 80) * scale, 1)
  return spr
}

/** 行星名：白字、无底板，约 14px 屏上大小 */
function makePlanetNameSprite(text: string) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 28 // 画布分辨率；屏上再缩到约 14px
  ctx.font = `500 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  canvas.width = tw + 6
  canvas.height = fontSize + 8
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `500 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 3, canvas.height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false,
      toneMapped: false,
    }),
  )
  spr.renderOrder = 40
  // 再小一档（约 10～11px）
  const h = 0.011
  spr.scale.set(h * (canvas.width / canvas.height), h, 1)
  spr.userData.planetName = true
  return spr
}

function makeOrbitLine(radius: number, color: number, opacity = 0.35) {
  const pts: THREE.Vector3[] = []
  const n = 96
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
}

/**
 * 土星光环几何：把条带贴图的 U 轴映到半径（内→外），才能显示完整环带。
 * 默认 RingGeometry UV 是 U=方位角、V=半径，条带纹理会只露出一小截。
 */
function makeSaturnRingGeometry(inner: number, outer: number) {
  const geo = new THREE.RingGeometry(inner, outer, 160, 6)
  const pos = geo.attributes.position!
  const uv = geo.attributes.uv!
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    const u = (r - inner) / Math.max(1e-6, outer - inner)
    uv.setXY(i, u, 0.5)
  }
  uv.needsUpdate = true
  return geo
}

/** 程序化径向条带（贴图缺失时的后备） */
function makeSaturnRingTextureFallback() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 4
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, c.width, 0)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.08, 'rgba(0,0,0,0)')
  g.addColorStop(0.14, 'rgba(200,180,140,0.35)')
  g.addColorStop(0.28, 'rgba(230,210,170,0.9)')
  g.addColorStop(0.4, 'rgba(30,24,16,0.55)')
  g.addColorStop(0.52, 'rgba(225,205,165,0.95)')
  g.addColorStop(0.68, 'rgba(190,170,130,0.7)')
  g.addColorStop(0.82, 'rgba(210,190,150,0.45)')
  g.addColorStop(0.94, 'rgba(160,140,110,0.2)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/** 圆形光芯（角全透明，避免 Points 方框伪影） */
function makeStarSpriteTexture() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, s, s)
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.48)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.2, 'rgba(255,252,245,0.9)')
  g.addColorStop(0.55, 'rgba(180,200,255,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.premultiplyAlpha = true
  tex.needsUpdate = true
  return tex
}

/** 银河系星点：锐利小光芯（避免大柔边被 Bloom 糊成灰团） */
/** 冷白青光晕（盘面/旋臂用，避免整盘发黄） */
function makeCoolGlowTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, s, s)
  const cx = s / 2
  const cy = s / 2
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5)
  g.addColorStop(0, 'rgba(255, 252, 255, 0.9)')
  g.addColorStop(0.2, 'rgba(200, 230, 255, 0.45)')
  g.addColorStop(0.5, 'rgba(140, 180, 255, 0.14)')
  g.addColorStop(0.78, 'rgba(80, 100, 160, 0.04)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.premultiplyAlpha = true
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

/** 银心微暖光晕（仅核球小范围） */
function makeWarmGlowTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, s, s)
  const cx = s / 2
  const cy = s / 2
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5)
  g.addColorStop(0, 'rgba(255, 245, 230, 0.85)')
  g.addColorStop(0.22, 'rgba(255, 220, 180, 0.35)')
  g.addColorStop(0.55, 'rgba(255, 190, 120, 0.1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.premultiplyAlpha = true
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

function makeGlowSprite(tex: THREE.Texture, scale: number, color = 0xffe8b0, opacity = 0.85) {
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  spr.scale.set(scale, scale, 1)
  return spr
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 太阳系星空（对齐 Stellarium 观感）：
 * NASA 全天图银道光带 + 密星尘 + BSC5 亮星光晕。
 */
async function loadCatalogSky(target: THREE.Scene) {
  target.background = new THREE.Color(0x000000)
  const root = new THREE.Group()
  root.name = 'catalog-sky'
  const starTex = makeStarSpriteTexture()

  // 银道光带全天球（Deep Star Maps，含尘带与星云雾感）
  try {
    const milkyTex = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load('/textures/space/milky-way.jpg', resolve, undefined, reject)
    })
    milkyTex.colorSpace = THREE.SRGBColorSpace
    milkyTex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 8
    milkyTex.generateMipmaps = true
    milkyTex.minFilter = THREE.LinearMipmapLinearFilter
    milkyTex.magFilter = THREE.LinearFilter
    skyTexture?.dispose()
    skyTexture = milkyTex
    // 分段加细，避免近景出现明显多边形色块
    const milky = new THREE.Mesh(
      new THREE.SphereGeometry(2480, 128, 64),
      new THREE.MeshBasicMaterial({
        map: milkyTex,
        side: THREE.BackSide,
        depthWrite: false,
        // 保持贴图本色（灰蓝星野），勿整体染黄
        color: new THREE.Color(0xd8e0ea),
        toneMapped: false,
      }),
    )
    milky.name = 'milky-sphere'
    root.add(milky)
  } catch {
    /* 无贴图时仅星点 */
  }

  // 远景微星尘：银道带附近更密，模拟 Stellarium 细碎星点
  {
    const n = 5200
    const R = 2100
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const rnd = mulberry32(20261011)
    for (let i = 0; i < n; i++) {
      const θ = rnd() * Math.PI * 2
      // 约 55% 落在银道带附近（赤道带状），其余均匀
      let φ: number
      if (rnd() < 0.55) {
        φ = Math.PI * 0.5 + (rnd() - 0.5) * 0.55
      } else {
        φ = Math.acos(2 * rnd() - 1)
      }
      pos[i * 3] = R * Math.sin(φ) * Math.cos(θ)
      pos[i * 3 + 1] = R * Math.sin(φ) * Math.sin(θ)
      pos[i * 3 + 2] = R * Math.cos(φ)
      const t = 0.28 + rnd() * 0.55
      const warm = rnd()
      col[i * 3] = t * (warm > 0.7 ? 1.05 : 0.9)
      col[i * 3 + 1] = t * (0.9 + rnd() * 0.1)
      col[i * 3 + 2] = Math.min(1, t * (warm < 0.25 ? 1.15 : 1.0))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: starTex,
        size: 1.35,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        alphaTest: 0.05,
      }),
    )
    dust.name = 'star-dust'
    root.add(dust)
  }

  try {
    const res = await fetch('/astro/bright-stars.json')
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as {
      count: number
      coords: number[]
      names?: string[]
      namesZh?: string[]
    }
    const n = data.count
    const coords = data.coords
    const names = data.names ?? []
    const namesZh = data.namesZh ?? []

    const R = 2200
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const x = coords[i * 4]!
      const y = coords[i * 4 + 1]!
      const z = coords[i * 4 + 2]!
      const mag = coords[i * 4 + 3]!
      pos[i * 3] = x * R
      pos[i * 3 + 1] = z * R
      pos[i * 3 + 2] = -y * R
      const lum = Math.min(1, Math.pow(10, -0.4 * (mag - 1.2)))
      const cool = Math.min(1, Math.max(0, (2.5 - mag) / 4))
      const k = 0.4 + lum * 0.6
      col[i * 3] = (0.85 + cool * 0.15) * k
      col[i * 3 + 1] = (0.88 + cool * 0.1) * k
      col[i * 3 + 2] = (0.8 + cool * 0.2) * k
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const bscPts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: starTex,
        size: 2.2,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        alphaTest: 0.08,
      }),
    )
    bscPts.name = 'bsc5-points'
    root.add(bscPts)

    // 亮星光晕（Stellarium 式软晕）：一等星更大更亮
    const starMat = new THREE.SpriteMaterial({
      map: starTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    for (let i = 0; i < n; i++) {
      const mag = coords[i * 4 + 3]!
      if (mag >= 2.4) continue
      const spr = new THREE.Sprite(starMat.clone())
      spr.position.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!)
      const sc = 8 + Math.max(0, 2.4 - mag) * 10
      spr.scale.set(sc, sc, 1)
      ;(spr.material as THREE.SpriteMaterial).opacity = mag < 1.0 ? 0.95 : 0.7
      if (mag < 0.5) (spr.material as THREE.SpriteMaterial).color.set(0xe8f4ff)
      root.add(spr)
    }

    const labels = new THREE.Group()
    labels.name = 'star-labels'
    for (let i = 0; i < n; i++) {
      const mag = coords[i * 4 + 3]!
      const zh = namesZh[i] || ''
      const en = names[i] || ''
      if (!zh && !en) continue
      if (mag > 5.2) continue
      const spr = makeLabelSprite(zh || en, zh ? 0.42 : 0.34)
      spr.position.set(pos[i * 3]!, pos[i * 3 + 1]! + 18, pos[i * 3 + 2]!)
      spr.userData.mag = mag
      spr.userData.hasZh = !!zh
      labels.add(spr)
    }
    root.add(labels)
    starLabelGroup = labels
    syncStarLabels()
  } catch {
    /* 仅散点粒子 */
  }

  root.traverse((o) => addDisposable(o))
  starFieldRoot = root
  syncSkyForMode()
  target.add(root)
}

type ArmTeach = {
  id: string
  name: string
  widthKpc: number
  brightness: number
  points: number[][]
}

/**
 * 太阳系 / 银河系课共用全天银道 + 星尘 + BSC5（与太阳系课同套背景）。
 * 银河系课关掉亮星中文名，避免与旋臂教学标注抢视线；全天图略压暗以免盖过盘面。
 */
function syncSkyForMode() {
  if (!starFieldRoot) return
  const galaxy = props.stepId === 'galaxy'
  starFieldRoot.visible = true
  if (scene) scene.background = new THREE.Color(0x000000)
  starFieldRoot.traverse((o) => {
    if (o.name === 'milky-sphere') {
      o.visible = true
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshBasicMaterial
        m.transparent = galaxy
        m.opacity = galaxy ? 0.82 : 1
        m.color.setHex(galaxy ? 0xc0cad6 : 0xd8e0ea)
        m.needsUpdate = true
      }
    } else if (o.name === 'star-dust') {
      o.visible = true
      if (o instanceof THREE.Points) {
        ;(o.material as THREE.PointsMaterial).opacity = galaxy ? 0.7 : 0.78
        ;(o.material as THREE.PointsMaterial).size = 1.35
      }
    } else if (o.name === 'bsc5-points') {
      o.visible = true
      if (o instanceof THREE.Points) {
        ;(o.material as THREE.PointsMaterial).opacity = galaxy ? 0.85 : 0.92
      }
    } else if (o.name === 'star-labels') {
      o.visible = !galaxy && showStarNames.value
    } else if (o instanceof THREE.Sprite && o.parent === starFieldRoot) {
      // BSC 亮星光晕：两课都保留
      o.visible = true
    }
  })
  if (!galaxy) syncStarLabels()
}

/**
 * 银河系课：多层合成，贴近网上常见棒旋示意
 * NASA 俯视底图 + 星云气体着色 + 棒旋点云 + 盘面/晕星 + 教学标注。
 */
async function loadGalaxyMap(target: THREE.Scene) {
  try {
    const res = await fetch('/astro/milky-way-arms-teach.json')
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as {
      R0: number
      diskRadiusKpc: number
      sun: { x: number; z: number; label: string }
      galacticCenter: { label: string }
      arms: ArmTeach[]
    }

    const root = new THREE.Group()
    root.name = 'milky-way-galaxy'
    const coolGlow = makeCoolGlowTexture()
    const warmGlow = makeWarmGlowTexture()
    const starTex = makeStarSpriteTexture()
    galaxyCloudTex?.dispose()
    galaxyCloudTex = null
    galaxyShaderMat?.dispose()
    galaxyShaderMat = null
    galaxyNebulaMat?.dispose()
    galaxyNebulaMat = null

    const diskR = data.diskRadiusKpc * GALAXY_SCALE
    const BAR_ANGLE = 0.55
    const BAR_HALF = 3.6 * GALAXY_SCALE
    const rnd = mulberry32(20261013)

    // ① NASA/JPL 俯视底图：连续盘面质感（Additive，勿单独当主视觉）
    try {
      const diskTex = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(
          '/textures/space/milky-way-disk.jpg',
          resolve,
          undefined,
          reject,
        )
      })
      diskTex.colorSpace = THREE.SRGBColorSpace
      diskTex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 8
      diskTex.generateMipmaps = true
      diskTex.minFilter = THREE.LinearMipmapLinearFilter
      galaxyCloudTex = diskTex
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(diskR * 1.04, 128),
        new THREE.MeshBasicMaterial({
          map: diskTex,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
          color: new THREE.Color(0xb8c8e0),
        }),
      )
      disk.name = 'galaxy-disk-tex'
      disk.rotation.x = -Math.PI / 2
      disk.position.y = -2.4
      root.add(disk)
    } catch {
      /* 无贴图仍用着色器层 */
    }

    // ② 星云气体平面：尘带 / HII / 冷青臂（连续雾感，避免「只有沙点」）
    {
      const nebMat = createGalaxyNebulaMaterial(1.28)
      galaxyNebulaMat = nebMat
      const nebula = new THREE.Mesh(new THREE.PlaneGeometry(diskR * 2.12, diskR * 2.12), nebMat)
      nebula.name = 'galaxy-nebula'
      nebula.rotation.x = -Math.PI / 2
      nebula.position.y = -0.8
      root.add(nebula)
    }

    // ③ threejs-galaxy-shader：立体棒旋骨架
    {
      const totalStars = 72000
      const w = renderer?.domElement.clientWidth || 1200
      const h = renderer?.domElement.clientHeight || 800
      const geometry = new GalaxyGeometry(totalStars)
      const material = new GalaxyShader({
        resolution: new THREE.Vector2(w, h),
        pointSize: 260,
        totalStars,
        time: 0,
        blackHoleRadius: 0.03,
        blackHolePosition: new THREE.Vector3(0, 0, 0),
        spiralCount: 4,
        turnsPerSpiral: 1.22,
        fadeNear: diskR * 0.1,
        fadeFar: diskR * 5.5,
        colorMode: 0,
        colorPalette: [
          new THREE.Color(0xfff0dc),
          new THREE.Color(0xffc8a0),
          new THREE.Color(0xc8a0ff),
          new THREE.Color(0x88c0ff),
          new THREE.Color(0xa0e8ff),
          new THREE.Color(0xff88cc),
          new THREE.Color(0xffffff),
          new THREE.Color(0x70a8ff),
        ],
        colorIntensity: 1.05,
      })
      galaxyShaderMat = material
      const points = new THREE.Points(geometry, material)
      points.name = 'galaxy-shader-points'
      points.rotation.x = -Math.PI / 2
      points.scale.setScalar(diskR * 1.0)
      root.add(points)
    }

    // ④ 盘面填充 + 旋臂加厚 + 核球 + 晕：补臂间星与颜色，俯视也不空
    {
      const N_DISK = 14000
      const N_BULGE = 8000
      const N_HALO = 9000
      let armBudget = 0
      for (const arm of data.arms) armBudget += Math.floor(arm.points.length * 42)
      const capacity = N_DISK + N_BULGE + N_HALO + armBudget + 2500
      const pos = new Float32Array(capacity * 3)
      const col = new Float32Array(capacity * 3)
      let k = 0
      const push = (x: number, y: number, z: number, rgb: [number, number, number]) => {
        if (k >= capacity) return
        pos[k * 3] = x
        pos[k * 3 + 1] = y
        pos[k * 3 + 2] = z
        col[k * 3] = rgb[0]
        col[k * 3 + 1] = rgb[1]
        col[k * 3 + 2] = rgb[2]
        k++
      }

      // 薄盘填充（臂间也有星，避免「只有四条线」）
      for (let i = 0; i < N_DISK; i++) {
        const ang = rnd() * Math.PI * 2
        const r = Math.pow(rnd(), 0.55) * diskR * 0.98
        const h = (rnd() - 0.5) * 3.8 * Math.exp(-r / (diskR * 0.5))
        const temp = 0.25 + rnd() * 0.35
        push(Math.cos(ang) * r, h, Math.sin(ang) * r, spectralRgb(temp, 0.22 + rnd() * 0.28))
      }

      // 核球
      for (let i = 0; i < N_BULGE; i++) {
        const ang = rnd() * Math.PI * 2
        const rr = Math.pow(rnd(), 0.5) * 2.6 * GALAXY_SCALE
        const x = Math.cos(ang) * rr * (0.75 + rnd() * 0.4)
        const z = Math.sin(ang) * rr * (0.55 + rnd() * 0.4)
        const y = (rnd() - 0.5) * 3.2 * GALAXY_SCALE * Math.exp(-rr / (2.0 * GALAXY_SCALE))
        push(x, y, z, spectralRgb(0.55 + rnd() * 0.25, 0.65 + rnd() * 0.4))
      }

      // 晕（俯视时填满画布四周，避免纯黑）
      for (let i = 0; i < N_HALO; i++) {
        const u = rnd() * 2 - 1
        const v = rnd() * 2 - 1
        const w = rnd() * 2 - 1
        const len = Math.hypot(u, v, w) || 1
        const r = (0.85 + rnd() * 1.35) * diskR
        push(
          (u / len) * r,
          (v / len) * r * 0.55,
          (w / len) * r,
          spectralRgb(0.2 + rnd() * 0.35, 0.18 + rnd() * 0.28),
        )
      }

      // 沿教学迹线加厚旋臂 + 少量 HII 结
      for (const arm of data.arms) {
        const nPer = arm.id === 'local' ? 48 : 40
        for (const p of arm.points) {
          for (let j = 0; j < nPer; j++) {
            const spread = arm.widthKpc * GALAXY_SCALE * (0.25 + rnd() * 1.1)
            const a = rnd() * Math.PI * 2
            const g1 = Math.sqrt(-2 * Math.log(Math.max(1e-6, rnd()))) * Math.cos(a)
            const g2 = Math.sqrt(-2 * Math.log(Math.max(1e-6, rnd()))) * Math.sin(a)
            const x = p[0]! * GALAXY_SCALE + g1 * spread * 0.55
            const z = p[1]! * GALAXY_SCALE + g2 * spread * 0.55
            const y = (rnd() - 0.5) * 5.2
            if (rnd() < 0.045) {
              push(x, y, z, hiiRgb(0.55 + rnd() * 0.55))
            } else {
              const temp = rnd() < 0.35 ? 0.12 + rnd() * 0.2 : 0.28 + rnd() * 0.25
              push(x, y, z, spectralRgb(temp, 0.38 + arm.brightness * 0.3 * (0.5 + rnd() * 0.5)))
            }
          }
        }
      }

      // 中央棒
      for (let i = 0; i < 2500; i++) {
        const t = (rnd() - 0.5) * 2
        const along = t * BAR_HALF
        const side = (rnd() - 0.5) * 0.95 * GALAXY_SCALE * (1 - Math.abs(t) * 0.4)
        const x = Math.cos(BAR_ANGLE) * along - Math.sin(BAR_ANGLE) * side
        const z = Math.sin(BAR_ANGLE) * along + Math.cos(BAR_ANGLE) * side
        const y = (rnd() - 0.5) * 1.5 * GALAXY_SCALE
        push(x, y, z, spectralRgb(0.48 + rnd() * 0.2, 0.55 + rnd() * 0.35))
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, k * 3), 3))
      root.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            map: starTex,
            size: 1.55,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            alphaTest: 0.03,
            toneMapped: false,
          }),
        ),
      )
    }

    // 核球多层光晕
    {
      const under = makeGlowSprite(coolGlow, diskR * 0.98, 0x7090c8, 0.1)
      under.position.set(0, -10, 0)
      root.add(under)
      const bulge = makeGlowSprite(warmGlow, diskR * 0.16, 0xffe0c0, 0.55)
      bulge.position.set(0, 6, 0)
      root.add(bulge)
      const bulge2 = makeGlowSprite(coolGlow, diskR * 0.09, 0xfff6ec, 0.62)
      bulge2.position.set(0, 3, 0)
      root.add(bulge2)
      const bulge3 = makeGlowSprite(warmGlow, diskR * 0.05, 0xfffaf4, 0.7)
      bulge3.position.set(0, 1, 0)
      root.add(bulge3)
    }

    const sunX = data.sun.x * GALAXY_SCALE
    const sunZ = data.sun.z * GALAXY_SCALE
    const sunGlow = makeGlowSprite(coolGlow, 14, 0xfff2d8, 0.55)
    sunGlow.position.set(sunX, 6, sunZ)
    root.add(sunGlow)
    const sunLab = makeLabelSprite(data.sun.label || '太阳系', 0.48, 'star')
    sunLab.position.set(sunX, 18, sunZ)
    root.add(sunLab)

    const gcLabel = makeLabelSprite('银心', 0.58, 'star')
    gcLabel.position.set(10, 22, 8)
    root.add(gcLabel)
    const barLabel = makeLabelSprite('中央棒', 0.5, 'star')
    barLabel.position.set(Math.cos(BAR_ANGLE) * BAR_HALF * 0.45, 18, Math.sin(BAR_ANGLE) * BAR_HALF * 0.45)
    root.add(barLabel)

    for (const arm of data.arms) {
      if (arm.id === 'scutum') continue
      const mid = arm.points[Math.floor(arm.points.length * (arm.id === 'local' ? 0.4 : 0.58))]
      if (!mid) continue
      const lab = makeLabelSprite(arm.name, arm.id === 'local' ? 0.52 : 0.46, 'star')
      lab.position.set(mid[0]! * GALAXY_SCALE, 14, mid[1]! * GALAXY_SCALE)
      root.add(lab)
    }

    root.traverse((o) => addDisposable(o))
    galaxyRoot = root
    root.visible = props.stepId === 'galaxy'
    target.add(root)
    syncSkyForMode()
    if (props.stepId === 'galaxy') frameGalaxy()
  } catch {
    galaxyRoot = null
  }
}

function syncStarLabels() {
  if (!starLabelGroup) return
  const on = showStarNames.value
  const lim = showMoreStarNames.value ? 5.2 : 3.2
  for (const child of starLabelGroup.children) {
    const mag = Number(child.userData.mag ?? 99)
    // 默认：亮星 + 有中文名；「更多」：具名星到 5.2 等
    const show =
      on &&
      (mag <= lim || (!!child.userData.hasZh && mag <= (showMoreStarNames.value ? 5.2 : 3.5)))
    child.visible = show
  }
}

/** 默认取景：八大行星轨道同屏；视点略下移，让黄道面抬到画面中上部 */
function frameWholeSystem() {
  if (!camera || !controls) return
  const R = systemFitRadius()
  // 注视点压低 → 轨道平面在屏幕上上移，避免底边被裁
  controls.target.set(0, -R * 0.22, 0)
  const vFov = (camera.fov * Math.PI) / 180
  const aspect = Math.max(camera.aspect, 0.5)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
  const fit = Math.max(R / Math.tan(hFov / 2), R / Math.tan(vFov / 2)) * 0.78
  camera.position.set(fit * 0.18, fit * 0.38, fit * 0.78)
  controls.minDistance = R * 0.32
  controls.maxDistance = fit * 3
  controls.maxPolarAngle = Math.PI * 0.49
  controls.update()
}

/** 银河系取景：默认斜视（参考点云构图），另有俯视/侧视 */
function frameGalaxy() {
  if (!camera || !controls) return
  const R = GALAXY_DISK_R
  controls.target.set(0, 0, 0)
  controls.minDistance = R * 0.4
  controls.maxDistance = R * 4.8
  controls.maxPolarAngle = Math.PI * 0.92
  if (galaxyView.value === 'edge') {
    camera.position.set(R * 0.1, R * 0.26, R * 1.7)
  } else if (galaxyView.value === 'top') {
    camera.position.set(R * 0.05, R * 1.85, R * 0.08)
  } else {
    // 斜视：与参考棒旋点云构图一致
    camera.position.set(R * 0.55, R * 0.92, R * 1.05)
  }
  controls.update()
}

function buildAsteroidBelt() {
  const n = 1600
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const r0 = (orbitRadius(1.52) + orbitRadius(5.2)) * 0.5
  const spread = (orbitRadius(5.2) - orbitRadius(1.52)) * 0.28
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const r = r0 + (Math.random() - 0.5) * 2 * spread
    const y = (Math.random() - 0.5) * 3.5
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = Math.sin(a) * r
    const t = 0.55 + Math.random() * 0.45
    col[i * 3] = 0.85 * t
    col[i * 3 + 1] = 0.78 * t
    col[i * 3 + 2] = 0.65 * t
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  )
}

/**
 * 哈雷彗星（课堂压缩示意，要素对齐 JPL 1P/Halley 量级）：
 * i≈162.3°（>90° 即逆行）、Ω≈59°、ω≈112°；e/a 略压扁以便同屏可见。
 * 场景 Y 向上、黄道在 XZ：Rz→绕 +Y，Rx→绕 +X。
 * 注意：倾角本身已表示逆行，轨道面内须与行星同向参数化（z=-sin），勿再反号。
 * 真实远日点在黄道以南；课堂侧视把长轴镜像到黄道以北（+Y），倾角与逆行不变。
 */
const HALLEY_INC = (162.3 * Math.PI) / 180
const HALLEY_NODE = (59.1 * Math.PI) / 180
const HALLEY_ARGP = (112.2 * Math.PI) / 180
const _halleyAxisX = new THREE.Vector3(1, 0, 0)
const _halleyAxisY = new THREE.Vector3(0, 1, 0)

function halleyPos(t: number) {
  // 远日点略出外行星圈；e 真实≈0.967，此处略降以免针状难辨
  const a = ORBIT_R_OUT * 0.68
  const e = 0.86
  const b = a * Math.sqrt(1 - e * e)
  const c = a * e
  const ang = t * Math.PI * 2
  // 近日点在 +X；面内与行星同向（北黄极俯视逆时针参数）
  const v = new THREE.Vector3(Math.cos(ang) * a - c, 0, -Math.sin(ang) * b)
  v.applyAxisAngle(_halleyAxisY, HALLEY_ARGP) // ω 近日点幅角
  v.applyAxisAngle(_halleyAxisX, HALLEY_INC) // i 倾角（>90° → 逆行）
  v.applyAxisAngle(_halleyAxisY, HALLEY_NODE) // Ω 升交点黄经
  // 镜像到黄道以北：侧视长轴向上，Ly 符号（逆行）不变
  v.y = -v.y
  return v
}

function makeHalleyOrbitLine() {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 120; i++) pts.push(halleyPos(i / 120))
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({
      color: 0x9ec9e8,
      dashSize: 6,
      gapSize: 5,
      transparent: true,
      opacity: 0.55,
    }),
  )
}

/**
 * 参考图风彗星贴图：青白彗头 + 多层扫把尾（青→品红渐隐）+ 星尘闪点。
 * 画布上方=彗头，下方=尾梢。
 */
function makeCometArtTexture() {
  const w = 256
  const h = 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  const rnd = mulberry32(77)

  // 底层宽幅紫蓝雾
  for (let i = 0; i < 14; i++) {
    const t0 = 0.08 + rnd() * 0.15
    const t1 = 0.55 + rnd() * 0.4
    const x0 = w * (0.35 + (rnd() - 0.5) * 0.12)
    const x1 = w * (0.5 + (rnd() - 0.5) * 0.55)
    const g = ctx.createLinearGradient(x0, h * t0, x1, h * t1)
    g.addColorStop(0, 'rgba(120,220,255,0)')
    g.addColorStop(0.15, `rgba(80,200,255,${0.08 + rnd() * 0.1})`)
    g.addColorStop(0.45, `rgba(160,100,255,${0.1 + rnd() * 0.12})`)
    g.addColorStop(0.75, `rgba(220,60,180,${0.06 + rnd() * 0.08})`)
    g.addColorStop(1, 'rgba(40,20,80,0)')
    ctx.strokeStyle = g
    ctx.lineWidth = 10 + rnd() * 28
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, h * t0)
    ctx.quadraticCurveTo(
      w * (0.45 + (rnd() - 0.5) * 0.2),
      h * ((t0 + t1) * 0.5),
      x1,
      h * t1,
    )
    ctx.stroke()
  }

  // 扫把鬃丝（多层半透明描边）
  for (let i = 0; i < 42; i++) {
    const side = (rnd() - 0.5) * 2
    const x0 = w * 0.5 + side * w * 0.04
    const x1 = w * 0.5 + side * w * (0.12 + rnd() * 0.38)
    const y0 = h * (0.1 + rnd() * 0.08)
    const y1 = h * (0.55 + rnd() * 0.4)
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    const cool = rnd()
    if (cool < 0.45) {
      g.addColorStop(0, 'rgba(255,255,255,0.55)')
      g.addColorStop(0.25, 'rgba(120,230,255,0.4)')
      g.addColorStop(0.65, 'rgba(140,120,255,0.18)')
      g.addColorStop(1, 'rgba(200,40,160,0)')
    } else if (cool < 0.75) {
      g.addColorStop(0, 'rgba(200,245,255,0.35)')
      g.addColorStop(0.4, 'rgba(100,180,255,0.22)')
      g.addColorStop(1, 'rgba(180,80,220,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.25)')
      g.addColorStop(0.5, 'rgba(220,100,200,0.2)')
      g.addColorStop(1, 'rgba(80,40,120,0)')
    }
    ctx.strokeStyle = g
    ctx.lineWidth = 1.2 + rnd() * 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(w * 0.5 + side * w * 0.15, (y0 + y1) * 0.5, x1, y1)
    ctx.stroke()
  }

  // 彗头大光晕（青白）
  const head = ctx.createRadialGradient(w * 0.5, h * 0.12, 0, w * 0.5, h * 0.12, w * 0.42)
  head.addColorStop(0, 'rgba(255,255,255,1)')
  head.addColorStop(0.18, 'rgba(180,250,255,0.95)')
  head.addColorStop(0.4, 'rgba(80,210,255,0.55)')
  head.addColorStop(0.7, 'rgba(100,140,255,0.12)')
  head.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = head
  ctx.fillRect(0, 0, w, h * 0.45)

  // 彗核亮芯
  const core = ctx.createRadialGradient(w * 0.5, h * 0.11, 0, w * 0.5, h * 0.11, w * 0.1)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.5, 'rgba(200,255,255,0.9)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.11, w * 0.1, 0, Math.PI * 2)
  ctx.fill()

  // 星尘闪点
  for (let i = 0; i < 55; i++) {
    const u = rnd()
    const px = w * (0.5 + (rnd() - 0.5) * (0.1 + u * 0.7))
    const py = h * (0.18 + u * 0.75)
    const s = 0.6 + rnd() * 1.8
    const a = (0.35 + rnd() * 0.55) * (1 - u * 0.7)
    ctx.fillStyle =
      rnd() > 0.5 ? `rgba(200,240,255,${a})` : `rgba(255,180,240,${a * 0.85})`
    ctx.beginPath()
    ctx.arc(px, py, s, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.premultiplyAlpha = true
  tex.needsUpdate = true
  return tex
}

/** 参考图风：亮青白彗头 + 单片朝向相机的扫把尾（青→紫渐隐） */
function buildHalleyComet() {
  const root = new THREE.Group()
  const softTex = makeStarSpriteTexture()
  const artTex = makeCometArtTexture()

  // 头部多层光晕（始终朝向相机的 Sprite）
  const headGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softTex,
      color: 0x66e0ff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  headGlow.scale.set(14, 14, 1)
  root.add(addDisposable(headGlow))
  const headCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softTex,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  headCore.scale.set(5.5, 5.5, 1)
  root.add(addDisposable(headCore))

  const tailLen = 28
  const tailW = 16
  const board = new THREE.Group()
  board.name = 'halley-tail-board'
  // 平面在 XY，长边沿 +Y；再转到沿 +Z，核在近端
  const plume = new THREE.Mesh(
    new THREE.PlaneGeometry(tailW, tailLen, 1, 1),
    new THREE.MeshBasicMaterial({
      map: artTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 1,
    }),
  )
  // 贴图上方=头：-90° 绕 X 后头靠核、尾沿 +Z
  plume.rotation.x = -Math.PI / 2
  plume.position.z = tailLen * 0.42
  board.add(addDisposable(plume))
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(tailW * 1.25, tailLen * 1.05, 1, 1),
    new THREE.MeshBasicMaterial({
      map: artTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0.4,
      color: 0xdda0ff,
    }),
  )
  veil.rotation.x = -Math.PI / 2
  veil.position.z = tailLen * 0.42
  board.add(addDisposable(veil))
  root.add(board)
  halleyTailBoard = board

  // 尾迹星尘（青粉闪点）
  const n = 80
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = Math.pow(Math.random(), 0.55)
    const len = 2 + u * (tailLen * 0.95)
    const spread = 0.3 + Math.pow(u, 0.9) * 5.5
    const a = Math.random() * Math.PI * 2
    const rr = Math.random() * spread * (0.35 + u)
    pos[i * 3] = Math.cos(a) * rr
    pos[i * 3 + 1] = Math.sin(a) * rr * 0.4
    pos[i * 3 + 2] = len
    const cool = 1 - u
    col[i * 3] = 0.55 + cool * 0.45
    col[i * 3 + 1] = 0.45 + cool * 0.5
    col[i * 3 + 2] = 0.85 + cool * 0.15
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  root.add(
    addDisposable(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          map: softTex,
          size: 2.2,
          sizeAttenuation: true,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          alphaTest: 0.04,
        }),
      ),
    ),
  )
  return root
}

/** 彗尾广告牌绕本地 Z（背离太阳）转向相机，始终呈扫把正面 */
function orientHalleyTailBoard() {
  if (!halleyTailBoard || !halleyRoot || !camera) return
  halleyRoot.updateMatrixWorld(true)
  _halleyCamLocal.copy(camera.position)
  halleyRoot.worldToLocal(_halleyCamLocal)
  // 平面法线约 +Y；绕 Z 转到指向相机在 XY 上的投影
  halleyTailBoard.rotation.z = Math.atan2(_halleyCamLocal.x, _halleyCamLocal.y)
}

function setup() {
  if (!canvasRef.value) return
  disposed = false
  const canvas = canvasRef.value
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 1)
  configureEarthRenderer(renderer, 1.04)
  savedToneMapping = renderer.toneMapping
  savedExposure = renderer.toneMappingExposure

  scene = new THREE.Scene()
  void loadCatalogSky(scene)
  void loadGalaxyMap(scene)

  camera = new THREE.PerspectiveCamera(32, 1, 1, 5000)
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)
  controls.maxPolarAngle = Math.PI * 0.49

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.4, 0.55)
  bloomPass.enabled = false
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  scene.add(new THREE.AmbientLight(0x6a7a90, 0.85))
  const key = new THREE.DirectionalLight(0xfff4e0, 1.45)
  key.position.set(80, 120, 60)
  scene.add(key)
  const fill = new THREE.PointLight(0xffd090, 3.2, 520, 1.05)
  fill.position.set(0, 0, 0)
  scene.add(fill)
  const rim = new THREE.PointLight(0xa8c8ff, 0.9, 600, 1.2)
  rim.position.set(-40, 80, -120)
  scene.add(rim)

  systemRoot = new THREE.Group()
  systemRoot.name = 'solar-system'
  scene.add(systemRoot)

  const sunVis = makeSunBillboard(SUN_R)
  sunLookAt = sunVis.lookAt
  sunVis.group.position.set(0, 0, 0)
  systemRoot.add(addDisposable(sunVis.group))
  const sunLabel = makePlanetNameSprite('太阳')
  sunLabel.position.set(0, SUN_R + 2.5, 0)
  systemRoot.add(addDisposable(sunLabel))

  const loader = new THREE.TextureLoader()
  // 径向剖面条带（宽×矮）；缺文件时用程序渐变
  let ringTex: THREE.Texture = makeSaturnRingTextureFallback()
  loader.load(
    '/textures/planets/saturn_ring.png',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 8
      ringTex.dispose()
      ringTex = tex
      // 已挂到场景的土星环材质换上真贴图
      for (const p of planets) {
        if (p.def.id !== 'saturn') continue
        p.root.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry instanceof THREE.RingGeometry) {
            const m = o.material as THREE.MeshBasicMaterial
            m.map = tex
            m.needsUpdate = true
          }
        })
      }
    },
    undefined,
    () => {
      /* 保留程序化后备 */
    },
  )

  for (const def of PLANETS) {
    const rOrbit = orbitRadius(def.au)
    const root = new THREE.Group()
    systemRoot.add(root)

    const radius = EARTH_R * def.size
    let mesh: THREE.Mesh
    if (def.id === 'earth' && renderer) {
      solarEarth = createRealisticEarth(renderer, radius, new THREE.Vector3(-1, 0.12, 0), {
        segments: 64,
        atmosphereScale: 1.075,
        atmosphereStrength: 0.95,
      })
      solarEarth.surface.userData.disposeEarthTextures = solarEarth.disposeTextures
      mesh = solarEarth.surface
      root.add(addDisposable(solarEarth.surface))
      root.add(addDisposable(solarEarth.atmosphere))
    } else {
      const map = loader.load(def.tex)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 8
      const mat = new THREE.MeshPhongMaterial({
        map,
        color: 0xffffff,
        shininess: 18,
        specular: new THREE.Color(0x333333),
        emissive: new THREE.Color(0xffffff),
        emissiveMap: map,
        emissiveIntensity: 0.32,
      })
      mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat)
      root.add(addDisposable(mesh))
    }

    if (def.ring) {
      // 主环约 1.1～2.3 倍赤道半径；略放宽以便课堂看清卡西尼缝与外环
      const ring = new THREE.Mesh(
        makeSaturnRingGeometry(radius * 1.18, radius * 2.45),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.08,
          toneMapped: false,
        }),
      )
      ring.name = 'saturn-ring'
      ring.rotation.x = Math.PI / 2.12
      root.add(addDisposable(ring))
    }

    // 名称挂在 systemRoot，随帧更新到星球正上方（不被行星材质透明度拖淡）
    const label = makePlanetNameSprite(def.name)
    label.visible = true
    systemRoot.add(addDisposable(label))

    const orbitLine = makeOrbitLine(rOrbit, def.id === 'earth' ? 0x7dd3a0 : 0x6a8498, def.id === 'earth' ? 0.55 : 0.32)
    systemRoot.add(addDisposable(orbitLine))

    // 初始相位错开
    const phase = Math.random() * Math.PI * 2
    planets.push({ def, root, mesh, label, orbitLine, phase, radius })
  }

  asteroidBeltRoot = new THREE.Group()
  asteroidBeltRoot.name = 'asteroid-belt'
  asteroidPoints = buildAsteroidBelt()
  addDisposable(asteroidPoints)
  asteroidBeltRoot.add(asteroidPoints)
  systemRoot.add(asteroidBeltRoot)
  beltLabel = makePlanetNameSprite('小行星带')
  // 环带标注略大于行星名，便于在火星—木星之间辨认
  beltLabel.scale.multiplyScalar(1.4)
  systemRoot.add(addDisposable(beltLabel))

  halleyOrbit = makeHalleyOrbitLine()
  halleyOrbit.computeLineDistances()
  systemRoot.add(addDisposable(halleyOrbit))

  halleyRoot = buildHalleyComet()
  systemRoot.add(halleyRoot)

  halleyLabel = makePlanetNameSprite('哈雷彗星')
  halleyLabel.scale.multiplyScalar(1.45)
  systemRoot.add(addDisposable(halleyLabel))

  applyStepFocus()
  resize()
  if (isGalaxy.value) frameGalaxy()
  else frameWholeSystem()
  lastT = performance.now()
  loop()
  window.addEventListener('resize', resize)
}

function setMatOpacity(obj: THREE.Object3D, opacity: number) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.Material & { opacity?: number; transparent?: boolean }
      m.transparent = true
      m.opacity = opacity
      const shader = m as THREE.ShaderMaterial
      if (shader.uniforms?.globalOpacity) shader.uniforms.globalOpacity.value = opacity
      m.needsUpdate = true
    } else if (o instanceof THREE.Sprite) {
      ;(o.material as THREE.SpriteMaterial).opacity = opacity
    }
  })
}

function applyStepFocus() {
  const step = props.stepId
  const focus = focusBody.value
  const galaxy = step === 'galaxy'

  if (systemRoot) systemRoot.visible = !galaxy
  if (galaxyRoot) galaxyRoot.visible = galaxy
  syncSkyForMode()
  if (scene) scene.background = new THREE.Color(0x000000)
  if (renderer) {
    if (galaxy) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
    } else {
      renderer.toneMapping = savedToneMapping
      renderer.toneMappingExposure = savedExposure
    }
  }
  if (bloomPass) {
    bloomPass.enabled = galaxy
    // 银心/星云泛光：接近常见棒旋示意，阈值勿过低以免糊白
    bloomPass.strength = galaxy ? 0.55 : 0
    bloomPass.radius = galaxy ? 0.38 : 0.2
    bloomPass.threshold = galaxy ? 0.42 : 1
  }

  if (galaxy) return

  for (const p of planets) {
    let dim = false
    if (step === 'structure') {
      dim = false
    } else if (step === 'earth') {
      dim = p.def.id !== 'earth'
    } else if (focus !== 'all') {
      dim = p.def.id !== focus
    }
    p.root.visible = true
    p.orbitLine.visible = true
    setMatOpacity(p.root, dim ? 0.18 : 1)
    p.label.visible = true
    ;(p.label.material as THREE.SpriteMaterial).opacity = 1
    ;(p.orbitLine.material as THREE.LineBasicMaterial).opacity = dim
      ? 0.1
      : p.def.id === 'earth'
        ? 0.55
        : step === 'structure' && p.def.group === 'inner'
          ? 0.5
          : 0.32
  }

  if (asteroidBeltRoot) asteroidBeltRoot.visible = true
  if (asteroidPoints) {
    const mat = asteroidPoints.material as THREE.PointsMaterial
    mat.opacity = step === 'earth' ? 0.2 : step === 'structure' ? 0.95 : 0.85
  }
  if (beltLabel) {
    // 结构课与总览课突出标注；聚焦地球时淡出，避免抢戏
    beltLabel.visible = step !== 'earth'
    ;(beltLabel.material as THREE.SpriteMaterial).opacity = step === 'structure' ? 1 : 0.95
  }
  const showHalley = step !== 'earth'
  if (halleyRoot) {
    halleyRoot.visible = showHalley
    if (showHalley) setMatOpacity(halleyRoot, 1)
  }
  if (halleyOrbit) halleyOrbit.visible = showHalley
  if (halleyLabel) {
    halleyLabel.visible = showHalley
    ;(halleyLabel.material as THREE.SpriteMaterial).opacity = showHalley ? 1 : 0
  }
}

function syncBodies(dt: number) {
  if (isGalaxy.value) {
    if (playing.value && galaxyRoot) {
      galaxySpin += dt * 0.03 * speed.value
      galaxyRoot.rotation.y = galaxySpin
    }
    return
  }
  if (playing.value) {
    for (const p of planets) {
      // 开普勒近似：ω ∝ a^{-1.5}
      const ω = (0.22 / Math.pow(p.def.au, 1.5)) * speed.value
      p.phase += dt * ω
      // 自转自西向东：绕 +Y 正转为北黄极俯视逆时针（金星/天王星未单独逆向）
      p.mesh.rotation.y += dt * 0.6
    }
    // 小行星带：rotation.y+ = 与行星同向（自西向东）
    if (asteroidBeltRoot) asteroidBeltRoot.rotation.y += dt * 0.09 * speed.value
    // 哈雷更慢；逆行由倾角 i≈162° 体现（见 halleyPos）
    halleyPhase = (halleyPhase + dt * 0.035 * speed.value) % 1
  }

  for (const p of planets) {
    const r = orbitRadius(p.def.au)
    // 自西向东公转：北黄极(+Y)俯视逆时针 = x=cosθ, z=-sinθ
    // （Three 绕 +Y 正转把 +X 旋向 −Z；旧式 z=+sin 实为顺时针）
    p.root.position.set(Math.cos(p.phase) * r, 0, -Math.sin(p.phase) * r)
    p.label.position.set(p.root.position.x, p.radius + 2.2, p.root.position.z)
    p.label.visible = true
  }
  if (solarEarth) {
    const earthRuntime = planets.find((p) => p.def.id === 'earth')
    if (earthRuntime) {
      solarEarth.atmosphere.rotation.copy(earthRuntime.mesh.rotation)
      earthRuntime.mesh.updateMatrixWorld(true)
      const q = new THREE.Quaternion()
      earthRuntime.mesh.getWorldQuaternion(q)
      const toSun = earthRuntime.root.position.clone().negate().normalize().applyQuaternion(q.invert())
      solarEarth.setSunDirection(toSun)
    }
  }

  const hp = halleyPos(halleyPhase)
  if (halleyRoot) {
    halleyRoot.position.copy(hp)
    // lookAt 太阳：本地 −Z 朝向太阳，+Z 为背离太阳的彗尾
    halleyRoot.lookAt(0, 0, 0)
    orientHalleyTailBoard()
  }
  if (halleyLabel) halleyLabel.position.set(hp.x, hp.y + 8, hp.z)

  // 小行星带标注：与 Group 绕 Y 正转一致（Ry 后局部角 β → 世界角 β−φ）
  if (beltLabel && asteroidBeltRoot) {
    const beltR = (orbitRadius(1.52) + orbitRadius(5.2)) * 0.5
    const a = beltLabelAngle - asteroidBeltRoot.rotation.y
    beltLabel.position.set(Math.cos(a) * beltR, 6, Math.sin(a) * beltR)
  }
}

function loop() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  syncBodies(dt)
  if (playing.value) {
    galaxyElapsed += dt * speed.value
    if (galaxyShaderMat?.uniforms?.u_time) galaxyShaderMat.uniforms.u_time.value = galaxyElapsed * 0.012
    if (galaxyNebulaMat?.uniforms?.uTime) galaxyNebulaMat.uniforms.uTime.value = galaxyElapsed
  }
  if (!isGalaxy.value && camera && sunLookAt) sunLookAt(camera)
  controls?.update()
  if (isGalaxy.value && composer) composer.render()
  else renderer.render(scene, camera)
}

function resize() {
  if (!renderer || !camera || !canvasRef.value) return
  const parent = canvasRef.value.parentElement
  const w = parent?.clientWidth || canvasRef.value.clientWidth || 800
  const h = parent?.clientHeight || 480
  renderer.setSize(w, h, false)
  composer?.setSize(w, h)
  bloomPass?.resolution.set(w, h)
  galaxyShaderMat?.uniforms?.u_resolution?.value.set(w, h)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
  if (isGalaxy.value) frameGalaxy()
  else if (focusBody.value === 'all' && props.stepId !== 'earth') frameWholeSystem()
}

function focusPlanet(id: string | 'all') {
  focusBody.value = id
  applyStepFocus()
  if (!camera || !controls) return
  if (id === 'all') {
    frameWholeSystem()
    return
  }
  const p = planets.find((x) => x.def.id === id)
  if (!p) return
  const target = p.root.position.clone()
  controls.target.copy(target)
  const dist = orbitRadius(p.def.au) * 0.55 + 36
  camera.position.set(target.x + dist * 0.55, dist * 0.48, target.z + dist * 0.75)
  controls.update()
}

watch(
  () => props.stepId,
  () => {
    focusBody.value = props.stepId === 'earth' ? 'earth' : 'all'
    applyStepFocus()
    if (props.stepId === 'galaxy') frameGalaxy()
    else if (props.stepId === 'earth') focusPlanet('earth')
    else frameWholeSystem()
  },
)

watch(playing, () => applyStepFocus())
watch([showStarNames, showMoreStarNames], () => syncStarLabels())
watch(galaxyView, () => {
  if (isGalaxy.value) frameGalaxy()
})

onMounted(() => {
  setup()
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  teardown()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="note">{{ stepTitle }}</span>
      <span class="note">点击场景暂停 / 恢复</span>
      <template v-if="isGalaxy">
        <div class="chips">
          <button type="button" class="chip" :class="{ on: galaxyView === 'oblique' }" @click="galaxyView = 'oblique'">
            斜视
          </button>
          <button type="button" class="chip" :class="{ on: galaxyView === 'top' }" @click="galaxyView = 'top'">
            俯视
          </button>
          <button type="button" class="chip" :class="{ on: galaxyView === 'edge' }" @click="galaxyView = 'edge'">
            侧视
          </button>
        </div>
      </template>
      <template v-else>
        <label class="ctrl check">
          <input v-model="showStarNames" type="checkbox" />
          星名
        </label>
        <label class="ctrl check">
          <input v-model="showMoreStarNames" type="checkbox" :disabled="!showStarNames" />
          更多星名
        </label>
      </template>
      <label class="ctrl">
        <span>倍速</span>
        <input v-model.number="speed" type="range" min="0.3" max="3" step="0.1" />
        <em>{{ speed.toFixed(1) }}×</em>
      </label>
      <div v-if="!isGalaxy && stepId !== 'earth'" class="chips">
        <button type="button" class="chip" :class="{ on: focusBody === 'all' }" @click="focusPlanet('all')">
          全部
        </button>
        <button
          v-for="p in PLANETS"
          :key="p.id"
          type="button"
          class="chip"
          :class="{ on: focusBody === p.id }"
          @click="focusPlanet(p.id)"
        >
          {{ p.name }}
        </button>
      </div>
      <span class="note dim">{{ isGalaxy ? '示意 · 旋臂据开源银道模型简化' : '示意 · 距离/大小已夸张' }}</span>
    </div>
    <div class="stage">
      <canvas ref="canvasRef" class="globe" @pointerdown="onScenePointerDown" @pointerup="onScenePointerUp" />
      <aside class="hud">
        <p class="hud-title">{{ stepTitle }}</p>
        <template v-if="stepId === 'galaxy'">
          <p class="hud-row"><span>形态</span><strong>棒旋星系（示意）</strong></p>
          <p class="hud-row"><span>日–银心</span><strong>约 8.2 kpc</strong></p>
          <p class="hud-phase">太阳系位于猎户臂 · 银心暖光与中央棒</p>
        </template>
        <template v-else-if="stepId === 'structure'">
          <p class="hud-row"><span>类地行星</span><strong>水金地火</strong></p>
          <p class="hud-row"><span>巨行星</span><strong>木土天海</strong></p>
          <p class="hud-phase">小行星带 · 火木之间</p>
        </template>
        <template v-else-if="stepId === 'earth'">
          <p class="hud-row"><span>日地距离</span><strong>约 1 AU</strong></p>
          <p class="hud-phase">宜居带内 · 液态水条件之一</p>
        </template>
        <template v-else>
          <p class="hud-row"><span>中心天体</span><strong>太阳</strong></p>
          <p class="hud-row"><span>行星数</span><strong>8</strong></p>
          <p class="hud-phase">公转同向 · 近圆共面（示意）</p>
        </template>
        <p class="hud-hint">{{ stepHint }}</p>
        <p class="hud-hint">
          {{
            isGalaxy
              ? 'NASA 俯视盘 + 立体核球/旋臂点云 · 可斜视/侧视 · 课堂示意'
              : '全天银道 · 亮星 BSC5 · 行星开源贴图 · 写实太阳贴图 · 课堂示意'
          }}
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
  background: var(--bg-canvas);
  min-height: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn.on {
  border-color: var(--demo-accent, #4aa3d9);
  color: var(--demo-accent-soft, #c5e4f6);
  background: var(--demo-accent-on-bg, rgba(74, 163, 217, 0.14));
}
.ctrl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.ctrl input {
  width: 88px;
}
.ctrl em {
  font-style: normal;
  color: var(--demo-lift, #f0d078);
  min-width: 2.2em;
}
.ctrl.check {
  gap: 4px;
  cursor: pointer;
  user-select: none;
}
.ctrl.check input {
  width: auto;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.chip.on {
  border-color: rgba(125, 211, 160, 0.55);
  color: #b8f0d0;
  background: rgba(125, 211, 160, 0.12);
}
.note {
  font-size: 12px;
  color: var(--text-secondary);
}
.note.dim {
  color: var(--text-faint, #5c6e82);
  font-size: 11px;
}
.stage {
  position: relative;
  flex: 1;
  min-height: 280px;
  display: flex;
}
.globe {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 280px;
}
.hud {
  position: absolute;
  left: 14px;
  bottom: 14px;
  width: 220px;
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(10, 18, 34, 0.9), rgba(8, 14, 28, 0.84));
  border: 1px solid rgba(74, 163, 217, 0.28);
  pointer-events: none;
}
.hud-title {
  margin: 0;
  font-size: 11px;
  color: #8aa0b4;
}
.hud-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 0;
  font-size: 11px;
  color: #8aa0b4;
}
.hud-row strong {
  color: #ffe08a;
  font-weight: 600;
}
.hud-phase {
  margin: 6px 0 0;
  font-size: 12px;
  color: #5ec8f0;
}
.hud-hint {
  margin: 8px 0 0;
  font-size: 10px;
  color: #5a7388;
  line-height: 1.4;
}
</style>
