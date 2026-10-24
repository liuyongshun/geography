<script setup lang="ts">
/**
 * 垂直地带性：乞力马扎罗山精细地形、卫星影像与实例植被场景。
 * 山体形态来自 SRTM，地表来自 EOxCloudless Sentinel-2；自然带标注仍为课堂示意。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { DemoHex } from '@/demos/theme'
import {
  HALF,
  PEAK_M,
  PEAK_Y,
  WORLD,
  ZONES,
  contourLines,
  elevation,
  findPeak,
  lakeCenter,
  lakeRadius,
  lakeSurfaceMeters,
  metersToY,
  pointAtElevation,
  riverPoints,
} from './mountain'

const ready = ref(false)
const failed = ref(false)
const selectedId = ref('meadow')
const panelOpen = ref(true)
const tab = ref<'climate' | 'veg' | 'animal' | 'feature'>('climate')
const viewId = ref<'wide' | 'near' | 'valley'>('wide')
const realPeakM = ref(PEAK_M)

const zone = computed(() => ZONES.find((z) => z.id === selectedId.value) ?? ZONES[2]!)

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const leadersRef = ref<SVGSVGElement | null>(null)
const marksRef = ref<HTMLDivElement | null>(null)

const VIEWS = {
  // 从南坡看向独立火山体；目标点偏左，使主峰避开固定教学面板。
  wide: { pos: [170, 160, 620], target: [-65, 50, 0] },
  near: { pos: [105, 62, 330], target: [-45, 68, 0] },
  valley: { pos: [40, 34, 300], target: [-10, 42, 140] },
} as const

/** 偏低的侧光：山脊一侧亮、冲沟进阴影，远看才有照片里的起伏 */
const SUN = new THREE.Vector3(0.42, 0.5, 0.76).normalize()

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raf = 0
let disposed = false
let peak = findPeak()
let waterMat: THREE.ShaderMaterial | null = null
let terrainUniforms: { uLo: { value: number }; uHi: { value: number } } | null = null
let contourMat: LineMaterial | null = null
let contourGroup: THREE.Group | null = null
let arrowCones: THREE.Object3D[] = []
let arrowCurve: THREE.CatmullRomCurve3 | null = null
let cloudSprites: THREE.Sprite[] = []
const clock = new THREE.Clock()
const realAnchors = new Map<string, THREE.Vector3>()

const viewAnim = {
  on: false,
  t: 0,
  fromP: new THREE.Vector3(),
  toP: new THREE.Vector3(),
  fromT: new THREE.Vector3(),
  toT: new THREE.Vector3(),
}

const TERRAIN_VERT = /* glsl */ `
  uniform float uPeakY;
  uniform float uPeakM;
  attribute float aOcc;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vMeters;
  varying float vOcc;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vMeters = world.y / uPeakY * uPeakM;
    vOcc = aOcc;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const TERRAIN_FRAG = /* glsl */ `
  uniform sampler2D uCanopy;
  uniform sampler2D uMeadow;
  uniform sampler2D uScree;
  uniform sampler2D uSnow;
  uniform float uLo;
  uniform float uHi;
  uniform vec3 uSun;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vMeters;
  varying float vOcc;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
  vec3 tri(sampler2D tex, vec3 p, vec3 n, float scale) {
    vec2 warp = vec2(fbm(p.xz * 0.018), fbm(p.xz * 0.018 + vec2(5.2, 1.3)));
    vec3 q = p + vec3((warp.x - 0.5) * 14.0, 0.0, (warp.y - 0.5) * 14.0);
    vec3 bn = pow(abs(normalize(n)), vec3(3.5));
    bn /= bn.x + bn.y + bn.z + 1e-4;
    vec3 x = texture2D(tex, q.yz * scale).rgb;
    vec3 y = texture2D(tex, q.xz * scale).rgb;
    vec3 z = texture2D(tex, q.xy * scale).rgb;
    return x * bn.x + y * bn.y + z * bn.z;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

  void main() {
    vec3 n = normalize(vNormalW);
    float bump = fbm(vWorld.xz * 0.16);
    float bx = fbm(vWorld.xz * 0.16 + vec2(1.4, 0.0));
    float bz = fbm(vWorld.xz * 0.16 + vec2(0.0, 1.4));
    n = normalize(n + vec3(bump - bx, 0.0, bump - bz) * 0.65);
    float slope = 1.0 - clamp(n.y, 0.0, 1.0);
    float meters = vMeters;

    float n1 = fbm(vWorld.xz * 0.02);
    float clump = fbm(vWorld.xz * 0.007);
    // 贴图 colorSpace 已是 sRGB，采样结果是线性值，不要再 pow 一次
    vec3 canopy = tri(uCanopy, vWorld, n, 0.009);
    canopy *= 0.94 + clump * 0.12;
    vec3 meadow = tri(uMeadow, vWorld, n, 0.011);
    meadow *= 0.96 + n1 * 0.08;
    vec3 scree = tri(uScree, vWorld, n, 0.013);
    vec3 snowCol = tri(uSnow, vWorld, n, 0.01);

    float treeLine = 3120.0 + (fbm(vWorld.xz * 0.0042 + 2.0) - 0.5) * 480.0;
    float snowLine = 4920.0 + (fbm(vWorld.xz * 0.0048 + 9.0) - 0.5) * 560.0;
    float wMeadow = smoothstep(treeLine - 60.0, treeLine + 140.0, meters) * (1.0 - smoothstep(3850.0, 4400.0, meters));
    wMeadow *= 1.0 - smoothstep(0.32, 0.58, slope);
    float wSnow = smoothstep(snowLine - 140.0, snowLine + 30.0, meters) * (1.0 - smoothstep(0.4, 0.72, slope));
    float wDesert = smoothstep(3900.0, 4450.0, meters) * (1.0 - wSnow);
    float wRock = max(smoothstep(0.38, 0.66, slope), wDesert);

    vec3 col = canopy;
    col = mix(col, meadow, clamp(wMeadow, 0.0, 1.0));
    col = mix(col, scree, clamp(wRock, 0.0, 1.0) * (1.0 - wSnow * 0.85));
    col = mix(col, snowCol, clamp(wSnow, 0.0, 1.0));
    float outcrop = smoothstep(0.62, 0.86, fbm(vWorld.xz * 0.035 + 3.0));
    col = mix(col, scree * 0.85, clamp(wSnow, 0.0, 1.0) * outcrop * smoothstep(0.16, 0.42, slope));

    float dist = length(cameraPosition - vWorld);
    col *= mix(0.92, 1.0, smoothstep(0.0, 0.45, n.y));
    col *= mix(0.9, 1.0, vOcc);

    float band = smoothstep(uLo - 60.0, uLo + 90.0, meters) * (1.0 - smoothstep(uHi - 90.0, uHi + 50.0, meters));
    col *= 1.0 + band * 0.16;

    float ndl = dot(n, uSun);
    float sunW = clamp(ndl, 0.0, 1.0);
    vec3 sunCol = lin(vec3(1.0, 0.9, 0.72));
    vec3 sky = lin(vec3(0.48, 0.62, 0.82));
    vec3 lit = col * (sunCol * (0.55 + sunW * 0.7) + sky * 0.22);
    lit += lin(vec3(1.0, 0.96, 0.88)) * pow(clamp(dot(reflect(-uSun, n), normalize(cameraPosition - vWorld)), 0.0, 1.0), 36.0) * wSnow * sunW * 0.4;
    float aerial = smoothstep(uFogNear, uFogFar, dist);
    float luma = dot(lit, vec3(0.25, 0.65, 0.1));
    lit = mix(lit, vec3(luma), aerial * 0.55);
    vec3 haze = mix(uFogColor, lin(vec3(0.55, 0.68, 0.8)), 0.45);
    lit = mix(lit, haze, aerial * 0.7);
    gl_FragColor = vec4(lit, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
  }
`

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  varying vec3 vWorld;
  void main() {
    float w1 = sin(vWorld.x * 0.16 + uTime * 1.25) * cos(vWorld.z * 0.14 - uTime * 0.85);
    float w2 = sin(vWorld.x * 0.06 - uTime * 0.55 + vWorld.z * 0.08);
    vec3 n = normalize(vec3(w1 * 0.09, 1.0, w2 * 0.09));
    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.6);
    vec3 deep = pow(vec3(0.03, 0.32, 0.36), vec3(2.2));
    vec3 shallow = pow(vec3(0.2, 0.7, 0.66), vec3(2.2));
    vec3 sky = pow(vec3(0.72, 0.86, 0.93), vec3(2.2));
    vec3 col = mix(deep, shallow, 0.62 + w1 * 0.12);
    col = mix(col, sky, fres * 0.72);
    float spec = pow(max(dot(reflect(-uSun, n), view), 0.0), 70.0);
    col += spec * 0.4;
    gl_FragColor = vec4(col, 0.9);
#include <tonemapping_fragment>
#include <colorspace_fragment>
  }
`

function loadTex(url: string) {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function makeTree(kind: 'conifer' | 'broad') {
  const parts: THREE.BufferGeometry[] = []
  if (kind === 'conifer') {
    const trunk = new THREE.CylinderGeometry(0.05, 0.08, 0.32, 5)
    trunk.translate(0, 0.16, 0)
    const c1 = new THREE.ConeGeometry(0.36, 0.62, 6)
    c1.translate(0, 0.52, 0)
    const c2 = new THREE.ConeGeometry(0.28, 0.52, 6)
    c2.translate(0, 0.86, 0)
    const c3 = new THREE.ConeGeometry(0.16, 0.4, 5)
    c3.translate(0, 1.14, 0)
    parts.push(trunk, c1, c2, c3)
  } else {
    const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5)
    trunk.translate(0, 0.2, 0)
    const a = new THREE.IcosahedronGeometry(0.42, 1)
    a.translate(0, 0.72, 0)
    const b = new THREE.IcosahedronGeometry(0.28, 0)
    b.translate(0.22, 0.62, 0.08)
    const c = new THREE.IcosahedronGeometry(0.22, 0)
    c.translate(-0.16, 0.58, -0.06)
    parts.push(trunk, a, b, c)
  }
  const geo = mergeGeometries(parts, false)
  if (!geo) return null
  const pos = geo.attributes.position
  if (!pos) return geo
  const colors = new Float32Array(pos.count * 3)
  const leaf = new THREE.Color(kind === 'conifer' ? '#1e4a28' : '#2f6a34')
  const trunkC = new THREE.Color('#5a4030')
  const tmp = new THREE.Color()
  const trunkTop = kind === 'conifer' ? 0.34 : 0.38
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < trunkTop) tmp.copy(trunkC)
    else tmp.copy(leaf).offsetHSL(0, (y - trunkTop) * 0.04, (y - 0.6) * 0.05)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  parts.forEach((g) => g.dispose())
  return geo
}

function scatterTrees(lake: { x: number; z: number }, radius: number) {
  const conifer: THREE.Matrix4[] = []
  const broad: THREE.Matrix4[] = []
  const coniferColor: THREE.Color[] = []
  const broadColor: THREE.Color[] = []
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  let n = 0
  const step = 6.2
  for (let x = -HALF + 8; x < HALF - 8; x += step) {
    for (let z = -HALF + 8; z < HALF - 8; z += step) {
      n++
      const jx = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1
      const jz = Math.abs(Math.sin(n * 78.233) * 12345.678) % 1
      const px = x + (jx - 0.5) * step
      const pz = z + (jz - 0.5) * step
      if (Math.hypot(px - lake.x, pz - lake.z) < radius + 8) continue
      const m = elevation(px, pz)
      if (m < 700 || m > 2800) continue
      const yL = metersToY(elevation(px - 2, pz))
      const yR = metersToY(elevation(px + 2, pz))
      const yD = metersToY(elevation(px, pz - 2))
      const yU = metersToY(elevation(px, pz + 2))
      const slope = Math.hypot(yR - yL, yU - yD) / 4
      if (slope > 0.85) continue
      if (slope < 0.08 && m < 1500) continue
      const tall = 0.42 + (Math.abs(Math.sin(n * 1.7)) % 1) * 0.45
      dummy.position.set(px, metersToY(m), pz)
      dummy.rotation.set(0, (n % 17) * 0.4, 0)
      dummy.scale.setScalar(tall * (m > 1600 ? 1.15 : 1))
      dummy.updateMatrix()
      tint.setRGB(0.82 + (n % 5) * 0.04, 0.9 + (n % 3) * 0.03, 0.78 + (n % 4) * 0.04)
      if (m > 1450) {
        conifer.push(dummy.matrix.clone())
        coniferColor.push(tint.clone())
      } else if (m > 900 && n % 3 === 0) {
        conifer.push(dummy.matrix.clone())
        coniferColor.push(tint.clone())
      } else {
        broad.push(dummy.matrix.clone())
        broadColor.push(tint.clone())
      }
    }
  }
  return { conifer, broad, coniferColor, broadColor }
}

function placeInstances(geo: THREE.BufferGeometry, matrices: THREE.Matrix4[], colors: THREE.Color[]) {
  if (!matrices.length) return null
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    matrices.length,
  )
  matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat))
  colors.forEach((c, i) => mesh.setColorAt(i, c))
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false
  mesh.castShadow = false
  return mesh
}

function buildRibbon(pts: { x: number; y: number; z: number }[], halfW: number) {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(pts.length - 1, i + 1)]!
    const tx = next.x - prev.x
    const tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    const px = (-tz / len) * halfW
    const pz = (tx / len) * halfW
    positions.push(p.x + px, p.y, p.z + pz, p.x - px, p.y, p.z - pz)
    if (i < pts.length - 1) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function select(id: string) {
  selectedId.value = id
  panelOpen.value = true
  tab.value = 'climate'
}

function goView(id: 'wide' | 'near' | 'valley') {
  viewId.value = id
  if (!camera || !controls) return
  const v = VIEWS[id]
  viewAnim.on = true
  viewAnim.t = 0
  viewAnim.fromP.copy(camera.position)
  viewAnim.toP.set(v.pos[0], v.pos[1], v.pos[2])
  viewAnim.fromT.copy(controls.target)
  viewAnim.toT.set(v.target[0], v.target[1], v.target[2])
}

function zoom(dir: number) {
  if (!camera || !controls) return
  viewAnim.on = false
  const offset = camera.position.clone().sub(controls.target)
  const dist = THREE.MathUtils.clamp(
    offset.length() * (dir < 0 ? 0.82 : 1.22),
    controls.minDistance,
    controls.maxDistance,
  )
  offset.setLength(dist)
  camera.position.copy(controls.target).add(offset)
}

function resize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth || 640
  const h = Math.max(280, wrapRef.value.clientHeight)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  if (contourMat) contourMat.resolution.set(w, h)
}

function rebuildContours() {
  if (!scene || !contourMat) return
  if (contourGroup) {
    scene.remove(contourGroup)
    contourGroup.traverse((obj) => {
      const mesh = obj as THREE.Line
      mesh.geometry?.dispose()
    })
  }
  const z = zone.value
  const levels = [z.lo, z.hi].filter((m) => m > 80 && m < PEAK_M - 20)
  contourGroup = new THREE.Group()
  for (const level of levels) {
    const lines = contourLines(level)
    for (const line of lines) {
      if (line.length < 8) continue
      const geo = new LineGeometry()
      const flat: number[] = []
      for (const p of line) flat.push(p.x, p.y, p.z)
      geo.setPositions(flat)
      const mesh = new Line2(geo, contourMat)
      mesh.computeLineDistances()
      mesh.frustumCulled = false
      contourGroup.add(mesh)
    }
  }
  scene.add(contourGroup)
}

function projectMarks() {
  if (!camera || !wrapRef.value || !marksRef.value || !leadersRef.value) return
  const w = wrapRef.value.clientWidth
  const h = wrapRef.value.clientHeight
  marksRef.value.querySelectorAll<HTMLElement>('[data-k]').forEach((tag) => {
    tag.style.display = 'none'
  })
  leadersRef.value.querySelectorAll<SVGLineElement>('line[data-k]').forEach((line) => {
    line.setAttribute('visibility', 'hidden')
  })
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  const ndc = new THREE.Vector3()

  const place = (key: string, dx: number, dy: number) => {
    const tag = marksRef.value!.querySelector<HTMLElement>(`[data-k="${key}"]`)
    const line = leadersRef.value!.querySelector<SVGLineElement>(`line[data-k="${key}"]`)
    const anchor = realAnchors.get(key)
    if (!tag || !line || !anchor) {
      tag?.style.setProperty('display', 'none')
      line?.setAttribute('visibility', 'hidden')
      return
    }
    const inFront = anchor.clone().sub(camera!.position).dot(forward) > 6
    ndc.copy(anchor).project(camera!)
    const x = (ndc.x * 0.5 + 0.5) * w
    const y = (-ndc.y * 0.5 + 0.5) * h
    if (!inFront || x < -40 || x > w + 40 || y < -40 || y > h + 40) {
      tag.style.display = 'none'
      line.setAttribute('visibility', 'hidden')
      return
    }
    tag.style.display = 'flex'
    const lx = x + dx
    const ly = y + dy
    tag.style.transform = `translate(${lx}px, ${ly}px)`
    line.setAttribute('visibility', 'visible')
    line.setAttribute('x1', x.toFixed(1))
    line.setAttribute('y1', y.toFixed(1))
    line.setAttribute('x2', (lx + 8).toFixed(1))
    line.setAttribute('y2', (ly + 16).toFixed(1))
  }

  const selectedZone = zone.value
  const flip = selectedZone.azimuth > 8 ? 12 : -126
  place(selectedZone.id, flip, -30)
  place('peak', -24, -52)
  place('lift', 12, -26)
}

function frame(dt: number) {
  if (viewAnim.on && camera && controls) {
    viewAnim.t = Math.min(1, viewAnim.t + dt / 0.85)
    const k = viewAnim.t * viewAnim.t * (3 - 2 * viewAnim.t)
    camera.position.lerpVectors(viewAnim.fromP, viewAnim.toP, k)
    controls.target.lerpVectors(viewAnim.fromT, viewAnim.toT, k)
    if (viewAnim.t >= 1) viewAnim.on = false
  }
  if (waterMat) waterMat.uniforms.uTime!.value += dt
  if (arrowCurve && arrowCones.length) {
    const up = new THREE.Vector3(0, 1, 0)
    arrowCones.forEach((cone, i) => {
      const t = (clock.elapsedTime * 0.07 + i / arrowCones.length) % 1
      const p = arrowCurve!.getPointAt(Math.min(0.98, t))
      const tan = arrowCurve!.getTangentAt(Math.min(0.98, t)).normalize()
      cone.position.copy(p)
      cone.quaternion.setFromUnitVectors(up, tan)
    })
  }
  cloudSprites.forEach((s, i) => {
    const base = s.userData.baseX as number
    s.position.x = base + Math.sin(clock.elapsedTime * 0.08 + i) * 5
  })
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
  projectMarks()
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  frame(Math.min(0.05, clock.getDelta()))
}

function disposeScene() {
  disposed = true
  cancelAnimationFrame(raf)
  controls?.dispose()
  scene?.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  controls = null
}

interface RealTerrainMeta {
  gridSize: number
  widthMeters: number
  minElevation: number
  maxElevation: number
  officialSummitElevation?: number
  verticalExaggeration?: number
  bboxWGS84?: [number, number, number, number]
  summitWGS84?: [number, number]
}

async function addRealTerrain() {
  if (!scene || !renderer) return
  const ortho = new THREE.TextureLoader().load('/terrain/kilimanjaro/ortho.jpg')
  const [metaResponse, heightResponse, vegetationResponse] = await Promise.all([
    fetch('/terrain/kilimanjaro/metadata.json'),
    fetch('/terrain/kilimanjaro/height-u16.bin'),
    fetch('/terrain/kilimanjaro/vegetation-u8.bin'),
  ])
  if (!metaResponse.ok || !heightResponse.ok || !vegetationResponse.ok) {
    throw new Error('真实地形资源未生成')
  }
  const meta = (await metaResponse.json()) as RealTerrainMeta
  const encoded = new Uint16Array(await heightResponse.arrayBuffer())
  const vegetation = new Uint8Array(await vegetationResponse.arrayBuffer())
  const size = meta.gridSize
  if (encoded.length !== size * size) throw new Error('真实高程网格尺寸不一致')
  if (vegetation.length !== size * size) throw new Error('植被掩膜尺寸不一致')

  const heights = new Float32Array(encoded.length)
  const span = meta.maxElevation - meta.minElevation
  for (let i = 0; i < encoded.length; i++) {
    heights[i] = meta.minElevation + (encoded[i]! / 65535) * span
  }

  // 保留真实比例基础，并按元数据为课堂斜视轻微增强垂直高差。
  const verticalScale = (WORLD / meta.widthMeters) * (meta.verticalExaggeration ?? 1)
  const geometry = new THREE.PlaneGeometry(WORLD, WORLD, size - 1, size - 1)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  if (!position) throw new Error('真实地形缺少顶点')
  for (let i = 0; i < position.count; i++) {
    position.setY(i, (heights[i]! - meta.minElevation) * verticalScale)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  ortho.colorSpace = THREE.SRGBColorSpace
  ortho.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  // Sentinel 雪区高光较平，加入较弱的真实法线光照恢复山脊层次。
  const material = new THREE.MeshStandardMaterial({
    map: ortho,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
    emissive: 0x242424,
    emissiveMap: ortho,
    emissiveIntensity: 0.28,
  })
  const terrain = new THREE.Mesh(geometry, material)
  terrain.name = 'kilimanjaro-real-terrain'
  scene.add(terrain)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 5, WORLD * 5),
    new THREE.MeshLambertMaterial({ color: 0x52635b }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -2
  scene.add(floor)

  // 影像负责远景林冠，实例树只补充中近景轮廓；密度来自植被概率掩膜。
  const broadMatrices: THREE.Matrix4[] = []
  const heathMatrices: THREE.Matrix4[] = []
  const broadColors: THREE.Color[] = []
  const heathColors: THREE.Color[] = []
  const tree = new THREE.Object3D()
  const tint = new THREE.Color()
  const cellWorld = WORLD / (size - 1)
  const random01 = (seed: number) => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return value - Math.floor(value)
  }
  for (let iz = 3; iz < size - 3; iz += 4) {
    for (let ix = 3; ix < size - 3; ix += 4) {
      const index = iz * size + ix
      const probability = vegetation[index]! / 255
      if (probability < 0.16 || random01(index) > probability * 0.86) continue
      const elevationMeters = heights[index]!
      const clusterSize = probability > 0.56 ? 3 : probability > 0.32 ? 2 : 1
      for (let cluster = 0; cluster < clusterSize; cluster++) {
        const seed = index * 3 + cluster * 991
        const jitterX = (random01(seed) - 0.5) * cellWorld * 3.4
        const jitterZ = (random01(seed + 17) - 0.5) * cellWorld * 3.4
        tree.position.set(
          (ix / (size - 1) - 0.5) * WORLD + jitterX,
          (elevationMeters - meta.minElevation) * verticalScale,
          (iz / (size - 1) - 0.5) * WORLD + jitterZ,
        )
        tree.rotation.set(0, random01(seed + 31) * Math.PI * 2, 0)
        // 单株高度约 15–25 米；略放大轮廓以抵消课堂投屏和抗锯齿造成的细节损失。
        tree.scale.setScalar(0.28 + random01(seed + 47) * 0.17)
        tree.updateMatrix()
        const upperForest = elevationMeters > 2650
        // instanceColor 会与几何体已有的深绿顶点色相乘，必须使用浅色调制，
        // 否则两次乘色会让近景树木变成几乎纯黑的点。
        tint.set(upperForest ? '#c4d8c3' : '#d6e8c0')
        tint.offsetHSL(
          (random01(seed + 59) - 0.5) * 0.025,
          0,
          (random01(seed + 73) - 0.5) * 0.1,
        )
        if (upperForest && random01(seed + 89) > 0.35) {
          heathMatrices.push(tree.matrix.clone())
          heathColors.push(tint.clone())
        } else {
          broadMatrices.push(tree.matrix.clone())
          broadColors.push(tint.clone())
        }
      }
    }
  }
  const broadGeometry = makeTree('broad')
  const heathGeometry = makeTree('conifer')
  if (broadGeometry) {
    const broadForest = placeInstances(broadGeometry, broadMatrices, broadColors)
    if (broadForest) scene.add(broadForest)
  }
  if (heathGeometry) {
    const upperForest = placeInstances(heathGeometry, heathMatrices, heathColors)
    if (upperForest) scene.add(upperForest)
  }

  let peakX = 0
  let peakZ = 0
  if (meta.bboxWGS84 && meta.summitWGS84) {
    const [west, south, east, north] = meta.bboxWGS84
    const [summitLon, summitLat] = meta.summitWGS84
    peakX = Math.round(((summitLon - west) / (east - west)) * (size - 1))
    peakZ = Math.round(((north - summitLat) / (north - south)) * (size - 1))
  } else {
    let peakIndex = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i]! > heights[peakIndex]!) peakIndex = i
    }
    peakX = peakIndex % size
    peakZ = Math.floor(peakIndex / size)
  }
  const worldPoint = (ix: number, iz: number, lift = 2) => {
    const i = iz * size + ix
    return new THREE.Vector3(
      (ix / (size - 1) - 0.5) * WORLD,
      (heights[i]! - meta.minElevation) * verticalScale + lift,
      (iz / (size - 1) - 0.5) * WORLD,
    )
  }
  peak = {
    x: (peakX / (size - 1) - 0.5) * WORLD,
    z: (peakZ / (size - 1) - 0.5) * WORLD,
    m: meta.officialSummitElevation ?? meta.maxElevation,
  }
  realPeakM.value = Math.round(meta.officialSummitElevation ?? meta.maxElevation)
  realAnchors.clear()
  realAnchors.set('peak', worldPoint(peakX, peakZ, 5))

  for (const naturalZone of ZONES) {
    const top = Math.min(naturalZone.hi, peak.m)
    const teachingMeters = naturalZone.lo + Math.max(40, top - naturalZone.lo) * 0.5
    if (naturalZone.hi < meta.minElevation || naturalZone.lo > meta.maxElevation) continue
    const targetElevation = THREE.MathUtils.clamp(
      teachingMeters,
      meta.minElevation,
      meta.maxElevation,
    )
    const angle = THREE.MathUtils.degToRad(naturalZone.azimuth)
    let bestX = peakX
    let bestZ = peakZ
    let bestDelta = Number.POSITIVE_INFINITY
    for (let radius = 2; radius < size * 0.72; radius += 1.2) {
      const ix = Math.round(peakX + Math.sin(angle) * radius)
      const iz = Math.round(peakZ + Math.cos(angle) * radius)
      if (ix < 0 || ix >= size || iz < 0 || iz >= size) break
      const delta = Math.abs(heights[iz * size + ix]! - targetElevation)
      if (delta < bestDelta) {
        bestDelta = delta
        bestX = ix
        bestZ = iz
      }
    }
    realAnchors.set(naturalZone.id, worldPoint(bestX, bestZ))
  }
  const liftPoints = ['broad', 'conifer', 'meadow', 'desert']
    .map((key) => realAnchors.get(key)?.clone().add(new THREE.Vector3(0, 4, 0)))
    .filter((point): point is THREE.Vector3 => !!point)
  if (liftPoints.length >= 3) {
    arrowCurve = new THREE.CatmullRomCurve3(liftPoints)
    scene.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(arrowCurve, 48, 0.7, 7, false),
        new THREE.MeshBasicMaterial({ color: DemoHex.lift, toneMapped: false }),
      ),
    )
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 5.2, 9),
        new THREE.MeshBasicMaterial({ color: DemoHex.lift, toneMapped: false }),
      )
      arrowCones.push(cone)
      scene.add(cone)
    }
    realAnchors.set('lift', arrowCurve.getPointAt(0.42))
  }
}

function setup() {
  if (!canvasRef.value || !wrapRef.value) return
  disposed = false
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: false })
  } catch {
    failed.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xb7cbe0)
  scene.fog = new THREE.Fog(0xb7cbe0, 380, 1200)
  camera = new THREE.PerspectiveCamera(52, 1, 1, 2400)
  const start = VIEWS.wide
  camera.position.set(start.pos[0], start.pos[1], start.pos[2])

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(start.target[0], start.target[1], start.target[2])
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minPolarAngle = 0.18
  controls.minDistance = 28
  controls.maxDistance = 1100
  controls.addEventListener('start', () => {
    viewAnim.on = false
  })

  scene.add(new THREE.HemisphereLight(0xd5e8f8, 0x3a5340, 0.9))
  scene.add(new THREE.AmbientLight(0xffffff, 0.22))
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.45)
  sun.position.copy(SUN).multiplyScalar(220)
  scene.add(sun)

  void addRealTerrain()
    .then(() => {
      if (disposed || !scene) return
      scene.fog = new THREE.Fog(0xb7cbe0, 560, 1350)
      resize()
      ready.value = true
      clock.start()
      loop()
    })
    .catch((error: unknown) => {
      console.error(error)
      failed.value = true
    })
  // 保留旧程序地形作为开发回退；正式路径在真实数据加载后结束。
  scene.userData.realTerrain = true
  if (scene.userData.realTerrain) return

  const fogColor = new THREE.Color(0xc5d6ea)
  const canopy = loadTex('/textures/landcover/canopy-aerial.jpg')
  const meadow = loadTex('/textures/landcover/meadow-aerial.jpg')
  const scree = loadTex('/textures/landcover/scree-aerial.jpg')
  const snow = loadTex('/textures/landcover/snowfield-aerial.jpg')
  const terrainMat = new THREE.ShaderMaterial({
    name: 'vertical-terrain',
    uniforms: {
      uCanopy: { value: canopy },
      uMeadow: { value: meadow },
      uScree: { value: scree },
      uSnow: { value: snow },
      uPeakY: { value: PEAK_Y },
      uPeakM: { value: PEAK_M },
      uLo: { value: zone.value.lo },
      uHi: { value: zone.value.hi },
      uSun: { value: SUN },
      uFogColor: { value: fogColor },
      uFogNear: { value: 340 },
      uFogFar: { value: 1080 },
    },
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
  })
  terrainUniforms = terrainMat.uniforms as { uLo: { value: number }; uHi: { value: number } }
  const seg = 280
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  if (!pos) return
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, metersToY(elevation(pos.getX(i), pos.getZ(i))))
  }
  const occ = new Float32Array(pos.count)
  const grid = seg + 1
  for (let i = 0; i < pos.count; i++) {
    const ix = i % grid
    const iz = Math.floor(i / grid)
    const h = pos.getY(i)
    const left = pos.getY(iz * grid + Math.max(0, ix - 2))
    const right = pos.getY(iz * grid + Math.min(grid - 1, ix + 2))
    const down = pos.getY(Math.max(0, iz - 2) * grid + ix)
    const up = pos.getY(Math.min(grid - 1, iz + 2) * grid + ix)
    const dip = (left + right + down + up) / 4 - h
    occ[i] = Math.min(1, Math.max(0.7, 1 - dip * 0.09))
  }
  geo.setAttribute('aOcc', new THREE.BufferAttribute(occ, 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  scene.add(new THREE.Mesh(geo, terrainMat))

  peak = findPeak()
  const lake = lakeCenter()
  const surface = lakeSurfaceMeters()
  const radius = lakeRadius(surface)

  waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN } },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  })
  const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), waterMat)
  lakeMesh.rotation.x = -Math.PI / 2
  lakeMesh.position.set(lake.x, metersToY(surface), lake.z)
  lakeMesh.renderOrder = 2
  scene.add(lakeMesh)

  const river = riverPoints(0.45)
  const riverMesh = new THREE.Mesh(buildRibbon(river, 3.2), waterMat)
  riverMesh.renderOrder = 2
  scene.add(riverMesh)

  const trees = scatterTrees(lake, radius)
  const coniferGeo = makeTree('conifer')
  const broadGeo = makeTree('broad')
  if (coniferGeo) {
    const mesh = placeInstances(coniferGeo, trees.conifer, trees.coniferColor)
    if (mesh) scene.add(mesh)
  }
  if (broadGeo) {
    const mesh = placeInstances(broadGeo, trees.broad, trees.broadColor)
    if (mesh) scene.add(mesh)
  }

  const cloudCanvas = document.createElement('canvas')
  cloudCanvas.width = cloudCanvas.height = 256
  const cloudCtx = cloudCanvas.getContext('2d')
  if (cloudCtx) {
    const blobs: Array<[number, number, number]> = [
      [128, 132, 78],
      [86, 146, 52],
      [172, 140, 56],
      [118, 96, 42],
      [154, 158, 36],
    ]
    for (const [x, y, r] of blobs) {
      const grd = cloudCtx.createRadialGradient(x, y, r * 0.15, x, y, r)
      grd.addColorStop(0, 'rgba(255,255,255,0.9)')
      grd.addColorStop(0.5, 'rgba(255,255,255,0.35)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      cloudCtx.fillStyle = grd
      cloudCtx.beginPath()
      cloudCtx.arc(x, y, r, 0, Math.PI * 2)
      cloudCtx.fill()
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas)
    cloudTex.colorSpace = THREE.SRGBColorSpace
    const spots = [
      [20, 40, 110, 0.42],
      [70, 20, 90, 0.34],
      [-30, 10, 100, 0.3],
      [110, 70, 80, 0.28],
      [-60, 50, 86, 0.26],
    ]
    for (const [x, z, s, o] of spots) {
      const m = elevation(x!, z!)
      if (m > 3800) continue
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: o,
        depthWrite: false,
        color: 0xf7fafc,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.position.set(x!, metersToY(m) + 12, z!)
      sprite.scale.set(s!, s! * 0.55, 1)
      sprite.userData.baseX = x
      cloudSprites.push(sprite)
      scene.add(sprite)
    }
  }

  function addRange(
    z: number,
    y: number,
    width: number,
    depth: number,
    height: number,
    haze: number,
    shiftX: number,
  ) {
    const rangeGeo = new THREE.PlaneGeometry(width, depth, 64, 32)
    rangeGeo.rotateX(-Math.PI / 2)
    const attr = rangeGeo.attributes.position
    if (!attr) return
    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i)
      const zz = attr.getZ(i)
      const nx = x / (width * 0.42)
      const nz = zz / (depth * 0.42)
      const h =
        Math.exp(-(nx * nx) * 1.3 - nz * nz * 1.1) * height +
        Math.exp(-((nx - 0.65) ** 2) * 2.6 - ((nz + 0.15) ** 2) * 1.5) * height * 0.62 +
        Math.exp(-((nx + 0.72) ** 2) * 2.1 - ((nz - 0.2) ** 2) * 1.8) * height * 0.48
      attr.setY(i, Math.max(0, h))
    }
    rangeGeo.computeVertexNormals()
    const mesh = new THREE.Mesh(
      rangeGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: SUN },
          uHaze: { value: new THREE.Color(0xb7c8dc) },
          uMix: { value: haze },
          uPeak: { value: height },
        },
        vertexShader: `
          varying float vH;
          varying vec3 vN;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vH = position.y;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: `
          varying float vH;
          varying vec3 vN;
          uniform vec3 uSun;
          uniform vec3 uHaze;
          uniform float uMix;
          uniform float uPeak;
          void main() {
            float h = clamp(vH / max(uPeak, 1.0), 0.0, 1.0);
            vec3 forest = pow(vec3(0.04, 0.11, 0.035), vec3(2.2));
            vec3 rock = pow(vec3(0.48, 0.45, 0.41), vec3(2.2));
            vec3 snow = pow(vec3(0.94, 0.96, 0.98), vec3(2.2));
            vec3 col = mix(forest, rock, smoothstep(0.42, 0.68, h));
            col = mix(col, snow, smoothstep(0.7, 0.88, h) * smoothstep(0.25, 0.6, vN.y));
            float ndl = clamp(dot(normalize(vN), uSun), 0.0, 1.0);
            col *= 0.42 + ndl * 1.05;
            col = mix(col, pow(uHaze, vec3(2.2)), uMix);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    )
    mesh.position.set(shiftX, y, z)
    scene!.add(mesh)
  }
  addRange(200, 0, 640, 180, 16, 0.15, -10)
  addRange(-300, 4, 860, 380, 62, 0.42, 30)
  addRange(-520, 2, 980, 420, 50, 0.66, -40)
  addRange(-760, 0, 1100, 460, 38, 0.82, 20)

  const liftPts = [1000, 1500, 2000, 2500, 3000, 3450]
    .map((m) => pointAtElevation(peak, m, -38))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => new THREE.Vector3(p.x, p.y + 2.4, p.z))
  if (liftPts.length >= 3) {
    arrowCurve = new THREE.CatmullRomCurve3(liftPts)
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(arrowCurve, 40, 0.55, 6, false),
      new THREE.MeshBasicMaterial({ color: DemoHex.lift, toneMapped: false }),
    )
    scene.add(tube)
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.7, 4.4, 8),
        new THREE.MeshBasicMaterial({ color: DemoHex.lift, toneMapped: false }),
      )
      arrowCones.push(cone)
      scene.add(cone)
    }
  }

  contourMat = new LineMaterial({
    color: 0x8fd4ff,
    linewidth: 2.4,
    dashed: true,
    dashSize: 2.2,
    gapSize: 1.4,
    worldUnits: false,
    toneMapped: false,
  })
  rebuildContours()
  resize()
  ready.value = true
  clock.start()
  loop()
}

watch(selectedId, () => {
  if (terrainUniforms) {
    terrainUniforms.uLo.value = zone.value.lo
    terrainUniforms.uHi.value = zone.value.hi
  }
  if (ready.value) rebuildContours()
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  setup()
  resizeObserver = new ResizeObserver(() => resize())
  if (wrapRef.value) resizeObserver.observe(wrapRef.value)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  disposeScene()
})
</script>

<template>
  <div ref="wrapRef" class="scene">
    <canvas ref="canvasRef" />
    <p v-if="failed" class="loading">这个环境没能启动三维画面。</p>
    <p v-else-if="!ready" class="loading">正在生成山地…</p>
    <svg ref="leadersRef" class="leaders">
      <line v-for="z in ZONES" :key="z.id" :data-k="z.id" />
      <line data-k="peak" />
      <line data-k="lift" />
    </svg>
    <div ref="marksRef" class="marks">
      <button
        v-for="z in ZONES"
        :key="z.id"
        type="button"
        class="tag"
        :class="{ on: selectedId === z.id }"
        :data-k="z.id"
        @click="select(z.id)"
      >
        <b>{{ Math.round((z.lo + Math.min(z.hi, realPeakM)) / 2).toLocaleString('zh-CN') }} m</b>
        <span>{{ z.name }}</span>
      </button>
      <div class="tag peak" data-k="peak">
        <b>海拔 {{ realPeakM.toLocaleString('zh-CN') }} m</b>
        <span>乞力马扎罗山乌呼鲁峰</span>
      </div>
      <div class="tag lift" data-k="lift">水汽抬升</div>
    </div>

    <div class="hud dock left">
      <section class="panel">
        <header class="title">
          <svg viewBox="0 0 24 24" class="ico" aria-hidden="true">
            <path d="M3 18 L9 8 L13 13 L16 9 L21 18 Z" fill="currentColor" />
          </svg>
          <div>
            <h2>乞力马扎罗山垂直自然带</h2>
            <p>从热带草原到 5895 米峰顶，水热改变、植被更替</p>
          </div>
        </header>
        <p class="axis-label">海拔（米）</p>
        <ul class="axis">
          <li v-for="z in ZONES" :key="z.id">
            <button type="button" :class="{ on: selectedId === z.id }" @click="select(z.id)">
              <i class="dot" />
              <span class="range">{{ z.axis }}</span>
              <span class="name">{{ z.name }}</span>
            </button>
          </li>
        </ul>
        <p class="fine">SRTM 地形 + Sentinel-2 影像 · 自然带为教学示意</p>
      </section>
      <div class="views">
        <p>视角切换</p>
        <div class="view-row">
          <button type="button" :class="{ on: viewId === 'wide' }" @click="goView('wide')">
            <i class="mini wide" />
            全景视角
          </button>
          <button type="button" :class="{ on: viewId === 'near' }" @click="goView('near')">
            <i class="mini near" />
            山体近景
          </button>
          <button type="button" :class="{ on: viewId === 'valley' }" @click="goView('valley')">
            <i class="mini valley" />
            山谷视角
          </button>
        </div>
      </div>
    </div>

    <aside v-if="panelOpen" class="hud panel card">
      <header class="card-h">
        <div>
          <h3>{{ zone.name }}</h3>
          <p>{{ zone.rangeLabel }}</p>
        </div>
        <button type="button" class="x" aria-label="关闭" @click="panelOpen = false">×</button>
      </header>
      <p class="blurb">{{ zone.blurb }}</p>
      <div class="tabs">
        <button type="button" :class="{ on: tab === 'climate' }" @click="tab = 'climate'">气候特征</button>
        <button type="button" :class="{ on: tab === 'veg' }" @click="tab = 'veg'">典型植被</button>
        <button type="button" :class="{ on: tab === 'animal' }" @click="tab = 'animal'">代表动物</button>
        <button type="button" :class="{ on: tab === 'feature' }" @click="tab = 'feature'">景观特点</button>
      </div>
      <div v-if="tab === 'climate'" class="stats">
        <p><i class="sym">℃</i><span>年平均气温</span><b>{{ zone.temp }}</b></p>
        <p><i class="sym">❄</i><span>年降水量</span><b>{{ zone.precip }}</b></p>
        <p><i class="sym">≈</i><span>气候特点</span><b>{{ zone.climate }}</b></p>
      </div>
      <p v-else-if="tab === 'veg'" class="body">{{ zone.veg }}</p>
      <p v-else-if="tab === 'animal'" class="body">{{ zone.animals }}</p>
      <p v-else class="body">{{ zone.feature }}</p>
      <div v-if="tab === 'climate' || tab === 'veg'" class="shots">
        <figure>
          <i class="shot meadow" />
          <figcaption>高山草甸</figcaption>
        </figure>
        <figure>
          <i class="shot rhodo" />
          <figcaption>高山杜鹃</figcaption>
        </figure>
        <figure>
          <i class="shot tundra" />
          <figcaption>苔原植被</figcaption>
        </figure>
      </div>
    </aside>
    <button v-else type="button" class="hud reopen" @click="panelOpen = true">地带说明</button>

    <div class="hud zoom">
      <button type="button" aria-label="回到全景" @click="goView('wide')">◎</button>
      <button type="button" aria-label="拉近" @click="zoom(-1)">+</button>
      <button type="button" aria-label="拉远" @click="zoom(1)">−</button>
    </div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  height: 100%;
  min-height: 360px;
  background: #8eb4d4;
  overflow: hidden;
  font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 1;
}
.hero {
  position: absolute;
  z-index: 0;
  inset: -1.5%;
  width: 103%;
  height: 103%;
  object-fit: cover;
  object-position: center;
  transform-origin: 50% 52%;
  transition: transform 0.8s cubic-bezier(.22, .72, .2, 1), filter 0.8s ease;
  user-select: none;
  pointer-events: none;
}
.hero.flying {
  filter: saturate(1.04) contrast(1.025);
}
.hero-swap-enter-active,
.hero-swap-leave-active {
  position: absolute;
  transition: opacity 0.7s ease, transform 1s cubic-bezier(.22, .72, .2, 1);
}
.hero-swap-enter-from {
  opacity: 0;
  transform: scale(0.97) !important;
}
.hero-swap-leave-to {
  opacity: 0;
  transform: scale(1.13) !important;
}
.depth-cloud {
  position: absolute;
  z-index: 1;
  width: 38%;
  height: 12%;
  border-radius: 50%;
  opacity: 0.2;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.7), rgba(235, 244, 250, 0.18) 52%, transparent 72%);
  filter: blur(12px);
  pointer-events: none;
  transition: transform 1.1s cubic-bezier(.22, .72, .2, 1), opacity 0.7s ease;
}
.depth-cloud.cloud-a {
  left: 8%;
  top: 48%;
  transform: translate3d(0, 0, 0) scale(1);
}
.depth-cloud.cloud-b {
  right: 4%;
  top: 61%;
  width: 30%;
  opacity: 0.14;
  transform: translate3d(0, 0, 0) scale(0.85);
}
.depth-cloud.cloud-a.flying {
  transform: translate3d(-12%, 12%, 0) scale(1.35);
  opacity: 0.3;
}
.depth-cloud.cloud-b.flying {
  transform: translate3d(14%, 6%, 0) scale(1.18);
  opacity: 0.23;
}
.hero-process {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.lift-route {
  fill: none;
  stroke: var(--demo-lift);
  stroke-width: 4;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
}
#lift-head path,
.lift-pulse {
  fill: var(--demo-lift);
}
.loading {
  position: absolute;
  z-index: 8;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--demo-ink);
  background: rgba(8, 16, 28, 0.35);
  pointer-events: none;
}
.leaders {
  position: absolute;
  z-index: 3;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.leaders line {
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 1;
  visibility: hidden;
}
.marks {
  position: absolute;
  z-index: 4;
  inset: 0;
  pointer-events: none;
}
.tag {
  position: absolute;
  left: 0;
  top: 0;
  display: none;
  flex-direction: column;
  gap: 1px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: rgba(12, 22, 36, 0.72);
  color: #fff;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  transition: transform 0.65s cubic-bezier(.22, .72, .2, 1), opacity 0.4s ease;
}
.tag b {
  font-size: 12px;
  font-weight: 650;
}
.tag span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.82);
}
.tag.on {
  outline: 1px solid var(--demo-accent);
}
.tag.lift {
  color: var(--demo-lift);
  font-size: 12px;
  font-weight: 650;
}
.hud {
  z-index: 5;
  pointer-events: auto;
}
.dock {
  position: absolute;
  top: 12px;
  bottom: 72px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 228px;
}
.dock.left { left: 12px; }
.panel {
  border-radius: 14px;
  background: rgba(10, 20, 34, 0.78);
  color: var(--demo-ink);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}
.dock .panel {
  padding: 12px 12px 10px;
  overflow: auto;
}
.title {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ico {
  width: 22px;
  height: 22px;
  margin-top: 2px;
  color: var(--demo-accent-soft);
  flex: none;
}
.title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 680;
}
.title p,
.fine,
.axis-label {
  margin: 2px 0 0;
  color: var(--demo-ink-dim);
  font-size: 11px;
}
.axis-label { margin: 12px 0 6px; }
.axis {
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
  border-left: 1px solid rgba(255, 255, 255, 0.28);
}
.axis button {
  display: grid;
  grid-template-columns: 14px 76px 1fr;
  gap: 4px;
  align-items: center;
  width: 100%;
  margin: 0 0 2px -7px;
  padding: 5px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.axis button.on { background: var(--demo-accent-on); }
.dot {
  width: 8px;
  height: 8px;
  border: 2px solid #fff;
  border-radius: 50%;
  justify-self: center;
}
.axis button.on .dot {
  background: var(--demo-accent);
  box-shadow: 0 0 0 3px rgba(74, 163, 217, 0.28);
}
.range { font-size: 12px; color: var(--demo-ink-muted); }
.name { font-size: 12px; }
.fine { margin-top: 8px; }
.views {
  margin-top: auto;
  padding: 8px;
  border-radius: 12px;
  background: rgba(10, 20, 34, 0.78);
  backdrop-filter: blur(12px);
}
.views p {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--demo-ink-dim);
}
.view-row { display: flex; gap: 6px; }
.view-row button {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--demo-ink-muted);
  font-size: 10px;
  cursor: pointer;
}
.view-row button.on { border-color: var(--demo-accent); color: #fff; }
.mini {
  display: block;
  width: 100%;
  height: 36px;
  border-radius: 6px;
}
.mini.wide { background: linear-gradient(#7eb6e6, #8fbf6a 55%, #1f6f86); }
.mini.near { background: linear-gradient(#d7e6f2, #f4f7fb 42%, #6d8ea4); }
.mini.valley { background: linear-gradient(#9fd0ea, #2f6a40 50%, #1a6a72); }
.card {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 280px;
  max-height: calc(100% - 86px);
  overflow: auto;
  padding: 12px 12px 10px;
}
.card-h {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.card-h h3 { margin: 0; font-size: 16px; }
.card-h p { margin: 2px 0 0; font-size: 12px; color: var(--demo-accent-soft); }
.x {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--demo-ink-muted);
  font-size: 18px;
  cursor: pointer;
}
.blurb {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--demo-ink-muted);
}
.tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.tabs button {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: transparent;
  color: var(--demo-ink-dim);
  font-size: 11px;
  cursor: pointer;
}
.tabs button.on { background: var(--demo-accent); color: #fff; }
.stats { margin: 8px 0 0; }
.stats p, .body {
  display: grid;
  grid-template-columns: 22px 72px 1fr;
  gap: 6px;
  align-items: start;
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.45;
}
.body { display: block; color: var(--demo-ink-muted); }
.sym { color: var(--demo-accent-soft); font-style: normal; }
.stats span { color: var(--demo-ink-dim); }
.stats b { font-weight: 560; }
.shots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 4px 0 0;
}
.shots figure { margin: 0; }
.shot {
  display: block;
  height: 52px;
  border-radius: 8px;
}
.shot.meadow { background: radial-gradient(circle at 30% 70%, #f2e27a 0 6%, transparent 7%), radial-gradient(circle at 60% 40%, #fff 0 5%, transparent 6%), linear-gradient(#7fbe58, #3e7a34); }
.shot.rhodo { background: radial-gradient(circle at 40% 45%, #d4538a 0 16%, transparent 17%), radial-gradient(circle at 68% 58%, #c43d78 0 12%, transparent 13%), linear-gradient(#2f6a38, #1d4a28); }
.shot.tundra { background: radial-gradient(circle at 30% 60%, #8a9294 0 14%, transparent 15%), linear-gradient(#c5d0c8, #6e8a78 60%, #5c6b62); }
.shots figcaption {
  margin-top: 3px;
  font-size: 10px;
  text-align: center;
  color: var(--demo-ink-dim);
}
.reopen {
  position: absolute;
  top: 12px;
  right: 12px;
  border: 0;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(10, 20, 34, 0.82);
  color: #fff;
  cursor: pointer;
}
.zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(10, 20, 34, 0.78);
}
.zoom button {
  width: 36px;
  height: 34px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}
.zoom button:last-child { border-bottom: 0; }
</style>
