<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { Demo3, DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const svgRef = ref<SVGSVGElement | null>(null)
const amount = ref(0.55)
const playing = ref(true)
const foldMode = ref<'anticline' | 'syncline'>('anticline')

const W = 780
const H = 420

const isThreeStep = computed(() => props.stepId === 'fold' || props.stepId === 'fault')

const ctrlLabel = computed(() => {
  if (props.stepId === 'fold') return '挤压强度'
  if (props.stepId === 'fault') return '断距'
  return '侵蚀强度'
})

const hint = computed(() => {
  if (props.stepId === 'fold') return '拖转视角 · ambientCG 岩层贴图 · 水平挤压弯曲'
  if (props.stepId === 'fault') return '拖转视角 · 分层岩体贴图 · 沿断层面相对错动'
  return '风化、侵蚀、搬运、堆积缓慢改造地表'
})

const hudTitle = computed(() => {
  if (props.stepId === 'fold') {
    if (amount.value < 0.15) return '近水平岩层'
    return foldMode.value === 'anticline' ? '背斜 · 岩层向上拱起' : '向斜 · 岩层向下弯曲'
  }
  if (props.stepId === 'fault') {
    return amount.value < 0.12 ? '岩层尚未明显错动' : '正断层 · 一盘相对下降'
  }
  return '流水侵蚀 · 搬运 · 堆积'
})

const hudDesc = computed(() => {
  if (props.stepId === 'fold') return '内力挤压示意 · 可 scrub 或自动演示'
  if (props.stepId === 'fault') return `断距示意 ${(amount.value * 7.8).toFixed(1)} · 左盘上升 / 右盘下降`
  return '外力作用 · 强度越大河谷越深、堆积扇越明显'
})

const LAYER_COLORS = [0xfff4e8, 0xf0e0c8, 0xe8d8b8, 0xdcc8a8] as const
const LAYER_TEX_URLS = [
  '/textures/rocks/sedimentary-color.jpg',
  '/textures/rocks/igneous-color.jpg',
  '/textures/rocks/metamorphic-color.jpg',
  '/textures/rocks/sedimentary-color.jpg',
] as const

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let root: THREE.Group | null = null
let foldLayers: THREE.Mesh[] = []
let faultLeft: THREE.Group | null = null
let faultRight: THREE.Group | null = null
let pressArrows: THREE.Group[] = []
let slipArrows: THREE.Group[] = []
let texLayers: THREE.Texture[] = []
let raf = 0
let disposed = false
let lastT = 0
let phase = 0
let drawAccum = 0
let lastAmount = -1
let lastFoldMode: typeof foldMode.value | null = null
let threeReady = false

function disposeObj(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        const anyM = m as THREE.MeshStandardMaterial
        if (anyM.map && anyM.map !== texLayers[0] && !texLayers.includes(anyM.map)) {
          anyM.map.dispose()
        }
        m.dispose()
      }
    } else if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
  })
}

function prepTex(t: THREE.Texture, repeatX = 2.2, repeatY = 1.4) {
  const c = t.clone()
  c.colorSpace = THREE.SRGBColorSpace
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  c.repeat.set(repeatX, repeatY)
  c.needsUpdate = true
  return c
}

function rockMat(i: number) {
  const src = texLayers[i % Math.max(1, texLayers.length)]
  const map = src ? prepTex(src, 2.4 + i * 0.35, 1.2) : null
  return new THREE.MeshStandardMaterial({
    color: LAYER_COLORS[i % LAYER_COLORS.length],
    map,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  })
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
  roundRect(g, 0, 0, canvas.width, canvas.height, 7)
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

function makeArrow(color: number, len = 14) {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, Math.max(2, len - 5), 8), mat)
  shaft.position.y = (len - 5) / 2
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.35, 5, 10), mat)
  head.position.y = len - 2.4
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

function clearRoot() {
  if (!root) return
  while (root.children.length) {
    const c = root.children[0]!
    root.remove(c)
    disposeObj(c)
  }
  foldLayers = []
  faultLeft = null
  faultRight = null
  pressArrows = []
  slipArrows = []
}

/** 褶皱岩层：纵向剖面网格，X 向弯曲 */
function makeFoldLayerGeo(ny: number, amp: number, sign: number, y0: number, thick: number) {
  const segsX = 64
  const segsZ = 10
  const width = 120
  const depth = 48
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let iz = 0; iz <= segsZ; iz++) {
    const v = iz / segsZ
    const z = -depth / 2 + v * depth
    for (let ix = 0; ix <= segsX; ix++) {
      const u = ix / segsX
      const x = -width / 2 + u * width
      const bend = Math.sin(u * Math.PI * 2) * amp * sign
      const y = y0 + bend + ny * 0.02
      positions.push(x, y, z)
      uvs.push(u * 2, v)
    }
  }
  // 底面（厚度）
  const topCount = (segsX + 1) * (segsZ + 1)
  for (let iz = 0; iz <= segsZ; iz++) {
    const v = iz / segsZ
    const z = -depth / 2 + v * depth
    for (let ix = 0; ix <= segsX; ix++) {
      const u = ix / segsX
      const x = -width / 2 + u * width
      const bend = Math.sin(u * Math.PI * 2) * amp * sign
      positions.push(x, y0 + bend - thick, z)
      uvs.push(u * 2, v)
    }
  }

  const cols = segsX + 1
  for (let iz = 0; iz < segsZ; iz++) {
    for (let ix = 0; ix < segsX; ix++) {
      const a = iz * cols + ix
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices.push(a, c, b, b, c, d)
      // 底面反向
      indices.push(topCount + a, topCount + b, topCount + c, topCount + b, topCount + d, topCount + c)
    }
  }
  // 侧面（前后边简化：两端）
  for (let ix = 0; ix < segsX; ix++) {
    // z min
    const a = ix
    const b = ix + 1
    const c = topCount + ix
    const d = topCount + ix + 1
    indices.push(a, b, c, b, d, c)
    // z max
    const a2 = segsZ * cols + ix
    const b2 = a2 + 1
    const c2 = topCount + a2
    const d2 = topCount + b2
    indices.push(a2, c2, b2, b2, c2, d2)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function updateFoldLayerPositions(mesh: THREE.Mesh, ny: number, amp: number, sign: number, y0: number, thick: number) {
  const geo = mesh.geometry as THREE.BufferGeometry
  const pos = geo.attributes.position as THREE.BufferAttribute
  const segsX = 64
  const segsZ = 10
  const width = 120
  const depth = 48
  let i = 0
  for (let half = 0; half < 2; half++) {
    const yOff = half === 0 ? 0 : -thick
    for (let iz = 0; iz <= segsZ; iz++) {
      const v = iz / segsZ
      const z = -depth / 2 + v * depth
      for (let ix = 0; ix <= segsX; ix++) {
        const u = ix / segsX
        const x = -width / 2 + u * width
        const bend = Math.sin(u * Math.PI * 2) * amp * sign
        pos.setXYZ(i++, x, y0 + bend + ny * 0.02 + yOff, z)
      }
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

function buildFoldScene() {
  if (!root) return
  clearRoot()
  const t = amount.value
  const amp = 1.5 + t * 22
  const sign = foldMode.value === 'anticline' ? 1 : -1

  // 浅色地面，避免整屏发黑
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(95, 102, 3, 40),
    new THREE.MeshStandardMaterial({ color: 0x3d5a42, roughness: 0.9, metalness: 0 }),
  )
  ground.position.y = -18
  root.add(ground)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(88, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a6a50, roughness: 0.95, metalness: 0 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -16.4
  root.add(floor)

  const bases = [6, 2, -2, -6]
  for (let i = 0; i < 4; i++) {
    const geo = makeFoldLayerGeo(i, amp, sign, bases[i]!, 3.2)
    const mesh = new THREE.Mesh(geo, rockMat(i))
    // 层间描边感：略抬高一点避免 z-fight
    mesh.position.y = i * 0.02
    foldLayers.push(mesh)
    root.add(mesh)
  }

  // 挤压箭头（两侧水平）
  const aL = makeArrow(Demo3.lift, 18)
  pointArrow(aL, new THREE.Vector3(-58, 18, 0), new THREE.Vector3(-40, 18, 0))
  const aR = makeArrow(Demo3.lift, 18)
  pointArrow(aR, new THREE.Vector3(58, 18, 0), new THREE.Vector3(40, 18, 0))
  pressArrows = [aL, aR]
  root.add(aL, aR)
  const lb = makeLabel('挤压', DemoHex.lift, 0.55)
  lb.position.set(-50, 26, 8)
  const rb = makeLabel('挤压', DemoHex.lift, 0.55)
  rb.position.set(50, 26, 8)
  root.add(lb, rb)

  if (t >= 0.18) {
    const crest = makeLabel(foldMode.value === 'anticline' ? '脊部' : '槽部', DemoHex.high, 0.55)
    crest.position.set(0, 6 + amp * sign + (sign > 0 ? 10 : -4), 10)
    root.add(crest)
  }
}

function applyFoldAmount() {
  if (!foldLayers.length) {
    buildFoldScene()
    return
  }
  const t = amount.value
  const amp = 1.5 + t * 22
  const sign = foldMode.value === 'anticline' ? 1 : -1
  const bases = [6, 2, -2, -6]
  foldLayers.forEach((mesh, i) => updateFoldLayerPositions(mesh, i, amp, sign, bases[i]!, 3.2))
  // 挤压箭头轻微脉动
  for (const a of pressArrows) {
    a.scale.setScalar(0.9 + 0.15 * Math.sin(phase * 2.2))
    a.visible = t > 0.05
  }
}

function buildFaultBlocks() {
  if (!root) return
  clearRoot()

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(140, 2, 60),
    new THREE.MeshStandardMaterial({ color: 0x3d5a42, roughness: 0.92 }),
  )
  ground.position.set(0, -16, 0)
  root.add(ground)

  faultLeft = new THREE.Group()
  faultRight = new THREE.Group()
  const layerH = 5.5
  for (let i = 0; i < 4; i++) {
    const matL = rockMat(i)
    const matR = rockMat(i)
    const left = new THREE.Mesh(new THREE.BoxGeometry(52, layerH, 40), matL)
    left.position.set(-26, -4 + i * layerH, 0)
    const right = new THREE.Mesh(new THREE.BoxGeometry(52, layerH, 40), matR)
    right.position.set(26, -4 + i * layerH, 0)
    faultLeft.add(left)
    faultRight.add(right)
  }
  root.add(faultLeft, faultRight)

  // 断层面
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 48),
    new THREE.MeshBasicMaterial({
      color: Demo3.warm,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.position.set(0, 8, 0)
  root.add(plane)
  const fl = makeLabel('断层面', DemoHex.warmSoft, 0.55)
  fl.position.set(6, 28, 12)
  root.add(fl)

  const up = makeArrow(Demo3.lift, 14)
  pointArrow(up, new THREE.Vector3(-18, 22, 12), new THREE.Vector3(-18, 34, 12))
  const dn = makeArrow(Demo3.warm, 14)
  pointArrow(dn, new THREE.Vector3(18, 20, 12), new THREE.Vector3(18, 8, 12))
  slipArrows = [up, dn]
  root.add(up, dn)
  root.add(makeLabel('上升盘', DemoHex.lift, 0.5).translateX(-22).translateY(38).translateZ(14))
  root.add(makeLabel('下降盘', DemoHex.warmSoft, 0.5).translateX(22).translateY(4).translateZ(14))
}

function applyFaultAmount() {
  if (!faultLeft || !faultRight) {
    buildFaultBlocks()
    return
  }
  const drop = amount.value * 16
  faultLeft.position.y = drop * 0.35
  faultRight.position.y = -drop
  for (const a of slipArrows) {
    a.visible = amount.value > 0.06
    a.scale.setScalar(0.85 + 0.2 * Math.sin(phase * 2))
  }
}

function applyCamera() {
  if (!camera || !controls) return
  if (props.stepId === 'fold') {
    camera.position.set(55, 42, 95)
    controls.target.set(0, 4, 0)
  } else {
    camera.position.set(70, 36, 90)
    controls.target.set(0, 6, 0)
  }
  controls.minDistance = 50
  controls.maxDistance = 200
  controls.maxPolarAngle = Math.PI * 0.48
  controls.update()
}

function buildThreeForStep() {
  if (props.stepId === 'fold') {
    buildFoldScene()
    lastFoldMode = foldMode.value
  } else if (props.stepId === 'fault') {
    buildFaultBlocks()
  }
  lastAmount = amount.value
  applyCamera()
}

function loadRockTex(): Promise<void> {
  const loader = new THREE.TextureLoader()
  const loadOne = (url: string) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          resolve(t)
        },
        undefined,
        reject,
      )
    })
  return Promise.all(LAYER_TEX_URLS.map((u) => loadOne(u)))
    .then((list) => {
      texLayers = list
    })
    .catch(() => {
      texLayers = []
    })
}

function setupThree() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(300, wrapRef.value.clientHeight)

  scene = new THREE.Scene()
  // 偏亮墨蓝天空，避免「黑乎乎」
  scene.background = new THREE.Color(0x1a3048)
  scene.fog = new THREE.Fog(0x1a3048, 160, 380)

  camera = new THREE.PerspectiveCamera(42, w / h, 1, 600)
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.35
  renderer.outputColorSpace = THREE.SRGBColorSpace

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.enablePan = false

  scene.add(new THREE.AmbientLight(0xb8d0e8, 0.55))
  scene.add(new THREE.HemisphereLight(0xd8e8f8, 0x3a5040, 0.85))
  const key = new THREE.DirectionalLight(0xfff2dc, 1.55)
  key.position.set(-35, 80, 45)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x8ec0f0, 0.65)
  fill.position.set(55, 30, -35)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffe0a0, 0.4)
  rim.position.set(0, 20, -60)
  scene.add(rim)

  root = new THREE.Group()
  scene.add(root)

  loadRockTex().then(() => {
    if (disposed) return
    threeReady = true
    if (isThreeStep.value) buildThreeForStep()
  })

  lastT = performance.now()
  loop()
}

function teardownThree() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  if (root) {
    clearRoot()
    scene?.remove(root)
  }
  texLayers.forEach((t) => t.dispose())
  texLayers = []
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  root = null
  threeReady = false
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(300, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

/* —— 外力：D3 —— */
function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#lf-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'lf-anim')
    .text(`
      .lf-flow { stroke-dasharray: 6 10; animation: lf-dash 2.8s linear infinite; }
      .lf-rain { stroke-dasharray: 2 8; animation: lf-rain 1.8s linear infinite; }
      .lf-pulse { animation: lf-pulse 2.6s ease-in-out infinite; }
      .lf-bob { animation: lf-bob 3.4s ease-in-out infinite; }
      @keyframes lf-dash { to { stroke-dashoffset: -32; } }
      @keyframes lf-rain { to { stroke-dashoffset: 20; } }
      @keyframes lf-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
      @keyframes lf-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
    `)
}

function marker(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>, id: string, color: string) {
  const m = defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 12 12')
    .attr('refX', 10)
    .attr('refY', 6)
    .attr('markerWidth', 11)
    .attr('markerHeight', 11)
    .attr('orient', 'auto')
    .attr('markerUnits', 'userSpaceOnUse')
  m.append('path').attr('d', 'M 1 1.5 L 11 6 L 1 10.5 Z').attr('fill', color)
}

function riverPoint(u: number, riverY: number, t: number) {
  const x = 40 + u * 660
  const y =
    riverY + 48 * (1 - u) * 0.15 + Math.sin(u * Math.PI) * (-50 * t) * (u < 0.55 ? u / 0.55 : (1 - u) / 0.45) + 4
  return { x, y }
}

function drawExternal() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'lf-erode', DemoHex.lift)
  marker(defs, 'lf-carry', DemoHex.cold)

  const t = amount.value
  const riverY = 248 + (1 - t) * 22

  const sky = defs.append('linearGradient').attr('id', 'lf-esky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.canvasFog)
  sky.append('stop').attr('offset', '55%').attr('stop-color', DemoHex.panel)
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.groundDark)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#lf-esky)').attr('rx', 12)

  const cg = svg.append('g').attr('class', 'lf-bob').attr('opacity', 0.55 + t * 0.35)
  cg.append('ellipse').attr('cx', 220).attr('cy', 64).attr('rx', 38).attr('ry', 14).attr('fill', DemoHex.cloud)
  cg.append('ellipse').attr('cx', 246).attr('cy', 60).attr('rx', 22).attr('ry', 12).attr('fill', '#e8f0f8')
  for (let i = 0; i < 6; i++) {
    svg
      .append('line')
      .attr('x1', 200 + i * 12)
      .attr('x2', 196 + i * 12)
      .attr('y1', 80)
      .attr('y2', 118 + t * 20)
      .attr('stroke', DemoHex.rain)
      .attr('stroke-width', 1.1)
      .attr('class', 'lf-rain')
      .attr('style', `animation-delay:${i * 0.08}s`)
  }

  const land = `M 40 400 L 40 ${riverY + 48} Q 180 ${riverY - 50 * t} 360 ${riverY + 4} T 740 ${riverY + 36} L 740 400 Z`
  svg.append('path').attr('d', land).attr('fill', DemoHex.ground)

  const river = `M 40 ${riverY + 48} Q 180 ${riverY - 50 * t} 360 ${riverY + 4} T 700 ${riverY + 36}`
  svg.append('path').attr('d', river).attr('fill', 'none').attr('stroke', DemoHex.coldDeep).attr('stroke-width', 14 + t * 6).attr('opacity', 0.35)
  svg
    .append('path')
    .attr('d', river)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.cold)
    .attr('stroke-width', 5)
    .attr('marker-end', 'url(#lf-carry)')
    .attr('class', 'lf-flow')

  for (const x of [150, 280, 480, 620]) {
    svg
      .append('path')
      .attr('d', `M ${x} ${110 + (1 - t) * 10} L ${x} ${150 + t * 36}`)
      .attr('stroke', DemoHex.lift)
      .attr('stroke-width', 1.8)
      .attr('marker-end', 'url(#lf-erode)')
      .attr('class', 'lf-pulse')
  }
  svg.append('text').attr('x', 150).attr('y', 100).attr('fill', DemoHex.lift).attr('font-size', 10).text('侵蚀')

  for (let i = 0; i < 4; i++) {
    const u = (i / 4 + phase * 0.06) % 0.85
    const p0 = riverPoint(u, riverY, t)
    const p1 = riverPoint(Math.min(0.92, u + 0.06), riverY, t)
    svg
      .append('path')
      .attr('d', `M ${p0.x} ${p0.y - 8} L ${p1.x} ${p1.y - 8}`)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.rain)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#lf-carry)')
      .attr('opacity', 0.85)
  }
  svg.append('text').attr('x', 390).attr('y', riverY - 22).attr('text-anchor', 'middle').attr('fill', DemoHex.rain).attr('font-size', 10).text('搬运')

  const fanX = 680
  const fanY = riverY + 28
  svg
    .append('path')
    .attr('d', `M ${fanX - 48} ${fanY - 4} L ${fanX - 18} ${fanY + 6}`)
    .attr('stroke', DemoHex.sink)
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#lf-erode)')
  svg
    .append('path')
    .attr('d', `M ${fanX - 30} ${fanY} L ${fanX + 40} ${fanY + 10 + t * 18} L ${fanX - 10} ${fanY + 22 + t * 10} Z`)
    .attr('fill', DemoHex.sink)
    .attr('opacity', 0.35 + t * 0.45)
    .attr('class', 'lf-bob')
  svg.append('text').attr('x', fanX + 8).attr('y', fanY + 36).attr('fill', DemoHex.sink).attr('font-size', 10).text('堆积')

  svg
    .append('text')
    .attr('x', 390)
    .attr('y', 36)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 12)
    .attr('font-weight', 600)
    .text('流水侵蚀 · 搬运 · 堆积')

  svg.append('rect').attr('x', 24).attr('y', 378).attr('width', W - 48).attr('height', 28).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 396)
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text('外力作用示意 · 贴图质感见褶皱/断层课步 · ambientCG 沉积岩 CC0')
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  phase += dt
  drawAccum += dt

  if (playing.value) {
    const wave = (Math.sin(phase * 0.55) + 1) / 2
    amount.value = 0.12 + wave * 0.78
  }

  if (isThreeStep.value && threeReady && renderer && scene && camera) {
    if (props.stepId === 'fold') {
      if (foldMode.value !== lastFoldMode || !foldLayers.length) {
        buildFoldScene()
        lastFoldMode = foldMode.value
      } else if (Math.abs(amount.value - lastAmount) > 0.008) {
        applyFoldAmount()
        lastAmount = amount.value
      } else {
        applyFoldAmount()
      }
    } else if (props.stepId === 'fault') {
      if (!faultLeft) buildFaultBlocks()
      applyFaultAmount()
      lastAmount = amount.value
    }
    controls?.update()
    renderer.render(scene, camera)
  } else if (!isThreeStep.value && drawAccum >= 0.066) {
    drawAccum = 0
    if (playing.value) drawExternal()
  }
}

watch(amount, () => {
  if (!playing.value && !isThreeStep.value) drawExternal()
})

watch(
  () => props.stepId,
  (id) => {
    amount.value = 0.45
    phase = 0
    playing.value = true
    if (id === 'fold' || id === 'fault') {
      if (threeReady) buildThreeForStep()
    } else {
      requestAnimationFrame(drawExternal)
    }
  },
)

watch(foldMode, () => {
  if (props.stepId === 'fold' && threeReady) {
    buildFoldScene()
    lastFoldMode = foldMode.value
  }
})

onMounted(() => {
  disposed = false
  window.addEventListener('resize', onResize)
  setupThree()
  if (!isThreeStep.value) requestAnimationFrame(drawExternal)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  teardownThree()
  d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <div v-if="stepId === 'fold'" class="chips">
        <button type="button" class="chip" :class="{ on: foldMode === 'anticline' }" @click="foldMode = 'anticline'">背斜</button>
        <button type="button" class="chip" :class="{ on: foldMode === 'syncline' }" @click="foldMode = 'syncline'">向斜</button>
      </div>
      <label class="ctrl">
        <span>{{ ctrlLabel }}</span>
        <input v-model.number="amount" type="range" min="0" max="1" step="0.01" @pointerdown="playing = false" />
      </label>
      <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? '暂停演示' : '自动演示' }}
      </button>
    </div>

    <div v-show="isThreeStep" ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud">
        <p class="hud-title">{{ hudTitle }}</p>
        <p class="hud-desc">{{ hudDesc }}</p>
      </aside>
    </div>
    <svg
      v-show="!isThreeStep"
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
}
.hud-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--demo-ink-muted);
}
.hud-desc {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--demo-ink-dim);
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
