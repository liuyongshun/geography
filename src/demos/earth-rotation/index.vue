<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
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
const tzSvgRef = ref<SVGSVGElement | null>(null)
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
const periodAnim = ref(0)
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

// —— 昼夜 / 通用 Three ——
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let globeRoot: THREE.Group | null = null
let pathGroup: THREE.Group | null = null
let sunLight: THREE.DirectionalLight | null = null
let sunMesh: THREE.Object3D | null = null
let sunLookAt: ((c: THREE.Camera) => void) | null = null
let beijingMarker: THREE.Object3D | null = null
let userOrbiting = false
const _bjWorld = new THREE.Vector3()
let disposables: THREE.Object3D[] = []
let raf = 0
let disposed = false
let lastT = 0
/** day-night | sphere | basics */
let threeMode: 'day-night' | 'sphere' | 'basics' | null = null
let terminatorRing: THREE.Line | null = null
let dawnHighlight: THREE.Mesh | null = null
let duskHighlight: THREE.Mesh | null = null
let dayHemLabel: THREE.Sprite | null = null
let nightHemLabel: THREE.Sprite | null = null
let spinArrowMesh: THREE.Mesh | null = null
let spinArcLine: THREE.Line | null = null
let latitudeRing: THREE.Line | null = null
let latMarker: THREE.Mesh | null = null
let periodPhase = 0
let lastSpeedLat = -1
/** 恒星日/太阳日场景 */
let periodOrbitRoot: THREE.Group | null = null
let periodEarthSpin: THREE.Group | null = null
let periodMarker: THREE.Group | null = null
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
  beijingMarker = null
  userOrbiting = false
  sunLight = null
  sunMesh = null
  sunLookAt = null
  terminatorRing = null
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
  periodMarker = null
  periodSunLine = null
  periodOrbitArc = null
  periodGuideGroup = null
  periodGhostGroup = null
  periodLabelGroup = null
  basicsSceneKind = null
  for (const obj of disposables) disposeObj(obj)
  disposables = []
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
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.position.set(x, y, z)
  sprite.renderOrder = 10
  const s = opts?.scale ?? 1
  // 按像素比例缩放，保证中文完整可见
  const worldW = (canvas.width / 64) * 11 * s
  const worldH = (canvas.height / 64) * 11 * s
  sprite.scale.set(worldW, worldH, 1)
  return sprite
}

function latLonToVec(lat: number, lon: number, r: number) {
  const φ = (lat * Math.PI) / 180
  const λ = (lon * Math.PI) / 180
  return new THREE.Vector3(Math.cos(φ) * Math.sin(λ), Math.sin(φ), Math.cos(φ) * Math.cos(λ)).multiplyScalar(r)
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

function addAxisAndPoles(group: THREE.Group, R: number) {
  const axisLen = R * 2 + 48
  group.add(
    addDisposable(
      new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, axisLen, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
    ),
  )
  const poleN = new THREE.Mesh(new THREE.ConeGeometry(3.0, 9, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  poleN.position.y = axisLen / 2 + 2
  group.add(addDisposable(poleN))
  const poleS = new THREE.Mesh(new THREE.ConeGeometry(3.0, 9, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  poleS.position.y = -(axisLen / 2 + 2)
  poleS.rotation.x = Math.PI
  group.add(addDisposable(poleS))
  group.add(addDisposable(makeLabelSprite('北', 0, axisLen / 2 + 16, 0, { scale: 0.85 })))
  group.add(addDisposable(makeLabelSprite('南', 0, -(axisLen / 2 + 16), 0, { scale: 0.85 })))
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

function initThreeCanvas(mode: 'day-night' | 'sphere' | 'basics') {
  const canvas = mode === 'sphere' ? sphereCanvasRef.value : canvasRef.value
  if (!canvas || !wrapRef.value) return false
  disposed = false
  disposables = []
  beijingMarker = null
  userOrbiting = false
  threeMode = mode
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(280, wrapRef.value.clientHeight - 48)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050814)
  camera = new THREE.PerspectiveCamera(38, w / h, 1, 1200)
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
    controls.minDistance = 140
    controls.maxDistance = 420
    controls.addEventListener('start', () => {
      playing.value = false
      userOrbiting = true
    })
    controls.addEventListener('end', () => {
      userOrbiting = false
    })
  }

  scene.add(new THREE.AmbientLight(0x1a2838, 0.4))
  const fill = new THREE.DirectionalLight(0x4a6a90, 0.22)
  fill.position.set(-160, -20, -80)
  scene.add(fill)

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
    disposeObj(latMarker)
    latMarker = null
  }
  if (lat >= 89.5) {
    latMarker = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
    latMarker.position.set(0, R, 0)
    globeRoot.add(addDisposable(latMarker))
    return
  }
  const φ = (lat * Math.PI) / 180
  const y = Math.sin(φ) * R
  const rr = Math.cos(φ) * R
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr))
  }
  latitudeRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.95 }),
  )
  globeRoot.add(addDisposable(latitudeRing))

  const a0 = periodPhase * Math.PI * 2
  const p = new THREE.Vector3(Math.sin(a0) * (rr + 2), y, Math.cos(a0) * (rr + 2))
  latMarker = new THREE.Mesh(new THREE.ConeGeometry(2.4, 7, 10), new THREE.MeshBasicMaterial({ color: 0xff9f43 }))
  latMarker.position.copy(p)
  const tangent = new THREE.Vector3(Math.cos(a0), 0, -Math.sin(a0))
  latMarker.lookAt(p.clone().add(tangent))
  latMarker.rotateX(Math.PI / 2)
  globeRoot.add(addDisposable(latMarker))
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

  const earth = buildEarthSphere(R)
  globeRoot.add(addDisposable(earth))
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.4, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }),
      ),
    ),
  )

  addAxisAndPoles(globeRoot, R)
  addSpinDirectionArc(globeRoot, R, 8)

  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.sin(a) * (R + 0.6), 0, Math.cos(a) * (R + 0.6)))
    }
    globeRoot.add(
      addDisposable(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5ec8f0, opacity: 0.7, transparent: true })),
      ),
    )
  }

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
        scale: 0.58 * 4,
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

  const starHalf = PERIOD_ORBIT_R * 0.72
  const addStarRef = (x: number, dashed: boolean, opacity: number) => {
    periodGuideGroup!.add(
      addDisposable(
        makePeriodLine(
          new THREE.Vector3(x, -starHalf * 0.85, -1),
          new THREE.Vector3(x, starHalf * 0.35, -1),
          0x4ecadb,
          { dashed, opacity },
        ),
      ),
    )
  }
  // 起点与太阳共线（p0.x === 0），只画一条
  addStarRef(0, false, 0.75)
  addStarRef(pSid.x, false, 0.75)
  addStarRef(pSol.x, true, 0.35)

  periodGuideGroup.add(addDisposable(makePeriodLine(new THREE.Vector3(0, 0, -0.5), p0.clone().setZ(-0.5), 0xd8e4f0, { opacity: 0.85 })))
  periodGuideGroup.add(
    addDisposable(makePeriodLine(new THREE.Vector3(0, 0, -0.5), pSid.clone().setZ(-0.5), 0xd8e4f0, { dashed: true, opacity: 0.4 })),
  )
  periodGuideGroup.add(addDisposable(makePeriodLine(new THREE.Vector3(0, 0, -0.5), pSol.clone().setZ(-0.5), 0xd8e4f0, { opacity: 0.75 })))

  for (const [p, label] of [
    [p0, '起'],
    [pSid, '恒'],
    [pSol, '太'],
  ] as const) {
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    dot.position.set(p.x, p.y, 0.8)
    periodGhostGroup.add(addDisposable(dot))
    periodGhostGroup.add(addDisposable(makeLabelSprite(label, p.x, p.y - 14, 2, { scale: 0.45 })))
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
  periodLabelGroup.add(
    addDisposable(makeLabelSprite('遥远恒星方向', pSid.x * 0.55, starHalf * 0.28, 3, { scale: 0.5 })),
  )

  periodOrbitRoot = new THREE.Group()
  scene.add(periodOrbitRoot)
  periodEarthSpin = new THREE.Group()
  periodOrbitRoot.add(periodEarthSpin)

  const earth = buildEarthSphere(PERIOD_EARTH_R)
  ;(earth.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.35
  periodEarthSpin.add(addDisposable(earth))

  periodMarker = new THREE.Group()
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, PERIOD_EARTH_R + 9, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  )
  shaft.position.y = (PERIOD_EARTH_R + 9) / 2
  periodMarker.add(addDisposable(shaft))
  const tip = new THREE.Mesh(new THREE.ConeGeometry(2.1, 6, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  tip.position.y = PERIOD_EARTH_R + 11
  periodMarker.add(addDisposable(tip))
  periodEarthSpin.add(periodMarker)

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
  if (!initThreeCanvas('day-night') || !globeRoot || !scene || !canvasRef.value) return
  const R = 72

  sunLight = new THREE.DirectionalLight(0xfff1d0, 1.55)
  sunLight.position.set(220, 40, 0)
  scene.add(sunLight)

  const sunVis = makeSunBillboard(16)
  sunMesh = sunVis.group
  sunLookAt = sunVis.lookAt
  sunMesh.position.copy(sunLight.position).setLength(240)
  scene.add(addDisposable(sunMesh))

  const earth = buildEarthSphere(R)
  ;(earth.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.55
  globeRoot.add(addDisposable(earth))

  globeRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.8, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
      ),
    ),
  )

  addAxisAndPoles(globeRoot, R)
  addSpinDirectionArc(globeRoot, R, 10)

  // 晨昏线：太阳在 +X，分界在 YZ 平面大圆
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2
      pts.push(new THREE.Vector3(0, Math.cos(a) * (R + 0.8), Math.sin(a) * (R + 0.8)))
    }
    terminatorRing = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 }),
    )
    globeRoot.add(addDisposable(terminatorRing))
  }

  // 晨线 / 昏线高亮弧（半圈 torus）
  {
    dawnHighlight = new THREE.Mesh(
      new THREE.TorusGeometry(R + 1.2, 0.9, 8, 48, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x5ec8f0, transparent: true, opacity: 0.85 }),
    )
    dawnHighlight.rotation.y = Math.PI / 2
    dawnHighlight.rotation.z = Math.PI / 2
    globeRoot.add(addDisposable(dawnHighlight))

    duskHighlight = new THREE.Mesh(
      new THREE.TorusGeometry(R + 1.2, 0.9, 8, 48, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.85 }),
    )
    duskHighlight.rotation.y = Math.PI / 2
    duskHighlight.rotation.z = -Math.PI / 2
    globeRoot.add(addDisposable(duskHighlight))
  }

  dayHemLabel = makeLabelSprite('昼半球', R * 0.85, 12, 0, { scale: 0.72 })
  nightHemLabel = makeLabelSprite('夜半球', -R * 0.85, 12, 0, { scale: 0.72 })
  globeRoot.add(addDisposable(dayHemLabel))
  globeRoot.add(addDisposable(nightHemLabel))
  globeRoot.add(addDisposable(makeLabelSprite('晨线', 4, R * 0.55, R * 0.75, { scale: 0.55 })))
  globeRoot.add(addDisposable(makeLabelSprite('昏线', 4, R * 0.55, -R * 0.75, { scale: 0.55 })))

  syncTerminatorFocus()

  // 只标北京，镜头与昼夜都以它为准
  const p = latLonToVec(BEIJING.lat, BEIJING.lon, R + 1.8)
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 16, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  )
  marker.position.copy(p)
  globeRoot.add(addDisposable(marker))
  beijingMarker = marker
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 4.6, 28),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  )
  halo.position.copy(p)
  halo.lookAt(0, 0, 0)
  globeRoot.add(addDisposable(halo))
  const lp = latLonToVec(BEIJING.lat, BEIJING.lon, R + 12)
  globeRoot.add(addDisposable(makeLabelSprite(BEIJING.name, lp.x, lp.y, lp.z, { scale: 0.72 })))

  lastT = performance.now()
  applyBeijingTime()
  frameBeijing(true)
  loopThree()
}

function syncTerminatorFocus() {
  const f = terminatorFocus.value
  if (dawnHighlight) dawnHighlight.visible = f === 'both' || f === 'dawn'
  if (duskHighlight) duskHighlight.visible = f === 'both' || f === 'dusk'
  if (terminatorRing) {
    const mat = terminatorRing.material as THREE.LineBasicMaterial
    mat.opacity = f === 'both' ? 0.95 : 0.35
  }
}

function beijingNoonSpin() {
  const v = latLonToVec(BEIJING.lat, BEIJING.lon, 1)
  return Math.atan2(v.z, v.x)
}

/** 正午北京朝向太阳（+X）；hour 为北京地方时 */
function applyBeijingTime() {
  if (!globeRoot) return
  const t = localHour.value
  globeRoot.rotation.y = beijingNoonSpin() + ((t - 12) / 24) * Math.PI * 2
}

function frameBeijing(force = false) {
  if (!camera || !globeRoot || !controls) return
  if (userOrbiting && !force) return
  if (beijingMarker) beijingMarker.getWorldPosition(_bjWorld)
  else {
    _bjWorld.copy(latLonToVec(BEIJING.lat, BEIJING.lon, 1))
    _bjWorld.applyAxisAngle(new THREE.Vector3(0, 1, 0), globeRoot.rotation.y)
  }
  if (_bjWorld.lengthSq() < 1e-6) return
  const dist = force ? 250 : Math.min(400, Math.max(160, camera.position.length()))
  camera.position.copy(_bjWorld).normalize().multiplyScalar(dist)
  controls.target.set(0, 0, 0)
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)
}

function snapHour(h: number) {
  playing.value = false
  hour.value = h
  applyBeijingTime()
  frameBeijing(true)
}

function loopThree() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loopThree)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  if (threeMode === 'day-night' && globeRoot) {
    if (playing.value) hour.value = (hour.value + dt * 0.7) % 24
    applyBeijingTime()
    if (playing.value || !userOrbiting) frameBeijing()
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
    if (playing.value) {
      periodPhase = (periodPhase + dt * 0.12) % 1
      globeRoot.rotation.y += dt * 0.35
      periodAnim.value = periodPhase
      if (latMarker && speedInfo.value.lat < 89.5) {
        const R = 72
        const φ = (speedInfo.value.lat * Math.PI) / 180
        const y = Math.sin(φ) * R
        const rr = Math.cos(φ) * R
        const a0 = periodPhase * Math.PI * 2
        const p = new THREE.Vector3(Math.sin(a0) * (rr + 2), y, Math.cos(a0) * (rr + 2))
        latMarker.position.copy(p)
        const tangent = new THREE.Vector3(Math.cos(a0), 0, -Math.sin(a0))
        latMarker.lookAt(p.clone().add(tangent))
        latMarker.rotateX(Math.PI / 2)
      }
    }
    controls?.update()
  } else if (threeMode === 'sphere') {
    updateSphereArrows(dt)
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

  scene.add(new THREE.AmbientLight(0x445566, 0.4))
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.25)
  sun.position.set(120, 60, 80)
  scene.add(sun)

  globeRoot = new THREE.Group()
  scene.add(globeRoot)

  const R = sphereR
  const tex = new THREE.TextureLoader().load('/textures/earth-blue-marble.jpg')
  tex.colorSpace = THREE.SRGBColorSpace
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshPhongMaterial({ map: tex, shininess: 6 })),
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
function startTopThrow() {
  teardownTop()
  topDisposed = false
  topThrowT.value = 0
  topLastT = performance.now()
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
  },
) {
  const r = 112
  const { cx, cy } = opt
  const t = Math.min(1, Math.max(0, topThrowT.value))

  svg.append('text').attr('x', cx).attr('y', 30).attr('text-anchor', 'middle').attr('fill', '#d8e4f0').attr('font-size', 12).attr('font-weight', 600).text(opt.title)

  const disk = svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', r)
    .attr('fill', opt.fill)
    .attr('stroke', '#4a90c8')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
  disk.on('click', () => {
    topThrowT.value = 0
    fpPlaying.value = true
  })

  // 纬线圈
  for (const f of [0.35, 0.62, 0.88]) {
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r * f).attr('fill', 'none').attr('stroke', '#2a4a68').attr('stroke-width', 1).attr('opacity', 0.7)
  }
  svg.append('text').attr('x', cx).attr('y', cy + r - 12).attr('text-anchor', 'middle').attr('fill', '#6a849c').attr('font-size', 10).text('赤道')

  const eastX = opt.eastOnRight ? cx + r - 14 : cx - r + 14
  const westX = opt.eastOnRight ? cx - r + 14 : cx + r - 14
  svg.append('text').attr('x', eastX).attr('y', cy + 3).attr('text-anchor', 'middle').attr('fill', '#6a849c').attr('font-size', 10).text('东')
  svg.append('text').attr('x', westX).attr('y', cy + 3).attr('text-anchor', 'middle').attr('fill', '#6a849c').attr('font-size', 10).text('西')

  svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4).attr('fill', '#ffe08a').attr('opacity', 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 500)))
  svg.append('text').attr('x', cx).attr('y', cy - 10).attr('text-anchor', 'middle').attr('fill', '#ffe08a').attr('font-size', 10).text('极')

  const spinR = r + 14
  const span = 0.95
  const aStart = opt.clockwise ? -span : span
  const aEnd = opt.clockwise ? span : -span
  const spinOff = ((performance.now() / 28) % 40) * (opt.clockwise ? 1 : -1)
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
  svg
    .append('line')
    .attr('x1', x0)
    .attr('y1', y0)
    .attr('x2', x1)
    .attr('y2', y1)
    .attr('stroke', '#8aa0b4')
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', '6 5')
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

function drawTimezones() {
  const el = tzSvgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()

  const width = W
  const height = H
  svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#080c12').attr('rx', 12)

  const defs = svg.append('defs')
  defs
    .append('marker')
    .attr('id', 'arr-east')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#6ec8f0')

  const margin = { top: 36, right: 24, bottom: 56, left: 24 }
  const bw = width - margin.left - margin.right
  const bh = 120
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  // 时区带：-12 … +12，中央为 0
  const zones = d3.range(-12, 13)
  const x = d3.scaleBand<number>().domain(zones).range([0, bw]).paddingInner(0.04)

  for (const z of zones) {
    const isZero = z === 0
    const isE8 = z === 8
    const fill = isE8 ? 'rgba(255, 224, 138, 0.28)' : isZero ? 'rgba(94, 200, 240, 0.18)' : 'rgba(40, 70, 100, 0.45)'
    g.append('rect')
      .attr('x', x(z)!)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', bh)
      .attr('fill', fill)
      .attr('stroke', isE8 || isZero ? '#ffe08a' : '#2a4a68')
      .attr('stroke-width', isE8 || isZero ? 1.5 : 0.6)
    const label = z === 0 ? '中' : z > 0 ? `东${z}` : `西${Math.abs(z)}`
    g.append('text')
      .attr('x', x(z)! + x.bandwidth() / 2)
      .attr('y', bh / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', isE8 ? '#ffe08a' : '#9ec9e8')
      .attr('font-size', 9)
      .attr('font-weight', isE8 || isZero ? 600 : 400)
      .text(z === 12 || z === -12 ? '东西十二' : label)
  }

  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', 22)
    .attr('text-anchor', 'middle')
    .attr('fill', '#d8e4f0')
    .attr('font-size', 12)
    .attr('font-weight', 600)
    .text('理论时区（每 15°）· 教学示意')

  // 东加西减箭头
  const ay = margin.top + bh + 28
  svg
    .append('line')
    .attr('x1', margin.left + 40)
    .attr('y1', ay)
    .attr('x2', width - margin.right - 40)
    .attr('y2', ay)
    .attr('stroke', '#6ec8f0')
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#arr-east)')
  svg.append('text').attr('x', width / 2).attr('y', ay - 8).attr('text-anchor', 'middle').attr('fill', '#6ec8f0').attr('font-size', 10).text('向东：区时更早（加） · 向西：区时更晚（减）')

  // 城市对比卡
  const cardY = ay + 24
  const cardH = 150
  const cardW = (width - margin.left - margin.right - 12) / 2
  const cards = [
    { city: tzA.value, local: tzALocal.value, zone: tzAZone.value, x: margin.left },
    { city: tzB.value, local: tzBLocal.value, zone: tzBZone.value, x: margin.left + cardW + 12 },
  ]
  for (const card of cards) {
    const cg = svg.append('g').attr('transform', `translate(${card.x},${cardY})`)
    cg.append('rect').attr('width', cardW).attr('height', cardH).attr('rx', 10).attr('fill', 'rgba(16,24,36,0.92)').attr('stroke', 'rgba(76,201,240,0.25)')
    cg.append('text').attr('x', 14).attr('y', 24).attr('fill', '#d8e4f0').attr('font-size', 12).attr('font-weight', 600).text(card.city.name)
    cg.append('text').attr('x', 14).attr('y', 46).attr('fill', '#8aa0b4').attr('font-size', 10).text(`经度 ${card.city.lon}° · 时区 ${card.city.zone >= 0 ? '东' : '西'}${Math.abs(card.city.zone)}`)
    cg.append('text').attr('x', 14).attr('y', 72).attr('fill', '#8aa0b4').attr('font-size', 10).text('地方时')
    cg.append('text').attr('x', 14).attr('y', 94).attr('fill', '#5ec8f0').attr('font-size', 20).attr('font-weight', 600).text(card.local)
    cg.append('text').attr('x', 14).attr('y', 118).attr('fill', '#8aa0b4').attr('font-size', 10).text('区时')
    cg.append('text').attr('x', 14).attr('y', 140).attr('fill', '#ffe08a').attr('font-size', 20).attr('font-weight', 600).text(card.zone)
  }

  // 北京时间辨析底栏
  const bj = beijingLocalVsZone.value
  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', height - 14)
    .attr('text-anchor', 'middle')
    .attr('fill', '#ff9f43')
    .attr('font-size', 10)
    .text(`北京时间 = 东八区区时（120°E）≈ ${bj.zone}  ·  北京地方时（116.4°E）≈ ${bj.local}  ·  二者不同`)
}

function enterStep(id: string) {
  teardownThree()
  teardownFp()
  teardownTop()
  if (id === 'basics') requestAnimationFrame(() => setupBasics())
  else if (id === 'day-night') requestAnimationFrame(() => setupDayNight())
  else if (id === 'coriolis') enterCoriolisMode(coriolisMode.value)
  else if (id === 'timezones') requestAnimationFrame(() => drawTimezones())
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

watch([tzCityA, tzCityB, tzUtcHour], () => {
  if (props.stepId === 'timezones') drawTimezones()
})

function onResize() {
  if (!wrapRef.value) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(280, wrapRef.value.clientHeight - 48)
  if (isDayNight.value || isBasics.value || (isCoriolis.value && coriolisMode.value === 'sphere')) {
    if (!renderer || !camera) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  } else if (isCoriolis.value && coriolisMode.value === 'fp') {
    resizeFp()
  } else if (isTimezones.value) {
    drawTimezones()
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
          {{ playing ? '暂停自转' : '继续自转' }}
        </button>
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
        <span class="note">东加西减 · 15°≈1 时区</span>
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
        <p class="hud-hint">α={{ PERIOD_ORBIT_TEACH_DEG }}°示意（真≈{{ PERIOD_SOLAR_EXTRA_DEG.toFixed(2) }}°）· 青线∥恒星 · 橙线→太阳</p>
      </aside>
    </div>

    <div v-else-if="isDayNight" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud hud-wide">
        <p class="hud-title">{{ BEIJING.name }}</p>
        <p class="hud-time">{{ localLabel }}</p>
        <p class="hud-phase">{{ dayPhase }} · 地方时</p>
        <p class="hud-hint">形成：球体不透明不发光 · 交替：自转 · 晨昏线相对地表自东向西</p>
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

    <svg
      v-show="isTimezones"
      ref="tzSvgRef"
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
