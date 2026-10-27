<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type FactorId = 'overview' | 'slope' | 'climate' | 'ground' | 'water'

interface Factor {
  id: FactorId
  short: string
  title: string
  tag: string
  description: string
  evidence: string[]
  tone: string
}

const FACTORS: Factor[] = [
  {
    id: 'overview',
    short: '综合观察',
    title: '真实山地中，局地景观为什么不同？',
    tag: '贡嘎山—海螺沟 · 真实地形',
    description: '卫星影像贴合真实高程：冰雪裸岩、森林坡面、冰川谷地与河谷水系在同一区域内镶嵌分布。点击因素观察形成机制。',
    evidence: ['冰雪裸岩', '森林坡面', '冰川谷地', '河谷水系'],
    tone: '#9ed8ff',
  },
  {
    id: 'slope',
    short: '地形坡向',
    title: '坡向改变太阳辐射与蒸发',
    tag: '因素 01 · 地方地形',
    description: '阳坡获得太阳辐射较多，升温快、蒸发强，耐旱草灌较多；阴坡较凉湿，土壤水分条件更好，林木更密。',
    evidence: ['辐射差异', '蒸发差异', '植被响应'],
    tone: '#ffd36a',
  },
  {
    id: 'climate',
    short: '谷地气候',
    title: '冷空气沿坡下沉并在谷底汇聚',
    tag: '因素 02 · 地方气候',
    description: '晴朗静风夜间，坡面近地空气冷却后沿坡下沉，在谷底形成低温、雾或霜冻高风险区，产生局地小气候。',
    evidence: ['山坡降温', '冷空气下沉', '谷底汇聚'],
    tone: '#72c7ff',
  },
  {
    id: 'ground',
    short: '岩性土壤',
    title: '地面组成物质控制渗透与土壤',
    tag: '因素 03 · 地面物质',
    description: '不同岩性、风化物和土壤具有不同的透水、保水与养分条件，使同一坡面上也会出现斑块状植被组合。',
    evidence: ['透水岩层', '隔水黏土', '土壤斑块'],
    tone: '#e7b56f',
  },
  {
    id: 'water',
    short: '局地水分',
    title: '坡面汇流塑造河谷水分梯度',
    tag: '因素 04 · 局地水分',
    description: '降水和融水沿坡面向谷地汇集，河谷与坡脚水分较充足，植被与坡上裸岩、稀疏草灌形成局地差异。流线沿海螺沟谷底，为教学示意。',
    evidence: ['坡面汇流', '河谷水系', '坡脚湿润'],
    tone: '#55d8c4',
  },
]

const activeId = ref<FactorId>('overview')
const active = computed(() => FACTORS.find((item) => item.id === activeId.value) ?? FACTORS[0]!)
const wrapRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let raf = 0
let elapsed = 0

interface Ride {
  curve: THREE.CatmullRomCurve3
  offset: number
  speed: number
  tube: THREE.MeshBasicMaterial
}

const stateGroups = new Map<FactorId, THREE.Group>()
const animatedDots: Array<{ mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number; speed: number }> = []
const waterRides: Ride[] = []
let mainRide: Ride | null = null
let activeRide: Ride | null = null
let waterGroup: THREE.Group | null = null
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()
const labelPoint = new THREE.Vector3()
const rideTangent = new THREE.Vector3()
const rideAhead = new THREE.Vector3()
const rideCamA = new THREE.Vector3()
const rideCamB = new THREE.Vector3()
let pointerArmed = false
let pointerMoved = false
let pointerX = 0
let pointerY = 0
const labelAnchors = {
  sunny: new THREE.Vector3(32, 0, 7),
  shady: new THREE.Vector3(39, 0, 21),
  valley: new THREE.Vector3(38, 0, 14),
  water: new THREE.Vector3(46, 0, 11),
}
const sunnyLabelEl = ref<HTMLElement | null>(null)
const shadyLabelEl = ref<HTMLElement | null>(null)
const valleyLabelEl = ref<HTMLElement | null>(null)
const waterLabelEl = ref<HTMLElement | null>(null)
const compassRoseEl = ref<HTMLElement | null>(null)
const compassNorthEl = ref<HTMLElement | null>(null)
const compassEastEl = ref<HTMLElement | null>(null)
const compassSouthEl = ref<HTMLElement | null>(null)
const compassWestEl = ref<HTMLElement | null>(null)
const driftingClouds: Array<{ sprite: THREE.Sprite; originX: number; travel: number; speed: number }> = []
let lakeMaterial: THREE.MeshPhysicalMaterial | null = null
let terrainMaterial: THREE.MeshStandardMaterial | null = null
let sunTexture: THREE.Texture | null = null
let cloudTexture: THREE.Texture | null = null
const loadedTextures: THREE.Texture[] = []
const WORLD_WIDTH = 164
const WORLD_DEPTH = 156
/** 40 km 场景中的约 6.8 km 高差；仅做约 1.2 倍教学夸张。 */
const WORLD_RELIEF = 34
/** 真实栅格方位：+X 东、-X 西、-Z 北、+Z 南；太阳按北半球午后西南来光设置。 */
const SUN_VISUAL_POSITION = new THREE.Vector3(-20, 50, 20)
const SUN_LIGHT_POSITION = new THREE.Vector3(-70, 95, 65)
const SUN_RAY_DIRECTION = new THREE.Vector3(1, -0.54, -0.46).normalize()
let heightValues: Uint16Array | null = null
let heightGridSize = 0
let desiredCamera = new THREE.Vector3(106, 80, 135)
let desiredTarget = new THREE.Vector3(0, 16, 0)

function terrainHeight(x: number, z: number) {
  if (heightValues && heightGridSize > 1) {
    const u = THREE.MathUtils.clamp(x / WORLD_WIDTH + 0.5, 0, 1)
    const v = THREE.MathUtils.clamp(z / WORLD_DEPTH + 0.5, 0, 1)
    const gx = u * (heightGridSize - 1)
    const gy = v * (heightGridSize - 1)
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const x1 = Math.min(heightGridSize - 1, x0 + 1)
    const y1 = Math.min(heightGridSize - 1, y0 + 1)
    const tx = gx - x0
    const ty = gy - y0
    const a = heightValues[y0 * heightGridSize + x0]!
    const b = heightValues[y0 * heightGridSize + x1]!
    const c = heightValues[y1 * heightGridSize + x0]!
    const d = heightValues[y1 * heightGridSize + x1]!
    const q0 = THREE.MathUtils.lerp(a, b, tx)
    const q1 = THREE.MathUtils.lerp(c, d, tx)
    const normalized = THREE.MathUtils.lerp(q0, q1, ty) / 65535
    return 1.2 + normalized * WORLD_RELIEF
  }
  const valley = 2.2 + 0.0049 * x * x
  const rearRise = Math.max(0, (-z - 12) * 0.18)
  const shoulder = 5.8 * Math.exp(-((Math.abs(x) - 48) ** 2) / 620)
  const detail = Math.sin(x * 0.12 + z * 0.08) * 0.75 + Math.sin(z * 0.19 - x * 0.05) * 0.42
  return valley + rearRise + shoulder + detail
}

function addTerrainSkirt(root: THREE.Group) {
  const edgeSegments = 256
  const bottomY = -8
  const topColor = new THREE.Color(0x39423d)
  const bottomColor = new THREE.Color(0x090e10)
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  })

  const addEdge = (pointAt: (ratio: number) => [number, number]) => {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    for (let i = 0; i <= edgeSegments; i++) {
      const ratio = i / edgeSegments
      const [x, z] = pointAt(ratio)
      const topY = terrainHeight(x, z) - 0.04
      positions.push(x, topY, z, x, bottomY, z)
      colors.push(topColor.r, topColor.g, topColor.b, bottomColor.r, bottomColor.g, bottomColor.b)
      if (i < edgeSegments) {
        const index = i * 2
        indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const skirt = new THREE.Mesh(geometry, material)
    skirt.receiveShadow = true
    root.add(skirt)
  }

  addEdge((ratio) => [-WORLD_WIDTH / 2 + ratio * WORLD_WIDTH, -WORLD_DEPTH / 2])
  addEdge((ratio) => [WORLD_WIDTH / 2, -WORLD_DEPTH / 2 + ratio * WORLD_DEPTH])
  addEdge((ratio) => [WORLD_WIDTH / 2 - ratio * WORLD_WIDTH, WORLD_DEPTH / 2])
  addEdge((ratio) => [-WORLD_WIDTH / 2, WORLD_DEPTH / 2 - ratio * WORLD_DEPTH])

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0x090e10, roughness: 1, metalness: 0 }),
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = bottomY
  base.receiveShadow = true
  root.add(base)
}

async function addTerrain(root: THREE.Group) {
  const [metadataResponse, heightResponse] = await Promise.all([
    fetch('/terrain/gongga/metadata.json'),
    fetch('/terrain/gongga/height-u16.bin'),
  ])
  if (!metadataResponse.ok || !heightResponse.ok) throw new Error('贡嘎山真实地形数据加载失败')
  const metadata = await metadataResponse.json() as { gridSize: number; minElevation: number; maxElevation: number }
  heightGridSize = metadata.gridSize
  heightValues = new Uint16Array(await heightResponse.arrayBuffer())

  const geometry = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH, 256, 256)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    positions.setY(i, terrainHeight(x, z))
  }
  geometry.computeVertexNormals()
  const loader = new THREE.TextureLoader()
  const ortho = await loader.loadAsync('/terrain/gongga/ortho.jpg')
  ortho.colorSpace = THREE.SRGBColorSpace
  ortho.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
  loadedTextures.push(ortho)
  terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ortho,
    roughness: 0.88,
    metalness: 0.02,
  })
  const mesh = new THREE.Mesh(geometry, terrainMaterial)
  mesh.receiveShadow = true
  mesh.castShadow = true
  root.add(mesh)
  addTerrainSkirt(root)
}

function surfacePoint(x: number, z: number, lift = 0.8) {
  return new THREE.Vector3(x, terrainHeight(x, z) + lift, z)
}

function hugValley(xz: Array<[number, number]>, lift: number) {
  const guide = new THREE.CatmullRomCurve3(xz.map(([x, z]) => surfacePoint(x, z, lift)), false, 'centripetal')
  const steps = xz.length * 4
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i += 1) {
    const sample = guide.getPoint(i / steps)
    points.push(surfacePoint(sample.x, sample.z, lift))
  }
  return points
}

function makeFlow(
  parent: THREE.Group,
  points: THREE.Vector3[],
  color: number,
  offset: number,
  speed = 0.08,
  radius = 0.3,
  arrowCount = 3,
): Ride {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  curve.arcLengthDivisions = 280
  const group = new THREE.Group()
  const tube = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 })
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(64, points.length * 12), radius, 8, false),
    tube,
  ))
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.62, radius * 1.65), 14, 10),
    new THREE.MeshBasicMaterial({ color }),
  )
  dot.renderOrder = 8
  group.add(dot)
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 1; i <= arrowCount; i += 1) {
    const t = i / (arrowCount + 1)
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 2.15, radius * 6.4, 8),
      new THREE.MeshBasicMaterial({ color }),
    )
    arrow.position.copy(curve.getPointAt(t))
    arrow.quaternion.setFromUnitVectors(up, curve.getTangentAt(t).normalize())
    arrow.renderOrder = 8
    group.add(arrow)
  }
  const ride: Ride = { curve, offset, speed, tube }
  group.userData.ride = ride
  parent.add(group)
  animatedDots.push({ mesh: dot, curve, offset, speed })
  return ride
}

function addSun(parent: THREE.Group) {
  const sunMaterial = new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    opacity: 1,
    alphaTest: 0.015,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const sun = new THREE.Sprite(sunMaterial)
  sun.position.copy(SUN_VISUAL_POSITION)
  sun.scale.set(10, 10, 1)
  sun.renderOrder = 3
  parent.add(sun)
}

function addThinSunRay(parent: THREE.Group, end: THREE.Vector3, length: number, opacity: number) {
  const start = end.clone().addScaledVector(SUN_RAY_DIRECTION, -length)
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
  const material = new THREE.LineBasicMaterial({
    color: 0xefb73f,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = 7
  parent.add(line)

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 1.45, 10),
    new THREE.MeshBasicMaterial({ color: 0xefb73f, transparent: true, opacity: opacity + 0.12 }),
  )
  arrow.position.copy(end).addScaledVector(SUN_RAY_DIRECTION, -2.3)
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_RAY_DIRECTION)
  arrow.renderOrder = 7
  parent.add(arrow)
}

function addSlopeState(parent: THREE.Group) {
  // 朝南的阳坡在海螺沟北壁；平行细光线从西南落到坡面。
  const hits: Array<[number, number]> = [[24, 9], [30, 7.5], [36, 6], [42, 4.5]]
  hits.forEach(([x, z], i) => {
    addThinSunRay(parent, surfacePoint(x, z, 1.15), 45 + i * 2.5, 0.68 + i * 0.05)
  })
}

function addClimateState(parent: THREE.Group) {
  const drains: Array<Array<[number, number]>> = [
    [[18, 28], [16.5, 24], [18.9, 20.7]],
    [[40, 24], [39, 20], [37, 16], [35, 14]],
    [[27.2, 0.3], [36.2, 0.9], [40.4, 4.3], [46.4, 10.7]],
  ]
  drains.forEach((path, i) => {
    makeFlow(parent, hugValley(path, 1.35), 0x70c8ff, 0.12 + i * 0.28, 0.07, 0.26, 3)
  })
  const fogMat = new THREE.MeshBasicMaterial({ color: 0xb8e6f5, transparent: true, opacity: 0.16, depthWrite: false })
  const pools: Array<[number, number]> = [[22, 20.4], [30, 17.4], [38, 13.6], [48, 10.2], [56, 4.6]]
  pools.forEach(([x, z], i) => {
    const fog = new THREE.Mesh(new THREE.SphereGeometry(7.5 + (i % 3) * 1.6, 24, 12), fogMat.clone())
    fog.scale.set(2.1, 0.14, 0.7)
    fog.position.set(x, terrainHeight(x, z) + 1.05, z)
    parent.add(fog)
  })
}

function addGroundState(parent: THREE.Group) {
  const palette = [0x8d6b49, 0xb78b58, 0x64706b, 0x3d4746]
  const segments = 72
  for (let layer = 0; layer < 4; layer++) {
    const vertices: number[] = []
    const indices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const x = -80 + (160 * i) / segments
      const top = terrainHeight(x, 76) - 0.25 - layer * 2.15
      vertices.push(x, top, 77.9 - layer * 0.04, x, top - 2.1, 77.9 - layer * 0.04)
      if (i < segments) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const ribbon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palette[layer], roughness: 0.92, side: THREE.DoubleSide }))
    ribbon.castShadow = true
    parent.add(ribbon)
  }
  const outcrop = new THREE.Mesh(
    new THREE.DodecahedronGeometry(6.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xa58b67, roughness: 1 }),
  )
  outcrop.scale.set(1.6, 0.58, 0.8)
  outcrop.position.set(-18, terrainHeight(-18, 68) + 1.6, 68)
  outcrop.rotation.set(0.2, 0.6, -0.1)
  parent.add(outcrop)
}

function addWaterState(parent: THREE.Group) {
  // 填洼后的海螺沟谷底：主峰东坡向东，再转向东北汇出图幅。高程沿程下降。
  const mainXz: Array<[number, number]> = [
    [1.0, 6.1], [3.8, 11.3], [8.6, 14.3], [13.8, 17.1], [18.9, 20.7], [24.7, 21.6],
    [29.1, 17.1], [34.9, 15.5], [40.7, 12.5], [46.4, 10.7], [51.9, 6.4], [57.3, 3.4],
    [63.1, 0.9], [68.9, 0.0], [74.6, -2.1], [77.8, -4.9], [80.4, -10.4],
  ]
  const northXz: Array<[number, number]> = [[27.2, 0.3], [31.7, 1.2], [36.2, 0.9], [40.4, 4.3], [44.5, 5.8], [48.0, 8.8]]
  const southXz: Array<[number, number]> = [[63.1, 17.4], [64.7, 13.1], [68.9, 11.3], [72.4, 7.9], [72.7, 3.7], [71.8, -0.3]]
  mainRide = makeFlow(parent, hugValley(mainXz, 0.85), 0x4fe3ef, 0.02, 0.04, 0.46, 5)
  activeRide = mainRide
  waterRides.push(
    mainRide,
    makeFlow(parent, hugValley(northXz, 0.8), 0x7aeee8, 0.34, 0.062, 0.3, 3),
    makeFlow(parent, hugValley(southXz, 0.8), 0x7aeee8, 0.58, 0.062, 0.3, 3),
  )
}

async function loadAtmosphereTextures() {
  const loader = new THREE.TextureLoader()
  ;[sunTexture, cloudTexture] = await Promise.all([
    loader.loadAsync('/textures/sun-realistic.webp'),
    loader.loadAsync('/textures/weather/cloud-realistic.webp'),
  ])
  sunTexture.colorSpace = THREE.SRGBColorSpace
  cloudTexture.colorSpace = THREE.SRGBColorSpace
  loadedTextures.push(sunTexture, cloudTexture)
}

function addAtmosphere(root: THREE.Group) {
  if (!cloudTexture) return
  const cloudLayouts = [
    { x: -76, y: 49, z: -64, width: 36, opacity: 0.24, travel: 16, speed: 0.5, rotation: -0.035 },
    { x: -20, y: 57, z: -75, width: 48, opacity: 0.19, travel: 20, speed: 0.38, rotation: 0.018 },
    { x: 43, y: 49, z: -60, width: 40, opacity: 0.22, travel: 17, speed: 0.44, rotation: -0.012 },
    { x: 76, y: 43, z: -34, width: 30, opacity: 0.16, travel: 13, speed: 0.34, rotation: 0.03 },
  ]
  for (const layout of cloudLayouts) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTexture,
      color: 0xdfe9ed,
      transparent: true,
      opacity: layout.opacity,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }))
    sprite.position.set(layout.x, layout.y, layout.z)
    sprite.scale.set(layout.width, layout.width * 0.42, 1)
    sprite.material.rotation = layout.rotation
    sprite.renderOrder = 2
    root.add(sprite)
    driftingClouds.push({
      sprite,
      originX: sprite.position.x,
      travel: layout.travel,
      speed: layout.speed,
    })
  }
}

const FRAMES: Record<Exclude<FactorId, 'water'>, [THREE.Vector3, THREE.Vector3]> = {
  overview: [new THREE.Vector3(106, 80, 135), new THREE.Vector3(0, 16, 0)],
  slope: [new THREE.Vector3(82, 48, 74), new THREE.Vector3(26, 18, 10)],
  climate: [new THREE.Vector3(70, 26, 4), new THREE.Vector3(34, 12, 15)],
  ground: [new THREE.Vector3(22, 28, 108), new THREE.Vector3(-6, 13, 70)],
}

function poseWaterCamera() {
  const ride = activeRide ?? mainRide
  if (!ride) {
    desiredCamera.set(62, 24, 30)
    desiredTarget.set(42, 9, 12)
    return
  }
  const t = ((elapsed * ride.speed + ride.offset) % 1 + 1) % 1
  const pos = ride.curve.getPointAt(t)
  rideAhead.copy(ride.curve.getPointAt(Math.min(0.992, t + 0.055)))
  rideTangent.subVectors(rideAhead, pos)
  rideTangent.y *= 0.35
  if (rideTangent.lengthSq() < 1e-6) rideTangent.set(1, 0, 0)
  rideTangent.normalize()
  const sideLen = Math.hypot(rideTangent.z, rideTangent.x) || 1
  const sideX = -rideTangent.z / sideLen
  const sideZ = rideTangent.x / sideLen
  rideCamA.copy(pos).addScaledVector(rideTangent, -22)
  rideCamB.copy(rideCamA)
  rideCamA.x += sideX * 13
  rideCamA.z += sideZ * 13
  rideCamB.x -= sideX * 13
  rideCamB.z -= sideZ * 13
  const cam = terrainHeight(rideCamA.x, rideCamA.z) <= terrainHeight(rideCamB.x, rideCamB.z) ? rideCamA : rideCamB
  cam.x = THREE.MathUtils.clamp(cam.x, -76, 76)
  cam.z = THREE.MathUtils.clamp(cam.z, -72, 72)
  cam.y = Math.max(cam.y, terrainHeight(cam.x, cam.z) + 8, pos.y + 13)
  desiredTarget.copy(rideAhead)
  desiredTarget.y += 1.8
  desiredCamera.copy(cam)
  labelAnchors.water.set(pos.x, pos.y, pos.z)
}

function updateStateVisibility() {
  for (const [id, group] of stateGroups) group.visible = id === activeId.value
  if (terrainMaterial) {
    terrainMaterial.emissive.set(activeId.value === 'climate' ? 0x071522 : activeId.value === 'slope' ? 0x130f03 : 0x000000)
    terrainMaterial.emissiveIntensity = activeId.value === 'overview' ? 0 : 0.38
  }
  if (lakeMaterial) {
    lakeMaterial.emissive.set(activeId.value === 'water' ? 0x064f58 : 0x000000)
    lakeMaterial.emissiveIntensity = activeId.value === 'water' ? 0.75 : 0
  }
  if (activeId.value === 'water') {
    if (!activeRide) activeRide = mainRide
    poseWaterCamera()
    return
  }
  const frame = FRAMES[activeId.value]
  desiredCamera.copy(frame[0])
  desiredTarget.copy(frame[1])
}

function selectFactor(id: FactorId) {
  if (id === 'water') activeRide = mainRide
  activeId.value = id
}

function placeLabel(el: HTMLElement | null, x: number, z: number, lift: number) {
  if (!el || !camera || !wrapRef.value) return
  const rect = wrapRef.value.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return
  labelPoint.set(x, terrainHeight(x, z) + lift, z)
  labelPoint.project(camera)
  const px = (labelPoint.x * 0.5 + 0.5) * rect.width
  const py = (-labelPoint.y * 0.5 + 0.5) * rect.height
  const narrow = rect.width < 860
  const underHeader = px < Math.min(620, rect.width * 0.62) && py < 118
  const underPanel = !narrow && px > rect.width - 320 && py < 360
  const underNav = py > rect.height - 86
  const visible = labelPoint.z < 1 && px > -30 && px < rect.width + 30 && py > -20 && py < rect.height + 20
    && !underHeader && !underPanel && !underNav
  el.style.left = `${px}px`
  el.style.top = `${py}px`
  el.style.opacity = visible ? '' : '0'
}

function updateCompass() {
  if (!camera || !controls || !compassRoseEl.value) return
  const base = controls.target.clone().project(camera)
  const north = controls.target.clone().add(new THREE.Vector3(0, 0, -20)).project(camera)
  const dx = north.x - base.x
  const dy = -(north.y - base.y)
  if (Math.hypot(dx, dy) < 1e-5) return
  const northAngle = Math.atan2(dx, -dy)
  compassRoseEl.value.style.transform = `translate(-50%, -50%) rotate(${northAngle}rad)`
  const radius = 25
  const labels = [compassNorthEl.value, compassEastEl.value, compassSouthEl.value, compassWestEl.value]
  labels.forEach((label, index) => {
    if (!label) return
    const angle = northAngle + index * Math.PI / 2
    label.style.left = `${35 + Math.sin(angle) * radius}px`
    label.style.top = `${35 - Math.cos(angle) * radius}px`
  })
}

function onPointerDown(event: PointerEvent) {
  pointerArmed = true
  pointerMoved = false
  pointerX = event.clientX
  pointerY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  if (!pointerArmed) return
  if (Math.hypot(event.clientX - pointerX, event.clientY - pointerY) > 7) pointerMoved = true
}

function pickFlow(event: PointerEvent) {
  if (!camera || !canvasRef.value || !waterGroup) return
  const rect = canvasRef.value.getBoundingClientRect()
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointerNdc, camera)
  const hits = raycaster.intersectObject(waterGroup, true)
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object
    while (object) {
      const ride = object.userData.ride as Ride | undefined
      if (ride) {
        activeRide = ride
        return
      }
      object = object.parent
    }
  }
}

function onPointerUp(event: PointerEvent) {
  if (!pointerArmed) return
  const moved = pointerMoved
  pointerArmed = false
  if (moved || activeId.value !== 'water') return
  pickFlow(event)
}

function resize() {
  if (!wrapRef.value || !renderer || !camera) return
  const rect = wrapRef.value.getBoundingClientRect()
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
  if (rect.width < 860) camera.clearViewOffset()
  else {
    const shift = rect.width * 0.24
    camera.setViewOffset(rect.width + shift, rect.height, shift, 0, rect.width, rect.height)
  }
  camera.updateProjectionMatrix()
}

function disposeScene() {
  if (!scene) return
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.InstancedMesh)) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) material.dispose()
  })
}

async function initThree() {
  if (!canvasRef.value || !wrapRef.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07131f)
  scene.fog = new THREE.FogExp2(0x0a1822, 0.0034)
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 420)
  camera.position.copy(desiredCamera)

  controls = new OrbitControls(camera, canvasRef.value)
  controls.target.copy(desiredTarget)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.065
  controls.minDistance = 10
  controls.maxDistance = 250
  controls.minPolarAngle = Math.PI * 0.08
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minAzimuthAngle = -Infinity
  controls.maxAzimuthAngle = Infinity

  const hemi = new THREE.HemisphereLight(0xc5e8ff, 0x3a3525, 1.65)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffe7bd, 5.25)
  sun.position.copy(SUN_LIGHT_POSITION)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -100
  sun.shadow.camera.right = 100
  sun.shadow.camera.top = 90
  sun.shadow.camera.bottom = -70
  sun.shadow.bias = -0.00045
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x83c8ff, 0.72)
  rim.position.set(80, 42, -70)
  scene.add(rim)

  const world = new THREE.Group()
  scene.add(world)
  await Promise.all([addTerrain(world), loadAtmosphereTextures()])
  addAtmosphere(world)
  addSun(world)

  const makers: Array<[FactorId, (group: THREE.Group) => void]> = [
    ['slope', addSlopeState],
    ['climate', addClimateState],
    ['ground', addGroundState],
    ['water', addWaterState],
  ]
  for (const [id, make] of makers) {
    const group = new THREE.Group()
    make(group)
    group.visible = false
    stateGroups.set(id, group)
    world.add(group)
    if (id === 'water') waterGroup = group
  }
  canvasRef.value.addEventListener('pointerdown', onPointerDown)
  canvasRef.value.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  updateStateVisibility()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(wrapRef.value)
  resize()

  let previous = performance.now()
  function render(now: number) {
    raf = requestAnimationFrame(render)
    const dt = Math.min(0.05, (now - previous) / 1000)
    previous = now
    elapsed += dt
    for (const item of animatedDots) {
      const factor = ((elapsed * item.speed + item.offset) % 1 + 1) % 1
      item.mesh.position.copy(item.curve.getPointAt(factor))
      item.mesh.scale.setScalar(0.78 + Math.sin(factor * Math.PI) * 0.42)
    }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const cloud of driftingClouds) {
        cloud.sprite.position.x = cloud.originX + Math.sin(elapsed * cloud.speed * 0.12) * cloud.travel
      }
    }
    if (lakeMaterial) lakeMaterial.roughness = 0.16 + Math.sin(elapsed * 0.65) * 0.025
    if (activeId.value === 'water') poseWaterCamera()
    for (const ride of waterRides) ride.tube.opacity = activeId.value === 'water' && ride === (activeRide ?? mainRide) ? 1 : 0.78
    if (camera && controls) {
      const gain = activeId.value === 'water' ? 0.00003 : 0.02
      const alpha = 1 - Math.pow(gain, dt)
      camera.position.lerp(desiredCamera, alpha)
      controls.target.lerp(desiredTarget, alpha)
      controls.update()
    }
    placeLabel(sunnyLabelEl.value, labelAnchors.sunny.x, labelAnchors.sunny.z, 3.6)
    placeLabel(shadyLabelEl.value, labelAnchors.shady.x, labelAnchors.shady.z, 3.6)
    placeLabel(valleyLabelEl.value, labelAnchors.valley.x, labelAnchors.valley.z, 3.2)
    placeLabel(waterLabelEl.value, labelAnchors.water.x, labelAnchors.water.z, 3.2)
    updateCompass()
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(render)
}

watch(activeId, updateStateVisibility)

onMounted(initThree)

onUnmounted(() => {
  cancelAnimationFrame(raf)
  canvasRef.value?.removeEventListener('pointerdown', onPointerDown)
  canvasRef.value?.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  resizeObserver?.disconnect()
  controls?.dispose()
  disposeScene()
  for (const texture of loadedTextures) texture.dispose()
  loadedTextures.length = 0
  renderer?.dispose()
  stateGroups.clear()
  animatedDots.length = 0
  driftingClouds.length = 0
})
</script>

<template>
  <section ref="wrapRef" class="local-terrain" :data-factor="activeId" aria-label="地方性分异三维山谷教学场景">
    <canvas ref="canvasRef" class="terrain-canvas" />
    <div class="sky-grade" aria-hidden="true" />
    <header class="scene-header">
      <p>地方性分异 · 真实地形数据</p>
      <h2>贡嘎山—海螺沟：局地条件如何塑造景观差异</h2>
      <span>拖动观察真实山体 · 点击因素拉近 · 局地水分下可再点流线跟随</span>
    </header>

    <div ref="sunnyLabelEl" class="scene-label sunny-label" :class="{ active: activeId === 'slope' }">
      <i />
      <b>向阳坡面</b>
      <span>辐射较强 · 裸岩草甸</span>
    </div>
    <div ref="shadyLabelEl" class="scene-label shady-label" :class="{ active: activeId === 'slope' }">
      <i />
      <b>背阴坡面</b>
      <span>冷湿 · 森林较密</span>
    </div>
    <div ref="valleyLabelEl" class="scene-label valley-label" :class="{ active: activeId === 'climate' }">
      <i />
      <b>冰川谷地</b>
      <span>冷空气沿坡汇聚</span>
    </div>
    <div ref="waterLabelEl" class="scene-label lake-label" :class="{ active: activeId === 'water' }">
      <i />
      <b>河谷水系</b>
      <span>降水与融水汇流</span>
    </div>

    <div class="scene-compass" aria-label="动态方位：上北、右东、下南、左西，随视角旋转">
      <div ref="compassRoseEl" class="compass-rose" aria-hidden="true">
        <i class="north-arrow" />
        <i class="south-tail" />
        <span class="east-west-axis" />
      </div>
      <b ref="compassNorthEl" class="north">北</b>
      <b ref="compassEastEl">东</b>
      <b ref="compassSouthEl">南</b>
      <b ref="compassWestEl">西</b>
      <small>方位</small>
    </div>

    <aside class="factor-panel" :style="{ '--factor-tone': active.tone }">
      <p>{{ active.tag }}</p>
      <h3>{{ active.title }}</h3>
      <div class="factor-rule" />
      <span>{{ active.description }}</span>
      <ul>
        <li v-for="item in active.evidence" :key="item">{{ item }}</li>
      </ul>
    </aside>

    <nav class="factor-nav" aria-label="地方性分异影响因素">
      <button
        v-for="factor in FACTORS"
        :key="factor.id"
        type="button"
        :class="{ active: activeId === factor.id }"
        :aria-pressed="activeId === factor.id"
        @click="selectFactor(factor.id)"
      >
        <i />
        <span>{{ factor.short }}</span>
      </button>
    </nav>

    <footer class="scene-conclusion">
      <strong>结论</strong>
      <span>局地地形、地方气候、地面物质与水分条件共同造成小尺度有序变化或镶嵌分布</span>
    </footer>
    <div class="teaching-note">地形：SRTM/Mapzen · 影像：EOxCloudless/Sentinel-2 · 机制叠加为教学示意</div>
  </section>
</template>

<style scoped>
.local-terrain {
  --factor-tone: #9ed8ff;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
  color: #edf7ff;
  background: #07131f;
  isolation: isolate;
}
.terrain-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.terrain-canvas:active { cursor: grabbing; }
.sky-grade {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgb(4 10 18 / 7%) 0%, transparent 32%, transparent 72%, rgb(3 9 15 / 55%) 100%),
    radial-gradient(circle at 36% 16%, rgb(91 166 213 / 7%), transparent 34%);
}
.scene-header {
  position: absolute;
  z-index: 4;
  top: 24px;
  left: 28px;
  max-width: min(590px, 58%);
  pointer-events: none;
  text-shadow: 0 2px 14px rgb(0 0 0 / 70%);
}
.scene-header p { margin: 0 0 5px; color: #96d9ff; font-size: 10px; font-weight: 800; letter-spacing: .15em; }
.scene-header h2 { margin: 0; font-size: clamp(16px, 1.45vw, 22px); line-height: 1.3; }
.scene-header span { display: block; margin-top: 7px; color: rgb(219 237 247 / 65%); font-size: 10px; }
.factor-panel {
  position: absolute;
  z-index: 5;
  top: 90px;
  right: 26px;
  width: min(285px, 28vw);
  padding: 16px 17px 15px;
  border: 1px solid color-mix(in srgb, var(--factor-tone) 34%, transparent);
  border-radius: 13px;
  background: linear-gradient(145deg, rgb(9 23 35 / 90%), rgb(7 16 27 / 76%));
  box-shadow: 0 18px 50px rgb(0 0 0 / 28%), inset 0 1px rgb(255 255 255 / 5%);
}
.factor-panel p { margin: 0 0 5px; color: var(--factor-tone); font-size: 9px; font-weight: 800; letter-spacing: .11em; }
.factor-panel h3 { margin: 0; font-size: 14px; line-height: 1.35; }
.factor-rule { width: 42px; height: 2px; margin: 10px 0; background: var(--factor-tone); box-shadow: 0 0 12px color-mix(in srgb, var(--factor-tone) 75%, transparent); }
.factor-panel > span { display: block; color: rgb(224 239 247 / 72%); font-size: 10px; line-height: 1.65; }
.factor-panel ul { display: flex; flex-wrap: wrap; gap: 5px; margin: 11px 0 0; padding: 0; list-style: none; }
.factor-panel li { padding: 4px 7px; border: 1px solid color-mix(in srgb, var(--factor-tone) 24%, transparent); border-radius: 999px; color: rgb(235 247 251 / 78%); background: color-mix(in srgb, var(--factor-tone) 10%, transparent); font-size: 9px; }
.scene-label {
  position: absolute;
  z-index: 4;
  display: grid;
  grid-template-columns: 9px auto;
  column-gap: 5px;
  padding: 5px 7px 5px 5px;
  border: 1px solid rgb(176 215 231 / 18%);
  border-radius: 7px;
  background: rgb(5 17 27 / 72%);
  box-shadow: 0 6px 18px rgb(0 0 0 / 28%);
  opacity: .7;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: opacity .25s, border-color .25s, transform .25s;
}
.scene-label.active { opacity: 1; border-color: var(--factor-tone); transform: translate(-50%, -50%) scale(1.06); }
.scene-label i { grid-row: 1 / 3; align-self: center; width: 6px; height: 6px; border-radius: 50%; background: #9ed8ff; box-shadow: 0 0 0 3px rgb(158 216 255 / 14%), 0 0 10px #9ed8ff; }
.scene-label b { font-size: 9px; line-height: 1.1; }
.scene-label span { color: rgb(220 238 247 / 65%); font-size: 8px; white-space: nowrap; }
.sunny-label { top: 56%; left: 29%; }
.sunny-label i { background: #ffd36a; box-shadow: 0 0 0 3px rgb(255 211 106 / 14%), 0 0 10px #ffd36a; }
.shady-label { top: 57%; left: 69%; }
.shady-label i { background: #6ad99c; box-shadow: 0 0 0 3px rgb(106 217 156 / 14%), 0 0 10px #6ad99c; }
.valley-label { top: 67%; left: 47%; }
.lake-label { top: 73%; left: 67%; }
.scene-compass {
  position: absolute;
  z-index: 5;
  left: 22px;
  bottom: 82px;
  width: 70px;
  height: 70px;
  border: 1px solid rgb(158 216 255 / 24%);
  border-radius: 50%;
  background: radial-gradient(circle, rgb(7 20 31 / 88%) 0 43%, rgb(7 20 31 / 66%) 44% 100%);
  box-shadow: 0 10px 28px rgb(0 0 0 / 28%), inset 0 0 18px rgb(126 203 239 / 7%);
  pointer-events: none;
}
.compass-rose { position: absolute; top: 35px; left: 35px; width: 42px; height: 42px; transform-origin: center; }
.compass-rose i, .compass-rose span { position: absolute; display: block; left: 50%; transform: translateX(-50%); }
.north-arrow {
  top: 0;
  width: 0;
  height: 0;
  border-right: 4px solid transparent;
  border-bottom: 18px solid #ffd36a;
  border-left: 4px solid transparent;
  filter: drop-shadow(0 0 4px rgb(255 211 106 / 55%));
}
.south-tail { top: 21px; width: 1px; height: 17px; background: rgb(206 231 243 / 40%); }
.east-west-axis { top: 20px; width: 34px; height: 1px; background: rgb(206 231 243 / 28%); }
.scene-compass > b {
  position: absolute;
  z-index: 2;
  color: rgb(222 239 248 / 68%);
  font-size: 8px;
  line-height: 1;
  transform: translate(-50%, -50%);
}
.scene-compass > b.north { color: #ffd36a; font-weight: 800; }
.scene-compass > small {
  position: absolute;
  left: 50%;
  bottom: -16px;
  color: rgb(199 224 237 / 48%);
  font-size: 8px;
  letter-spacing: .12em;
  transform: translateX(-50%);
}
.factor-nav {
  position: absolute;
  z-index: 6;
  left: 50%;
  bottom: 55px;
  display: flex;
  gap: 4px;
  padding: 5px;
  border: 1px solid rgb(151 202 227 / 19%);
  border-radius: 13px;
  background: rgb(6 17 27 / 84%);
  box-shadow: 0 14px 38px rgb(0 0 0 / 36%);
  transform: translateX(-50%);
  scrollbar-width: none;
}
.factor-nav::-webkit-scrollbar { display: none; }
.factor-nav button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 94px;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  color: rgb(218 235 244 / 62%);
  background: transparent;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: color .2s, background .2s, box-shadow .2s;
}
.factor-nav button i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.factor-nav button:hover { color: #fff; background: rgb(255 255 255 / 6%); }
.factor-nav button.active { color: #fff; background: linear-gradient(180deg, rgb(57 151 207 / 56%), rgb(25 93 137 / 52%)); box-shadow: 0 5px 16px rgb(0 0 0 / 23%), inset 0 1px rgb(255 255 255 / 12%); }
.scene-conclusion {
  position: absolute;
  z-index: 4;
  bottom: 18px;
  left: 28px;
  display: flex;
  gap: 9px;
  align-items: center;
  max-width: calc(100% - 340px);
  color: rgb(220 237 246 / 67%);
  font-size: 9px;
}
.scene-conclusion strong { color: #ffd36a; }
.teaching-note { position: absolute; z-index: 4; right: 15px; bottom: 11px; color: rgb(202 226 238 / 42%); font-size: 8px; }

@media (max-width: 820px) {
  .scene-header { top: 16px; left: 16px; max-width: calc(100% - 32px); }
  .scene-header h2 { font-size: 15px; }
  .scene-header span { display: none; }
  .factor-panel { top: auto; right: 12px; bottom: 111px; width: min(260px, calc(100% - 24px)); padding: 11px 13px; }
  .factor-panel > span { line-height: 1.45; }
  .factor-panel ul { margin-top: 7px; }
  .factor-nav { bottom: 49px; width: calc(100% - 24px); overflow-x: auto; justify-content: flex-start; }
  .factor-nav button { min-width: 88px; flex: 1 0 auto; padding: 7px 8px; }
  .scene-label { transform: translate(-50%, -50%) scale(.9); }
  .scene-label.active { transform: translate(-50%, -50%) scale(.96); }
  .sunny-label { left: 22%; }
  .shady-label { left: 65%; }
  .scene-conclusion { left: 14px; bottom: 15px; max-width: calc(100% - 28px); }
  .scene-conclusion span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .teaching-note { display: none; }
}

@media (max-width: 560px) {
  .factor-panel { left: 12px; right: 12px; width: auto; }
  .factor-panel h3 { font-size: 12px; }
  .scene-label span { display: none; }
  .scene-label { grid-template-columns: 7px auto; }
  .lake-label { left: 66%; }
  .scene-compass { left: 12px; bottom: 98px; transform: scale(.88); transform-origin: left bottom; }
}

@media (prefers-reduced-motion: reduce) {
  .scene-label, .factor-nav button { transition: none; }
}
</style>
