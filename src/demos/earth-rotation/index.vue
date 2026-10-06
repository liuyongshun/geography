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
const selectedCityId = ref<string>('beijing')
const topThrowT = ref(0)

const CITIES = [
  { id: 'beijing', name: '北京', lat: 39.9, lon: 116.4 },
  { id: 'london', name: '伦敦', lat: 51.5, lon: 0 },
  { id: 'newyork', name: '纽约', lat: 40.7, lon: -74 },
  { id: 'sydney', name: '悉尼', lat: -33.9, lon: 151.2 },
] as const

const W = 760
const H = 440

const isDayNight = computed(() => props.stepId === 'day-night')
const isCoriolis = computed(() => props.stepId === 'coriolis')

const selectedCity = computed(() => CITIES.find((c) => c.id === selectedCityId.value) ?? CITIES[0])
const localHour = computed(() => {
  const h = hour.value + selectedCity.value.lon / 15
  return ((h % 24) + 24) % 24
})
const localLabel = computed(() => {
  const h = Math.floor(localHour.value)
  const m = Math.floor((localHour.value % 1) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})
const dayPhase = computed(() => {
  const h = localHour.value
  if (h >= 5 && h < 8) return '清晨'
  if (h >= 8 && h < 17) return '白天'
  if (h >= 17 && h < 20) return '黄昏'
  return '夜晚'
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
let cityMarkers: THREE.Mesh[] = []
let raycaster: THREE.Raycaster | null = null
let pointer = new THREE.Vector2()
let disposables: THREE.Object3D[] = []
let raf = 0
let disposed = false
let lastT = 0
/** day-night | sphere */
let threeMode: 'day-night' | 'sphere' | null = null

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
  canvasRef.value?.removeEventListener('pointerdown', onGlobePointer)
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
  cityMarkers = []
  sunLight = null
  sunMesh = null
  sunLookAt = null
  raycaster = null
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

function makeLabelSprite(text: string, x: number, y: number, z: number, opts?: { scale?: number }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 36
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  const padX = 18
  const padY = 12
  canvas.width = tw + padX * 2
  canvas.height = fontSize + padY * 2
  // 重设字体（改 canvas 尺寸会重置状态）
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 底衬，避免被轨迹线切开
  const rx = 10
  ctx.fillStyle = 'rgba(7, 11, 22, 0.82)'
  ctx.beginPath()
  const w = canvas.width
  const h = canvas.height
  ctx.moveTo(rx, 0)
  ctx.arcTo(w, 0, w, h, rx)
  ctx.arcTo(w, h, 0, h, rx)
  ctx.arcTo(0, h, 0, 0, rx)
  ctx.arcTo(0, 0, w, 0, rx)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffe08a'
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

// ========== 昼夜更替 ==========
function setupDayNight() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  disposables = []
  cityMarkers = []
  threeMode = 'day-night'
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(280, wrapRef.value.clientHeight - 48)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050814)
  camera = new THREE.PerspectiveCamera(38, w / h, 1, 1200)
  camera.position.set(0, 36, 320)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 160
  controls.maxDistance = 520
  controls.target.set(0, 0, 0)
  controls.addEventListener('start', () => {
    playing.value = false
  })

  // 星空
  {
    const n = 900
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

  scene.add(new THREE.AmbientLight(0x1a2838, 0.35))
  sunLight = new THREE.DirectionalLight(0xfff1d0, 1.55)
  sunLight.position.set(220, 40, 0)
  scene.add(sunLight)
  const fill = new THREE.DirectionalLight(0x4a6a90, 0.18)
  fill.position.set(-160, -20, -80)
  scene.add(fill)

  // 太阳：SDO/HMI 日面（去掉方图黑底，始终朝向相机）
  const sunVis = makeSunBillboard(16)
  sunMesh = sunVis.group
  sunLookAt = sunVis.lookAt
  sunMesh.position.copy(sunLight.position).setLength(240)
  scene.add(addDisposable(sunMesh))

  globeRoot = new THREE.Group()
  scene.add(globeRoot)

  const R = 72
  const loader = new THREE.TextureLoader()
  const dayTex = loader.load('/textures/earth-blue-marble.jpg')
  dayTex.colorSpace = THREE.SRGBColorSpace
  const nightTex = loader.load('/textures/earth-night.jpg')
  nightTex.colorSpace = THREE.SRGBColorSpace
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, 72, 56),
    new THREE.MeshPhongMaterial({
      map: dayTex,
      emissiveMap: nightTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
      shininess: 12,
      specular: new THREE.Color(0x335566),
    }),
  )
  globeRoot.add(addDisposable(earth))

  // 大气晕
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.8, 48, 32),
        new THREE.MeshBasicMaterial({
          color: 0x6eb6ff,
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      ),
    ),
  )
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 1.2, 48, 32),
        new THREE.MeshBasicMaterial({
          color: 0x9ad0ff,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
        }),
      ),
    ),
  )

  const axisLen = R * 2 + 48
  globeRoot.add(
    addDisposable(
      new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, axisLen, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
    ),
  )
  const poleN = new THREE.Mesh(new THREE.ConeGeometry(3.0, 9, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  poleN.position.y = axisLen / 2 + 2
  globeRoot.add(addDisposable(poleN))
  const poleS = new THREE.Mesh(new THREE.ConeGeometry(3.0, 9, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  poleS.position.y = -(axisLen / 2 + 2)
  poleS.rotation.x = Math.PI
  globeRoot.add(addDisposable(poleS))
  globeRoot.add(addDisposable(makeLabelSprite('北', 0, axisLen / 2 + 16, 0, { scale: 0.85 })))
  globeRoot.add(addDisposable(makeLabelSprite('南', 0, -(axisLen / 2 + 16), 0, { scale: 0.85 })))

  // 自转方向弧 + 箭头
  const arcPts: THREE.Vector3[] = []
  for (let a = -0.95; a <= 0.95; a += 0.06) {
    arcPts.push(new THREE.Vector3(Math.sin(a) * (R + 10), 10, Math.cos(a) * (R + 10)))
  }
  globeRoot.add(
    addDisposable(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arcPts),
        new THREE.LineBasicMaterial({ color: 0x6ec8f0, transparent: true, opacity: 0.85 }),
      ),
    ),
  )
  const spinArrow = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7.5, 10), new THREE.MeshBasicMaterial({ color: 0x6ec8f0 }))
  const tip = arcPts[arcPts.length - 1]!
  spinArrow.position.copy(tip)
  spinArrow.lookAt(tip.clone().add(new THREE.Vector3(1, 0, -0.25)))
  spinArrow.rotateX(Math.PI / 2)
  globeRoot.add(addDisposable(spinArrow))
  globeRoot.add(addDisposable(makeLabelSprite('自西向东', tip.x * 1.15, tip.y + 8, tip.z * 1.15, { scale: 0.7 })))

  // 城市标记
  for (const c of CITIES) {
    const p = latLonToVec(c.lat, c.lon, R + 1.6)
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 14, 12),
      new THREE.MeshBasicMaterial({ color: c.id === selectedCityId.value ? 0xffe08a : 0x5ec8f0 }),
    )
    marker.position.copy(p)
    marker.userData.cityId = c.id
    globeRoot.add(addDisposable(marker))
    cityMarkers.push(marker)
    const lp = latLonToVec(c.lat, c.lon, R + 10)
    const spr = makeLabelSprite(c.name, lp.x, lp.y, lp.z, { scale: 0.62 })
    spr.userData.cityId = c.id
    globeRoot.add(addDisposable(spr))
  }

  raycaster = new THREE.Raycaster()
  canvasRef.value.addEventListener('pointerdown', onGlobePointer)

  syncCityMarkers()
  lastT = performance.now()
  loopThree()
}

function syncCityMarkers() {
  for (const m of cityMarkers) {
    const mat = m.material as THREE.MeshBasicMaterial
    mat.color.set(m.userData.cityId === selectedCityId.value ? 0xffe08a : 0x5ec8f0)
    m.scale.setScalar(m.userData.cityId === selectedCityId.value ? 1.35 : 1)
  }
}

function onGlobePointer(e: PointerEvent) {
  if (threeMode !== 'day-night' || !renderer || !camera || !globeRoot || !raycaster) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(cityMarkers, false)
  if (hits[0]?.object.userData.cityId) {
    selectedCityId.value = String(hits[0].object.userData.cityId)
    syncCityMarkers()
  }
}

function snapHour(h: number) {
  playing.value = false
  hour.value = h
}

function selectCity(id: string) {
  selectedCityId.value = id
  syncCityMarkers()
}

function loopThree() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loopThree)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  if (threeMode === 'day-night' && globeRoot) {
    if (playing.value) hour.value = (hour.value + dt * 0.7) % 24
    // 地球转；太阳相对固定在 +X，贴图经度与地方时对齐
    globeRoot.rotation.y = ((hour.value - 12) / 24) * Math.PI * 2
    if (camera && sunLookAt) sunLookAt(camera)
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
    .text(coriolisOn.value ? '口诀：北右南左 · 点圆盘可重放' : '关掉偏向后，两条线重合')
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

function enterStep(id: string) {
  teardownThree()
  teardownFp()
  teardownTop()
  if (id === 'day-night') requestAnimationFrame(() => setupDayNight())
  else if (id === 'coriolis') enterCoriolisMode(coriolisMode.value)
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

watch(selectedCityId, () => {
  if (threeMode === 'day-night') syncCityMarkers()
})

function onResize() {
  if (!wrapRef.value) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(280, wrapRef.value.clientHeight - 48)
  if (isDayNight.value || (isCoriolis.value && coriolisMode.value === 'sphere')) {
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
      <template v-if="isDayNight">
        <label class="ctrl">
          <span>世界时</span>
          <input v-model.number="hour" type="range" min="0" max="23.9" step="0.1" />
          <em>{{ String(Math.floor(hour)).padStart(2, '0') }}:00</em>
        </label>
        <div class="snaps">
          <button type="button" class="btn" @click="snapHour(6)">日出</button>
          <button type="button" class="btn" @click="snapHour(12)">正午</button>
          <button type="button" class="btn" @click="snapHour(18)">日落</button>
          <button type="button" class="btn" @click="snapHour(0)">子夜</button>
        </div>
        <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
          {{ playing ? '暂停自转' : '继续自转' }}
        </button>
        <div class="cities">
          <button
            v-for="c in CITIES"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ on: selectedCityId === c.id }"
            @click="selectCity(c.id)"
          >
            {{ c.name }}
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
        <span v-if="coriolisMode === 'top'" class="note">点圆盘重放 · 北右南左</span>
        <span v-else-if="coriolisMode === 'fp'" class="note">左北右南 · 朝极地扔出</span>
        <span v-else class="note">南北半球同时示意 · 拖动旋转</span>
      </template>
    </div>

    <div v-if="isDayNight" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud">
        <p class="hud-title">{{ selectedCity.name }}</p>
        <p class="hud-time">{{ localLabel }}</p>
        <p class="hud-phase">{{ dayPhase }} · 地方时</p>
        <p class="hud-hint">点地球城市或上方芯片 · 拖动旋转视角</p>
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
.hud-title {
  margin: 0;
  font-size: 11px;
  color: #8aa0b4;
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
.hud-hint {
  margin: 8px 0 0;
  font-size: 10px;
  color: #5a7388;
  line-height: 1.4;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
