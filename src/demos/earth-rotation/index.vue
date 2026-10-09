<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { Demo3, DemoHex, EarthDashDeg, EarthLineWidth } from '@/demos/theme'
import { makeSunBillboard } from '@/engine/sunVisual'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

type CoriolisMode = 'top' | 'fp' | 'sphere'
type PoleView = 'north' | 'south' | 'equator'
type TerminatorSide = 'both' | 'dawn' | 'dusk'
type BasicsTopic = 'direction' | 'period'
type PeriodKind = 'compare' | 'sidereal' | 'solar'

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const svgRef = ref<SVGSVGElement | null>(null)
const fpCanvasRef = ref<HTMLCanvasElement | null>(null)
const sphereCanvasRef = ref<HTMLCanvasElement | null>(null)

const playing = ref(true)
const hour = ref(6)
const coriolisOn = ref(true)
const fpPlaying = ref(true)
const coriolisMode = ref<CoriolisMode>('top')
const topThrowT = ref(0)

/** 昼夜课步只盯北京：地方时、镜头、贴图经纬都以它为准 */
const BEIJING = { name: '北京', lat: 39.9, lon: 116.4 } as const

/** basics */
const basicsTopic = ref<BasicsTopic>('period')
const poleView = ref<PoleView>('equator')
const speedLat = ref(0)
const periodKind = ref<PeriodKind>('compare')
/** 0→1 覆盖一个太阳日（示意）；恒星日约在 0.927 处完成 */
const periodProgress = ref(0)

/** 教学夸张：一日内公转角约 36°（真约 0.986°），便于看清两周期差 */
const PERIOD_ORBIT_TEACH_DEG = 36
const PERIOD_SOLAR_EXTRA_DEG = 360 / 365.25
const PERIOD_ORBIT_R = 210
const PERIOD_EARTH_R = 18
const PERIOD_SUN_R = 48
/** 恒星日完成进度 = 360/(360+α) */
const PERIOD_SIDEREAL_T = 360 / (360 + PERIOD_ORBIT_TEACH_DEG)

const periodSpinDeg = computed(() => periodProgress.value * (360 + PERIOD_ORBIT_TEACH_DEG))
const periodOrbitDeg = computed(() => periodProgress.value * PERIOD_ORBIT_TEACH_DEG)
const periodHours = computed(() => {
  // 太阳日映射 24h；恒星日完成时约 23h56m
  return periodProgress.value * 24
})
const siderealDone = computed(() => periodProgress.value >= PERIOD_SIDEREAL_T - 0.002)
const solarDone = computed(() => periodProgress.value >= 0.995)
const periodPhaseLabel = computed(() => {
  if (solarDone.value) return '太阳日完成：子午线再次对准太阳'
  if (siderealDone.value) return '恒星日完成：已转 360°，尚未对准太阳'
  return '公转 + 自转进行中'
})
const periodHudTitle = computed(() => {
  if (periodKind.value === 'sidereal') return '恒星日 · 相对恒星 360°'
  if (periodKind.value === 'solar') return '太阳日 · 相对太阳 360°+α'
  return '恒星日与太阳日'
})
const periodSpinVsNeed = computed(() => {
  const spun = periodSpinDeg.value
  if (!siderealDone.value) return `自转 ${spun.toFixed(0)}° / 360°`
  if (!solarDone.value) return `自转 ${spun.toFixed(0)}° / ${(360 + PERIOD_ORBIT_TEACH_DEG).toFixed(0)}°`
  return `自转 ${(360 + PERIOD_ORBIT_TEACH_DEG).toFixed(0)}° · 太阳日满`
})


/** day-night */
const terminatorFocus = ref<TerminatorSide>('both')
type DnCamView = 'overview' | 'edge' | 'day' | 'night' | 'pole'
const dnCamView = ref<DnCamView>('overview')
const DN_CAM_VIEWS: { id: DnCamView; label: string }[] = [
  { id: 'overview', label: '日地全景' },
  { id: 'edge', label: '侧视晨昏' },
  { id: 'day', label: '昼半球' },
  { id: 'night', label: '夜半球' },
  { id: 'pole', label: '北极俯视' },
]

/** timezones */
const tzCityA = ref('beijing')
const tzCityB = ref('london')
const tzUtcHour = ref(4) // 使北京约正午示意可调

const CITIES = [
  { id: 'beijing', name: '北京', lat: 39.9, lon: 116.4, zone: 8 },
  { id: 'london', name: '伦敦', lat: 51.5, lon: 0, zone: 0 },
  { id: 'newyork', name: '纽约', lat: 40.7, lon: -74, zone: -5 },
  { id: 'sydney', name: '悉尼', lat: -33.9, lon: 151.2, zone: 10 },
] as const

/** PPT：赤道 1670 → 60° 约 835 → 极点 0 */
const SPEED_ROWS = [
  { lat: 0, linear: 1670 },
  { lat: 30, linear: 1447 },
  { lat: 45, linear: 1180 },
  { lat: 60, linear: 835 },
  { lat: 90, linear: 0 },
] as const

const W = 760
const H = 440

const isBasics = computed(() => props.stepId === 'basics')
const isBasicsDirection = computed(() => isBasics.value && basicsTopic.value === 'direction')
const isBasicsPeriod = computed(() => isBasics.value && basicsTopic.value === 'period')
const isDayNight = computed(() => props.stepId === 'day-night')
const isCoriolis = computed(() => props.stepId === 'coriolis')
const isTimezones = computed(() => props.stepId === 'timezones')

/** hour 即北京地方时 */
const localHour = computed(() => ((hour.value % 24) + 24) % 24)
const localLabel = computed(() => formatClock(localHour.value))
const dayPhase = computed(() => {
  const h = localHour.value
  if (h >= 5 && h < 8) return '清晨'
  if (h >= 8 && h < 17) return '白天'
  if (h >= 17 && h < 20) return '黄昏'
  return '夜晚'
})

const speedInfo = computed(() => {
  const lat = speedLat.value
  const row = SPEED_ROWS.reduce((best, r) => (Math.abs(r.lat - lat) < Math.abs(best.lat - lat) ? r : best))
  const angular = lat >= 89.5 ? 0 : 15
  return { lat: row.lat, linear: row.linear, angular }
})

const poleSpinLabel = computed(() => {
  if (poleView.value === 'north') return '俯视北极 · 逆时针'
  if (poleView.value === 'south') return '俯视南极 · 顺时针'
  return '侧视 · 自西向东'
})

function formatClock(h: number) {
  const hh = Math.floor(((h % 24) + 24) % 24)
  const mm = Math.floor((((h % 24) + 24) % 24 % 1) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function cityById(id: string) {
  return CITIES.find((c) => c.id === id) ?? CITIES[0]
}

const tzA = computed(() => cityById(tzCityA.value))
const tzB = computed(() => cityById(tzCityB.value))
const tzALocal = computed(() => formatClock(tzUtcHour.value + tzA.value.lon / 15))
const tzBLocal = computed(() => formatClock(tzUtcHour.value + tzB.value.lon / 15))
const tzAZone = computed(() => formatClock(tzUtcHour.value + tzA.value.zone))
const tzBZone = computed(() => formatClock(tzUtcHour.value + tzB.value.zone))
const beijingLocalVsZone = computed(() => {
  const local = formatClock(tzUtcHour.value + 116.4 / 15)
  const zone = formatClock(tzUtcHour.value + 8)
  return { local, zone }
})

/** 晨昏课步：公转角与年积日（自转–公转按 365.25 联动） */
const dnOrbitDeg = computed(() => {
  const d = ((dnOrbitAngle.value * 180) / Math.PI) % 360
  return d < 0 ? d + 360 : d
})

// —— 昼夜 / 通用 Three ——
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let globeRoot: THREE.Group | null = null
/** 晨昏：公转定位 → 地轴倾斜（惯性系固定）→ 自转 */
let earthOrbitRoot: THREE.Group | null = null
let earthTiltRoot: THREE.Group | null = null
let earthSpinRoot: THREE.Group | null = null
let termRoot: THREE.Group | null = null
let pathGroup: THREE.Group | null = null
let sunLight: THREE.DirectionalLight | null = null
let sunPoint: THREE.PointLight | null = null
let sunMesh: THREE.Object3D | null = null
let sunLookAt: ((c: THREE.Camera) => void) | null = null
const _sunDir = new THREE.Vector3()
const _qTilt = new THREE.Quaternion()
const _vTmp = new THREE.Vector3()
let disposables: THREE.Object3D[] = []
let raf = 0
let disposed = false
let lastT = 0
/** day-night | sphere | basics | timezones */
let threeMode: 'day-night' | 'sphere' | 'basics' | 'timezones' | null = null
let tzMarkerGroup: THREE.Group | null = null
const TZ_EARTH_R = 100
let terminatorRing: THREE.Mesh | null = null
let terminatorGlow: THREE.Mesh | null = null
let dawnHighlight: THREE.Mesh | null = null
let duskHighlight: THREE.Mesh | null = null
let dayHemLabel: THREE.Sprite | null = null
let nightHemLabel: THREE.Sprite | null = null
/** 黄赤交角；公转平面 = XZ（Y 向上），地轴倾向 +X（夏至：地球在 -X 时北极向日） */
const OBLIQUITY_RAD = (23.5 * Math.PI) / 180
const DN_ORBIT_R = 260
const DN_EARTH_R = 48
const DN_SUN_R = 38
/** 恒星年天数（公转一周） */
const DAYS_PER_YEAR = 365.25
/** 真值约 0.99°/日；课堂加速使公转肉眼可见 */
const ORBIT_TEACH_DEG_PER_DAY = 18
const ORBIT_TRUE_DEG_PER_DAY = 360 / DAYS_PER_YEAR
/** 公转角（弧度），自转由 hour 驱动；θ=π 时地球在 -X */
const dnOrbitAngle = ref(Math.PI)
let sceneAmbient: THREE.AmbientLight | null = null
let sceneFill: THREE.DirectionalLight | null = null
let spinArrowMesh: THREE.Mesh | null = null
let spinArcLine: THREE.Line | null = null
let latitudeRing: THREE.Line | null = null
let latMarker: THREE.Object3D | null = null
let periodPhase = 0
let lastSpeedLat = -1
/** 恒星日/太阳日场景 */
let periodOrbitRoot: THREE.Group | null = null
let periodEarthSpin: THREE.Group | null = null
let periodSunLine: THREE.Line | null = null
let periodOrbitArc: THREE.Line | null = null
let periodGuideGroup: THREE.Group | null = null
let periodGhostGroup: THREE.Group | null = null
let periodLabelGroup: THREE.Group | null = null
let basicsSceneKind: 'direction' | 'period' | null = null

// 俯视抛射动画
let topRaf = 0
let topDisposed = true
let topLastT = 0

// 球体箭头动画（南北半球各一条）
type SphereTrack = {
  hemi: 'N' | 'S'
  trail: THREE.Line
  arrow: THREE.Mesh
}
let sphereTracks: SphereTrack[] = []
let sphereProgress = 0
let sphereR = 80

// 地面第一人称 2D
let fpRaf = 0
let fpDisposed = false
let fpLastT = 0
let fpProgress = 0
let fpGroundShift = 0

/** 俯视地转偏向：极地正射真实底图（缓存） */
let polarMapN: string | null = null
let polarMapS: string | null = null
let polarMapLoading = false

function addDisposable(obj: THREE.Object3D) {
  disposables.push(obj)
  return obj
}

function disposeObj(obj: THREE.Object3D) {
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
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

function teardownThree() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  controls = null
  if (camera?.parent) camera.parent.remove(camera)
  if (pathGroup) {
    pathGroup.traverse((obj) => {
      if (obj !== pathGroup) disposeObj(obj)
    })
    pathGroup = null
  }
  sphereTracks = []
  sunLight = null
  sunPoint = null
  sunMesh = null
  sunLookAt = null
  terminatorRing = null
  terminatorGlow = null
  dawnHighlight = null
  duskHighlight = null
  dayHemLabel = null
  nightHemLabel = null
  spinArrowMesh = null
  spinArcLine = null
  latitudeRing = null
  latMarker = null
  lastSpeedLat = -1
  periodOrbitRoot = null
  periodEarthSpin = null
  periodSunLine = null
  periodOrbitArc = null
  periodGuideGroup = null
  periodGhostGroup = null
  periodLabelGroup = null
  basicsSceneKind = null
  sceneAmbient = null
  sceneFill = null
  tzMarkerGroup = null
  dnOrbitAngle.value = Math.PI
  for (const obj of disposables) disposeObj(obj)
  disposables = []
  termRoot = null
  earthSpinRoot = null
  earthTiltRoot = null
  earthOrbitRoot = null
  globeRoot?.removeFromParent()
  globeRoot = null
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  threeMode = null
}

function teardownTop() {
  topDisposed = true
  cancelAnimationFrame(topRaf)
}

function makeLabelSprite(
  text: string,
  x: number,
  y: number,
  z: number,
  opts?: { scale?: number; bg?: boolean; color?: string },
) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 36
  const withBg = opts?.bg !== false
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  const padX = withBg ? 18 : 10
  const padY = withBg ? 12 : 8
  canvas.width = tw + padX * 2
  canvas.height = fontSize + padY * 2
  // 重设字体（改 canvas 尺寸会重置状态）
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = canvas.width
  const h = canvas.height
  if (withBg) {
    const rx = 10
    ctx.fillStyle = 'rgba(7, 11, 22, 0.82)'
    ctx.beginPath()
    ctx.moveTo(rx, 0)
    ctx.arcTo(w, 0, w, h, rx)
    ctx.arcTo(w, h, 0, h, rx)
    ctx.arcTo(0, h, 0, 0, rx)
    ctx.arcTo(0, 0, w, 0, rx)
    ctx.closePath()
    ctx.fill()
  } else {
    // 无底时描边，保证叠在轨迹线上仍可读
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(6, 10, 20, 0.9)'
    ctx.lineJoin = 'round'
    ctx.strokeText(text, w / 2, h / 2)
  }
  ctx.fillStyle = opts?.color ?? '#ffe08a'
  ctx.fillText(text, w / 2, h / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.position.set(x, y, z)
  sprite.renderOrder = 1
  const s = opts?.scale ?? 1
  // 按像素比例缩放，保证中文完整可见
  const worldW = (canvas.width / 64) * 11 * s
  const worldH = (canvas.height / 64) * 11 * s
  sprite.scale.set(worldW, worldH, 1)
  return sprite
}

/**
 * 地理坐标 → 与 Three.js SphereGeometry + 常见等距圆柱贴图对齐：
 * 经度 0°（本初子午）在 +X，东经向 -Z，北纬向 +Y。
 */
function latLonToVec(lat: number, lon: number, r: number) {
  const φ = (lat * Math.PI) / 180
  const λ = (lon * Math.PI) / 180
  const c = Math.cos(φ)
  return new THREE.Vector3(c * Math.cos(λ), Math.sin(φ), -c * Math.sin(λ)).multiplyScalar(r)
}

function buildEarthSphere(R: number) {
  const loader = new THREE.TextureLoader()
  const dayTex = loader.load('/textures/earth-blue-marble.jpg')
  dayTex.colorSpace = THREE.SRGBColorSpace
  const nightTex = loader.load('/textures/earth-night.jpg')
  nightTex.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 72, 56),
    new THREE.MeshPhongMaterial({
      map: dayTex,
      emissiveMap: nightTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.45,
      shininess: 12,
      specular: new THREE.Color(0x335566),
    }),
  )
}

function tubeMat(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
  })
}

/** 纬线圈（水平环，实线） */
function makeEarthParallel(latDeg: number, R: number, tubeR: number, color: number, opacity: number) {
  const φ = (latDeg * Math.PI) / 180
  const lift = R + 0.35
  const rr = Math.max(0.5, Math.cos(φ) * lift)
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(rr, tubeR, 6, 72), tubeMat(color, opacity))
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = Math.sin(φ) * lift
  return mesh
}

/** 纬线圈虚线（回归线 / 极圈） */
function makeEarthDashedParallel(latDeg: number, R: number, tubeR: number, color: number, opacity: number) {
  const group = new THREE.Group()
  const { dash, gap } = EarthDashDeg.special
  const lift = R + 0.35
  const φ = (latDeg * Math.PI) / 180
  const y = Math.sin(φ) * lift
  const rr = Math.max(0.5, Math.cos(φ) * lift)
  const step = Math.max(2, Math.floor(dash / 3))
  for (let lon0 = -180; lon0 < 180; lon0 += dash + gap) {
    const pts: THREE.Vector3[] = []
    for (let lon = lon0; lon <= lon0 + dash; lon += step) {
      const λ = (lon * Math.PI) / 180
      pts.push(new THREE.Vector3(Math.sin(λ) * rr, y, Math.cos(λ) * rr))
    }
    if (pts.length < 2) continue
    const curve = new THREE.CatmullRomCurve3(pts)
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(4, pts.length), tubeR, 5, false),
        tubeMat(color, opacity),
      ),
    )
  }
  return group
}

/** 经线圈（过两极大圆） */
function makeEarthMeridian(lonDeg: number, R: number, tubeR: number, color: number, opacity: number) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, tubeR, 6, 72), tubeMat(color, opacity))
  mesh.rotation.y = Math.PI / 2 + (lonDeg * Math.PI) / 180
  return mesh
}

/**
 * 晨昏课步：地轴 + 经纬网 + 赤道/本初子午/回归线/极圈（EarthLine 规范）
 */
function addEarthAxisEquator(group: THREE.Group, R: number) {
  const axisLen = R * 2 + 40
  const axisR = EarthLineWidth.axis
  group.add(
    addDisposable(
      new THREE.Mesh(new THREE.CylinderGeometry(axisR, axisR, axisLen, 14), tubeMat(Demo3.earthAxis, 0.95)),
    ),
  )
  const coneH = 7
  const poleN = new THREE.Mesh(
    new THREE.ConeGeometry(EarthLineWidth.poleCone, coneH, 12),
    tubeMat(Demo3.earthAxis),
  )
  poleN.position.y = axisLen / 2 + coneH * 0.35
  group.add(addDisposable(poleN))
  const poleS = new THREE.Mesh(
    new THREE.ConeGeometry(EarthLineWidth.poleCone, coneH, 12),
    tubeMat(Demo3.earthAxis),
  )
  poleS.position.y = -(axisLen / 2 + coneH * 0.35)
  poleS.rotation.x = Math.PI
  group.add(addDisposable(poleS))
  group.add(
    addDisposable(makeLabelSprite('N', 0, axisLen / 2 + 14, 0, { scale: 0.48, bg: false, color: DemoHex.earthAxis })),
  )
  group.add(
    addDisposable(makeLabelSprite('S', 0, -(axisLen / 2 + 14), 0, { scale: 0.48, bg: false, color: DemoHex.earthAxis })),
  )

  // 次要经纬网（每 30°，淡）
  for (let lon = -150; lon <= 180; lon += 30) {
    if (lon === 0 || Math.abs(lon) === 180) continue
    group.add(addDisposable(makeEarthMeridian(lon, R, EarthLineWidth.grid, Demo3.earthGrid, 0.35)))
  }
  for (const lat of [-60, -30, 30, 60]) {
    group.add(addDisposable(makeEarthParallel(lat, R, EarthLineWidth.grid, Demo3.earthGrid, 0.35)))
  }

  // 本初子午线（亮）
  group.add(addDisposable(makeEarthMeridian(0, R, EarthLineWidth.gridMajor, Demo3.earthPrime, 0.9)))
  group.add(
    addDisposable(
      makeLabelSprite('本初子午', 4, 10, R + 8, { scale: 0.38, bg: false, color: DemoHex.earthPrime }),
    ),
  )

  // 赤道（绿青，最醒目纬线）
  group.add(addDisposable(makeEarthParallel(0, R, EarthLineWidth.gridMajor, Demo3.earthEquator, 0.92)))
  group.add(
    addDisposable(
      makeLabelSprite('赤道', R * 0.55, 5, R * 0.72, { scale: 0.4, bg: false, color: DemoHex.earthEquator }),
    ),
  )

  // 南北回归线 ±23.5°（虚线）
  for (const lat of [23.5, -23.5]) {
    group.add(addDisposable(makeEarthDashedParallel(lat, R, EarthLineWidth.special, Demo3.earthTropic, 0.8)))
  }
  group.add(
    addDisposable(
      makeLabelSprite('北回归线', R * 0.35, R * 0.42, R * 0.55, {
        scale: 0.36,
        bg: false,
        color: DemoHex.earthTropic,
      }),
    ),
  )
  group.add(
    addDisposable(
      makeLabelSprite('南回归线', R * 0.35, -R * 0.42, R * 0.55, {
        scale: 0.36,
        bg: false,
        color: DemoHex.earthTropic,
      }),
    ),
  )

  // 南北极圈 ±66.5°（虚线）
  for (const lat of [66.5, -66.5]) {
    group.add(addDisposable(makeEarthDashedParallel(lat, R, EarthLineWidth.special, Demo3.earthPolar, 0.72)))
  }
  group.add(
    addDisposable(
      makeLabelSprite('北极圈', R * 0.18, R * 0.78, R * 0.28, {
        scale: 0.34,
        bg: false,
        color: DemoHex.earthPolar,
      }),
    ),
  )
  group.add(
    addDisposable(
      makeLabelSprite('南极圈', R * 0.18, -R * 0.78, R * 0.28, {
        scale: 0.34,
        bg: false,
        color: DemoHex.earthPolar,
      }),
    ),
  )
}

function addSpinDirectionArc(group: THREE.Group, R: number, latDeg = 10) {
  const arcPts: THREE.Vector3[] = []
  const φ = (latDeg * Math.PI) / 180
  const rr = Math.cos(φ) * (R + 8)
  const y = Math.sin(φ) * R
  for (let a = -0.95; a <= 0.95; a += 0.05) {
    // 自西向东：从 -X 侧看，经度增大方向
    arcPts.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr))
  }
  spinArcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({ color: 0x6ec8f0, transparent: true, opacity: 0.9 }),
  )
  group.add(addDisposable(spinArcLine))
  spinArrowMesh = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 10), new THREE.MeshBasicMaterial({ color: 0x6ec8f0 }))
  const tip = arcPts[arcPts.length - 1]!
  const prev = arcPts[arcPts.length - 2]!
  spinArrowMesh.position.copy(tip)
  spinArrowMesh.lookAt(tip.clone().sub(prev).add(tip))
  spinArrowMesh.rotateX(Math.PI / 2)
  group.add(addDisposable(spinArrowMesh))
  group.add(addDisposable(makeLabelSprite('自西向东', tip.x * 1.12, tip.y + 10, tip.z * 1.12, { scale: 0.68 })))
}

function initThreeCanvas(mode: 'day-night' | 'sphere' | 'basics' | 'timezones') {
  const canvas = mode === 'sphere' ? sphereCanvasRef.value : canvasRef.value
  if (!canvas || !wrapRef.value) return false
  disposed = false
  disposables = []
  threeMode = mode
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(280, wrapRef.value.clientHeight - 48)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050814)
  camera = new THREE.PerspectiveCamera(38, w / h, 1, mode === 'day-night' ? 4000 : 1200)
  camera.position.set(0, 36, 320)

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 160
  controls.maxDistance = 520
  controls.target.set(0, 0, 0)
  if (mode === 'day-night') {
    // 自由环视：不强制复位镜头、不因拖动暂停动画
    controls.enablePan = true
    controls.enableRotate = true
    controls.minDistance = 60
    controls.maxDistance = 2200
    controls.minPolarAngle = 0.02
    controls.maxPolarAngle = Math.PI - 0.02
    controls.minAzimuthAngle = -Infinity
    controls.maxAzimuthAngle = Infinity
  } else if (mode === 'timezones') {
    controls.enableRotate = true
    controls.minDistance = 160
    controls.maxDistance = 480
    camera.position.set(80, 40, 280)
  }

  sceneAmbient = new THREE.AmbientLight(0x1a2838, 0.4)
  scene.add(sceneAmbient)
  sceneFill = new THREE.DirectionalLight(0x4a6a90, 0.22)
  sceneFill.position.set(-160, -20, -80)
  scene.add(sceneFill)

  // 星空
  {
    const n = 700
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 420 + Math.random() * 280
      const u = Math.random()
      const v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    scene.add(
      addDisposable(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({ color: 0xb8d4f0, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.85 }),
        ),
      ),
    )
  }

  globeRoot = new THREE.Group()
  scene.add(globeRoot)
  return true
}

function applyPoleCamera() {
  if (!camera || !controls) return
  if (poleView.value === 'north') {
    camera.position.set(0, 280, 40)
    controls.target.set(0, 0, 0)
  } else if (poleView.value === 'south') {
    camera.position.set(0, -280, 40)
    controls.target.set(0, 0, 0)
  } else {
    camera.position.set(0, 36, 320)
    controls.target.set(0, 0, 0)
  }
  controls.update()
}

function updateLatitudeSpeedVisual(R: number) {
  if (!globeRoot) return
  const lat = speedInfo.value.lat
  if (lat === lastSpeedLat && latitudeRing) return
  lastSpeedLat = lat

  if (latitudeRing) {
    globeRoot.remove(latitudeRing)
    disposeObj(latitudeRing)
    latitudeRing = null
  }
  if (latMarker) {
    globeRoot.remove(latMarker)
    latMarker.traverse((obj) => {
      if (obj !== latMarker) disposeObj(obj)
    })
    disposeObj(latMarker)
    latMarker = null
  }
  if (lat >= 89.5) {
    latMarker = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
    latMarker.position.set(0, R + 1.2, 0)
    globeRoot.add(addDisposable(latMarker))
    return
  }
  const φ = (lat * Math.PI) / 180
  const y = Math.sin(φ) * R
  const rr = Math.cos(φ) * R
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.sin(a) * (rr + 0.5), y, Math.cos(a) * (rr + 0.5)))
  }
  latitudeRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.95 }),
  )
  globeRoot.add(addDisposable(latitudeRing))

  // 定位标固定在纬线圈朝镜头一侧，随地球自转；勿再单独绕圈（否则像一直空转）
  const a0 = 0
  const p = new THREE.Vector3(Math.sin(a0) * (rr + 2.2), y, Math.cos(a0) * (rr + 2.2))
  const mark = new THREE.Group()
  const pad = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
  pad.position.copy(p)
  mark.add(pad)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.8, 5.5, 10), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
  // a=0 处切向为 +X（自西向东）
  tip.position.set(p.x + 5, p.y, p.z)
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
  mark.add(tip)
  latMarker = mark
  globeRoot.add(addDisposable(mark))
}

// ========== 方向·周期·速度 ==========
function setupBasics() {
  if (basicsTopic.value === 'period') setupBasicsPeriod()
  else setupBasicsDirection()
}

function setupBasicsDirection() {
  if (!initThreeCanvas('basics') || !globeRoot || !scene || !canvasRef.value) return
  basicsSceneKind = 'direction'
  const R = 72

  sunLight = new THREE.DirectionalLight(0xfff1d0, 1.35)
  sunLight.position.set(200, 60, 80)
  scene.add(sunLight)
  if (sceneAmbient) {
    sceneAmbient.color.set(0x3a4a5c)
    sceneAmbient.intensity = 0.55
  }

  // 真彩底图（示意球），避免夜光贴图把赤道区压太暗
  {
    const tex = new THREE.TextureLoader().load('/textures/earth-period.jpg')
    tex.colorSpace = THREE.SRGBColorSpace
    globeRoot.add(
      addDisposable(
        new THREE.Mesh(
          new THREE.SphereGeometry(R, 72, 56),
          new THREE.MeshPhongMaterial({ map: tex, shininess: 10, specular: new THREE.Color(0x223344) }),
        ),
      ),
    )
  }
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.4, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }),
      ),
    ),
  )

  // 地轴 + 经纬网 + 赤道/本初子午/回归线/极圈
  addEarthAxisEquator(globeRoot, R)
  addSpinDirectionArc(globeRoot, R, 8)

  updateLatitudeSpeedVisual(R)
  applyPoleCamera()
  controls?.addEventListener('start', () => {
    playing.value = false
  })

  periodPhase = 0
  lastT = performance.now()
  loopThree()
}

/** 轨道角：起点在太阳正下方，逆时针扫过 teachDeg（示意图：太阳左、地球沿黄弧向右） */
function periodOrbitTheta(progress: number) {
  const α = (PERIOD_ORBIT_TEACH_DEG * Math.PI) / 180
  return -Math.PI / 2 + Math.max(0, Math.min(1, progress)) * α
}

function periodEarthPos(progress: number) {
  const θ = periodOrbitTheta(progress)
  return new THREE.Vector3(Math.cos(θ) * PERIOD_ORBIT_R, Math.sin(θ) * PERIOD_ORBIT_R, 0)
}

/** 自转角：与公转同步，太阳日结束时共转 360°+α（CCW 绕 Z） */
function periodSpinRad(progress: number) {
  const α = (PERIOD_ORBIT_TEACH_DEG * Math.PI) / 180
  return Math.max(0, Math.min(1, progress)) * (Math.PI * 2 + α)
}

function makePeriodLine(a: THREE.Vector3, b: THREE.Vector3, color: number, opts?: { dashed?: boolean; opacity?: number }) {
  const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()])
  if (opts?.dashed) {
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({
        color,
        dashSize: 6,
        gapSize: 5,
        transparent: true,
        opacity: opts.opacity ?? 0.7,
      }),
    )
    line.computeLineDistances()
    return line
  }
  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts?.opacity ?? 0.9 }),
  )
}

/** 沿轨道外侧偏移，画跨度弧 + 两端箭头 */
function addOrbitSpan(
  group: THREE.Group,
  t0: number,
  t1: number,
  color: number,
  label: string,
  outward: number,
  opts?: { labelT?: number; labelOut?: number; labelAlong?: number },
) {
  const span = new THREE.Group()
  span.userData.span = label
  const pts: THREE.Vector3[] = []
  const n = 28
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const p = periodEarthPos(t)
    const radial = p.clone().normalize().multiplyScalar(outward)
    pts.push(p.clone().add(radial).setZ(1.5))
  }
  span.add(
    addDisposable(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }),
      ),
    ),
  )

  const tipAt = (idx: number, inward: boolean) => {
    const p = pts[idx]!
    const prev = pts[Math.max(0, idx - 1)]!
    const next = pts[Math.min(pts.length - 1, idx + 1)]!
    const tan = next.clone().sub(prev).normalize()
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 8), new THREE.MeshBasicMaterial({ color }))
    cone.position.copy(p)
    const aim = inward ? p.clone().sub(tan) : p.clone().add(tan)
    cone.lookAt(aim)
    cone.rotateX(Math.PI / 2)
    span.add(addDisposable(cone))
  }
  tipAt(0, true)
  tipAt(pts.length - 1, false)

  // 标签单独取弧上位置，避免两弧中点叠在一起
  const lt = opts?.labelT ?? 0.5
  const tLabel = t0 + (t1 - t0) * lt
  const pLabel = periodEarthPos(tLabel)
  const rad = pLabel.clone().normalize()
  const tan = new THREE.Vector3(-rad.y, rad.x, 0)
  const out = outward + (opts?.labelOut ?? 18)
  const along = opts?.labelAlong ?? 0
  const lx = pLabel.x + rad.x * out + tan.x * along
  const ly = pLabel.y + rad.y * out + tan.y * along
  span.add(
    addDisposable(
      makeLabelSprite(label, lx, ly, 4, {
        scale: 1.05,
        bg: false,
        color: '#ffe6a8',
      }),
    ),
  )
  group.add(span)
}

/**
 * 示意图：
 * - 起点：地球在太阳正下方，子午线 +Y 同时指向太阳与遥远恒星
 * - 恒星日：自转 360°，子午线再次平行恒星方向，但因公转已不对准太阳
 * - 太阳日：自转 360°+α，子午线再次对准太阳
 */
function setupBasicsPeriod() {
  if (!initThreeCanvas('basics') || !scene || !camera || !canvasRef.value) return
  basicsSceneKind = 'period'
  disposed = false

  camera.position.set(PERIOD_ORBIT_R * 0.22, -PERIOD_ORBIT_R * 0.15, 520)
  camera.up.set(0, 1, 0)
  controls!.target.set(PERIOD_ORBIT_R * 0.28, -PERIOD_ORBIT_R * 0.55, 0)
  controls!.enableRotate = false
  controls!.enablePan = false
  controls!.minDistance = 360
  controls!.maxDistance = 680
  controls!.update()
  controls!.addEventListener('start', () => {
    playing.value = false
  })

  sunLight = new THREE.DirectionalLight(0xfff4e0, 1.35)
  sunLight.position.set(40, 60, 200)
  scene.add(sunLight)
  scene.add(new THREE.AmbientLight(0x1e2a38, 0.65))

  const sunVis = makeSunBillboard(PERIOD_SUN_R)
  sunMesh = sunVis.group
  sunLookAt = sunVis.lookAt
  sunMesh.position.set(0, 0, 2)
  scene.add(addDisposable(sunMesh))
  scene.add(addDisposable(makeLabelSprite('太阳', -PERIOD_SUN_R * 0.15, PERIOD_SUN_R + 18, 4, { scale: 0.65 })))

  const p0 = periodEarthPos(0)
  const pSid = periodEarthPos(PERIOD_SIDEREAL_T)
  const pSol = periodEarthPos(1)

  periodGuideGroup = new THREE.Group()
  periodGhostGroup = new THREE.Group()
  periodLabelGroup = new THREE.Group()
  scene.add(periodGuideGroup)
  scene.add(periodGhostGroup)
  scene.add(periodLabelGroup)

  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 48; i++) pts.push(periodEarthPos(i / 48))
    periodOrbitArc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xe8b84a, transparent: true, opacity: 0.9 }),
    )
    scene.add(addDisposable(periodOrbitArc))
  }

  // 灰线：太阳 → 起点 / 恒星日终点 / 太阳日终点（三条都画）
  {
    const sunZ = new THREE.Vector3(0, 0, -0.5)
    const toStart = makePeriodLine(sunZ, p0.clone().setZ(-0.5), 0xd8e4f0, { opacity: 0.88 })
    toStart.userData.guide = 'sun-ray-start'
    periodGuideGroup.add(addDisposable(toStart))
    const toSid = makePeriodLine(sunZ.clone(), pSid.clone().setZ(-0.5), 0xd8e4f0, { opacity: 0.7 })
    toSid.userData.guide = 'sun-ray-sid'
    periodGuideGroup.add(addDisposable(toSid))
    const toSol = makePeriodLine(sunZ.clone(), pSol.clone().setZ(-0.5), 0xd8e4f0, { opacity: 0.7 })
    toSol.userData.guide = 'sun-ray-sol'
    periodGuideGroup.add(addDisposable(toSol))
  }

  // 起 / 恒 / 太：空心大圆标记
  for (const [p, label, dy] of [
    [p0, '起', -26],
    [pSid, '恒', -34],
    [pSol, '太', -26],
  ] as const) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.2, 7.6, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff8a7a,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.position.set(p.x, p.y, 0.8)
    periodGhostGroup.add(addDisposable(ring))
    const side = label === '太' ? 18 : label === '恒' ? -16 : 0
    periodGhostGroup.add(
      addDisposable(
        makeLabelSprite(label, p.x + side, p.y + dy, 2, { scale: 1.15, bg: false, color: '#ffd0a8' }),
      ),
    )
  }

  // 恒星日偏前段、太阳日偏后段，径向错开，避免互相遮挡
  addOrbitSpan(periodLabelGroup, 0, PERIOD_SIDEREAL_T, 0xd94f9c, '恒星日', 34, {
    labelT: 0.32,
    labelOut: 24,
    labelAlong: -22,
  })
  addOrbitSpan(periodLabelGroup, 0, 1, 0xc43d8a, '太阳日', 52, {
    labelT: 0.78,
    labelOut: 28,
    labelAlong: 16,
  })

  periodOrbitRoot = new THREE.Group()
  scene.add(periodOrbitRoot)
  periodEarthSpin = new THREE.Group()
  periodOrbitRoot.add(periodEarthSpin)

  // 示意球用浅海真彩贴图 + Basic（不受夜光/暗光照拖累）
  {
    const tex = new THREE.TextureLoader().load('/textures/earth-period.jpg')
    tex.colorSpace = THREE.SRGBColorSpace
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(PERIOD_EARTH_R, 64, 48),
      new THREE.MeshBasicMaterial({ map: tex }),
    )
    periodEarthSpin.add(addDisposable(earth))
  }

  periodSunLine = makePeriodLine(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 0xffb040, { opacity: 0.95 })
  scene.add(addDisposable(periodSunLine))

  periodProgress.value = 0
  playing.value = true
  syncPeriodScene()
  lastT = performance.now()
  loopThree()
}

function syncPeriodScene() {
  if (!periodOrbitRoot || !periodEarthSpin) return
  const p = periodProgress.value
  const pos = periodEarthPos(p)
  periodOrbitRoot.position.copy(pos)

  periodEarthSpin.rotation.set(0, 0, periodSpinRad(p))
  periodOrbitRoot.updateMatrixWorld(true)

  if (periodSunLine) {
    periodSunLine.visible = periodKind.value !== 'sidereal'
    const attr = periodSunLine.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, pos.x, pos.y, 0.5)
    attr.setXYZ(1, 0, 0, 0.5)
    attr.needsUpdate = true
    periodSunLine.geometry.computeBoundingSphere()
    const mat = periodSunLine.material as THREE.LineBasicMaterial
    mat.opacity = solarDone.value ? 1 : 0.55
    mat.color.set(solarDone.value ? 0xffd060 : 0xd4893a)
  }

  if (periodLabelGroup) {
    const showSid = periodKind.value !== 'solar'
    const showSol = periodKind.value !== 'sidereal'
    for (const child of periodLabelGroup.children) {
      if (child.userData?.span === '恒星日') child.visible = showSid
      else if (child.userData?.span === '太阳日') child.visible = showSol
    }
  }
  if (periodGuideGroup) {
    const showSid = periodKind.value !== 'solar'
    const showSol = periodKind.value !== 'sidereal'
    for (const child of periodGuideGroup.children) {
      const g = child.userData?.guide as string | undefined
      if (g === 'sun-ray-sid') child.visible = showSid
      else if (g === 'sun-ray-sol') child.visible = showSol
      else if (g === 'sun-ray-start') child.visible = true
    }
  }
  if (periodGhostGroup) {
    // 对照：三点都显示；单模式：只保留起 + 对应终点
    const showSidMark = periodKind.value !== 'solar'
    const showSolMark = periodKind.value !== 'sidereal'
    periodGhostGroup.children.forEach((child, i) => {
      // 每点：圆点 + 标签，序 0–1 起、2–3 恒、4–5 太
      if (i <= 1) child.visible = true
      else if (i <= 3) child.visible = showSidMark
      else child.visible = showSolMark
    })
  }
}

function restartPeriod() {
  periodProgress.value = 0
  playing.value = true
  if (basicsSceneKind === 'period') syncPeriodScene()
}

// ========== 昼夜更替 ==========
function setupDayNight() {
  if (!initThreeCanvas('day-night') || !globeRoot || !scene || !canvasRef.value || !camera || !controls) return
  const R = DN_EARTH_R

  if (sceneAmbient) {
    sceneAmbient.color.set(0x03050a)
    sceneAmbient.intensity = 0.04
  }
  if (sceneFill) {
    sceneFill.color.set(0x0a1520)
    sceneFill.intensity = 0.02
    sceneFill.position.set(0, 40, 80)
  }

  // 太阳在原点（可视区内）
  const sunVis = makeSunBillboard(DN_SUN_R)
  sunMesh = sunVis.group
  sunLookAt = sunVis.lookAt
  sunMesh.position.set(0, 0, 0)
  scene.add(addDisposable(sunMesh))
  scene.add(addDisposable(makeLabelSprite('太阳', 0, -DN_SUN_R - 14, 0, { scale: 0.55, bg: false, color: DemoHex.earthMarker })))

  // 仅用平行光沿日→地，避免点光包抄照亮夜半球
  sunLight = new THREE.DirectionalLight(0xfff2d6, 3.4)
  sunLight.position.set(0, 0, 0)
  scene.add(sunLight)
  scene.add(sunLight.target)
  // 太阳表面微光（极短距，不照地球背面）
  sunPoint = new THREE.PointLight(0xffc878, 1.2, DN_SUN_R * 2.2, 2)
  sunPoint.position.set(0, 0, 0)
  scene.add(sunPoint)

  // 公转轨道（黄道面 XZ，Y 向上）
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * DN_ORBIT_R, 0, Math.sin(a) * DN_ORBIT_R))
    }
    scene.add(
      addDisposable(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: Demo3.earthTropic, transparent: true, opacity: 0.55 }),
        ),
      ),
    )
    scene.add(
      addDisposable(
        makeLabelSprite('公转轨道', DN_ORBIT_R * 0.75, 8, DN_ORBIT_R * 0.35, {
          scale: 0.42,
          bg: false,
          color: DemoHex.earthTropic,
        }),
      ),
    )
  }

  // 层级：公转平移 → 地轴倾斜（惯性系固定，不随公转摇摆）→ 自转
  earthOrbitRoot = new THREE.Group()
  globeRoot.add(earthOrbitRoot)
  earthTiltRoot = new THREE.Group()
  earthTiltRoot.rotation.z = OBLIQUITY_RAD
  earthOrbitRoot.add(earthTiltRoot)
  earthSpinRoot = new THREE.Group()
  earthTiltRoot.add(earthSpinRoot)

  const earth = buildEarthSphere(R)
  const mat = earth.material as THREE.MeshPhongMaterial
  // 夜光克制，避免洗掉夜半球；昼侧靠平行光拉亮
  mat.emissiveIntensity = 0.38
  mat.shininess = 18
  mat.specular = new THREE.Color(0x1a2838)
  mat.color = new THREE.Color(0xffffff)
  earthSpinRoot.add(addDisposable(earth))
  earthSpinRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.2, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }),
      ),
    ),
  )

  addEarthAxisEquator(earthSpinRoot, R)
  addSpinDirectionArc(earthSpinRoot, R, 12)
  if (spinArcLine) {
    const sm = spinArcLine.material as THREE.LineBasicMaterial
    sm.color.set(Demo3.earthSpin)
    sm.opacity = 0.75
  }
  if (spinArrowMesh) {
    ;(spinArrowMesh.material as THREE.MeshBasicMaterial).color.set(Demo3.earthSpin)
  }
  earthSpinRoot.add(
    addDisposable(
      makeLabelSprite('地轴 23.5°', 12, R + 28, 0, { scale: 0.4, bg: false, color: DemoHex.earthAxis }),
    ),
  )

  // 晨昏线：挂在地球旁，每帧对准日地连线（+X=向日）
  termRoot = new THREE.Group()
  scene.add(termRoot)

  // 夜半球罩：本地 -X（背日）半壳；Three 球 phi=0 在 -X，取 [-π/2, π/2] 即 x≤0
  termRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 0.4, 56, 40, -Math.PI / 2, Math.PI),
        new THREE.MeshBasicMaterial({
          color: 0x02060f,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    ),
  )
  // 分割面：过球心、垂直日地连线
  {
    const divide = new THREE.Mesh(
      new THREE.CircleGeometry(R + 0.15, 72),
      new THREE.MeshBasicMaterial({
        color: Demo3.earthTerminatorSoft,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    divide.rotation.y = Math.PI / 2
    termRoot.add(addDisposable(divide))
    const divideEdge = new THREE.Mesh(
      new THREE.RingGeometry(R - 0.2, R + 0.35, 72),
      new THREE.MeshBasicMaterial({
        color: Demo3.earthTerminator,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    divideEdge.rotation.y = Math.PI / 2
    termRoot.add(addDisposable(divideEdge))
  }

  terminatorGlow = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.55, EarthLineWidth.soft * 1.15, 14, 96),
    tubeMat(Demo3.earthTerminatorSoft, 0.28),
  )
  terminatorGlow.rotation.y = Math.PI / 2
  termRoot.add(addDisposable(terminatorGlow))

  terminatorRing = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.5, EarthLineWidth.thin, 10, 128),
    tubeMat(Demo3.earthTerminator, 0.7),
  )
  terminatorRing.rotation.y = Math.PI / 2
  termRoot.add(addDisposable(terminatorRing))

  // 晨 / 昏两段加粗异色弧，一眼能分出两条半圈
  dawnHighlight = new THREE.Mesh(
    new THREE.TorusGeometry(R + 1.6, EarthLineWidth.bold * 1.55, 10, 72, Math.PI),
    tubeMat(Demo3.earthDawn, 1),
  )
  dawnHighlight.rotation.y = Math.PI / 2
  dawnHighlight.rotation.z = Math.PI / 2
  termRoot.add(addDisposable(dawnHighlight))

  duskHighlight = new THREE.Mesh(
    new THREE.TorusGeometry(R + 1.6, EarthLineWidth.bold * 1.55, 10, 72, Math.PI),
    tubeMat(Demo3.earthDusk, 1),
  )
  duskHighlight.rotation.y = Math.PI / 2
  duskHighlight.rotation.z = -Math.PI / 2
  termRoot.add(addDisposable(duskHighlight))

  dayHemLabel = makeLabelSprite('昼', R * 0.9, 6, 0, { scale: 0.55, bg: false, color: DemoHex.earthDayLabel })
  nightHemLabel = makeLabelSprite('夜', -R * 0.9, 6, 0, { scale: 0.55, bg: false, color: DemoHex.earthNightLabel })
  termRoot.add(addDisposable(dayHemLabel))
  termRoot.add(addDisposable(nightHemLabel))
  termRoot.add(
    addDisposable(makeLabelSprite('晨', 6, R * 0.5, R * 0.85, { scale: 0.42, bg: false, color: DemoHex.earthDawn })),
  )
  termRoot.add(
    addDisposable(makeLabelSprite('昏', 6, R * 0.5, -R * 0.85, { scale: 0.42, bg: false, color: DemoHex.earthDusk })),
  )
  syncTerminatorFocus()

  const p = latLonToVec(BEIJING.lat, BEIJING.lon, R + 1.5)
  const marker = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 12), tubeMat(Demo3.earthMarker, 0.95))
  marker.position.copy(p)
  earthSpinRoot.add(addDisposable(marker))
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({
      color: Demo3.earthMarker,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  )
  halo.position.copy(p)
  halo.lookAt(0, 0, 0)
  earthSpinRoot.add(addDisposable(halo))
  const lp = latLonToVec(BEIJING.lat, BEIJING.lon, R + 10)
  earthSpinRoot.add(
    addDisposable(makeLabelSprite(BEIJING.name, lp.x, lp.y, lp.z, { scale: 0.45, bg: false, color: DemoHex.earthMarker })),
  )

  // 夏至示意：地球在 -X，地轴倾向 +X（北极向日）
  dnOrbitAngle.value = Math.PI
  hour.value = 12
  lastT = performance.now()
  syncDayNightScene()
  frameDayNight()
  loopThree()
}

function syncTerminatorFocus() {
  const f = terminatorFocus.value
  if (dawnHighlight) {
    dawnHighlight.visible = f === 'both' || f === 'dawn'
    ;(dawnHighlight.material as THREE.MeshBasicMaterial).opacity = f === 'dusk' ? 0.25 : 1
  }
  if (duskHighlight) {
    duskHighlight.visible = f === 'both' || f === 'dusk'
    ;(duskHighlight.material as THREE.MeshBasicMaterial).opacity = f === 'dawn' ? 0.25 : 1
  }
  const coreOp = f === 'both' ? 0.7 : 0.35
  const glowOp = f === 'both' ? 0.28 : 0.12
  if (terminatorRing) (terminatorRing.material as THREE.MeshBasicMaterial).opacity = coreOp
  if (terminatorGlow) (terminatorGlow.material as THREE.MeshBasicMaterial).opacity = glowOp
}

/**
 * 自转角：绕地轴使「北京」在给定地方时对准太阳。
 * 正午：北京经线朝向太阳；小时角每 15°/h。
 */
function spinFacingSun(hourLocal: number) {
  if (!earthTiltRoot || !earthOrbitRoot) return 0
  earthTiltRoot.updateMatrixWorld(true)
  earthTiltRoot.getWorldQuaternion(_qTilt)
  const inv = _qTilt.clone().invert()
  // 地球→太阳（世界系）
  _sunDir.copy(earthOrbitRoot.position).multiplyScalar(-1).normalize()
  // 变到地轴倾斜后的本体水平面
  _vTmp.copy(_sunDir).applyQuaternion(inv)
  const city = latLonToVec(BEIJING.lat, BEIJING.lon, 1)
  const sunAz = Math.atan2(_vTmp.x, _vTmp.z)
  const cityAz = Math.atan2(city.x, city.z)
  const hourAngle = ((hourLocal - 12) / 24) * Math.PI * 2
  return sunAz - cityAz + hourAngle
}

function syncDayNightScene() {
  if (!earthOrbitRoot || !earthSpinRoot || !termRoot) return
  earthOrbitRoot.position.set(
    Math.cos(dnOrbitAngle.value) * DN_ORBIT_R,
    0,
    Math.sin(dnOrbitAngle.value) * DN_ORBIT_R,
  )

  earthSpinRoot.rotation.y = spinFacingSun(localHour.value)

  _sunDir.set(0, 0, 0).sub(earthOrbitRoot.position).normalize()
  termRoot.position.copy(earthOrbitRoot.position)
  termRoot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _sunDir)

  if (sunLight) {
    sunLight.position.set(0, 0, 0)
    sunLight.target.position.copy(earthOrbitRoot.position)
    sunLight.target.updateMatrixWorld()
  }
}

const _dnAlong = new THREE.Vector3()
const _dnCamSide = new THREE.Vector3()
const _dnCamPos = new THREE.Vector3()
const _dnCamTarget = new THREE.Vector3()
const _dnCamUp = new THREE.Vector3(0, 1, 0)

/** 预设镜头：只点选瞬间跳一次，不每帧跟随（否则公转看起来像停住） */
function applyDayNightView(kind: DnCamView = dnCamView.value) {
  if (!camera || !controls || !earthOrbitRoot) return
  dnCamView.value = kind

  const ep = earthOrbitRoot.position
  const R = DN_EARTH_R
  const orbitR = Math.max(ep.length(), 1)
  _dnAlong.copy(ep).multiplyScalar(1 / orbitR)
  _dnCamSide.crossVectors(_dnCamUp, _dnAlong)
  if (_dnCamSide.lengthSq() < 1e-8) _dnCamSide.set(1, 0, 0)
  else _dnCamSide.normalize()
  camera.up.copy(_dnCamUp)

  if (kind === 'overview') {
    _dnCamTarget.copy(ep).multiplyScalar(0.42)
    _dnCamPos
      .copy(_dnCamTarget)
      .addScaledVector(_dnCamSide, orbitR * 0.92)
      .addScaledVector(_dnCamUp, orbitR * 0.48)
  } else if (kind === 'edge') {
    _dnCamTarget.copy(ep)
    _dnCamPos.copy(ep).addScaledVector(_dnCamSide, R * 4.6).addScaledVector(_dnCamUp, R * 0.55)
  } else if (kind === 'day') {
    _dnCamTarget.copy(ep)
    const fromSun = Math.max(DN_SUN_R * 1.85, orbitR - R * 3.8)
    _dnCamPos.copy(_dnAlong).multiplyScalar(fromSun).addScaledVector(_dnCamUp, R * 0.4)
  } else if (kind === 'night') {
    _dnCamTarget.copy(ep)
    _dnCamPos.copy(_dnAlong).multiplyScalar(orbitR + R * 3.8).addScaledVector(_dnCamUp, R * 0.4)
  } else {
    _dnCamTarget.copy(ep)
    _dnCamPos.copy(ep).addScaledVector(_dnCamUp, R * 5.4).addScaledVector(_dnAlong, -R * 1.6)
  }

  camera.position.copy(_dnCamPos)
  controls.target.copy(_dnCamTarget)
  controls.update()
}

function frameDayNight() {
  applyDayNightView('overview')
}

function snapHour(h: number) {
  playing.value = false
  hour.value = h
  syncDayNightScene()
}

function loopThree() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loopThree)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  if (threeMode === 'day-night' && earthOrbitRoot) {
    if (playing.value) {
      const dHour = dt * 2.2
      hour.value = (hour.value + dHour) % 24
      // 课堂加速公转（真≈0.99°/日看不见）；自转仍按地方时准确
      dnOrbitAngle.value += (dHour / 24) * ((ORBIT_TEACH_DEG_PER_DAY * Math.PI) / 180)
    }
    syncDayNightScene()
    if (camera && sunLookAt) sunLookAt(camera)
    controls?.update()
  } else if (threeMode === 'basics' && basicsSceneKind === 'period') {
    if (playing.value) {
      if (periodProgress.value < 1) {
        periodProgress.value = Math.min(1, periodProgress.value + dt / 14)
        periodPhase = 0
      } else {
        periodPhase += dt
        if (periodPhase > 1.5) {
          periodProgress.value = 0
          periodPhase = 0
        }
      }
    }
    syncPeriodScene()
    if (camera && sunLookAt) sunLookAt(camera)
    controls?.update()
  } else if (threeMode === 'basics' && globeRoot) {
    // 方向·速度：只转地球；纬圈定位标钉在球面上，随自转走（线速度由纬圈半径体现）
    if (playing.value && basicsSceneKind === 'direction') {
      globeRoot.rotation.y += dt * 0.28
    }
    controls?.update()
  } else if (threeMode === 'sphere') {
    updateSphereArrows(dt)
    controls?.update()
  } else if (threeMode === 'timezones') {
    if (playing.value && globeRoot) globeRoot.rotation.y += dt * 0.08
    controls?.update()
  }

  renderer.render(scene, camera)
}

/** 球体：外视地球 + 南北半球双箭头动画 */
function setupSphereThrow() {
  if (!sphereCanvasRef.value || !wrapRef.value) return
  disposed = false
  disposables = []
  threeMode = 'sphere'
  sphereProgress = 0
  sphereR = 80
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(280, wrapRef.value.clientHeight - 48)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x070b16)
  camera = new THREE.PerspectiveCamera(42, w / h, 1, 800)
  // 略偏侧视，南北半球都能看到
  camera.position.set(160, 30, 260)

  renderer = new THREE.WebGLRenderer({ canvas: sphereCanvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  controls = new OrbitControls(camera, sphereCanvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 140
  controls.maxDistance = 480
  controls.target.set(0, 0, 0)

  scene.add(new THREE.AmbientLight(0x667788, 0.55))
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.1)
  sun.position.set(120, 60, 80)
  scene.add(sun)

  globeRoot = new THREE.Group()
  scene.add(globeRoot)

  const R = sphereR
  const tex = new THREE.TextureLoader().load('/textures/earth-period.jpg')
  tex.colorSpace = THREE.SRGBColorSpace
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshBasicMaterial({ map: tex })),
    ),
  )

  const axisLen = R * 2 + 24
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, axisLen, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
    ),
  )
  globeRoot.add(addDisposable(makeLabelSprite('北', 0, axisLen / 2 + 10, 0, { scale: 0.75 })))
  globeRoot.add(addDisposable(makeLabelSprite('南', 0, -(axisLen / 2 + 10), 0, { scale: 0.75 })))

  buildSpherePaths()

  lastT = performance.now()
  loopThree()
}

function buildSpherePaths() {
  if (!globeRoot) return
  const R = sphereR

  if (pathGroup) {
    globeRoot.remove(pathGroup)
    pathGroup.traverse((obj) => {
      if (obj !== pathGroup) disposeObj(obj)
    })
    pathGroup = null
  }
  sphereTracks = []

  pathGroup = new THREE.Group()
  globeRoot.add(pathGroup)

  for (const h of ['N', 'S'] as const) {
    addSphereTrack(h, R)
  }

  sphereProgress = 0
}

function addSphereTrack(h: 'N' | 'S', R: number) {
  if (!pathGroup) return
  const startLat = h === 'N' ? 20 : -20
  const endLat = h === 'N' ? 75 : -75

  const intentPts: THREE.Vector3[] = []
  for (let i = 0; i <= 48; i++) {
    const t = i / 48
    const lat = startLat + (endLat - startLat) * t
    intentPts.push(latLonToVec(lat, 0, R + 0.8))
  }
  const intent = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(intentPts),
    new THREE.LineDashedMaterial({ color: 0x8aa0b4, dashSize: 2, gapSize: 1.4 }),
  )
  intent.computeLineDistances()
  pathGroup.add(intent)

  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([intentPts[0]!, intentPts[0]!.clone()]),
    new THREE.LineBasicMaterial({ color: 0xff9f43 }),
  )
  pathGroup.add(trail)

  const start = latLonToVec(startLat, 0, R + 1.2)
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0x5ec8f0 }))
  pad.position.copy(start)
  pathGroup.add(pad)

  const startLabelPos = latLonToVec(startLat + (h === 'N' ? -7 : 7), -8, R + 6)
  pathGroup.add(
    makeLabelSprite(h === 'N' ? '北半球出发' : '南半球出发', startLabelPos.x, startLabelPos.y, startLabelPos.z, {
      scale: 0.72,
    }),
  )

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5.5, 12), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
  arrow.visible = false
  pathGroup.add(arrow)

  if (coriolisOn.value) {
    const onPath = sampleSpherePoint(h, 0.5, R + 2)
    const radial = onPath.clone().normalize()
    const east = new THREE.Vector3(0, 1, 0).cross(radial).normalize()
    const tagAt = onPath.clone().add(east.multiplyScalar(14)).setLength(R + 12)
    pathGroup.add(
      makeLabelSprite(h === 'N' ? '右偏（向东）' : '左偏（向东）', tagAt.x, tagAt.y, tagAt.z, { scale: 0.8 }),
    )
  }

  sphereTracks.push({ hemi: h, trail, arrow })
}

function sampleSpherePoint(h: 'N' | 'S', t: number, r: number) {
  const startLat = h === 'N' ? 20 : -20
  const endLat = h === 'N' ? 75 : -75
  const lat = startLat + (endLat - startLat) * t
  // 两半球向极运动都向东偏
  const maxLon = coriolisOn.value ? 22 : 0
  const lon = maxLon * t * t
  const alt = 3.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  return latLonToVec(lat, lon, r + alt)
}

function orientArrow(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  if (dir.lengthSq() < 1e-8) return
  dir.normalize()
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  mesh.position.copy(to)
}

function updateSphereArrows(dt: number) {
  if (!sphereTracks.length) return
  const R = sphereR
  if (fpPlaying.value) {
    sphereProgress += dt / 3.2
    if (sphereProgress > 1.25) sphereProgress = 0
  }

  const t = Math.min(1, Math.max(0, sphereProgress))
  for (const track of sphereTracks) {
    const pts: THREE.Vector3[] = []
    const n = Math.max(2, Math.floor(t * 56) + 1)
    for (let i = 0; i < n; i++) {
      pts.push(sampleSpherePoint(track.hemi, i / 55, R + 0.8))
    }
    track.trail.geometry.dispose()
    track.trail.geometry = new THREE.BufferGeometry().setFromPoints(pts)

    if (t > 0.02) {
      track.arrow.visible = true
      orientArrow(track.arrow, pts[Math.max(0, pts.length - 2)]!, pts[pts.length - 1]!)
    } else {
      track.arrow.visible = false
    }
  }
}

function restartThrow() {
  sphereProgress = 0
  fpProgress = 0
  topThrowT.value = 0
  fpPlaying.value = true
}

// ========== 俯视 SVG ==========
/** 从赤道圆柱投影采样，生成极地→赤道正射圆盘（北：东在右；南：东在左） */
function renderPolarMap(img: HTMLImageElement, pole: 'N' | 'S'): string {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const src = document.createElement('canvas')
  src.width = img.naturalWidth || img.width
  src.height = img.naturalHeight || img.height
  const sctx = src.getContext('2d')!
  sctx.drawImage(img, 0, 0)
  const srcData = sctx.getImageData(0, 0, src.width, src.height)
  const out = ctx.createImageData(size, size)
  const cx = (size - 1) / 2
  const rMax = size / 2 - 1.5
  const sw = src.width
  const sh = src.height

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx
      const dy = py - cx
      const ρ = Math.hypot(dx, dy)
      const oi = (py * size + px) * 4
      if (ρ > rMax) {
        out.data[oi + 3] = 0
        continue
      }
      const colat = (ρ / rMax) * (Math.PI / 2)
      // atan2(dx,dy)：底部为 0° 经线，顺时针为正（北半球俯视东在右）
      const ang = Math.atan2(dx, dy)
      let lat: number
      let lon: number
      if (pole === 'N') {
        lat = 90 - (colat * 180) / Math.PI
        lon = (ang * 180) / Math.PI
      } else {
        lat = -90 + (colat * 180) / Math.PI
        // 南极俯视：东西对调，东在左
        lon = (-ang * 180) / Math.PI
      }
      lon = ((((lon + 180) % 360) + 360) % 360) - 180
      const u = ((lon + 180) / 360) * (sw - 1)
      const v = ((90 - lat) / 180) * (sh - 1)
      const ui = Math.max(0, Math.min(sw - 1, Math.round(u)))
      const vi = Math.max(0, Math.min(sh - 1, Math.round(v)))
      const si = (vi * sw + ui) * 4
      out.data[oi] = srcData.data[si]!
      out.data[oi + 1] = srcData.data[si + 1]!
      out.data[oi + 2] = srcData.data[si + 2]!
      out.data[oi + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.88)
}

function ensurePolarMaps() {
  if (polarMapN && polarMapS) return
  if (polarMapLoading) return
  polarMapLoading = true
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    try {
      polarMapN = renderPolarMap(img, 'N')
      polarMapS = renderPolarMap(img, 'S')
    } finally {
      polarMapLoading = false
      if (!topDisposed && coriolisMode.value === 'top') drawCoriolis()
    }
  }
  img.onerror = () => {
    polarMapLoading = false
  }
  img.src = '/textures/earth-period.jpg'
}

function startTopThrow() {
  teardownTop()
  topDisposed = false
  topThrowT.value = 0
  topLastT = performance.now()
  ensurePolarMaps()
  topLoop()
}

function topLoop() {
  if (topDisposed) return
  topRaf = requestAnimationFrame(topLoop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - topLastT) / 1000)
  topLastT = now
  if (fpPlaying.value) {
    topThrowT.value += dt / 2.8
    if (topThrowT.value > 1.2) topThrowT.value = 0
  }
  drawCoriolis()
}

function drawCoriolis() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#080c12').attr('rx', 12)

  const defs = svg.append('defs')
  for (const [id, color] of [
    ['arr-intent', '#8aa0b4'],
    ['arr-actual', '#ff9f43'],
    ['arr-spin', '#6ec8f0'],
  ] as const) {
    defs
      .append('marker')
      .attr('id', id)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', color)
  }

  // 回退色：贴图未就绪时用
  const radialN = defs.append('radialGradient').attr('id', 'er-disk-n')
  radialN.append('stop').attr('offset', '0%').attr('stop-color', '#1a4a6a')
  radialN.append('stop').attr('offset', '100%').attr('stop-color', '#0c2438')
  const radialS = defs.append('radialGradient').attr('id', 'er-disk-s')
  radialS.append('stop').attr('offset', '0%').attr('stop-color', '#1a3a55')
  radialS.append('stop').attr('offset', '100%').attr('stop-color', '#0a1c2e')

  drawHemisphere(svg, {
    cx: 200,
    cy: 215,
    title: '北半球 · 俯视北极',
    spinLabel: '自转（逆时针）',
    clockwise: false,
    eastOnRight: true,
    bend: coriolisOn.value ? 48 : 0,
    intentLabel: '预定：赤道 → 北极',
    resultLabel: coriolisOn.value ? '实际：右偏（向东）' : '实际：不偏转',
    verdict: coriolisOn.value ? '右偏' : '无偏',
    fill: 'url(#er-disk-n)',
    mapUrl: polarMapN,
    clipId: 'er-clip-n',
  })

  drawHemisphere(svg, {
    cx: 560,
    cy: 215,
    title: '南半球 · 俯视南极',
    spinLabel: '自转（顺时针）',
    clockwise: true,
    eastOnRight: false,
    bend: coriolisOn.value ? -48 : 0,
    intentLabel: '预定：赤道 → 南极',
    resultLabel: coriolisOn.value ? '实际：左偏（向东）' : '实际：不偏转',
    verdict: coriolisOn.value ? '左偏' : '无偏',
    fill: 'url(#er-disk-s)',
    mapUrl: polarMapS,
    clipId: 'er-clip-s',
  })

  svg.append('line').attr('x1', 40).attr('y1', H - 28).attr('x2', 80).attr('y2', H - 28).attr('stroke', '#8aa0b4').attr('stroke-width', 2).attr('stroke-dasharray', '5 4')
  svg.append('text').attr('x', 88).attr('y', H - 24).attr('fill', '#8aa0b4').attr('font-size', 10).text('预定直线')
  svg.append('line').attr('x1', 180).attr('y1', H - 28).attr('x2', 220).attr('y2', H - 28).attr('stroke', '#ff9f43').attr('stroke-width', 2.5)
  svg.append('text').attr('x', 228).attr('y', H - 24).attr('fill', '#ff9f43').attr('font-size', 10).text('实际路径')
  svg
    .append('text')
    .attr('x', W - 40)
    .attr('y', H - 24)
    .attr('text-anchor', 'end')
    .attr('fill', '#9ec9e8')
    .attr('font-size', 10)
    .text(coriolisOn.value ? '口诀：北右南左 · 赤道不偏 · 点圆盘可重放' : '关掉偏向后，两条线重合')
}

function drawHemisphere(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  opt: {
    cx: number
    cy: number
    title: string
    spinLabel: string
    clockwise: boolean
    eastOnRight: boolean
    bend: number
    intentLabel: string
    resultLabel: string
    verdict: string
    fill: string
    mapUrl: string | null
    clipId: string
  },
) {
  const r = 112
  const { cx, cy } = opt
  const t = Math.min(1, Math.max(0, topThrowT.value))

  svg.append('text').attr('x', cx).attr('y', 30).attr('text-anchor', 'middle').attr('fill', '#d8e4f0').attr('font-size', 12).attr('font-weight', 600).text(opt.title)

  const defs = svg.select('defs')
  defs.append('clipPath').attr('id', opt.clipId).append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)

  // 底：真实极地地图（未加载时用渐变占位）
  svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', r)
    .attr('fill', opt.fill)
  if (opt.mapUrl) {
    svg
      .append('image')
      .attr('href', opt.mapUrl)
      .attr('x', cx - r)
      .attr('y', cy - r)
      .attr('width', r * 2)
      .attr('height', r * 2)
      .attr('clip-path', `url(#${opt.clipId})`)
      .attr('preserveAspectRatio', 'xMidYMid slice')
    // 轻微压暗，让轨迹更清楚
    svg
      .append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', r)
      .attr('fill', '#061018')
      .attr('opacity', 0.22)
  }

  const disk = svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', r)
    .attr('fill', 'transparent')
    .attr('stroke', '#4a90c8')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
  disk.on('click', () => {
    topThrowT.value = 0
    fpPlaying.value = true
  })

  // 纬线圈
  for (const f of [0.35, 0.62, 0.88]) {
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r * f).attr('fill', 'none').attr('stroke', '#d8e8f8').attr('stroke-width', 1).attr('opacity', 0.35)
  }
  svg.append('text').attr('x', cx).attr('y', cy + r - 12).attr('text-anchor', 'middle').attr('fill', '#e8f0f8').attr('font-size', 10).attr('font-weight', 600).text('赤道')

  const eastX = opt.eastOnRight ? cx + r - 14 : cx - r + 14
  const westX = opt.eastOnRight ? cx - r + 14 : cx + r - 14
  svg.append('text').attr('x', eastX).attr('y', cy + 3).attr('text-anchor', 'middle').attr('fill', '#e8f0f8').attr('font-size', 10).attr('font-weight', 600).text('东')
  svg.append('text').attr('x', westX).attr('y', cy + 3).attr('text-anchor', 'middle').attr('fill', '#e8f0f8').attr('font-size', 10).attr('font-weight', 600).text('西')

  svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4).attr('fill', '#ffe08a').attr('opacity', 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 500)))
  svg.append('text').attr('x', cx).attr('y', cy - 10).attr('text-anchor', 'middle').attr('fill', '#ffe08a').attr('font-size', 10).text('极')

  const spinR = r + 14
  const span = 0.95
  const aStart = opt.clockwise ? -span : span
  const aEnd = opt.clockwise ? span : -span
  // dashoffset 减小 → 虚线沿路径流向箭头端；南北路径方向已区分顺/逆，符号须一致
  const spinOff = -((performance.now() / 28) % 40)
  svg
    .append('path')
    .attr('d', describeArc(cx, cy, spinR, aStart, aEnd, opt.clockwise))
    .attr('fill', 'none')
    .attr('stroke', '#6ec8f0')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '8 10')
    .attr('stroke-dashoffset', spinOff)
    .attr('marker-end', 'url(#arr-spin)')

  const spinLabelX = cx + (opt.clockwise ? r + 8 : -r - 8)
  svg
    .append('text')
    .attr('x', spinLabelX)
    .attr('y', cy - r * 0.35)
    .attr('text-anchor', opt.clockwise ? 'start' : 'end')
    .attr('fill', '#6ec8f0')
    .attr('font-size', 10)
    .text(opt.spinLabel)

  const x0 = cx
  const y0 = cy + r - 10
  const x1 = cx
  const y1 = cy + 14
  // 预定虚线流向极点（减小 dashoffset）；南北同一规则，避免南半球反着流
  const intentOff = -((performance.now() / 36) % 22)
  svg
    .append('line')
    .attr('x1', x0)
    .attr('y1', y0)
    .attr('x2', x1)
    .attr('y2', y1)
    .attr('stroke', '#8aa0b4')
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', '6 5')
    .attr('stroke-dashoffset', intentOff)
    .attr('marker-end', 'url(#arr-intent)')

  svg.append('circle').attr('cx', x0).attr('cy', y0).attr('r', 6).attr('fill', '#5ec8f0').attr('stroke', '#fff').attr('stroke-width', 1.2)
  svg
    .append('text')
    .attr('x', x0 + (opt.eastOnRight ? -10 : 10))
    .attr('y', y0 + 3)
    .attr('text-anchor', opt.eastOnRight ? 'end' : 'start')
    .attr('fill', '#9ec9e8')
    .attr('font-size', 10)
    .text('出发')

  const mx = (x0 + x1) / 2 + opt.bend
  const my = (y0 + y1) / 2
  const endX = x1 + opt.bend * 0.35
  const pathD = `M ${x0} ${y0} Q ${mx} ${my} ${endX} ${y1}`
  svg
    .append('path')
    .attr('d', pathD)
    .attr('fill', 'none')
    .attr('stroke', '#ff9a3a')
    .attr('stroke-width', 2.6)
    .attr('opacity', 0.35)
  // 生长轨迹
  const pathEl = svg
    .append('path')
    .attr('d', pathD)
    .attr('fill', 'none')
    .attr('stroke', '#ff9f43')
    .attr('stroke-width', 2.8)
    .attr('marker-end', t > 0.92 ? 'url(#arr-actual)' : null)
  const total = (pathEl.node() as SVGPathElement).getTotalLength()
  pathEl
    .attr('stroke-dasharray', `${total * t} ${total}`)
    .attr('stroke-dashoffset', 0)

  // 飞行物
  if (t > 0.02 && t <= 1) {
    const pt = (pathEl.node() as SVGPathElement).getPointAtLength(total * t)
    svg.append('circle').attr('cx', pt.x).attr('cy', pt.y).attr('r', 5.5).attr('fill', '#5ec8f0').attr('stroke', '#fff').attr('stroke-width', 1.4)
  }

  if (Math.abs(opt.bend) > 1 && t > 0.55) {
    svg
      .append('text')
      .attr('x', mx + (opt.bend > 0 ? 16 : -16))
      .attr('y', my + 3)
      .attr('text-anchor', opt.bend > 0 ? 'start' : 'end')
      .attr('fill', '#ff9f43')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('opacity', Math.min(1, (t - 0.55) / 0.3))
      .text(opt.verdict)
  }

  svg.append('text').attr('x', cx).attr('y', cy + r + 34).attr('text-anchor', 'middle').attr('fill', '#a8b8c8').attr('font-size', 10).text(opt.intentLabel)
  svg.append('text').attr('x', cx).attr('y', cy + r + 50).attr('text-anchor', 'middle').attr('fill', '#ff9f43').attr('font-size', 10).text(opt.resultLabel)
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number, clockwise: boolean) {
  const x0 = cx + Math.sin(start) * r
  const y0 = cy - Math.cos(start) * r
  const x1 = cx + Math.sin(end) * r
  const y1 = cy - Math.cos(end) * r
  const delta = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const sweepDelta = clockwise ? delta : (Math.PI * 2 - delta) % (Math.PI * 2)
  const large = sweepDelta > Math.PI ? 1 : 0
  const sweep = clockwise ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`
}

// ========== 地面第一人称 2D ==========
function setupFp() {
  teardownFp()
  if (!fpCanvasRef.value || !wrapRef.value) return
  fpDisposed = false
  fpProgress = 0
  fpGroundShift = 0
  fpLastT = performance.now()
  resizeFp()
  fpLoop()
}

function teardownFp() {
  fpDisposed = true
  cancelAnimationFrame(fpRaf)
}

function resizeFp() {
  const c = fpCanvasRef.value
  const wrap = wrapRef.value
  if (!c || !wrap) return
  const w = wrap.clientWidth || 640
  const h = Math.max(280, wrap.clientHeight - 48)
  const dpr = Math.min(window.devicePixelRatio, 2)
  c.width = Math.floor(w * dpr)
  c.height = Math.floor(h * dpr)
  c.style.width = `${w}px`
  c.style.height = `${h}px`
}

function projectFp(latOffset: number, depth: number, panelW: number, panelH: number, ox: number) {
  const horizonY = panelH * 0.3
  const groundBottom = panelH * 0.9
  const eyeX = ox + panelW * 0.5
  const y = groundBottom + (horizonY - groundBottom) * depth
  const scale = 1 - depth * 0.85
  const halfNear = panelW * 0.4
  const x = eyeX + latOffset * halfNear * scale
  return { x, y, scale, horizonY, groundBottom, eyeX }
}

function fpLoop() {
  if (fpDisposed || !fpCanvasRef.value) return
  fpRaf = requestAnimationFrame(fpLoop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - fpLastT) / 1000)
  fpLastT = now
  if (fpPlaying.value) {
    fpProgress += dt / 3.2
    if (fpProgress > 1.15) fpProgress = 0
    fpGroundShift += dt * 28
  }
  drawFpFrame()
}

function drawFpFrame() {
  const c = fpCanvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio, 2)
  const w = c.width / dpr
  const h = c.height / dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#080c12'
  ctx.fillRect(0, 0, w, h)

  const gap = 10
  const panelW = (w - gap) / 2
  drawFpPanel(ctx, 0, 0, panelW, h, 'N')
  drawFpPanel(ctx, panelW + gap, 0, panelW, h, 'S')
}

/** 北：面向正北，右偏；南：面向正南，左偏（向东） */
function drawFpPanel(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  panelW: number,
  panelH: number,
  h: 'N' | 'S',
) {
  const facingNorth = h === 'N'
  // 面向正北：东在右；面向正南：东在左
  const eastSign = facingNorth ? 1 : -1
  const bendSign = coriolisOn.value ? eastSign : 0 // 向东偏 → 对前进方向：北右南左
  const maxBend = 0.55 * bendSign

  const sky = ctx.createLinearGradient(0, oy, 0, oy + panelH * 0.35)
  sky.addColorStop(0, '#0a1528')
  sky.addColorStop(1, '#1a3a55')
  ctx.fillStyle = sky
  ctx.fillRect(ox, oy, panelW, panelH)

  const p0 = projectFp(0, 0, panelW, panelH, ox)
  const { horizonY, groundBottom, eyeX } = p0

  const ground = ctx.createLinearGradient(0, oy + horizonY, 0, oy + panelH)
  ground.addColorStop(0, '#1e4a38')
  ground.addColorStop(1, '#0d2818')
  ctx.fillStyle = ground
  ctx.beginPath()
  ctx.moveTo(ox, oy + horizonY)
  ctx.lineTo(ox + panelW, oy + horizonY)
  ctx.lineTo(ox + panelW, oy + panelH)
  ctx.lineTo(ox, oy + panelH)
  ctx.closePath()
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, panelW, panelH)
  ctx.clip()

  ctx.strokeStyle = 'rgba(120, 180, 140, 0.35)'
  ctx.lineWidth = 1
  // 网格向「东」滑：面北时向右，面南时向左（自西向东）
  const shift = ((fpGroundShift % 40) / 40) * eastSign
  for (let i = -8; i <= 8; i++) {
    const u = (i + shift) / 8
    const near = projectFp(u, 0.02, panelW, panelH, ox)
    const far = projectFp(u * 0.15, 0.98, panelW, panelH, ox)
    ctx.beginPath()
    ctx.moveTo(near.x, oy + near.y)
    ctx.lineTo(far.x, oy + far.y)
    ctx.stroke()
  }
  for (let d = 0.1; d < 1; d += 0.12) {
    const left = projectFp(-1, d, panelW, panelH, ox)
    const right = projectFp(1, d, panelW, panelH, ox)
    ctx.beginPath()
    ctx.moveTo(left.x, oy + left.y)
    ctx.lineTo(right.x, oy + right.y)
    ctx.stroke()
  }

  ctx.strokeStyle = '#6a849c'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(ox, oy + horizonY)
  ctx.lineTo(ox + panelW, oy + horizonY)
  ctx.stroke()

  const target = projectFp(0, 0.92, panelW, panelH, ox)
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.arc(target.x, oy + target.y, 6 * target.scale + 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(facingNorth ? '正北目标' : '正南目标', target.x, oy + target.y - 12)

  ctx.fillStyle = '#8aa0b4'
  ctx.font = '11px sans-serif'
  // 面北：左西右东；面南：左东右西
  ctx.fillText(facingNorth ? '西' : '东', ox + panelW * 0.12, oy + groundBottom - 6)
  ctx.fillText(facingNorth ? '东' : '西', ox + panelW * 0.88, oy + groundBottom - 6)

  ctx.setLineDash([6, 5])
  ctx.strokeStyle = '#8aa0b4'
  ctx.lineWidth = 2
  const start = projectFp(0, 0.05, panelW, panelH, ox)
  ctx.beginPath()
  ctx.moveTo(start.x, oy + start.y)
  ctx.lineTo(target.x, oy + target.y)
  ctx.stroke()
  ctx.setLineDash([])

  const trail: { x: number; y: number; s: number }[] = []
  const tMax = Math.min(1, Math.max(0, fpProgress))
  for (let t = 0; t <= tMax; t += 0.02) {
    const p = projectFp(maxBend * t * t, 0.05 + t * 0.87, panelW, panelH, ox)
    trail.push({ x: p.x, y: oy + p.y, s: p.scale })
  }
  if (trail.length > 1) {
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(trail[0]!.x, trail[0]!.y)
    for (const p of trail) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  if (fpProgress <= 1 && trail.length) {
    const ball = trail[trail.length - 1]!
    ctx.fillStyle = '#5ec8f0'
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, 7 * ball.s + 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else if (fpProgress > 1) {
    const land = projectFp(maxBend, 0.92, panelW, panelH, ox)
    ctx.fillStyle = '#ff9f43'
    ctx.beginPath()
    ctx.arc(land.x, oy + land.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(coriolisOn.value ? (h === 'N' ? '落点偏右' : '落点偏左') : '正中', land.x, oy + land.y - 10)
  }

  // 你
  ctx.fillStyle = '#c8d6e4'
  ctx.beginPath()
  ctx.ellipse(eyeX, oy + groundBottom - 14, 28, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(eyeX, oy + groundBottom - 30, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8aa0b4'
  ctx.font = '10px sans-serif'
  ctx.fillText(facingNorth ? '你（面向正北）' : '你（面向正南）', eyeX, oy + groundBottom + 6)

  ctx.restore()

  // 顶栏
  ctx.fillStyle = 'rgba(7, 11, 22, 0.78)'
  ctx.fillRect(ox, oy, panelW, 36)
  ctx.fillStyle = '#d8e4f0'
  ctx.font = '13px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(h === 'N' ? '北半球 · 朝极地（正北）' : '南半球 · 朝极地（正南）', ox + 10, oy + 23)
  ctx.textAlign = 'right'
  ctx.fillStyle = coriolisOn.value ? '#ff9f43' : '#8aa0b4'
  ctx.fillText(coriolisOn.value ? (h === 'N' ? '右偏' : '左偏') : '无偏', ox + panelW - 10, oy + 23)

  // 分隔边框
  ctx.strokeStyle = 'rgba(74, 144, 200, 0.35)'
  ctx.strokeRect(ox + 0.5, oy + 0.5, panelW - 1, panelH - 1)
}

// ========== 路由 / 模式 ==========
function enterCoriolisMode(mode: CoriolisMode) {
  teardownThree()
  teardownFp()
  teardownTop()
  if (mode === 'top') requestAnimationFrame(() => startTopThrow())
  else if (mode === 'fp') requestAnimationFrame(() => setupFp())
  else requestAnimationFrame(() => setupSphereThrow())
}

/** 时区：真实地球 + 理论时区经线（每 15°） */
function setupTimezones() {
  if (!initThreeCanvas('timezones') || !scene || !camera || !controls) return
  const R = TZ_EARTH_R

  // Basic 贴图不受光照影响，避免夜半球被平行光打成全黑
  if (sceneAmbient) {
    sceneAmbient.color.set(0xffffff)
    sceneAmbient.intensity = 0.55
  }
  if (sceneFill) {
    sceneFill.intensity = 0
  }

  globeRoot = new THREE.Group()
  scene.add(globeRoot)

  const tex = new THREE.TextureLoader().load('/textures/earth-period.jpg')
  tex.colorSpace = THREE.SRGBColorSpace
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(new THREE.SphereGeometry(R, 72, 56), new THREE.MeshBasicMaterial({ map: tex })),
    ),
  )

  // 夜半球半透明罩（随 UTC 转），压暗但不抹掉地图
  const nightShell = new THREE.Mesh(
    new THREE.SphereGeometry(R + 0.35, 56, 40, -Math.PI / 2, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0x020814,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  nightShell.name = 'tz-night'
  globeRoot.add(addDisposable(nightShell))

  // 赤道 + 本初子午（主框架）
  globeRoot.add(addDisposable(makeEarthParallel(0, R, EarthLineWidth.gridMajor, Demo3.earthEquator, 0.85)))
  globeRoot.add(addDisposable(makeEarthMeridian(0, R, EarthLineWidth.gridMajor, Demo3.earthPrime, 0.85)))
  globeRoot.add(
    addDisposable(makeLabelSprite('赤道', R * 0.55, 6, R * 0.75, { scale: 0.4, bg: false, color: DemoHex.earthEquator })),
  )

  // 时区边界：中心经线 offset×15 的西界 = offset×15 − 7.5
  for (let offset = -11; offset <= 12; offset++) {
    const centerLng = offset * 15
    const westLng = centerLng - 7.5
    const isCn = offset === 8 || offset === 9
    const isZero = offset === 0 || offset === 1
    const color = isCn ? 0xffd060 : isZero ? 0x6ec8f0 : 0xf0a020
    const tube = isCn ? EarthLineWidth.bold : EarthLineWidth.mid
    const op = isCn ? 0.95 : 0.75
    globeRoot.add(addDisposable(makeEarthMeridian(westLng, R, tube, color, op)))

    const label = offset === 0 ? 'UTC±0' : offset > 0 ? `UTC+${offset}` : `UTC${offset}`
    const lp = latLonToVec(-16, centerLng, R + 6)
    const spr = makeLabelSprite(label, lp.x, lp.y, lp.z, {
      scale: offset === 0 || offset === 8 ? 0.48 : 0.32,
      bg: offset === 0 || offset === 8,
      color: offset === 0 ? '#6ec8f0' : offset === 8 ? '#ffe08a' : '#f0c878',
    })
    globeRoot.add(addDisposable(spr))
  }

  // 高亮界线旁注：蓝=中时区两侧，金=东八区两侧
  {
    const notes: { lon: number; text: string; color: string; lat: number }[] = [
      { lon: -7.5, text: '中时区西界', color: '#6ec8f0', lat: 28 },
      { lon: 7.5, text: '中时区东界', color: '#6ec8f0', lat: 28 },
      { lon: 0, text: '本初子午', color: DemoHex.earthPrime, lat: 48 },
      { lon: 112.5, text: '东八区西界', color: '#ffe08a', lat: 28 },
      { lon: 127.5, text: '东八区东界', color: '#ffe08a', lat: 28 },
    ]
    for (const n of notes) {
      const p = latLonToVec(n.lat, n.lon, R + 8)
      globeRoot.add(
        addDisposable(
          makeLabelSprite(n.text, p.x, p.y, p.z, { scale: 0.4, bg: true, color: n.color }),
        ),
      )
    }
  }

  tzMarkerGroup = new THREE.Group()
  globeRoot.add(tzMarkerGroup)

  syncTimezoneMarkers()
  syncTimezoneSun()
  frameTimezoneCamera()

  playing.value = true
  lastT = performance.now()
  loopThree()
}

/** 夜罩默认盖本地 -X；转到 UTC 背日经线，半透明压暗即可 */
function syncTimezoneSun() {
  if (!globeRoot) return
  const night = globeRoot.getObjectByName('tz-night')
  if (!night) return
  const subLon = 15 * (12 - tzUtcHour.value)
  const nightLon = subLon + 180
  night.rotation.set(0, (nightLon * Math.PI) / 180, 0)
}

/** 镜头看向东八区（北京附近），保证首屏能看到地图与时区线 */
function frameTimezoneCamera() {
  if (!camera || !controls) return
  const focus = latLonToVec(25, 110, TZ_EARTH_R * 2.8)
  camera.position.copy(focus)
  camera.up.set(0, 1, 0)
  controls.target.set(0, 0, 0)
  controls.update()
}

function syncTimezoneMarkers() {
  if (!tzMarkerGroup || !globeRoot) return
  while (tzMarkerGroup.children.length) {
    const c = tzMarkerGroup.children[0]!
    tzMarkerGroup.remove(c)
    disposeObj(c)
  }
  const R = TZ_EARTH_R
  const cities = [
    { city: tzA.value, local: tzALocal.value, zone: tzAZone.value, color: 0x5ec8f0, tag: 'A' },
    { city: tzB.value, local: tzBLocal.value, zone: tzBZone.value, color: 0xff9f43, tag: 'B' },
  ]
  // 若 A/B 同城，只画一个点
  const seen = new Set<string>()
  for (const item of cities) {
    if (seen.has(item.city.id)) continue
    seen.add(item.city.id)
    const p = latLonToVec(item.city.lat, item.city.lon, R + 1.6)
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 14, 12),
      new THREE.MeshBasicMaterial({ color: item.color }),
    )
    dot.position.copy(p)
    tzMarkerGroup.add(dot)
    const lp = latLonToVec(item.city.lat, item.city.lon, R + 12)
    tzMarkerGroup.add(
      makeLabelSprite(`${item.city.name} · 区时${item.zone}`, lp.x, lp.y, lp.z, {
        scale: 0.48,
        bg: true,
        color: item.tag === 'A' ? '#9fe0f8' : '#ffc090',
      }),
    )
  }
}

function enterStep(id: string) {
  teardownThree()
  teardownFp()
  teardownTop()
  if (id === 'basics') requestAnimationFrame(() => setupBasics())
  else if (id === 'day-night') requestAnimationFrame(() => setupDayNight())
  else if (id === 'coriolis') enterCoriolisMode(coriolisMode.value)
  else if (id === 'timezones') requestAnimationFrame(() => setupTimezones())
}

watch(
  () => props.stepId,
  (id) => enterStep(id),
)

watch(coriolisMode, (mode) => {
  if (props.stepId === 'coriolis') enterCoriolisMode(mode)
})

watch([coriolisOn], () => {
  if (props.stepId !== 'coriolis') return
  if (coriolisMode.value === 'top') topThrowT.value = 0
  else if (coriolisMode.value === 'sphere' && threeMode === 'sphere') buildSpherePaths()
  else if (coriolisMode.value === 'fp') fpProgress = 0
})

watch(poleView, () => {
  if (threeMode === 'basics' && basicsSceneKind === 'direction') applyPoleCamera()
})

watch(speedLat, () => {
  if (threeMode === 'basics' && basicsSceneKind === 'direction') {
    lastSpeedLat = -1
    updateLatitudeSpeedVisual(72)
  }
})

watch(basicsTopic, () => {
  if (props.stepId === 'basics') {
    teardownThree()
    requestAnimationFrame(() => setupBasics())
  }
})

watch(periodKind, () => {
  if (basicsSceneKind === 'period') syncPeriodScene()
})

watch(periodProgress, () => {
  if (basicsSceneKind === 'period' && !playing.value) syncPeriodScene()
})

watch(terminatorFocus, () => {
  if (threeMode === 'day-night') syncTerminatorFocus()
})

watch(hour, () => {
  if (threeMode === 'day-night' && !playing.value) syncDayNightScene()
})

watch([tzCityA, tzCityB, tzUtcHour], () => {
  if (threeMode !== 'timezones') return
  syncTimezoneMarkers()
  syncTimezoneSun()
})

function onResize() {
  if (!wrapRef.value) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(280, wrapRef.value.clientHeight - 48)
  if (
    isDayNight.value ||
    isBasics.value ||
    isTimezones.value ||
    (isCoriolis.value && coriolisMode.value === 'sphere')
  ) {
    if (!renderer || !camera) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  } else if (isCoriolis.value && coriolisMode.value === 'fp') {
    resizeFp()
  }
}

onMounted(() => {
  enterStep(props.stepId)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  teardownThree()
  teardownFp()
  teardownTop()
})
</script>

<template>
  <div ref="wrapRef" class="wrap">
    <div class="toolbar">
      <template v-if="isBasics">
        <div class="mode-tabs">
          <button type="button" :class="{ on: basicsTopic === 'direction' }" @click="basicsTopic = 'direction'">方向·速度</button>
          <button type="button" :class="{ on: basicsTopic === 'period' }" @click="basicsTopic = 'period'">恒星日·太阳日</button>
        </div>

        <template v-if="isBasicsDirection">
          <div class="mode-tabs">
            <button type="button" :class="{ on: poleView === 'equator' }" @click="poleView = 'equator'">侧视</button>
            <button type="button" :class="{ on: poleView === 'north' }" @click="poleView = 'north'">俯视北极</button>
            <button type="button" :class="{ on: poleView === 'south' }" @click="poleView = 'south'">俯视南极</button>
          </div>
          <label class="ctrl">
            <span>纬度</span>
            <input v-model.number="speedLat" type="range" min="0" max="90" step="15" list="lat-snaps" />
            <em>{{ speedInfo.lat }}°</em>
          </label>
          <datalist id="lat-snaps">
            <option value="0" />
            <option value="30" />
            <option value="45" />
            <option value="60" />
            <option value="90" />
          </datalist>
          <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
            {{ playing ? '暂停自转' : '继续自转' }}
          </button>
          <span class="note">{{ poleSpinLabel }} · N逆S顺</span>
        </template>

        <template v-else-if="isBasicsPeriod">
          <div class="mode-tabs">
            <button type="button" :class="{ on: periodKind === 'compare' }" @click="periodKind = 'compare'">对照</button>
            <button type="button" :class="{ on: periodKind === 'sidereal' }" @click="periodKind = 'sidereal'">恒星日</button>
            <button type="button" :class="{ on: periodKind === 'solar' }" @click="periodKind = 'solar'">太阳日</button>
          </div>
          <label class="ctrl period-scrub">
            <span>进程</span>
            <input
              v-model.number="periodProgress"
              type="range"
              min="0"
              max="1"
              step="0.001"
              @pointerdown="playing = false"
            />
            <em>{{ periodHours.toFixed(1) }}h</em>
          </label>
          <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
            {{ playing ? '暂停' : '播放' }}
          </button>
          <button type="button" class="btn" @click="restartPeriod">重放</button>
        </template>
      </template>

      <template v-else-if="isDayNight">
        <label class="ctrl">
          <span>北京地方时</span>
          <input v-model.number="hour" type="range" min="0" max="23.9" step="0.1" />
          <em>{{ localLabel }}</em>
        </label>
        <div class="snaps">
          <button type="button" class="btn" @click="snapHour(6)">日出</button>
          <button type="button" class="btn" @click="snapHour(12)">正午</button>
          <button type="button" class="btn" @click="snapHour(18)">日落</button>
          <button type="button" class="btn" @click="snapHour(0)">子夜</button>
        </div>
        <div class="mode-tabs">
          <button type="button" :class="{ on: terminatorFocus === 'both' }" @click="terminatorFocus = 'both'">晨昏线</button>
          <button type="button" :class="{ on: terminatorFocus === 'dawn' }" @click="terminatorFocus = 'dawn'">晨线</button>
          <button type="button" :class="{ on: terminatorFocus === 'dusk' }" @click="terminatorFocus = 'dusk'">昏线</button>
        </div>
        <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
          {{ playing ? '暂停' : '播放自转+公转' }}
        </button>
        <div class="mode-tabs">
          <button
            v-for="v in DN_CAM_VIEWS"
            :key="v.id"
            type="button"
            :class="{ on: dnCamView === v.id }"
            @click="applyDayNightView(v.id)"
          >
            {{ v.label }}
          </button>
        </div>
      </template>

      <template v-else-if="isCoriolis">
        <div class="mode-tabs">
          <button type="button" :class="{ on: coriolisMode === 'top' }" @click="coriolisMode = 'top'">俯视</button>
          <button type="button" :class="{ on: coriolisMode === 'fp' }" @click="coriolisMode = 'fp'">地面第一人称</button>
          <button type="button" :class="{ on: coriolisMode === 'sphere' }" @click="coriolisMode = 'sphere'">地球箭头</button>
        </div>

        <label class="ctrl check">
          <input v-model="coriolisOn" type="checkbox" />
          地转偏向
        </label>
        <label class="ctrl check">
          <input v-model="fpPlaying" type="checkbox" />
          播放
        </label>
        <button type="button" class="btn" @click="restartThrow">重放</button>
        <span v-if="coriolisMode === 'top'" class="note">点圆盘重放 · 北右南左 · 赤道不偏</span>
        <span v-else-if="coriolisMode === 'fp'" class="note">左北右南 · 朝极地扔出 · 应用：北半球右岸冲刷更强</span>
        <span v-else class="note">南北半球同时示意 · 拖动旋转</span>
      </template>

      <template v-else-if="isTimezones">
        <label class="ctrl">
          <span>参考 UTC</span>
          <input v-model.number="tzUtcHour" type="range" min="0" max="23.9" step="0.1" />
          <em>{{ formatClock(tzUtcHour) }}</em>
        </label>
        <div class="cities">
          <span class="note">城 A</span>
          <button
            v-for="c in CITIES"
            :key="'a-' + c.id"
            type="button"
            class="chip"
            :class="{ on: tzCityA === c.id }"
            @click="tzCityA = c.id"
          >
            {{ c.name }}
          </button>
        </div>
        <div class="cities">
          <span class="note">城 B</span>
          <button
            v-for="c in CITIES"
            :key="'b-' + c.id"
            type="button"
            class="chip"
            :class="{ on: tzCityB === c.id }"
            @click="tzCityB = c.id"
          >
            {{ c.name }}
          </button>
        </div>
        <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
          {{ playing ? '暂停自转' : '慢速自转' }}
        </button>
        <span class="note">橙线=时区界 · 东加西减 · 15°≈1h · 拖转地球</span>
      </template>
    </div>

    <div v-if="isBasics" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside v-if="isBasicsDirection" class="hud hud-wide">
        <p class="hud-title">{{ poleSpinLabel }}</p>
        <p class="hud-row"><span>角速度</span><strong>{{ speedInfo.angular === 0 ? '0（极点）' : '≈15°/h' }}</strong></p>
        <p class="hud-row"><span>线速度</span><strong>{{ speedInfo.linear }} km/h</strong></p>
        <p class="hud-phase">赤道最大 · 向两极递减</p>
        <div class="period-box">
          <p><em>恒星日</em> 23h56m4s · 360° · 真周期</p>
          <p><em>太阳日</em> 24h · 假周期 · 日常生活</p>
        </div>
        <p class="hud-hint">地轴指向北极星附近 · 口诀 N逆 S顺 · 切到「恒星日·太阳日」看动画</p>
      </aside>
      <aside v-else-if="isBasicsPeriod" class="hud hud-period">
        <p class="hud-title">{{ periodHudTitle }}</p>
        <p class="hud-metric">{{ periodSpinVsNeed }}</p>
        <p class="hud-row"><span>公转（示意）</span><strong>{{ periodOrbitDeg.toFixed(0) }}° / {{ PERIOD_ORBIT_TEACH_DEG }}°</strong></p>
        <div class="period-track">
          <div class="period-track-fill" :style="{ width: `${periodProgress * 100}%` }" />
          <i class="period-mark sid" :style="{ left: `${PERIOD_SIDEREAL_T * 100}%` }" title="恒星日" />
        </div>
        <p class="hud-phase" :class="{ hot: siderealDone && !solarDone, ok: solarDone }">{{ periodPhaseLabel }}</p>
        <div class="period-box">
          <p v-if="periodKind !== 'solar'"><em>恒星日</em>360° · 23h56m · 对准恒星</p>
          <p v-if="periodKind !== 'sidereal'"><em>太阳日</em>360°+α · 24h · 对准太阳</p>
        </div>
        <p class="hud-hint">
          α={{ PERIOD_ORBIT_TEACH_DEG }}°示意（真≈{{ PERIOD_SOLAR_EXTRA_DEG.toFixed(2) }}°/日）· 灰线：太阳→起/恒/太 · 橙线：当前地球→太阳
        </p>
      </aside>
    </div>

    <div v-else-if="isDayNight" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud hud-wide">
        <p class="hud-title">{{ BEIJING.name }} · {{ localLabel }}</p>
        <p class="hud-row"><span>自转</span><strong>{{ dayPhase }} · 地方时对准太阳</strong></p>
        <p class="hud-row"><span>公转</span><strong>{{ dnOrbitDeg.toFixed(1) }}°</strong></p>
        <p class="hud-phase">
          公转示意 {{ ORBIT_TEACH_DEG_PER_DAY }}°/日（真≈{{ ORBIT_TRUE_DEG_PER_DAY.toFixed(2) }}°）· 地轴定向不变
        </p>
        <p class="hud-hint">可拖转/滚轮缩放/右键平移 · 太阳居中 · 晨昏⊥日地连线</p>
      </aside>
    </div>

    <div v-else-if="isTimezones" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud hud-wide">
        <p class="hud-title">理论时区 · 每 15°</p>
        <p class="hud-row">
          <span>{{ tzA.name }} 地方时</span><strong>{{ tzALocal }}</strong>
        </p>
        <p class="hud-row">
          <span>{{ tzA.name }} 区时</span><strong>{{ tzAZone }}</strong>
        </p>
        <p class="hud-row">
          <span>{{ tzB.name }} 地方时</span><strong>{{ tzBLocal }}</strong>
        </p>
        <p class="hud-row">
          <span>{{ tzB.name }} 区时</span><strong>{{ tzBZone }}</strong>
        </p>
        <p class="hud-phase">
          北京时间=东八区≈{{ beijingLocalVsZone.zone }} · 北京地方时≈{{ beijingLocalVsZone.local }}
        </p>
        <p class="hud-hint">蓝线=中时区（UTC±0）两侧界 · 金线=东八区两侧界 · 橙线=其余时区界</p>
      </aside>
    </div>

    <svg
      v-show="isCoriolis && coriolisMode === 'top'"
      ref="svgRef"
      class="canvas"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
    />
    <canvas v-show="isCoriolis && coriolisMode === 'fp'" ref="fpCanvasRef" class="globe" />
    <canvas v-show="isCoriolis && coriolisMode === 'sphere'" ref="sphereCanvasRef" class="globe" />
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
.mode-tabs {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.mode-tabs button {
  font-size: 12px;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--text-500);
  cursor: pointer;
}
.mode-tabs button + button {
  border-left: 1px solid var(--border);
}
.mode-tabs button.on {
  background: var(--bg-canvas);
  color: var(--text-700);
  font-weight: 600;
}
.ctrl {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-500);
}
.ctrl input[type='range'] {
  width: 140px;
}
.ctrl em {
  font-style: normal;
  color: var(--text-700);
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
}
.check {
  cursor: pointer;
  user-select: none;
}
.note {
  font-size: 11px;
  color: var(--text-400);
}
.snaps,
.cities {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--primary, #4cc9f0);
  color: var(--primary-mid, #7dd8f0);
  background: rgba(76, 201, 240, 0.12);
  font-weight: 600;
}
.btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-canvas);
  color: var(--text-700);
  cursor: pointer;
}
.btn.on {
  border-color: var(--primary, #4cc9f0);
  color: var(--primary-mid, #7dd8f0);
}
.btn:hover {
  border-color: var(--text-400);
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
  width: 168px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(8, 14, 28, 0.82);
  border: 1px solid rgba(76, 201, 240, 0.25);
  pointer-events: none;
}
.hud-wide {
  width: 220px;
}
.hud-period {
  width: 248px;
  padding: 12px 14px;
  background: linear-gradient(160deg, rgba(10, 18, 34, 0.9), rgba(8, 14, 28, 0.84));
  border-color: rgba(232, 184, 74, 0.28);
}
.hud-title {
  margin: 0;
  font-size: 11px;
  color: #8aa0b4;
}
.hud-metric {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: #ffe08a;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.period-track {
  position: relative;
  margin: 10px 0 4px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: visible;
}
.period-track-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4ecadb, #e8b84a);
  transition: width 0.05s linear;
}
.period-mark {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 12px;
  margin: -6px 0 0 -1px;
  border-radius: 1px;
  pointer-events: none;
}
.period-mark.sid {
  background: #d94f9c;
  box-shadow: 0 0 0 2px rgba(8, 14, 28, 0.65);
}
.period-scrub {
  min-width: 200px;
}
.hud-time {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 600;
  color: #ffe08a;
  font-variant-numeric: tabular-nums;
}
.hud-phase {
  margin: 2px 0 0;
  font-size: 11px;
  color: #5ec8f0;
}
.hud-phase.hot {
  color: #ff9f43;
}
.hud-phase.ok {
  color: #7dffb0;
}
.hud-hint {
  margin: 8px 0 0;
  font-size: 10px;
  color: #5a7388;
  line-height: 1.4;
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
  font-variant-numeric: tabular-nums;
}
.period-box {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(76, 201, 240, 0.2);
}
.period-box p {
  margin: 0 0 4px;
  font-size: 10px;
  color: #9ec9e8;
  line-height: 1.35;
}
.period-box em {
  font-style: normal;
  color: #ffe08a;
  margin-right: 6px;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
