<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{ stepId: string; demo: DemoEntry }>()
const mount = ref<HTMLDivElement | null>(null)
const rain = ref(68)
const forest = ref(82)
const playing = ref(true)
const isElements = computed(() => props.stepId === 'elements')
const runoff = computed(() => Math.round(rain.value * (1.48 - forest.value / 150)))
const erosion = computed(() => Math.min(100, Math.round(rain.value * (1.55 - forest.value / 115))))
const riverLevel = computed(() => Math.min(98, Math.round(19 + runoff.value * 0.72)))
const stateName = computed(() => (forest.value > 65 ? '林冠完整' : forest.value > 35 ? '斑块退化' : '植被破坏'))
const stateCopy = computed(() => (forest.value > 65
  ? '林冠截留降雨，枯落物与根系帮助雨水下渗，河流涨水较缓。'
  : forest.value > 35
    ? '林地破碎，部分坡面开始形成快速径流与轻微沟蚀。'
    : '裸露坡面直接承受雨滴打击，径流夹带泥沙，洪峰明显抬升。'))

const elements = [
  { id: 'air', name: '大气', copy: '热量、降水与气体交换', color: DemoHex.air },
  { id: 'water', name: '水', copy: '蒸发、降水、径流与下渗', color: DemoHex.water },
  { id: 'soil', name: '土壤', copy: '储水、供肥并承接风化产物', color: DemoHex.soil },
  { id: 'life', name: '生物', copy: '改变水分、养分与地表覆盖', color: DemoHex.vegetation },
  { id: 'rock', name: '岩石及地貌', copy: '提供物质基础并控制地表过程', color: DemoHex.rock },
]

let renderer: THREE.WebGLRenderer | null
let scene: THREE.Scene | null
let camera: THREE.PerspectiveCamera | null
let controls: OrbitControls | null
let resizeObserver: ResizeObserver | null
let raf = 0
let rainPoints: THREE.Points | null
let rainPositions: Float32Array | null
let trees: THREE.Group | null
let water: THREE.Mesh | null
let ground: THREE.MeshStandardMaterial | null
const clock = new THREE.Clock()
const h = (x: number, z: number) => Math.sin(x * 0.16) * 1.8 + Math.cos(z * 0.19) * 1.2 + Math.sin((x + z) * 0.08) * 2.8 + Math.min(11, Math.abs(x) * 0.38 + Math.abs(z) * 0.055) - Math.exp(-(x * x) / 78) * 6.8 - 2.6

function texture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 128, 128)
  gradient.addColorStop(0, DemoHex.vegetation)
  gradient.addColorStop(1, DemoHex.groundDark)
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 1100; i += 1) {
    context.fillStyle = `rgba(184,210,151,${Math.random() * 0.24})`
    context.fillRect(Math.random() * 128, Math.random() * 128, 1, 1)
  }
  const result = new THREE.CanvasTexture(canvas)
  result.wrapS = result.wrapT = THREE.RepeatWrapping
  result.repeat.set(7, 7)
  result.colorSpace = THREE.SRGBColorSpace
  return result
}

function terrain() {
  const geometry = new THREE.PlaneGeometry(54, 62, 80, 80)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) position.setY(i, h(position.getX(i), position.getZ(i)))
  geometry.computeVertexNormals()
  ground = new THREE.MeshStandardMaterial({ map: texture(), roughness: 0.96 })
  const mesh = new THREE.Mesh(geometry, ground)
  mesh.receiveShadow = true
  scene!.add(mesh)
}

function tree(parent: THREE.Group, x: number, z: number, scale: number) {
  const group = new THREE.Group()
  group.position.set(x, h(x, z), z)
  group.scale.setScalar(scale)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.35, 7), new THREE.MeshStandardMaterial({ color: DemoHex.soil }))
  trunk.position.y = 0.67
  trunk.castShadow = true
  group.add(trunk)
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.33 + Math.random() * 0.035, 0.34, 0.22 + Math.random() * 0.06), roughness: 0.88 })
  ;[[0.9, 1.15, 1.5], [0.67, 1.86, 1.25], [0.42, 2.43, 0.98]].forEach(([radius, y, height]) => {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), material)
    crown.position.y = y
    crown.castShadow = true
    group.add(crown)
  })
  parent.add(group)
}

function rebuildForest() {
  if (!scene) return
  if (trees) scene.remove(trees)
  trees = new THREE.Group()
  const wanted = Math.round(34 + forest.value * 1.7)
  let count = 0
  for (let i = 0; i < 210 && count < wanted; i += 1) {
    const x = ((i * 37) % 510) / 10 - 25.5
    const z = ((i * 71) % 550) / 10 - 27.5
    if (Math.abs(x) < 4.1 || (x > 15 && z < -12)) continue
    tree(trees, x, z, 0.58 + ((i * 13) % 45) / 100)
    count += 1
  }
  scene.add(trees)
}

function river() {
  const shape = new THREE.Shape()
  shape.moveTo(-2.2, -31)
  shape.bezierCurveTo(-1.4, -15, 2.2, -8, 0.4, 2)
  shape.bezierCurveTo(-2.1, 13, 1.8, 22, -0.8, 31)
  shape.lineTo(3.8, 31)
  shape.bezierCurveTo(5.8, 21, 1.8, 12, 4.6, 2)
  shape.bezierCurveTo(6.8, -8, 3.4, -17, 2.6, -31)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  water = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color: DemoHex.water, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.92, clearcoat: 0.65 }))
  water.position.y = -1.75
  scene!.add(water)
}

function rainField() {
  const count = 2400
  rainPositions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 58
    rainPositions[i * 3 + 1] = Math.random() * 25 + 1
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 58
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3))
  rainPoints = new THREE.Points(geometry, new THREE.PointsMaterial({ color: DemoHex.rainDrop, size: 0.065, transparent: true, opacity: 0.56, depthWrite: false }))
  scene!.add(rainPoints)
}

function cloud(x: number, y: number, z: number) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: DemoHex.cloud, roughness: 1, transparent: true, opacity: 0.72 })
  for (let i = 0; i < 6; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.3 + Math.random(), 12, 8), material)
    mesh.position.set((i - 2.5) * 1.25, Math.random() * 0.8, (Math.random() - 0.5) * 1.2)
    group.add(mesh)
  }
  group.position.set(x, y, z)
  scene!.add(group)
}

function update() {
  if (!rainPoints || !water || !ground) return
  const material = rainPoints.material as THREE.PointsMaterial
  material.opacity = 0.12 + rain.value / 100 * 0.7
  material.size = 0.035 + rain.value / 1800
  ground.color.setHSL(0.39 - rain.value / 1500, 0.3 + rain.value / 500, 0.16 + rain.value / 1300)
  water.position.y = -1.86 + riverLevel.value / 200
  water.scale.x = 1 + riverLevel.value / 260
  ;(water.material as THREE.MeshPhysicalMaterial).color.set(erosion.value > 70 ? DemoHex.soil : DemoHex.water)
}

function preset(value: 'intact' | 'broken') {
  if (value === 'intact') {
    forest.value = 86
    rain.value = 64
  } else {
    forest.value = 20
    rain.value = 84
  }
}

function init() {
  if (!mount.value) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(DemoHex.canvasFog)
  scene.fog = new THREE.FogExp2(DemoHex.canvasFog, 0.018)
  camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180)
  camera.position.set(30, 21, 38)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  mount.value.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true
  controls.minDistance = 20
  controls.maxDistance = 82
  controls.maxPolarAngle = Math.PI * 0.48
  scene.add(new THREE.HemisphereLight(DemoHex.lightHemiSky, DemoHex.lightHemiGround, 2.2))
  const sun = new THREE.DirectionalLight(DemoHex.lightKey, 3.1)
  sun.position.set(-22, 35, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)
  terrain()
  river()
  rainField()
  rebuildForest()
  cloud(-19, 19, -17)
  cloud(8, 23, -25)
  cloud(25, 17, -6)
  const resize = () => {
    if (!mount.value || !renderer || !camera) return
    const { clientWidth: width, clientHeight: height } = mount.value
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(mount.value)
  resize()
  update()
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const delta = Math.min(clock.getDelta(), 0.05)
    if (playing.value && rainPositions && rainPoints) {
      const speed = 9 + rain.value * 0.13
      for (let i = 0; i < rainPositions.length; i += 3) {
        rainPositions[i + 1] -= speed * delta
        if (rainPositions[i + 1] < h(rainPositions[i], rainPositions[i + 2]) + 0.2) rainPositions[i + 1] = 26 + Math.random() * 9
      }
      rainPoints.geometry.attributes.position.needsUpdate = true
    }
    controls?.update()
    renderer?.render(scene!, camera!)
  }
  loop()
}

watch([rain, forest], () => {
  update()
  rebuildForest()
})
onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div class="sim" :class="{ elements: isElements }">
    <div ref="mount" class="world" aria-label="雨季森林山谷三维互动场景" />
    <div class="vignette" />

    <section v-if="isElements" class="elements-board" aria-label="自然环境要素联系示意图">
      <header><p>自然环境系统</p><h2>要素不是孤立存在，而是组成有机整体</h2></header>
      <div class="system-map">
        <svg viewBox="0 0 720 330" aria-hidden="true">
          <defs><marker id="element-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
          <path d="M360 72 C270 78 230 118 194 150" /><path d="M360 72 C450 78 490 118 526 150" /><path d="M194 150 C228 226 284 260 360 266" /><path d="M526 150 C492 226 436 260 360 266" /><path d="M194 150 C290 132 430 132 526 150" />
        </svg>
        <article v-for="(item, index) in elements" :key="item.id" class="element-card" :class="`pos-${index}`" :style="{ '--element-color': item.color }"><i /><b>{{ item.name }}</b><small>{{ item.copy }}</small></article>
        <div class="system-core"><b>自然环境整体</b><span>结构 · 功能 · 演化</span></div>
      </div>
      <footer><span><i class="matter" />物质迁移：水、气体、养分、沉积物</span><span><i class="energy" />能量交换：太阳辐射、热量与势能</span><strong>相互联系 · 统一演化 · 区域间传导</strong></footer>
    </section>

    <template v-else>
      <header class="hud top"><div><p>雨季 · 山地森林流域</p><h2>自然环境整体响应实验场</h2></div><div class="live"><i />实时模拟 <button @click="playing = !playing">{{ playing ? '暂停雨幕' : '继续降雨' }}</button></div></header>
      <aside class="hud control"><strong>干预条件</strong><label>降雨强度 <b>{{ rain }} mm/h</b></label><input v-model.number="rain" type="range" min="10" max="100"><label>森林覆盖 <b>{{ forest }}%</b></label><input v-model.number="forest" type="range" min="5" max="95"><div><button @click="preset('intact')">森林完整</button><button class="danger" @click="preset('broken')">模拟砍伐</button></div><small>拖拽旋转 · 滚轮缩放</small></aside>
      <aside class="hud analysis"><div class="state"><span>当前状态</span><b>{{ stateName }}</b></div><p>{{ stateCopy }}</p><div v-for="metric in [{ n: '河流水位', v: riverLevel, u: '%', c: '' }, { n: '地表径流', v: runoff, u: 'm³/s', c: 'blue' }, { n: '侵蚀风险', v: erosion, u: '/100', c: 'soil' }]" :key="metric.n" class="metric"><span>{{ metric.n }}</span><b>{{ metric.v }}<small>{{ metric.u }}</small></b><i><em :class="metric.c" :style="{ width: Math.min(100, metric.v) + '%' }" /></i></div></aside>
      <footer class="hud chain"><div><b>植被减少</b><small>{{ forest }}% 覆盖</small></div><i>→</i><div><b>截留下渗减弱</b><small>径流 {{ runoff }} m³/s</small></div><i>→</i><div><b>土壤侵蚀增强</b><small>风险 {{ erosion }}</small></div><i>→</i><div><b>河流响应</b><small>水位 {{ riverLevel }}%</small></div><p>人类改变植被，会通过水、土壤、生物和大气反馈影响整个流域。</p></footer>
      <div class="disclaimer">课堂模拟 · 数值仅表示相对变化，不作水文预报依据</div>
    </template>
  </div>
</template>

<style scoped>
.sim{position:relative;height:100%;min-height:520px;overflow:hidden;background:var(--demo-canvas);color:var(--demo-ink);font-family:ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif}.world,.world :deep(canvas){position:absolute;inset:0;width:100%;height:100%;display:block}.vignette{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgb(7 11 22 / 38%),transparent 30%,transparent 62%,rgb(7 11 22 / 58%))}.hud{position:absolute;z-index:2;backdrop-filter:blur(12px);background:color-mix(in srgb,var(--demo-panel) 78%,transparent);border:1px solid color-mix(in srgb,var(--demo-ink-muted) 22%,transparent);box-shadow:0 12px 32px rgb(0 0 0 / 24%)}.top{top:20px;left:22px;right:22px;padding:13px 17px;display:flex;justify-content:space-between;align-items:center;border-radius:13px}.top p{margin:0 0 3px;color:var(--demo-vegetation);letter-spacing:.12em;font-size:10px;font-weight:700}.top h2{margin:0;font-size:18px;letter-spacing:.04em}.live{display:flex;gap:8px;align-items:center;color:var(--demo-ink-muted);font-size:12px}.live i{width:7px;height:7px;border-radius:50%;background:var(--demo-vegetation);box-shadow:0 0 9px var(--demo-vegetation)}.hud button{border:1px solid color-mix(in srgb,var(--demo-ink-muted) 35%,transparent);background:color-mix(in srgb,var(--demo-panel) 45%,transparent);border-radius:7px;color:var(--demo-ink);padding:6px 9px;cursor:pointer;font:inherit}.hud button:hover{background:var(--demo-vegetation);color:var(--demo-canvas);border-color:var(--demo-vegetation)}.control{top:105px;left:22px;width:208px;padding:15px;border-radius:12px}.control>strong{display:block;margin-bottom:13px;text-transform:uppercase;letter-spacing:.13em;font-size:10px;color:var(--demo-ink-muted)}.control label{display:flex;justify-content:space-between;margin:12px 0 5px;font-size:12px;color:var(--demo-ink-muted)}.control label b{color:var(--demo-vegetation);font-variant-numeric:tabular-nums}.control input{width:100%;accent-color:var(--demo-vegetation)}.control>div{display:flex;gap:7px;margin-top:14px}.control>div button{font-size:11px;flex:1;padding:7px 4px}.control .danger{color:var(--demo-warm);border-color:color-mix(in srgb,var(--demo-warm) 48%,transparent)}.control small{display:block;margin-top:13px;font-size:10px;color:var(--demo-ink-dim)}.analysis{right:22px;top:105px;width:224px;padding:14px 15px;border-radius:12px}.state{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--demo-ink-dim)}.state b{color:var(--demo-vegetation);font-size:13px}.analysis>p{font-size:11px;line-height:1.55;color:var(--demo-ink-muted);margin:10px 0 15px}.metric{display:grid;grid-template-columns:1fr auto;gap:4px;margin-top:10px;font-size:10px;color:var(--demo-ink-dim)}.metric>b{color:var(--demo-ink);font-size:13px;font-variant-numeric:tabular-nums}.metric small{font-size:8px;color:var(--demo-ink-dim);margin-left:2px}.metric i{height:4px;background:color-mix(in srgb,var(--demo-ink) 17%,transparent);grid-column:1/3;border-radius:4px;overflow:hidden}.metric em{display:block;height:100%;border-radius:4px;background:var(--demo-vegetation)}.metric em.blue{background:var(--demo-water)}.metric em.soil{background:var(--demo-soil)}.chain{left:22px;right:22px;bottom:27px;border-radius:12px;padding:10px;display:flex;align-items:center;gap:8px}.chain>div{min-width:92px;display:grid;padding:7px 9px;border:1px solid color-mix(in srgb,var(--demo-ink-muted) 22%,transparent);border-radius:7px;background:color-mix(in srgb,var(--demo-panel) 42%,transparent)}.chain b{font-size:11px}.chain small{font-size:9px;color:var(--demo-ink-muted);margin-top:2px}.chain>i{font-size:18px;color:var(--demo-lift);font-style:normal}.chain p{margin:0 0 0 5px;font-size:10px;line-height:1.45;color:var(--demo-ink-muted);max-width:220px}.disclaimer{position:absolute;right:24px;bottom:8px;z-index:3;color:var(--demo-ink-dim);font-size:9px}.elements .world{filter:blur(2px) brightness(.32)}.elements-board{position:absolute;z-index:3;inset:18px;display:grid;grid-template-rows:auto 1fr auto;padding:18px 22px;border:1px solid color-mix(in srgb,var(--demo-ink-muted) 24%,transparent);border-radius:16px;background:color-mix(in srgb,var(--demo-canvas) 82%,transparent);backdrop-filter:blur(10px)}.elements-board header p{margin:0 0 4px;color:var(--demo-accent-soft);font-size:10px;letter-spacing:.14em}.elements-board header h2{margin:0;font-size:17px}.system-map{position:relative;width:min(720px,100%);height:330px;margin:auto}.system-map>svg{position:absolute;inset:0;width:100%;height:100%}.system-map>svg>path{fill:none;stroke:var(--demo-accent);stroke-width:2;stroke-dasharray:7 10;marker-start:url(#element-arrow);marker-end:url(#element-arrow);animation:flow 3.5s linear infinite}.system-map marker path{fill:var(--demo-accent)}.element-card{--element-color:var(--demo-accent);position:absolute;width:158px;display:grid;grid-template-columns:10px 1fr;gap:3px 8px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--element-color) 65%,transparent);border-radius:10px;background:color-mix(in srgb,var(--demo-panel) 88%,transparent);box-shadow:0 8px 20px rgb(0 0 0 / 22%)}.element-card i{grid-row:1/3;width:8px;height:8px;margin-top:4px;border-radius:50%;background:var(--element-color);box-shadow:0 0 10px var(--element-color)}.element-card b{font-size:12px}.element-card small{color:var(--demo-ink-dim);font-size:9px;line-height:1.35}.pos-0{top:8px;left:calc(50% - 79px)}.pos-1{top:116px;right:14px}.pos-2{bottom:2px;right:calc(50% - 79px)}.pos-3{top:116px;left:14px}.pos-4{top:110px;left:calc(50% - 79px)}.system-core{position:absolute;top:215px;left:calc(50% - 92px);width:184px;text-align:center;display:grid;gap:2px}.system-core b{color:var(--demo-lift);font-size:12px}.system-core span{color:var(--demo-ink-dim);font-size:9px}.elements-board footer{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap;color:var(--demo-ink-muted);font-size:10px}.elements-board footer span{display:flex;align-items:center;gap:6px}.elements-board footer i{width:18px;height:3px;border-radius:3px}.elements-board footer .matter{background:var(--demo-water)}.elements-board footer .energy{background:var(--demo-lift)}.elements-board footer strong{color:var(--demo-ink);font-size:10px}@keyframes flow{to{stroke-dashoffset:-34}}@media(max-width:700px){.sim{min-height:620px}.analysis{top:auto;bottom:116px;right:12px;width:190px}.control{left:12px;top:96px;width:180px}.top{left:12px;right:12px;top:12px}.top h2{font-size:14px}.live{font-size:0}.live button{font-size:11px}.chain{left:12px;right:12px;bottom:22px;overflow:auto}.chain p,.chain>i{display:none}.chain>div{min-width:88px}.elements-board{inset:10px;padding:14px}.system-map{transform:scale(.84)}.elements-board footer{gap:8px}}
</style>
