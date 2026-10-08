<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { monthLabel, subsolarLatitude } from '@/engine/atmosphere'
import { makeSunBillboard } from '@/engine/sunVisual'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const plotRef = ref<SVGSVGElement | null>(null)

const month = ref(6.5)
const tiltOn = ref(true)
const playing = ref(true)
const bandHi = ref(2)
/** 黄赤交角课步 HUD 实时角度 */
const tiltDegShow = ref(23.5)

const R = 72

const BANDS = [
  { id: 0, name: '北寒带', y0: 90, y1: 66.5, color: 0xa8c0d8, note: '有极昼极夜' },
  { id: 1, name: '北温带', y0: 66.5, y1: 23.5, color: 0x5a9a6a, note: '四季分明' },
  { id: 2, name: '热带', y0: 23.5, y1: -23.5, color: 0xd4a04a, note: '有直射，终年高温' },
  { id: 3, name: '南温带', y0: -23.5, y1: -66.5, color: 0x5a9a6a, note: '四季分明' },
  { id: 4, name: '南寒带', y0: -66.5, y1: -90, color: 0xa8c0d8, note: '有极昼极夜' },
] as const

const SNAPS = [
  { label: '春分', month: 3.25 },
  { label: '夏至', month: 6.5 },
  { label: '秋分', month: 9.4 },
  { label: '冬至', month: 12.5 },
] as const

const subsolar = computed(() => subsolarLatitude(month.value, tiltOn.value))
const seasonName = computed(() => {
  const m = ((month.value - 1) % 12 + 12) % 12 + 1
  if (m >= 3 && m < 6) return '北半球春季 / 南半球秋季'
  if (m >= 6 && m < 9) return '北半球夏季 / 南半球冬季'
  if (m >= 9 && m < 12) return '北半球秋季 / 南半球春季'
  return '北半球冬季 / 南半球夏季'
})
const stepTitle = computed(() => {
  if (props.stepId === 'tilt') return '黄赤交角'
  if (props.stepId === 'subsolar') return '太阳直射点移动'
  return '四季与五带'
})
const stepHint = computed(() => {
  if (props.stepId === 'tilt') return '黄道面与赤道面的夹角 · 播放时 0°↔23.5° 往复 · 平行光流动'
  if (props.stepId === 'subsolar') return '直射点始终在向日面 · 随月份在南北回归线间往返'
  return `${seasonName.value} · 色带为五带 · 高亮=选中/有直射`
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let earthGroup: THREE.Group | null = null
/** 倾斜内层：绕本地 Y 自转 */
let earthSpinRoot: THREE.Group | null = null
let axisGroup: THREE.Group | null = null
let ecliptic: THREE.Mesh | null = null
let eclipticEdge: THREE.Line | null = null
let equatorRing: THREE.Line | null = null
let sunLight: THREE.DirectionalLight | null = null
let sunMesh: THREE.Object3D | null = null
let sunLookAt: ((c: THREE.Camera) => void) | null = null
let subsolarDot: THREE.Mesh | null = null
let rayBeam: THREE.Line | null = null
let rayGroup: THREE.Group | null = null
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
/** 平行光波纹相位 */
let rayPhase = 0
/** 上次写入角度标签的度数，避免每帧重建 Sprite */
let lastAngleDeg = -1

function addDisposable(obj: THREE.Object3D) {
  disposables.push(obj)
  return obj
}

function disposeObj(obj: THREE.Object3D) {
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
  const fontSize = 28
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
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
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
  camera = new THREE.PerspectiveCamera(40, w / h, 1, 1500)
  camera.position.set(160, 40, 260)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 140
  controls.maxDistance = 480
  controls.target.set(20, 0, 0)

  // 星空
  {
    const n = 700
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const rr = 500 + Math.random() * 300
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

  scene.add(new THREE.AmbientLight(0x4a5a6c, 0.55))
  sunLight = new THREE.DirectionalLight(0xfff1d0, 2.0)
  sunLight.position.set(-220, 0, 0)
  scene.add(sunLight)
  scene.add(sunLight.target)
  sunLight.target.position.set(0, 0, 0)
  const fill = new THREE.DirectionalLight(0x4a6a90, 0.18)
  fill.position.set(80, 40, 100)
  scene.add(fill)

  // 太阳：SDO/AIA 日面（−X）
  const sunRoot = new THREE.Group()
  sunRoot.position.set(-210, 0, 0)
  const sunVis = makeSunBillboard(18)
  sunLookAt = sunVis.lookAt
  sunRoot.add(addDisposable(sunVis.group))
  const sunLab = makeLabel('太阳', 0.7)
  sunLab.position.set(0, -28, 0)
  sunRoot.add(addDisposable(sunLab))
  scene.add(sunRoot)
  sunMesh = sunRoot

  // 黄道面
  ecliptic = new THREE.Mesh(
    new THREE.RingGeometry(R + 8, R + 90, 64),
    new THREE.MeshBasicMaterial({
      color: 0x5ec8f0,
      transparent: true,
      opacity: 0.12,
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
        return new THREE.Vector3(Math.cos(a) * (R + 50), 0, Math.sin(a) * (R + 50))
      }),
    ),
    new THREE.LineDashedMaterial({ color: 0x5ec8f0, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.7 }),
  )
  eclipticEdge.computeLineDistances()
  scene.add(addDisposable(eclipticEdge))
  const eclLabel = makeLabel('黄道面', 0.65)
  eclLabel.position.set(0, -6, R + 70)
  scene.add(addDisposable(eclLabel))

  // 直立参考轴（黄道法线，始终竖直）
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
  const nLab = makeLabel('黄道法线', 0.55)
  nLab.position.set(14, nLen - 4, 0)
  normalAxis.add(addDisposable(nLab))
  scene.add(normalAxis)

  // 平行太阳光线（黄赤交角课步主动画之一）
  rayGroup = new THREE.Group()
  for (const dy of [-48, -24, 0, 24, 48]) {
    for (const dz of [-30, 0, 30]) {
      if (Math.abs(dy) > 30 && Math.abs(dz) > 0) continue
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-190, dy, dz),
          new THREE.Vector3(-R - 8, dy * 0.35, dz * 0.35),
        ]),
        new THREE.LineDashedMaterial({
          color: 0xffe08a,
          dashSize: 6,
          gapSize: 5,
          transparent: true,
          opacity: 0.55,
        }),
      )
      line.userData.dy = dy
      line.userData.dz = dz
      line.computeLineDistances()
      rayGroup.add(addDisposable(line))
    }
  }
  scene.add(rayGroup)

  // 地球组：外层倾斜，内层自转
  earthGroup = new THREE.Group()
  earthSpinRoot = new THREE.Group()
  earthGroup.add(earthSpinRoot)
  scene.add(earthGroup)

  const dayTex = new THREE.TextureLoader().load('/textures/earth-period.jpg')
  dayTex.colorSpace = THREE.SRGBColorSpace
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, 72, 56),
    new THREE.MeshPhongMaterial({
      map: dayTex,
      shininess: 12,
      specular: new THREE.Color(0x223344),
    }),
  )
  earthSpinRoot.add(addDisposable(earth))

  // 大气
  earthSpinRoot.add(
    addDisposable(
      new THREE.Mesh(
        new THREE.SphereGeometry(R + 2.4, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x6eb6ff, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }),
      ),
    ),
  )

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
  equatorRing = makeLatCircle(0, R + 0.8, 0x7dd3a0, 0.95)
  earthSpinRoot.add(addDisposable(equatorRing))
  const eqLab = makeLabel('赤道面', 0.6)
  eqLab.position.copy(latLonToVec(0, 40, R + 14))
  earthSpinRoot.add(addDisposable(eqLab))

  // 回归线 / 极圈 + 注记（挂倾斜层，不随自转跑到背面语义错乱）
  for (const [lat, col, name] of [
    [23.5, 0xe8b84a, '北回归线'],
    [-23.5, 0xe8b84a, '南回归线'],
    [66.5, 0xa8c0d8, '北极圈'],
    [-66.5, 0xa8c0d8, '南极圈'],
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

  // 阳光束 + 锥箭头（世界坐标）
  rayBeam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }),
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
  updateOverlays()
  applyStepCamera()
  lastT = performance.now()
  loop()
  drawPlot()
}

function applyTilt() {
  if (!earthGroup) return
  const tiltRad = ((23.5 * tiltAnim) * Math.PI) / 180
  // 绕 Z：侧视（相机在 +Z 偏）时清晰看到交角
  earthGroup.rotation.z = tiltRad
  tiltDegShow.value = 23.5 * tiltAnim
  buildAngleArc(tiltRad)
}

function applyStepCamera() {
  if (!camera || !controls) return
  if (props.stepId === 'tilt') {
    camera.position.set(40, 30, 300)
    controls.target.set(0, 0, 0)
  } else if (props.stepId === 'subsolar') {
    camera.position.set(120, 50, 250)
    controls.target.set(10, 0, 0)
  } else {
    camera.position.set(80, 90, 240)
    controls.target.set(0, 0, 0)
  }
  controls.update()
}

function updateOverlays() {
  if (!earthGroup || !earthSpinRoot || !subsolarDot || !rayBeam || !bandGroup || !sunMesh) return
  const lat = subsolar.value
  // 始终钉在向日经线；只随月份改纬度，不随自转跑到夜半球
  const local = latLonToVec(lat, SUN_FACING_LON, R + 1.8)
  subsolarDot.position.copy(local)
  const showSub = props.stepId !== 'tilt'
  subsolarDot.visible = showSub
  const subLab = earthGroup.getObjectByName('subsolar-label')
  if (subLab) {
    subLab.position.copy(latLonToVec(lat, SUN_FACING_LON, R + 12))
    subLab.visible = showSub
  }

  earthGroup.updateMatrixWorld(true)
  const worldHit = local.clone()
  earthGroup.localToWorld(worldHit)
  const sunPos = sunMesh.position.clone()
  const from = sunPos.clone().add(new THREE.Vector3(22, 0, 0))
  const positions = rayBeam.geometry.attributes.position as THREE.BufferAttribute
  positions.setXYZ(0, from.x, from.y, from.z)
  positions.setXYZ(1, worldHit.x, worldHit.y, worldHit.z)
  positions.needsUpdate = true
  rayBeam.geometry.computeBoundingSphere()
  rayBeam.visible = showSub

  const cone = scene?.getObjectByName('ray-cone') as THREE.Mesh | null
  if (cone) {
    cone.visible = showSub
    if (showSub) {
      const dir = worldHit.clone().sub(from)
      if (dir.lengthSq() > 1e-6) {
        dir.normalize()
        cone.position.copy(worldHit).addScaledVector(dir, -5)
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      }
    }
  }

  if (rayGroup) rayGroup.visible = props.stepId === 'tilt'
  if (normalAxis) normalAxis.visible = props.stepId === 'tilt'

  const showBands = props.stepId === 'seasons'
  bandGroup.visible = showBands
  if (showBands) {
    for (const child of bandGroup.children) {
      const id = child.userData.bandId as number
      const on = id === bandHi.value
      const band = BANDS[id]
      if (!band) continue
      const inSun = lat <= band.y0 && lat >= band.y1
      if (child.userData.kind === 'band-label') {
        child.visible = on || inSun
        continue
      }
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial
        mat.opacity = on ? 0.5 : inSun ? 0.32 : 0.14
      }
    }
  }

  if (ecliptic) ecliptic.visible = props.stepId === 'tilt'
  if (eclipticEdge) eclipticEdge.visible = props.stepId === 'tilt'
  if (angleArc) angleArc.visible = props.stepId === 'tilt'
  if (angleLabel) angleLabel.visible = props.stepId === 'tilt'
}

function drawPlot() {
  const el = plotRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  if (props.stepId !== 'subsolar') return

  const pw = 260
  const ph = 300
  svg.attr('viewBox', `0 0 ${pw} ${ph}`)
  svg.append('rect').attr('width', pw).attr('height', ph).attr('rx', 10).attr('fill', '#0e1628').attr('stroke', '#1e2f48')
  svg.append('text').attr('x', 12).attr('y', 22).attr('fill', '#c5d4e4').attr('font-size', 11).attr('font-weight', 600).text('直射纬度 · 全年')

  const ix0 = 36
  const iy0 = 40
  const iw = 210
  const ih = 220
  for (const lat of [23.5, 0, -23.5]) {
    const y = iy0 + ih / 2 - (lat / 23.5) * (ih / 2)
    svg.append('line').attr('x1', ix0).attr('x2', ix0 + iw).attr('y1', y).attr('y2', y).attr('stroke', '#24344c')
    svg.append('text').attr('x', ix0 - 4).attr('y', y + 3).attr('text-anchor', 'end').attr('fill', '#6a849c').attr('font-size', 9).text(`${lat}°`)
  }
  const pts: [number, number][] = []
  for (let m = 1; m <= 12.01; m += 0.2) {
    const lat = subsolarLatitude(m, tiltOn.value)
    pts.push([ix0 + ((m - 1) / 11) * iw, iy0 + ih / 2 - (lat / 23.5) * (ih / 2)])
  }
  svg.append('path').attr('d', d3.line()(pts)!).attr('fill', 'none').attr('stroke', '#5ec8f0').attr('stroke-width', 2)
  const mx = ix0 + ((month.value - 1) / 11) * iw
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
      month.value = 1 + Math.max(0, Math.min(1, u)) * 11
      playing.value = false
    })
  for (const s of SNAPS) {
    const x = ix0 + ((s.month - 1) / 11) * iw
    svg.append('text').attr('x', x).attr('y', ph - 14).attr('text-anchor', 'middle').attr('fill', '#6a849c').attr('font-size', 9).text(s.label)
  }
}

function loop() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  if (props.stepId === 'tilt') {
    // 黄赤交角：0° ↔ 23.5° 往复，配合自转与光线流
    if (playing.value) {
      tiltPhase += dt * 0.55
      tiltAnim = (Math.sin(tiltPhase) + 1) / 2
      applyTilt()
    } else {
      const target = tiltOn.value ? 1 : 0
      if (Math.abs(target - tiltAnim) > 0.002) {
        tiltAnim += (target - tiltAnim) * Math.min(1, dt * 6)
        applyTilt()
      } else if (tiltAnim !== target) {
        tiltAnim = target
        applyTilt()
      }
    }
    // 黄赤交角课：慢转看地表即可
    if (earthSpinRoot) earthSpinRoot.rotation.y += dt * 0.25
    if (rayGroup) {
      rayPhase += dt * 2.2
      const slide = (rayPhase * 14) % 22
      let i = 0
      for (const child of rayGroup.children) {
        const line = child as THREE.Line
        const mat = line.material
        if (mat instanceof THREE.LineDashedMaterial) {
          mat.opacity = 0.28 + 0.32 * (0.5 + 0.5 * Math.sin(rayPhase + i * 0.55))
        }
        // 沿入射方向滑动端点，形成「光在流动」
        const pos = line.geometry.attributes.position as THREE.BufferAttribute
        const dy = line.userData.dy as number
        const dz = line.userData.dz as number
        const x0 = -190 + slide
        const x1 = -R - 8 + slide * 0.15
        pos.setXYZ(0, x0, dy, dz)
        pos.setXYZ(1, x1, dy * 0.35, dz * 0.35)
        pos.needsUpdate = true
        line.computeLineDistances()
        i++
      }
    }
    if (eclipticEdge?.material instanceof THREE.LineDashedMaterial) {
      eclipticEdge.material.opacity = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(rayPhase * 0.7))
    }
  } else {
    if (playing.value) {
      month.value += dt * 0.5
      if (month.value > 12.999) month.value = 1
    }
    const target = tiltOn.value ? 1 : 0
    if (Math.abs(target - tiltAnim) > 0.002) {
      tiltAnim += (target - tiltAnim) * Math.min(1, dt * 8)
      applyTilt()
    } else if (tiltAnim !== target) {
      tiltAnim = target
      applyTilt()
    }
    // 直射/五带：地表可慢转，直射点已钉在向日面，光线不会甩到背面
    if (earthSpinRoot && props.stepId === 'seasons') earthSpinRoot.rotation.y += dt * 0.08
    // 直射点课步不自转，避免干扰「纬度往返」观察
  }

  updateOverlays()
  if (camera && sunLookAt) sunLookAt(camera)
  controls?.update()
  renderer.render(scene, camera)

  if (props.stepId === 'subsolar') drawPlot()
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
  earthGroup = null
  earthSpinRoot = null
  axisGroup = null
  ecliptic = null
  eclipticEdge = null
  equatorRing = null
  sunLight = null
  sunMesh = null
  sunLookAt = null
  subsolarDot = null
  rayBeam = null
  rayGroup = null
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
  month.value = m > 12 ? m - 12 : m
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(300, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

watch(
  () => props.stepId,
  (id) => {
    if (id === 'tilt') {
      playing.value = true
      tiltPhase = Math.PI / 2
    }
    applyStepCamera()
    updateOverlays()
    drawPlot()
  },
)

watch(bandHi, () => updateOverlays())
watch(tiltOn, () => drawPlot())

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
      <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? (stepId === 'tilt' ? '暂停演示' : '暂停公转') : stepId === 'tilt' ? '演示交角' : '继续公转' }}
      </button>
      <label class="ctrl check">
        <input v-model="tiltOn" type="checkbox" />
        黄赤交角
      </label>
      <span class="hud-inline">直射 {{ subsolar >= 0 ? 'N' : 'S' }}{{ Math.abs(subsolar).toFixed(1) }}°</span>
    </div>

    <div ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud">
        <p class="hud-title">{{ stepTitle }}</p>
        <p class="hud-desc">{{ stepHint }}</p>
        <p v-if="stepId === 'tilt'" class="hud-desc">当前交角 {{ tiltDegShow.toFixed(1) }}°</p>
        <p v-if="stepId === 'seasons'" class="hud-desc">
          选中：{{ BANDS[bandHi]?.name }} · {{ BANDS[bandHi]?.note }}
        </p>
        <p v-if="stepId === 'seasons'" class="hud-desc">
          直射 {{ subsolar >= 0 ? 'N' : 'S' }}{{ Math.abs(subsolar).toFixed(1) }}° ·
          落在{{ BANDS.find((b) => subsolar <= b.y0 && subsolar >= b.y1)?.name ?? '—' }}
        </p>
        <p v-if="stepId === 'subsolar'" class="hud-desc">黄线=阳光 · 黄点=直射点（钉在向日面）</p>
      </aside>
      <svg v-show="stepId === 'subsolar'" ref="plotRef" class="plot" />
      <div v-if="stepId === 'seasons'" class="bands">
        <button
          v-for="b in BANDS"
          :key="b.id"
          type="button"
          class="chip"
          :class="{ on: bandHi === b.id }"
          @click="bandHi = b.id"
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
  font-size: 12px;
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
.hud-inline {
  font-size: 11px;
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
  font-size: 12px;
  font-weight: 600;
  color: #e8f0f8;
}
.hud-desc {
  margin: 6px 0 0;
  font-size: 10px;
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
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.chip.on {
  border-color: var(--primary, #4cc9f0);
  color: #e8f4f8;
  background: rgba(76, 201, 240, 0.15);
  font-weight: 600;
}
</style>
