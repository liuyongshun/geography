<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { Demo3, DemoHex } from '@/demos/theme'
import { makeSunBillboard } from '@/engine/sunVisual'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const playing = ref(true)
const advance = ref(0.55)

const isFront = computed(() => props.stepId !== 'cyclone')
const isWarm = computed(() => props.stepId === 'warm-front')

const hint = computed(() => {
  if (props.stepId === 'warm-front') return '拖转视角 · 地面/云层贴图 · 暖气团沿缓坡爬升 · 锋前降水'
  if (props.stepId === 'cyclone') return '拖转俯视 · 气旋逆时针辐合上升，反气旋顺时针辐散下沉'
  return '拖转视角 · 地面/云层贴图 · 冷气团楔入 · 锋后降水'
})

const title = computed(() => {
  if (props.stepId === 'warm-front') return '暖锋 · 三维剖面'
  if (props.stepId === 'cyclone') return '气旋 / 反气旋 · 北半球'
  return '冷锋 · 三维剖面'
})

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let root: THREE.Group | null = null
let rain: THREE.Points | null = null
let rainVel: Float32Array | null = null
let rainBounds = { x0: -20, x1: 10, y0: 8, y1: 42, z0: -28, z1: 28 }
const arrows: THREE.Group[] = []
let texGround: THREE.Texture | null = null
let texCloud: THREE.Texture | null = null
let raf = 0
let disposed = false
let lastT = 0
let phase = 0
let lastAdvance = -1
let weatherSunLookAt: ((c: THREE.Camera) => void) | null = null

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

function loadWeatherTextures(): Promise<void> {
  const loader = new THREE.TextureLoader()
  const load = (url: string) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          resolve(t)
        },
        undefined,
        reject,
      )
    })
  return Promise.all([
    load('/textures/weather/ground-color.jpg'),
    load('/textures/weather/cloud-soft.png'),
  ])
    .then(([g, c]) => {
      g.wrapS = g.wrapT = THREE.RepeatWrapping
      g.repeat.set(3.2, 1.4)
      texGround = g
      c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping
      texCloud = c
    })
    .catch(() => {
      texGround = null
      texCloud = null
    })
}

function makeLabel(text: string, color: string = DemoHex.ink, scale = 0.7) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 26
  ctx.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  const tw = Math.ceil(ctx.measureText(text).width)
  canvas.width = tw + 22
  canvas.height = fontSize + 16
  const g = canvas.getContext('2d')!
  g.font = `600 ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`
  g.fillStyle = 'rgba(10,18,32,0.78)'
  roundRect(g, 0, 0, canvas.width, canvas.height, 8)
  g.fill()
  g.fillStyle = color
  g.textBaseline = 'middle'
  g.fillText(text, 11, canvas.height / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  )
  spr.scale.set((canvas.width / 64) * 9 * scale, (canvas.height / 64) * 9 * scale, 1)
  spr.renderOrder = 20
  return spr
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

function matVolume(color: number, opacity: number, emissive = 0x000000) {
  return new THREE.MeshPhongMaterial({
    color,
    emissive,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    shininess: 18,
  })
}

function extrudePoly(pts: Array<[number, number]>, depth: number, material: THREE.Material) {
  const shape = new THREE.Shape()
  shape.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]![0], pts[i]![1])
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  })
  geo.translate(0, 0, -depth / 2)
  return new THREE.Mesh(geo, material)
}

function makeArrow(color: number, len = 14) {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, Math.max(2, len - 5), 8), mat)
  shaft.position.y = (len - 5) / 2
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.35, 5, 10), mat)
  head.position.y = len - 2.4
  g.add(shaft, head)
  g.userData.len = len
  return g
}

function pointArrow(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = to.clone().sub(from)
  const len = dir.length()
  if (len < 0.01) return
  dir.normalize()
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.position.copy(from)
}

function makeCloud(x: number, y: number, z: number, s = 1) {
  const g = new THREE.Group()
  const mat = new THREE.MeshPhongMaterial({
    color: 0xf2f6fc,
    map: texCloud,
    transparent: true,
    opacity: texCloud ? 0.88 : 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const blobs: Array<[number, number, number, number]> = [
    [0, 0, 0, 7],
    [6, 0.6, 2, 5.5],
    [-5.5, 0.2, -1.5, 5],
    [2, 2.2, 0, 4.2],
  ]
  for (const [dx, dy, dz, r] of blobs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, 16, 12), mat)
    m.position.set(dx * s, dy * s, dz * s)
    g.add(m)
  }
  // 软云面片（带 alpha 贴图）
  if (texCloud) {
    const bill = new THREE.Mesh(
      new THREE.PlaneGeometry(28 * s, 12 * s),
      new THREE.MeshBasicMaterial({
        map: texCloud,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    bill.position.set(0, 1.5 * s, 0)
    g.add(bill)
  }
  g.position.set(x, y, z)
  return g
}

function buildFrontScene(keepRain = false) {
  if (!root || !scene) return
  clearRoot(keepRain && !!rain)
  const warm = isWarm.value
  const t = advance.value
  const shift = (t - 0.5) * 36

  // 地面：ambientCG Ground037
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(220, 2.4, 90),
    new THREE.MeshStandardMaterial({
      color: 0xd8c8a8,
      map: texGround,
      roughness: 0.92,
      metalness: 0.02,
    }),
  )
  ground.position.set(8, -1.2, 0)
  root.add(ground)
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 90),
    new THREE.MeshStandardMaterial({
      color: 0xe8dcc4,
      map: texGround,
      transparent: true,
      opacity: 0.55,
      roughness: 0.95,
    }),
  )
  strip.rotation.x = -Math.PI / 2
  strip.position.y = 0.05
  root.add(strip)

  const depth = 56
  const coldMat = matVolume(Demo3.coldDeep, 0.55, Demo3.coldGlow)
  const warmMat = matVolume(Demo3.warmDeep, 0.38, Demo3.warmGlow)
  const frontMat = new THREE.MeshPhongMaterial({
    color: warm ? Demo3.warm : Demo3.cold,
    emissive: warm ? Demo3.warmFront : Demo3.coldFront,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    shininess: 30,
  })

  let coldPts: Array<[number, number]>
  let warmPts: Array<[number, number]>
  let slopeA: THREE.Vector3
  let slopeB: THREE.Vector3

  if (warm) {
    // 缓坡：左高右低，暖气团从右向左爬
    const x0 = -78 + shift
    const x1 = 42 + shift
    const h = 36
    coldPts = [
      [-110, 0],
      [-110, 10],
      [x0, h],
      [x1, 0],
    ]
    warmPts = [
      [x0, h],
      [x1, 0],
      [108, 0],
      [108, h + 8],
      [x0 + 8, h + 8],
    ]
    slopeA = new THREE.Vector3(x0, h, 0)
    slopeB = new THREE.Vector3(x1, 0, 0)
    rainBounds = { x0: x0 - 8, x1: x1 - 18, y0: 10, y1: h + 10, z0: -24, z1: 24 }
  } else {
    // 陡楔：冷气团从左向右推进
    const xTip = -8 + shift
    const xBase = 38 + shift
    const h = 40
    coldPts = [
      [-108, 0],
      [-108, h - 4],
      [xTip, h],
      [xBase, 0],
    ]
    warmPts = [
      [xTip, h],
      [xBase, 0],
      [110, 0],
      [110, h + 6],
      [xTip + 16, h + 6],
    ]
    slopeA = new THREE.Vector3(xTip, h, 0)
    slopeB = new THREE.Vector3(xBase, 0, 0)
    rainBounds = { x0: xTip - 28, x1: xTip + 10, y0: 8, y1: h + 6, z0: -24, z1: 24 }
  }

  root.add(extrudePoly(coldPts, depth, coldMat))
  root.add(extrudePoly(warmPts, depth, warmMat))

  const slopeLen = slopeA.distanceTo(slopeB)
  const slopeAng = Math.atan2(slopeB.y - slopeA.y, slopeB.x - slopeA.x)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.7, depth * 0.9), frontMat)
  slab.position.copy(slopeA.clone().lerp(slopeB, 0.5))
  slab.rotation.z = slopeAng
  root.add(slab)

  // 云
  const cloudY = Math.max(slopeA.y, slopeB.y) + 10
  const cx = (rainBounds.x0 + rainBounds.x1) / 2
  root.add(makeCloud(cx - 10, cloudY, -6, 1.15))
  root.add(makeCloud(cx + 12, cloudY - 2, 8, 0.9))

  if (!keepRain) buildRain(420)

  // 运动箭头
  arrows.length = 0
  if (warm) {
    // 暖气团向左推进
    for (const z of [-16, 0, 16]) {
      const a = makeArrow(Demo3.warm, 16)
      pointArrow(a, new THREE.Vector3(72 + shift, 18, z), new THREE.Vector3(48 + shift, 20, z))
      root.add(a)
      arrows.push(a)
    }
    // 沿坡爬升
    for (const k of [0.28, 0.5, 0.72]) {
      const p0 = slopeB.clone().lerp(slopeA, k)
      const p1 = p0.clone().add(slopeA.clone().sub(slopeB).normalize().multiplyScalar(16))
      p0.z = (k - 0.5) * 18
      p1.z = p0.z
      const a = makeArrow(Demo3.lift, 15)
      pointArrow(a, p0, p1)
      root.add(a)
      arrows.push(a)
    }
  } else {
    for (const z of [-16, 0, 16]) {
      const a = makeArrow(Demo3.cold, 16)
      pointArrow(a, new THREE.Vector3(-70 + shift, 16, z), new THREE.Vector3(-48 + shift, 16, z))
      root.add(a)
      arrows.push(a)
    }
    for (const k of [0.3, 0.55, 0.78]) {
      const along = slopeA.clone().lerp(slopeB, k)
      const up = slopeA.clone().sub(slopeB).normalize()
      const p0 = along.clone().add(new THREE.Vector3(8, -6, (k - 0.5) * 16))
      const p1 = p0.clone().add(up.multiplyScalar(14))
      const a = makeArrow(Demo3.lift, 14)
      pointArrow(a, p0, p1)
      root.add(a)
      arrows.push(a)
    }
  }

  const coldLab = makeLabel('冷气团', DemoHex.coldSoft, 0.72)
  coldLab.position.set(-72 + (warm ? 0 : shift * 0.3), 22, 34)
  root.add(coldLab)
  const warmLab = makeLabel('暖气团', DemoHex.warm, 0.72)
  warmLab.position.set(68 + shift * 0.2, 22, 34)
  root.add(warmLab)
  const rainLab = makeLabel(warm ? '锋前降水' : '锋后降水', DemoHex.rain, 0.62)
  rainLab.position.set((rainBounds.x0 + rainBounds.x1) / 2, rainBounds.y1 + 6, 32)
  root.add(rainLab)
  const liftLab = makeLabel(warm ? '暖空气爬升' : '暖空气抬升', DemoHex.lift, 0.62)
  liftLab.position.set((slopeA.x + slopeB.x) / 2 + 8, Math.max(slopeA.y, slopeB.y) - 4, -34)
  root.add(liftLab)
}

function buildRain(n: number) {
  if (!root) return
  const pos = new Float32Array(n * 3)
  rainVel = new Float32Array(n)
  for (let i = 0; i < n; i++) seedRain(pos, i)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  rain = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: Demo3.rainDrop,
      size: 0.85,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  )
  root.add(rain)
}

function seedRain(pos: Float32Array, i: number, yTop = true) {
  const b = rainBounds
  pos[i * 3] = b.x0 + Math.random() * (b.x1 - b.x0)
  pos[i * 3 + 1] = yTop ? b.y0 + Math.random() * (b.y1 - b.y0) : b.y1
  pos[i * 3 + 2] = b.z0 + Math.random() * (b.z1 - b.z0)
  if (rainVel) rainVel[i] = 10 + Math.random() * 14
}

function tickRain(dt: number) {
  if (!rain || !rainVel) return
  const pos = rain.geometry.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const b = rainBounds
  for (let i = 0; i < rainVel.length; i++) {
    arr[i * 3 + 1]! -= rainVel[i]! * dt
    arr[i * 3]! -= 2.2 * dt
    if (arr[i * 3 + 1]! < 1.2) seedRain(arr, i, false)
    if (arr[i * 3]! < b.x0 - 4) arr[i * 3] = b.x1
  }
  pos.needsUpdate = true
}

function buildCycloneScene() {
  if (!root) return
  clearRoot()
  arrows.length = 0
  weatherSunLookAt = null

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(130, 48),
    new THREE.MeshStandardMaterial({
      color: 0xd8c8a8,
      map: texGround,
      roughness: 0.92,
      metalness: 0.02,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  root.add(ground)

  addSystem(-58, 1, Demo3.lowBright, 'L', true)
  addSystem(58, -1, Demo3.high, 'H', false)

  rainBounds = { x0: -78, x1: -38, y0: 4, y1: 28, z0: -18, z1: 18 }
  buildRain(260)
}

function addSystem(cx: number, dir: number, color: number, letter: string, rainy: boolean) {
  if (!root) return
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  for (const r of [38, 26, 14]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r, 48), ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(cx, 0.4, 0)
    root.add(ring)
  }
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 3, 24),
    new THREE.MeshPhongMaterial({ color: Demo3.panel, emissive: color, emissiveIntensity: 0.25 }),
  )
  core.position.set(cx, 1.6, 0)
  root.add(core)
  const lab = makeLabel(letter, letter === 'L' ? DemoHex.cold : DemoHex.high, 0.85)
  lab.position.set(cx, 12, 0)
  root.add(lab)
  const name = makeLabel(letter === 'L' ? '气旋 · 辐合' : '反气旋 · 辐散', letter === 'L' ? DemoHex.coldSoft : DemoHex.highSoft, 0.6)
  name.position.set(cx, 22, 0)
  root.add(name)

  const n = 8
  for (let i = 0; i < n; i++) {
    const a = makeArrow(color, 12)
    a.userData.sys = { cx, dir, i, n }
    root.add(a)
    arrows.push(a)
  }

  const vert = makeArrow(letter === 'L' ? Demo3.lift : Demo3.sink, 18)
  if (letter === 'L') pointArrow(vert, new THREE.Vector3(cx - 48, 4, 0), new THREE.Vector3(cx - 48, 22, 0))
  else pointArrow(vert, new THREE.Vector3(cx + 48, 22, 0), new THREE.Vector3(cx + 48, 4, 0))
  root.add(vert)
  const vlab = makeLabel(letter === 'L' ? '上升' : '下沉', letter === 'L' ? DemoHex.lift : DemoHex.sink, 0.58)
  vlab.position.set(cx + (letter === 'L' ? -48 : 48), letter === 'L' ? 28 : -2, 0)
  root.add(vlab)

  if (!rainy) {
    const sunVis = makeSunBillboard(6)
    weatherSunLookAt = sunVis.lookAt
    sunVis.group.position.set(cx + 28, 26, -10)
    root.add(sunVis.group)
  }
}

function tickCycloneArrows() {
  for (const a of arrows) {
    const s = a.userData.sys as { cx: number; dir: number; i: number; n: number } | undefined
    if (!s) continue
    const inward = s.dir > 0
    const ang = phase * 0.7 * s.dir + (s.i / s.n) * Math.PI * 2
    const r0 = inward ? 36 : 12
    const r1 = inward ? 14 : 36
    const a1 = ang + s.dir * 0.55
    const from = new THREE.Vector3(s.cx + Math.cos(ang) * r0, 3.2, Math.sin(ang) * r0)
    const to = new THREE.Vector3(s.cx + Math.cos(a1) * r1, 3.2, Math.sin(a1) * r1)
    pointArrow(a, from, to)
  }
}

function clearRoot(keepRain = false) {
  if (!root) return
  const keep = keepRain ? rain : null
  const leftover = [...root.children]
  for (const c of leftover) {
    if (keep && (c === keep || keep.parent === c)) continue
    root.remove(c)
    disposeObj(c)
  }
  if (!keepRain) {
    rain = null
    rainVel = null
  }
  arrows.length = 0
}

function applyCamera() {
  if (!camera || !controls) return
  if (props.stepId === 'cyclone') {
    camera.position.set(0, 95, 88)
    controls.target.set(0, 4, 0)
    controls.minDistance = 50
    controls.maxDistance = 220
    controls.maxPolarAngle = Math.PI * 0.48
  } else {
    camera.position.set(18, 42, 128)
    controls.target.set(0, 16, 0)
    controls.minDistance = 70
    controls.maxDistance = 240
    controls.maxPolarAngle = Math.PI * 0.49
  }
  controls.update()
}

function buildForStep() {
  if (props.stepId === 'cyclone') buildCycloneScene()
  else buildFrontScene(false)
  lastAdvance = advance.value
}

function setupScene() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(300, wrapRef.value.clientHeight)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x152838)
  scene.fog = new THREE.Fog(0x152838, 180, 420)

  camera = new THREE.PerspectiveCamera(42, w / h, 1, 800)
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  renderer.outputColorSpace = THREE.SRGBColorSpace

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.enablePan = false
  controls.dampingFactor = 0.08

  scene.add(new THREE.AmbientLight(0xb0c8e0, 0.45))
  scene.add(new THREE.HemisphereLight(Demo3.lightHemiSky, Demo3.lightHemiGround, 0.7))
  const key = new THREE.DirectionalLight(Demo3.lightKey, 1.25)
  key.position.set(-40, 80, 50)
  scene.add(key)
  const fill = new THREE.DirectionalLight(Demo3.lightFill, 0.45)
  fill.position.set(60, 30, -40)
  scene.add(fill)

  root = new THREE.Group()
  scene.add(root)

  applyCamera()
  loadWeatherTextures().then(() => {
    if (disposed) return
    buildForStep()
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

  if (playing.value && isFront.value) {
    advance.value = 0.22 + ((Math.sin(phase * 0.55) + 1) / 2) * 0.62
  }

  if (isFront.value && Math.abs(advance.value - lastAdvance) > 0.04) {
    buildFrontScene(true)
    lastAdvance = advance.value
  }

  if (props.stepId === 'cyclone') tickCycloneArrows()
  if (playing.value || props.stepId !== 'cyclone') tickRain(dt)
  if (camera && weatherSunLookAt) weatherSunLookAt(camera)

  // 云轻微起伏
  if (root && isFront.value) {
    for (const c of root.children) {
      if (c.children.length >= 3 && c instanceof THREE.Group && c.children[0] instanceof THREE.Mesh) {
        const first = c.children[0] as THREE.Mesh
        if (first.geometry instanceof THREE.SphereGeometry && first.geometry.parameters.radius > 3) {
          c.position.y += Math.sin(phase * 0.8) * 0.004
        }
      }
    }
  }

  controls?.update()
  renderer.render(scene, camera)
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = Math.max(300, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function teardown() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  controls = null
  if (root) {
    clearRoot()
    scene?.remove(root)
  }
  texGround?.dispose()
  texCloud?.dispose()
  texGround = null
  texCloud = null
  weatherSunLookAt = null
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  root = null
}

watch(
  () => props.stepId,
  () => {
    playing.value = true
    phase = 0
    advance.value = 0.55
    applyCamera()
    buildForStep()
  },
)

watch(advance, () => {
  if (!playing.value && isFront.value) {
    buildFrontScene(true)
    lastAdvance = advance.value
  }
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
      <span class="hint">{{ hint }}</span>
      <label v-if="isFront" class="ctrl">
        <span>{{ isWarm ? '爬升进程' : '楔入进程' }}</span>
        <input v-model.number="advance" type="range" min="0" max="1" step="0.01" @pointerdown="playing = false" />
      </label>
      <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? '暂停演示' : '继续演示' }}
      </button>
    </div>
    <div ref="wrapRef" class="stage">
      <canvas ref="canvasRef" class="globe" />
      <aside class="hud">
        <p class="hud-title">{{ title }}</p>
        <p class="hud-desc">拖拽旋转 · 滚轮缩放</p>
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
</style>
