<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { monthLabel, subsolarLatitude } from '@/engine/atmosphere'
import { makeSunBillboard } from '@/engine/sunVisual'
import { configureEarthRenderer, createRealisticEarth, type RealisticEarth } from '@/engine/realisticEarth'
import { Demo3, EarthDashDeg, EarthLineWidth } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const plotRef = ref<SVGSVGElement | null>(null)

const month = ref(6.25)
const tiltOn = ref(true)
const playing = ref(true)
const bandHi = ref<number | null>(null)
/** 黄赤交角课步 HUD 实时角度 */
const tiltDegShow = ref(23.5)

const R = 72
/** 公转轨道半径（太阳在原点） */
const ORBIT_R = 260
/**
 * 月份 → 公转角（太阳在原点，黄道 XZ）。
 * 地轴 tilt.z>0 时北极倾向 +X，故夏至须在 +X（θ=0）才向日；
 * 与 subsolarLatitude：23.5·sin((m−3.25)/12·2π) 同相。
 * 春分 θ=−π/2（−Z）· 夏至 θ=0（+X）· 秋分 θ=π/2（+Z）· 冬至 θ=π（−X）
 */
function monthToOrbitAngle(m: number) {
  const t = ((m - 3.25) / 12) * Math.PI * 2
  return t - Math.PI / 2
}

const BANDS = [
  { id: 0, name: '北寒带', y0: 90, y1: 66.5, color: 0xa8c0d8, note: '有极昼极夜' },
  { id: 1, name: '北温带', y0: 66.5, y1: 23.5, color: 0x5a9a6a, note: '四季分明' },
  { id: 2, name: '热带', y0: 23.5, y1: -23.5, color: 0xd4a04a, note: '有直射，终年高温' },
  { id: 3, name: '南温带', y0: -23.5, y1: -66.5, color: 0x5a9a6a, note: '四季分明' },
  { id: 4, name: '南寒带', y0: -66.5, y1: -90, color: 0xa8c0d8, note: '有极昼极夜' },
] as const

const SNAPS = [
  { label: '春分', month: 3.25 },
  { label: '夏至', month: 6.25 },
  { label: '秋分', month: 9.25 },
  { label: '冬至', month: 12.25 },
] as const

const subsolar = computed(() => subsolarLatitude(month.value, tiltOn.value))
const selectedBand = computed(() => (bandHi.value === null ? null : BANDS[bandHi.value]))
const seasonName = computed(() => {
  const m = ((month.value - 1) % 12 + 12) % 12 + 1
  if (m >= 3 && m < 6) return '北半球春季 / 南半球秋季'
  if (m >= 6 && m < 9) return '北半球夏季 / 南半球冬季'
  if (m >= 9 && m < 12) return '北半球秋季 / 南半球春季'
  return '北半球冬季 / 南半球夏季'
})
const stepTitle = computed(() => {
  if (props.stepId === 'overview') return '地球公转综合演示'
  if (props.stepId === 'tilt') return '黄赤交角'
  if (props.stepId === 'subsolar') return '太阳直射点移动'
  return '四季与五带'
})
const stepHint = computed(() => {
  if (props.stepId === 'overview') return '地球绕太阳公转 · 黄赤交角、直射点与五带同步呈现'
  if (props.stepId === 'tilt') return '地球沿黄道围绕太阳公转 · 地轴方向保持平行 · 交角 0°↔23.5° 往复演示'
  if (props.stepId === 'subsolar') return '公转+自转同时进行 · 直射点钉在向日面 · 纬度随季节在回归线间往返'
  return `${seasonName.value} · 公转+自转 · 色带为五带`
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
/** 公转平移（太阳在原点） */
let earthOrbitRoot: THREE.Group | null = null
/** 地轴倾斜（惯性系定向，不随公转摇摆） */
let earthGroup: THREE.Group | null = null
/** 绕本地 Y 自转 */
let earthSpinRoot: THREE.Group | null = null
let axisGroup: THREE.Group | null = null
let ecliptic: THREE.Mesh | null = null
let eclipticEdge: THREE.Line | null = null
let orbitPath: THREE.Line | null = null
let equatorRing: THREE.Mesh | THREE.Line | null = null
let sunLight: THREE.DirectionalLight | null = null
let sunMesh: THREE.Object3D | null = null
let sunLookAt: ((c: THREE.Camera) => void) | null = null
let subsolarDot: THREE.Mesh | null = null
let rayBeam: THREE.Line | null = null
let normalAxis: THREE.Group | null = null
let bandGroup: THREE.Group | null = null
let angleArc: THREE.Line | null = null
let angleLabel: THREE.Sprite | null = null
let disposables: THREE.Object3D[] = []
let raf = 0
let disposed = false
let lastT = 0
let tiltAnim = 1
/** 黄赤交角课步：交角往复演示相位 */
let tiltPhase = 0
/** 黄道虚线轻微呼吸相位 */
let rayPhase = 0
let scenePress: { x: number; y: number } | null = null
let realisticEarth: RealisticEarth | null = null
/** 上次写入角度标签的度数，避免每帧重建 Sprite */
let lastAngleDeg = -1
const _toSun = new THREE.Vector3()
const _qTilt = new THREE.Quaternion()
const _zAxis = new THREE.Vector3(0, 0, 1)

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

/**
 * 本场景约定：太阳在 -X，向日经线 = −90°。
 * x = cosφ·sinλ，y = sinφ，z = cosφ·cosλ
 */
function latLonToVec(lat: number, lon: number, r: number) {
  const φ = (lat * Math.PI) / 180
  const λ = (lon * Math.PI) / 180
  return new THREE.Vector3(Math.cos(φ) * Math.sin(λ), Math.sin(φ), Math.cos(φ) * Math.cos(λ)).multiplyScalar(r)
}

/** 向日经线（对准 -X 太阳） */
const SUN_FACING_LON = -90

function makeLabel(text: string, scale = 0.75) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  // 三维教学标注需要在远景和大球近景中都保持可读。
  const fontSize = 44
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  canvas.width = tw + 20
  canvas.height = fontSize + 14
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(7,11,22,0.75)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffe08a'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  )
  spr.scale.set((canvas.width / 64) * 10 * scale, (canvas.height / 64) * 10 * scale, 1)
  spr.renderOrder = 12
  return spr
}

function makeLatCircle(lat: number, r: number, color: number, opacity = 0.85) {
  const φ = (lat * Math.PI) / 180
  const y = Math.sin(φ) * r
  const rr = Math.cos(φ) * r
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr))
  }
  if (lat === 0) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rr, EarthLineWidth.gridMajor * 0.58, 6, 144),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: true, depthWrite: false }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    return ring
  }
  const { dash, gap } = EarthDashDeg.special
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({
      color, transparent: true, opacity, depthTest: true, depthWrite: false,
      dashSize: rr * THREE.MathUtils.degToRad(dash),
      gapSize: rr * THREE.MathUtils.degToRad(gap),
    }),
  )
  line.computeLineDistances()
  return line
}

function makeBandMesh(lat0: number, lat1: number, r: number, color: number, opacity: number) {
  // 纬度带：球面环带
  const geo = new THREE.SphereGeometry(
    r * 1.012,
    64,
    24,
    0,
    Math.PI * 2,
    ((90 - lat0) * Math.PI) / 180,
    ((lat0 - lat1) * Math.PI) / 180,
  )
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
}

function buildAngleArc(tiltRad: number) {
  if (!earthGroup) return
  const deg = (tiltRad * 180) / Math.PI
  if (tiltRad < 0.01) {
    if (angleArc) angleArc.visible = false
    if (angleLabel) angleLabel.visible = false
    lastAngleDeg = 0
    return
  }
  const arcR = R + 18
  const seg = 24
  if (!angleArc) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((seg + 1) * 3), 3))
    angleArc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff9f43 }))
    earthGroup.add(angleArc)
  }
  const pos = angleArc.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * tiltRad
    pos.setXYZ(i, Math.sin(t) * arcR, Math.cos(t) * arcR, 0)
  }
  pos.needsUpdate = true
  angleArc.geometry.setDrawRange(0, seg + 1)
  angleArc.geometry.computeBoundingSphere()
  angleArc.visible = true

  const mid = tiltRad * 0.55
  const labelPos = new THREE.Vector3(Math.sin(mid) * (arcR + 12), Math.cos(mid) * (arcR + 12), 8)
  // 标签文字按 0.1° 节流重建
  if (!angleLabel || Math.abs(deg - lastAngleDeg) >= 0.1) {
    if (angleLabel) {
      earthGroup.remove(angleLabel)
      disposeObj(angleLabel)
      angleLabel = null
    }
    angleLabel = makeLabel(`${deg.toFixed(1)}°`, 0.7)
    earthGroup.add(angleLabel)
    lastAngleDeg = deg
  }
  angleLabel.position.copy(labelPos)
  angleLabel.visible = true
}

function setupScene() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  disposables = []
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(300, wrapRef.value.clientHeight)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050814)
  camera = new THREE.PerspectiveCamera(40, w / h, 1, 4000)
  camera.position.set(120, 180, 420)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  configureEarthRenderer(renderer, 1.34)

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.enablePan = true
  controls.minDistance = 120
  controls.maxDistance = 2200
  controls.target.set(-ORBIT_R * 0.35, 0, 0)

  // 星空
  {
    const n = 700
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const rr = 700 + Math.random() * 500
      const u = Math.random()
      const v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      pos[i * 3] = rr * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = rr * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = rr * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    scene.add(
      addDisposable(
        new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8d4f0, size: 1.05, transparent: true, opacity: 0.8 })),
      ),
    )
  }

  scene.add(new THREE.AmbientLight(0x4a5a6c, 0.5))
  sunLight = new THREE.DirectionalLight(0xfff1d0, 2.2)
  sunLight.position.set(0, 0, 0)
  scene.add(sunLight)
  scene.add(sunLight.target)
  const fill = new THREE.DirectionalLight(0x4a6a90, 0.16)
  fill.position.set(120, 80, 160)
  scene.add(fill)

  // 太阳在原点
  const sunRoot = new THREE.Group()
  sunRoot.position.set(0, 0, 0)
  const sunVis = makeSunBillboard(22)
  sunLookAt = sunVis.lookAt
  sunRoot.add(addDisposable(sunVis.group))
  const sunLab = makeLabel('太阳', 0.7)
  sunLab.position.set(0, -32, 0)
  sunRoot.add(addDisposable(sunLab))
  scene.add(sunRoot)
  sunMesh = sunRoot

  // 公转轨道（黄道面 XZ）
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R))
    }
    orbitPath = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xe8b84a, transparent: true, opacity: 0.65 }),
    )
    scene.add(addDisposable(orbitPath))
    const ol = makeLabel('公转轨道', 0.55)
    ol.position.set(ORBIT_R * 0.7, 8, ORBIT_R * 0.35)
    scene.add(addDisposable(ol))
  }

  // 黄道面示意盘（绕太阳，黄赤交角课用）
  ecliptic = new THREE.Mesh(
    new THREE.RingGeometry(ORBIT_R - 36, ORBIT_R + 36, 64),
    new THREE.MeshBasicMaterial({
      color: 0x5ec8f0,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ecliptic.rotation.x = -Math.PI / 2
  scene.add(addDisposable(ecliptic))
  eclipticEdge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 65 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R)
      }),
    ),
    new THREE.LineDashedMaterial({ color: 0x5ec8f0, dashSize: 8, gapSize: 5, transparent: true, opacity: 0.55 }),
  )
  eclipticEdge.computeLineDistances()
  scene.add(addDisposable(eclipticEdge))
  const eclLabel = makeLabel('黄道面', 0.6)
  eclLabel.position.set(0, -8, ORBIT_R + 28)
  scene.add(addDisposable(eclLabel))

  // 黄道法线：挂在地球旁，随公转平移
  normalAxis = new THREE.Group()
  const nLen = R + 48
  normalAxis.add(
    addDisposable(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -nLen, 0), new THREE.Vector3(0, nLen, 0)]),
        new THREE.LineDashedMaterial({ color: 0x8aa0b4, dashSize: 3, gapSize: 2.5, transparent: true, opacity: 0.75 }),
      ),
    ),
  )
  ;(normalAxis.children[0] as THREE.Line).computeLineDistances()
  const nLab = makeLabel('黄道法线', 0.5)
  nLab.position.set(14, nLen - 4, 0)
  normalAxis.add(addDisposable(nLab))

  // 层级：公转 → 倾斜（定向）→ 自转
  earthOrbitRoot = new THREE.Group()
  scene.add(earthOrbitRoot)
  earthOrbitRoot.add(normalAxis)
  earthGroup = new THREE.Group()
  earthOrbitRoot.add(earthGroup)
  earthSpinRoot = new THREE.Group()
  earthGroup.add(earthSpinRoot)

  realisticEarth = createRealisticEarth(renderer, R, new THREE.Vector3(-1, 0, 0), {
    segments: 112,
    atmosphereStrength: 0.86,
  })
  realisticEarth.surface.userData.disposeEarthTextures = realisticEarth.disposeTextures
  earthSpinRoot.add(addDisposable(realisticEarth.surface))
  earthSpinRoot.add(addDisposable(realisticEarth.atmosphere))
  // 公转教学图直接展示地表；关闭外层大气散射壳，避免浅白透明膜遮挡贴图与示意线。
  realisticEarth.atmosphere.visible = false

  // 地轴（沿本地 +Y）
  axisGroup = new THREE.Group()
  const axisLen = R * 2 + 40
  axisGroup.add(
    addDisposable(
      new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, axisLen, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
    ),
  )
  const coneN = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  coneN.position.y = axisLen / 2 + 2
  axisGroup.add(addDisposable(coneN))
  const coneS = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a }))
  coneS.position.y = -(axisLen / 2 + 2)
  coneS.rotation.x = Math.PI
  axisGroup.add(addDisposable(coneS))
  const northLab = makeLabel('北', 0.7)
  northLab.position.set(0, axisLen / 2 + 14, 0)
  axisGroup.add(addDisposable(northLab))
  earthSpinRoot.add(axisGroup)

  // 赤道环
  equatorRing = makeLatCircle(0, R + 0.8, Demo3.earthEquator, 0.95)
  earthSpinRoot.add(addDisposable(equatorRing))
  const eqLab = makeLabel('赤道面', 0.6)
  eqLab.position.copy(latLonToVec(0, 40, R + 14))
  earthSpinRoot.add(addDisposable(eqLab))

  // 回归线 / 极圈 + 注记（挂倾斜层，不随自转跑到背面语义错乱）
  for (const [lat, col, name] of [
    [23.5, Demo3.earthTropic, '北回归线'],
    [-23.5, Demo3.earthTropic, '南回归线'],
    [66.5, Demo3.earthPolar, '北极圈'],
    [-66.5, Demo3.earthPolar, '南极圈'],
  ] as const) {
    earthGroup.add(addDisposable(makeLatCircle(lat, R + 0.6, col, 0.7)))
    const lab = makeLabel(name, 0.48)
    lab.position.copy(latLonToVec(lat, SUN_FACING_LON + 25, R + 10))
    earthGroup.add(addDisposable(lab))
  }

  // 直射点：挂在倾斜层（earthGroup），始终在向日经线，绝不随自转到夜半球
  subsolarDot = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffeb3b }),
  )
  earthGroup.add(addDisposable(subsolarDot))
  const subLab = makeLabel('直射点', 0.55)
  subLab.name = 'subsolar-label'
  earthGroup.add(addDisposable(subLab))

  // 唯一直射光线（世界坐标）：始终连接太阳与地表受光点。
  rayBeam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xffe08a, dashSize: 7, gapSize: 5, transparent: true, opacity: 0.9 }),
  )
  scene.add(addDisposable(rayBeam))
  const rayCone = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 7, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  )
  rayCone.name = 'ray-cone'
  scene.add(addDisposable(rayCone))

  // 五带半透明壳：纬带对称，挂倾斜层即可
  bandGroup = new THREE.Group()
  earthGroup.add(bandGroup)
  for (const b of BANDS) {
    const mesh = makeBandMesh(b.y0, b.y1, R, b.color, 0.0)
    mesh.userData.bandId = b.id
    bandGroup.add(addDisposable(mesh))
    const midLat = (b.y0 + b.y1) / 2
    const lab = makeLabel(b.name, 0.5)
    lab.userData.bandId = b.id
    lab.userData.kind = 'band-label'
    lab.position.copy(latLonToVec(midLat, SUN_FACING_LON + 40, R + 14))
    bandGroup.add(addDisposable(lab))
  }

  tiltAnim = tiltOn.value ? 1 : 0
  tiltPhase = Math.PI / 2 // 开场先到 23.5°
  applyTilt()
  syncOrbitFromMonth()
  updateOverlays()
  applyStepCamera()
  lastT = performance.now()
  loop()
  drawPlot()
}

function applyTilt() {
  if (!earthGroup) return
  const tiltRad = ((23.5 * tiltAnim) * Math.PI) / 180
  // 绕 Z：北极倾向 +X；夏至地球在 −X 时北极向日
  earthGroup.rotation.z = tiltRad
  tiltDegShow.value = 23.5 * tiltAnim
  buildAngleArc(tiltRad)
}

/** 公转位置：所有课步都随月份沿黄道绕太阳运动。 */
function syncOrbitFromMonth() {
  if (!earthOrbitRoot) return
  const θ = monthToOrbitAngle(month.value)
  earthOrbitRoot.position.set(Math.cos(θ) * ORBIT_R, 0, Math.sin(θ) * ORBIT_R)
  if (sunLight) {
    sunLight.position.set(0, 0, 0)
    sunLight.target.position.copy(earthOrbitRoot.position)
    sunLight.target.updateMatrixWorld()
  }
}

function applyStepCamera() {
  if (!camera || !controls || !earthOrbitRoot) return
  syncOrbitFromMonth()
  const ep = earthOrbitRoot.position
  if (props.stepId === 'overview' || props.stepId === 'tilt') {
    frameTiltCamera()
  } else if (props.stepId === 'subsolar') {
    // 框住太阳与地球
    const mid = ep.clone().multiplyScalar(0.45)
    camera.position.set(mid.x + ORBIT_R * 0.2, ORBIT_R * 0.55, mid.z + ORBIT_R * 0.85)
    controls.target.copy(mid)
  } else {
    camera.position.set(ep.x * 0.2 + 40, ORBIT_R * 0.65, ep.z * 0.2 + ORBIT_R * 0.75)
    controls.target.set(ep.x * 0.35, 0, ep.z * 0.35)
  }
  controls.update()
}

/** 黄赤交角课以地球为主取景，太阳仅在边缘露出以提示来光方向。 */
function frameTiltCamera() {
  if (!camera || !controls || !earthOrbitRoot) return
  camera.up.set(0, 1, 0)
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect)
  const limitingHalfFov = Math.max(0.12, Math.min(verticalHalfFov, horizontalHalfFov))
  const focus = earthOrbitRoot.position.clone().multiplyScalar(0.7)
  const subjectRadius = ORBIT_R * 0.45 + R
  const distance = (subjectRadius / Math.sin(limitingHalfFov)) * 0.82
  camera.position.copy(focus).addScaledVector(new THREE.Vector3(0, 0.42, 1).normalize(), distance)
  controls.target.copy(focus)
}

function updateOverlays() {
  if (!earthOrbitRoot || !earthGroup || !earthSpinRoot || !subsolarDot || !rayBeam || !bandGroup || !sunMesh) return
  const showSub = true

  // 向日方向（世界）→ 变到倾斜层本地，钉在向日面（不进自转层）
  _toSun.copy(earthOrbitRoot.position).negate().normalize()
  _qTilt.setFromAxisAngle(_zAxis, earthGroup.rotation.z)
  const toSunLocal = _toSun.clone().applyQuaternion(_qTilt.clone().invert())
  subsolarDot.position.copy(toSunLocal.clone().multiplyScalar(R + 1.8))
  subsolarDot.visible = showSub
  const subLab = earthGroup.getObjectByName('subsolar-label')
  if (subLab) {
    subLab.position.copy(toSunLocal.clone().multiplyScalar(R + 12))
    subLab.visible = showSub
  }

  earthOrbitRoot.updateMatrixWorld(true)
  earthGroup.updateMatrixWorld(true)
  if (realisticEarth) {
    earthSpinRoot.updateMatrixWorld(true)
    earthSpinRoot.getWorldQuaternion(_qTilt)
    realisticEarth.setSunDirection(_toSun.clone().applyQuaternion(_qTilt.clone().invert()))
  }
  const worldHit = subsolarDot.position.clone()
  earthGroup.localToWorld(worldHit)
  // _toSun：地球→太阳；从太阳朝地球射出
  const from = sunMesh.position.clone().addScaledVector(_toSun, -28)
  const positions = rayBeam.geometry.attributes.position as THREE.BufferAttribute
  positions.setXYZ(0, from.x, from.y, from.z)
  positions.setXYZ(1, worldHit.x, worldHit.y, worldHit.z)
  positions.needsUpdate = true
  rayBeam.geometry.computeBoundingSphere()
  rayBeam.computeLineDistances()
  rayBeam.visible = showSub

  const cone = scene?.getObjectByName('ray-cone') as THREE.Mesh | null
  if (cone) {
    cone.visible = false
    if (cone.visible) {
      const dir = worldHit.clone().sub(from)
      if (dir.lengthSq() > 1e-6) {
        dir.normalize()
        cone.position.copy(worldHit).addScaledVector(dir, -5)
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      }
    }
  }

  if (normalAxis) normalAxis.visible = true
  if (orbitPath) orbitPath.visible = true

  const showBands = true
  bandGroup.visible = showBands
  if (showBands) {
    for (const child of bandGroup.children) {
      const id = child.userData.bandId as number
      const on = id === bandHi.value
      const band = BANDS[id]
      if (!band) continue
      if (child.userData.kind === 'band-label') {
        child.visible = on
        continue
      }
      if (child instanceof THREE.Mesh) {
        child.visible = on
        if (on) (child.material as THREE.MeshBasicMaterial).opacity = 0.5
      }
    }
  }

  if (ecliptic) ecliptic.visible = true
  if (eclipticEdge) eclipticEdge.visible = true
  if (angleArc) angleArc.visible = true
  if (angleLabel) angleLabel.visible = true
}

function drawPlot() {
  const el = plotRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  if (props.stepId !== 'overview' && props.stepId !== 'subsolar') return

  const pw = 260
  const ph = 300
  svg.attr('viewBox', `0 0 ${pw} ${ph}`)
  svg.append('rect').attr('width', pw).attr('height', ph).attr('rx', 10).attr('fill', '#0e1628').attr('stroke', '#1e2f48')
  svg.append('text').attr('x', 12).attr('y', 22).attr('fill', '#c5d4e4').attr('font-size', 14).attr('font-weight', 600).text('照射位置波动 · 全年纬度')

  const ix0 = 36
  const iy0 = 40
  const iw = 210
  const ih = 220
  const plotMonthMin = 1
  const plotMonthMax = 12.9
  const monthToPlotX = (m: number) => ix0 + ((m - plotMonthMin) / (plotMonthMax - plotMonthMin)) * iw
  for (const lat of [23.5, 0, -23.5]) {
    const y = iy0 + ih / 2 - (lat / 23.5) * (ih / 2)
    svg
      .append('line')
      .attr('x1', ix0)
      .attr('x2', ix0 + iw)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', '#3a5270')
      .attr('stroke-dasharray', '4 4')
    svg.append('text').attr('x', ix0 - 4).attr('y', y + 3).attr('text-anchor', 'end').attr('fill', '#6a849c').attr('font-size', 12).text(`${lat}°`)
  }
  const pts: [number, number][] = []
  for (let m = plotMonthMin; m <= plotMonthMax; m += 0.2) {
    const lat = subsolarLatitude(m, tiltOn.value)
    pts.push([monthToPlotX(m), iy0 + ih / 2 - (lat / 23.5) * (ih / 2)])
  }
  svg.append('path').attr('d', d3.line()(pts)!).attr('fill', 'none').attr('stroke', '#5ec8f0').attr('stroke-width', 2)
  const mx = monthToPlotX(month.value)
  const my = iy0 + ih / 2 - (subsolar.value / 23.5) * (ih / 2)
  svg.append('circle').attr('cx', mx).attr('cy', my).attr('r', 5).attr('fill', '#ff9f43').attr('stroke', '#fff').attr('stroke-width', 1.2)
  svg
    .append('rect')
    .attr('x', ix0)
    .attr('y', iy0)
    .attr('width', iw)
    .attr('height', ih)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('click', (event: MouseEvent) => {
      const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()
      const u = (event.clientX - rect.left) / rect.width
      month.value = plotMonthMin + Math.max(0, Math.min(1, u)) * (plotMonthMax - plotMonthMin)
      playing.value = false
    })
  for (const s of SNAPS) {
    const x = monthToPlotX(s.month)
    svg.append('text').attr('x', x).attr('y', ph - 14).attr('text-anchor', 'middle').attr('fill', '#6a849c').attr('font-size', 12).text(s.label)
  }
}

function loop() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  if (props.stepId === 'overview' || props.stepId === 'tilt') {
    if (playing.value) {
      month.value += dt * 0.35
      if (month.value > 12.999) month.value = 1
      tiltPhase += dt * 0.55
      tiltAnim = (Math.sin(tiltPhase) + 1) / 2
      applyTilt()
    }
    syncOrbitFromMonth()
    if (playing.value) frameTiltCamera()
    if (playing.value && earthSpinRoot) earthSpinRoot.rotation.y += dt * 0.25
    if (playing.value) rayPhase += dt * 2.2
    if (eclipticEdge?.material instanceof THREE.LineDashedMaterial) {
      eclipticEdge.material.opacity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(rayPhase * 0.7))
    }
  } else {
    // 直射点 / 五带：公转（月份）+ 自转同时跑，类似晨昏线
    if (playing.value) {
      month.value += dt * 0.35
      if (month.value > 12.999) month.value = 1
      if (earthSpinRoot) earthSpinRoot.rotation.y += dt * 0.55
    }
    const target = tiltOn.value ? 1 : 0
    if (Math.abs(target - tiltAnim) > 0.002) {
      tiltAnim += (target - tiltAnim) * Math.min(1, dt * 8)
      applyTilt()
    } else if (tiltAnim !== target) {
      tiltAnim = target
      applyTilt()
    }
    syncOrbitFromMonth()
  }

  updateOverlays()
  if (camera && sunLookAt) sunLookAt(camera)
  controls?.update()
  renderer.render(scene, camera)

  if (props.stepId === 'overview' || props.stepId === 'subsolar') drawPlot()
}

function teardown() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  controls = null
  for (const obj of disposables) disposeObj(obj)
  disposables = []
  if (bandGroup) {
    for (const c of bandGroup.children) disposeObj(c)
    bandGroup.clear()
  }
  earthOrbitRoot = null
  earthGroup = null
  earthSpinRoot = null
  realisticEarth = null
  axisGroup = null
  ecliptic = null
  eclipticEdge = null
  orbitPath = null
  equatorRing = null
  sunLight = null
  sunMesh = null
  sunLookAt = null
  subsolarDot = null
  rayBeam = null
  normalAxis = null
  bandGroup = null
  angleArc = null
  angleLabel = null
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
}

function snapTo(m: number) {
  playing.value = false
  month.value = m
}

function selectBand(id: number) {
  bandHi.value = bandHi.value === id ? null : id
  updateOverlays()
}

function onScenePointerDown(event: PointerEvent) {
  if (event.button === 0) scenePress = { x: event.clientX, y: event.clientY }
}

function onScenePointerUp(event: PointerEvent) {
  if (!scenePress || event.button !== 0) return
  const moved = Math.hypot(event.clientX - scenePress.x, event.clientY - scenePress.y)
  scenePress = null
  if (moved < 6) playing.value = !playing.value
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(300, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  if ((props.stepId === 'overview' || props.stepId === 'tilt') && !(bandHi.value !== null && !playing.value)) applyStepCamera()
}

watch(
  () => props.stepId,
  (id) => {
    if (id === 'tilt') {
      playing.value = true
      tiltPhase = Math.PI / 2
    } else {
      playing.value = true
    }
    syncOrbitFromMonth()
    applyStepCamera()
    updateOverlays()
    drawPlot()
  },
)

watch(bandHi, () => updateOverlays())
watch(tiltOn, () => drawPlot())
watch(month, () => {
  if (props.stepId !== 'tilt') syncOrbitFromMonth()
})

onMounted(() => {
  setupScene()
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  teardown()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <label class="ctrl">
        <span>月份</span>
        <input v-model.number="month" type="range" min="1" max="12.9" step="0.05" @pointerdown="playing = false" />
        <em>{{ monthLabel(month) }}</em>
      </label>
      <div class="snaps">
        <button v-for="s in SNAPS" :key="s.label" type="button" class="btn" @click="snapTo(s.month)">{{ s.label }}</button>
      </div>
      <label class="ctrl check">
        <input v-model="tiltOn" type="checkbox" />
        黄赤交角
      </label>
      <span class="hud-inline">直射 {{ subsolar >= 0 ? 'N' : 'S' }}{{ Math.abs(subsolar).toFixed(1) }}°</span>
      <span class="hud-inline scene-hint">点击场景暂停 / 恢复</span>
    </div>

    <div ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" @pointerdown="onScenePointerDown" @pointerup="onScenePointerUp" />
      <aside class="hud">
        <p class="hud-title">{{ stepTitle }}</p>
        <p class="hud-desc">{{ stepHint }}</p>
        <template v-if="stepId === 'overview'">
          <p class="hud-desc">黄赤交角 {{ tiltDegShow.toFixed(1) }}° · {{ seasonName }}</p>
          <p class="hud-desc">
            直射 {{ subsolar >= 0 ? 'N' : 'S' }}{{ Math.abs(subsolar).toFixed(1) }}° ·
            落在{{ BANDS.find((b) => subsolar <= b.y0 && subsolar >= b.y1)?.name ?? '—' }}
          </p>
          <p class="hud-desc">选中五带：{{ selectedBand ? `${selectedBand.name} · ${selectedBand.note}` : '未选择' }}</p>
        </template>
        <p v-if="stepId === 'tilt'" class="hud-desc">当前交角 {{ tiltDegShow.toFixed(1) }}°</p>
        <p v-if="stepId === 'seasons'" class="hud-desc">
          选中：{{ selectedBand ? `${selectedBand.name} · ${selectedBand.note}` : '未选择' }}
        </p>
        <p v-if="stepId === 'seasons'" class="hud-desc">
          直射 {{ subsolar >= 0 ? 'N' : 'S' }}{{ Math.abs(subsolar).toFixed(1) }}° ·
          落在{{ BANDS.find((b) => subsolar <= b.y0 && subsolar >= b.y1)?.name ?? '—' }}
        </p>
        <p v-if="stepId === 'subsolar'" class="hud-desc">轨道上公转 · 地表自转 · 黄点=直射点（始终向日）</p>
      </aside>
      <svg v-show="stepId === 'overview' || stepId === 'subsolar'" ref="plotRef" class="plot" />
      <div v-if="stepId === 'overview' || stepId === 'seasons'" class="bands" @pointerdown.stop @pointerup.stop>
        <button
          v-for="b in BANDS"
          :key="b.id"
          type="button"
          class="chip"
          :class="{ on: bandHi === b.id }"
          :aria-pressed="bandHi === b.id"
          @click.stop="selectBand(b.id)"
        >
          {{ b.name }}
        </button>
      </div>
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
.ctrl {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: var(--text-500);
}
.ctrl input[type='range'] {
  width: 140px;
}
.ctrl em {
  font-style: normal;
  color: var(--text-700);
  min-width: 2.5em;
  font-variant-numeric: tabular-nums;
}
.check {
  cursor: pointer;
  user-select: none;
}
.snaps {
  display: inline-flex;
  gap: 6px;
}
.btn {
  font-size: 15px;
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
.hud-inline {
  font-size: 14px;
  color: #ffe08a;
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
  cursor: pointer;
}
.scene-hint {
  color: var(--text-400);
}
.hud {
  position: absolute;
  left: 14px;
  top: 14px;
  max-width: 240px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(8, 14, 28, 0.8);
  border: 1px solid rgba(76, 201, 240, 0.22);
  pointer-events: none;
}
.hud-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e8f0f8;
}
.hud-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: #8aa0b4;
  line-height: 1.45;
}
.plot {
  position: absolute;
  right: 12px;
  top: 12px;
  width: 240px;
  height: 280px;
  pointer-events: auto;
}
.bands {
  position: absolute;
  z-index: 3;
  right: 12px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chip {
  border: 1px solid var(--border);
  background: rgba(8, 14, 28, 0.85);
  color: var(--text-500);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 15px;
  cursor: pointer;
  text-align: left;
}
.chip.on {
  border-color: var(--primary, #4cc9f0);
  color: #e8f4f8;
  background: rgba(76, 201, 240, 0.15);
  font-weight: 600;
}
@media (max-width: 900px) {
  .plot {
    right: 10px;
    top: 10px;
    width: 170px;
    height: 180px;
  }
  .bands {
    left: 10px;
    right: auto;
    flex-direction: row;
    gap: 4px;
  }
  .chip {
    padding: 5px 6px;
    font-size: 13px;
  }
}
</style>
