<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { advanceClimbMotion, createClimbMotion, buildRoute, EDGES_PER_SEGMENT, perimeterPoint, routePosition, routeStep, routeVertices, type UV } from './everestRoutes'
import type { TerrainMetadata } from './everestContext'
import { createStableEverestTerrain } from './everestTerrainMesh'
import { AUTO_ORBIT_SPEED, EverestAutoOrbit } from './everestAutoOrbit'
import { avatarFor, studentLabel, type Gender } from './leaderboardData'

type Mottos = [string, string, string]
type Member = { id: string; name: string; nameTag?: string; gender?: Gender; score: number; color: string; routeSlot: number; mottos?: Mottos; avatar?: string }
type MottoSlide = { key: string; name: string; text: string; color: string }
const FALLBACK_MOTTOS = [
  '也许你们的目标一样，但所走的路却各不相同',
  '换个角度，也许能看到不一样的风景。',
]
const MOTTO_GROUP_SIZE = 5
const props = defineProps<{ students: Member[]; selectedId: string; boostedId: string; segmentCount: number }>()
const emit = defineEmits<{ select: [id: string] }>()
const members = ref<Array<{ student: Member; x: number; y: number; depth: number; visible: boolean }>>([])
const markerScale = ref(1)
type Metadata = {
  gridSize: number; widthMeters: number; heightMeters: number
  minElevation: number; maxElevation: number; bboxWGS84: [number, number, number, number]
  summitWGS84: [number, number]; officialSummitElevation: number
  terrainSource?: string; imagerySource?: string; nominalSourceResolutionMeters?: number
}
const host = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref('')
const demSummit = ref(0)
const resolution = ref(30)
/** 中间轮播进度：与 selectedId 无关，始终自动轮转 */
const mottoIndex = ref(0)
const mottoGroupIndex = ref(0)
const mottoTick = ref(0)
const headBubble = ref<{ id: string; texts: string[]; index: number } | null>(null)
let mottoTimer = 0
let headHideTimer = 0
let headCycleTimer = 0
const summitLabel = ref({ left: '50%', top: '40%', visibility: 'hidden' as 'visible' | 'hidden' })
const abort = new AbortController()
let disposed = false
let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let resize: ResizeObserver | undefined
let visibility: IntersectionObserver | undefined
let visible = true
let frame = 0
let peak: THREE.Vector3 | undefined
let terrainPoint: ((u: number, v: number) => THREE.Vector3) | undefined
let summitUV: UV | undefined
const autoOrbit = new EverestAutoOrbit()
const autoRotateEnabled = ref(true)
let contextLost = false
let nextAutoFrame = 0
let drawingBufferResolution: THREE.Vector2 | undefined
let isTerrainOccluded: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | undefined
const avatarTextures = new Map<string, THREE.Texture>()
const avatarSprites = new Map<string, { source: string; sprite: THREE.Sprite }>()
const avatarLoader = new THREE.TextureLoader()
function syncAvatarSprites() {
  const ids = new Set(props.students.map(student => student.id))
  for (const [id, avatar] of avatarSprites) if (!ids.has(id)) {
    avatar.sprite.removeFromParent(); avatar.sprite.material.dispose(); avatarSprites.delete(id)
  }
  for (const student of props.students) {
    const source = avatarFor(student)
    let texture = avatarTextures.get(source)
    if (!texture) {
      texture = avatarLoader.load(source, loaded => {
        if (disposed) { loaded.dispose(); return }
        requestRender()
      })
      texture.colorSpace = THREE.SRGBColorSpace
      avatarTextures.set(source, texture)
    }
    let avatar = avatarSprites.get(student.id)
    if (!avatar) {
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, alphaTest: .02, toneMapped: false })
      const sprite = new THREE.Sprite(material)
      sprite.renderOrder = 4
      scene!.add(sprite)
      avatar = { source, sprite }; avatarSprites.set(student.id, avatar)
    } else if (avatar.source !== source) {
      avatar.sprite.material.map = texture; avatar.sprite.material.needsUpdate = true; avatar.source = source
    }
  }
}
let viewportWidth = 0
let viewportHeight = 0

function requestRender() {
  if (!disposed && !contextLost && frame === 0) frame = requestAnimationFrame(draw)
}

function onVisibilityChange() {
  autoOrbit.resetClock()
  nextAutoFrame = 0
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; return }
  if (!document.hidden) requestRender()
}
function onOrbitStart() { autoOrbit.beginInteraction(); requestRender() }
function onOrbitEnd() { autoOrbit.endInteraction(performance.now()); requestRender() }
function toggleAutoRotate() {
  autoRotateEnabled.value = !autoRotateEnabled.value
  autoOrbit.resetClock(); nextAutoFrame = 0
  requestRender()
}

function onContextLost(event: Event) {
  event.preventDefault()
  contextLost = true
  autoOrbit.resetClock()
  cancelAnimationFrame(frame)
  frame = 0
  error.value = '显卡渲染暂时中断，正在恢复…'
}

function onContextRestored() {
  contextLost = false
  autoOrbit.resetClock()
  error.value = ''
  if (renderer) renderer.shadowMap.needsUpdate = true
  requestRender()
}

watch(() => [props.students, props.selectedId, props.segmentCount], requestRender, { deep: true })

function filledMottos(mottos?: Mottos) {
  return (mottos ?? ['', '', '']).map((text) => text.trim()).filter(Boolean)
}

function fallbackSlides(): MottoSlide[] {
  return FALLBACK_MOTTOS.map((text, index) => ({
    key: `fallback-${index}`,
    name: '',
    text,
    color: '#dce8f2',
  }))
}

/** 仅收集每人主座右铭，不跟当前选中人物挂钩 */
const primarySlides = computed<MottoSlide[]>(() => props.students
  .map((student) => {
    const text = student.mottos?.[0]?.trim() ?? ''
    if (!text) return null
    return { key: student.id, name: studentLabel(student), text, color: student.color }
  })
  .filter((slide): slide is MottoSlide => slide !== null))

/** 主座右铭按最多 5 人一组；无人设置时回退默认句。选中谁都不影响分组。 */
const mottoGroups = computed(() => {
  const slides = primarySlides.value
  if (!slides.length) return [fallbackSlides()]
  const groups: MottoSlide[][] = []
  for (let index = 0; index < slides.length; index += MOTTO_GROUP_SIZE) {
    groups.push(slides.slice(index, index + MOTTO_GROUP_SIZE))
  }
  return groups
})

const currentMotto = computed(() => {
  const groups = mottoGroups.value
  if (!groups.length) return null
  const group = groups[mottoGroupIndex.value % groups.length] ?? groups[0]
  if (!group.length) return null
  return group[mottoIndex.value % group.length] ?? group[0]
})

watch(primarySlides, (slides, previous) => {
  const prevKeys = (previous ?? []).map((slide) => slide.key).join('|')
  const nextKeys = slides.map((slide) => slide.key).join('|')
  if (prevKeys === nextKeys) return
  mottoGroupIndex.value = 0
  mottoIndex.value = 0
})

function advanceMotto() {
  const groups = mottoGroups.value
  if (!groups.length) return
  const group = groups[mottoGroupIndex.value % groups.length] ?? []
  if (mottoIndex.value + 1 < group.length) {
    mottoIndex.value += 1
  } else {
    mottoIndex.value = 0
    mottoGroupIndex.value = (mottoGroupIndex.value + 1) % groups.length
  }
  mottoTick.value += 1
}

function clearHeadBubble() {
  window.clearTimeout(headHideTimer)
  window.clearInterval(headCycleTimer)
  headBubble.value = null
}

/** 头顶气泡：仅点击角色时短暂展示，不影响中间轮播 */
function showHeadMottos(student: Member) {
  const texts = filledMottos(student.mottos)
  clearHeadBubble()
  if (!texts.length) return
  headBubble.value = { id: student.id, texts, index: 0 }
  if (texts.length > 1) {
    headCycleTimer = window.setInterval(() => {
      if (!headBubble.value || headBubble.value.id !== student.id) return
      headBubble.value = {
        ...headBubble.value,
        index: (headBubble.value.index + 1) % headBubble.value.texts.length,
      }
    }, 1600)
  }
  headHideTimer = window.setTimeout(() => {
    if (headBubble.value?.id === student.id) clearHeadBubble()
  }, 5000)
}

function selectMember(student: Member) {
  autoOrbit.pause(performance.now())
  emit('select', student.id)
  showHeadMottos(student)
}
type MemberRoute = {
  slot: number; stations: UV[]; step: number; arrivalElapsed?: number; group: THREE.Group
  remaining: LineMaterial; completed: LineMaterial; dots: THREE.PointsMaterial
  progress: LineSegmentsGeometry; geometry: LineSegmentsGeometry; nodes: THREE.BufferGeometry
}
const routes = new Map<string, MemberRoute>()

function disposeRoute(route: MemberRoute) {
  route.group.removeFromParent()
  route.geometry.dispose(); route.progress.dispose(); route.nodes.dispose()
  route.remaining.dispose(); route.completed.dispose(); route.dots.dispose()
}

function syncRoutes(delta: number) {
  if (!scene || !terrainPoint || !summitUV) return false
  let moving = false
  const ids = new Set(props.students.map(student => student.id))
  for (const [id, route] of routes) {
    if (!ids.has(id)) { disposeRoute(route); routes.delete(id) }
  }
  props.students.forEach(student => {
    let route = routes.get(student.id)
    const previousStep = route?.step
    if (route && (route.stations.length !== props.segmentCount + 1 || route.slot !== student.routeSlot)) {
      disposeRoute(route)
      routes.delete(student.id)
      route = undefined
    }
    if (!route) {
      const slot = student.routeSlot
      const stations = buildRoute(perimeterPoint(slot), summitUV!, terrainPoint!, props.segmentCount)
      const geometry = new LineSegmentsGeometry().setPositions(routeVertices(stations, terrainPoint!))
      const progress = geometry.clone()
      const color = new THREE.Color(student.color).multiplyScalar(.65)
      const remaining = new LineMaterial({ color: color.getHex(), linewidth: 1.6, transparent: true, opacity: .65, depthWrite: false })
      const completed = new LineMaterial({ color: student.color, linewidth: 2.8, transparent: true, opacity: 1, depthWrite: false })
      const group = new THREE.Group()
      group.add(new LineSegments2(geometry, remaining), new LineSegments2(progress, completed))
      const nodes = new THREE.BufferGeometry().setFromPoints(stations.map(uv => {
        const p = terrainPoint!(...uv); p.y += .5; return p
      }))
      const dots = new THREE.PointsMaterial({ color: student.color, size: 2.2, sizeAttenuation: false, transparent: true, opacity: .6, depthWrite: false })
      group.add(new THREE.Points(nodes, dots))
      group.children.forEach(object => { object.renderOrder = 3 })
      scene!.add(group)
      const target = routeStep(student.score, props.segmentCount)
      route = { slot, stations, ...createClimbMotion(target, previousStep), group, remaining, completed, dots, progress, geometry, nodes }
      if (route.arrivalElapsed !== undefined) autoOrbit.pause(performance.now())
      routes.set(student.id, route)
    }
    const target = routeStep(student.score, props.segmentCount)
    const imageReady = !!avatarSprites.get(student.id)?.sprite.material.map?.image
    if (advanceClimbMotion(route, target, delta, imageReady)) moving = true
    const selected = student.id === props.selectedId
    route.remaining.opacity = selected ? 1 : .65
    route.remaining.linewidth = selected ? 2.8 : 1.6
    route.completed.opacity = selected ? 1 : .9
    route.remaining.resolution.set(host.value!.clientWidth, host.value!.clientHeight)
    route.completed.resolution.copy(route.remaining.resolution)
    route.dots.opacity = selected ? 1 : .6
    route.dots.size = selected ? 3.8 : 2.4
    route.progress.instanceCount = Math.floor(route.step) * EDGES_PER_SEGMENT
  })
  return moving
}
const geometries: THREE.BufferGeometry[] = []
const materials: THREE.Material[] = []
let texture: THREE.Texture | undefined

function resetView() {
  if (!camera || !controls) return
  autoOrbit.pause(performance.now())
  controls.autoRotate = false
  const distance = Math.max(275, 310 / Math.max(.4, camera.aspect))
  const direction = new THREE.Vector3(.57, .43, .70).normalize()
  controls.target.set(-4, 18, 0)
  camera.position.copy(controls.target).addScaledVector(direction, distance)
  controls.update(0)
}

function draw() {
  frame = 0
  const now = performance.now()
  if (!visible || document.hidden || contextLost || !renderer || !camera || !scene) { autoOrbit.resetClock(); return }
  // Cap unattended rotation at 30fps; dragging still uses the display's refresh rate.
  // Keep one RAF chain and never resize or rebuild the terrain during rotation.
  if (autoRotateEnabled.value && !autoOrbit.interacting && now < nextAutoFrame) { requestRender(); return }
  if (autoOrbit.interacting) nextAutoFrame = 0
  else {
    if (!nextAutoFrame || now - nextAutoFrame > 100) nextAutoFrame = now
    nextAutoFrame += 1000 / 30
  }
  const delta = autoOrbit.tick(now)
  if (controls) controls.autoRotate = autoRotateEnabled.value && autoOrbit.canRotate(now)
  const cameraMoving = controls?.update(delta) ?? false
  camera.updateMatrixWorld()
  syncAvatarSprites()
  const membersMoving = syncRoutes(delta)
  if (peak && host.value) {
    const p = peak.clone().project(camera)
    summitLabel.value = {
      left: `${(p.x + 1) * host.value.clientWidth / 2}px`,
      top: `${(1 - p.y) * host.value.clientHeight / 2 - 76}px`,
      visibility: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? 'visible' : 'hidden',
    }
  }
  if (terrainPoint && host.value) {
    const { clientWidth: width, clientHeight: height } = host.value
    markerScale.value = THREE.MathUtils.clamp(width / 1000, .65, .8)
    members.value = props.students.map(student => {
      const route = routes.get(student.id)!
      const anchor = new THREE.Vector3().copy(routePosition(route.stations, route.step, terrainPoint!))
      anchor.y += 1
      const distance = camera!.position.distanceTo(anchor)
      const inFrontOfTerrain = !isTerrainOccluded?.(camera!.position, anchor)
      const sprite = avatarSprites.get(student.id)!.sprite
      const cameraDepth = -anchor.clone().applyMatrix4(camera!.matrixWorldInverse).z
      const worldPerPixel = 2 * Math.max(.01, cameraDepth) * Math.tan(THREE.MathUtils.degToRad(camera!.fov / 2)) / height
      // Match the DOM button's 45×55 image above its 20px caption. Only the image
      // is rendered by WebGL, so the terrain depth buffer clips individual pixels.
      const up = new THREE.Vector3().setFromMatrixColumn(camera!.matrixWorld, 1)
      sprite.position.copy(anchor).addScaledVector(up, (47.5 * markerScale.value - 11) * worldPerPixel)
      sprite.scale.set(45 * markerScale.value * worldPerPixel, 55 * markerScale.value * worldPerPixel, 1)
      sprite.visible = cameraDepth > camera!.near
      anchor.project(camera!)
      return {
        student,
        x: (anchor.x + 1) * width / 2,
        y: (1 - anchor.y) * height / 2,
        depth: Math.round(1000 - distance),
        visible: inFrontOfTerrain && anchor.z > -1 && anchor.z < 1 && Math.abs(anchor.x) < .94 && Math.abs(anchor.y) < .91,
      }
    })
  }
  renderer.render(scene, camera)
  renderer.domElement.dataset.renderFrame = String(renderer.info.render.frame)
  if (cameraMoving || membersMoving || autoRotateEnabled.value) requestRender()
}

onMounted(async () => {
  mottoTimer = window.setInterval(advanceMotto, 4800)
  try {
    const [metaResponse, heightResponse, contextMetaResponse, contextHeightResponse] = await Promise.all([
      fetch('/terrain/everest/metadata.json', { signal: abort.signal }),
      fetch('/terrain/everest/height-u16.bin', { signal: abort.signal }),
      fetch('/terrain/everest/context/metadata.json', { signal: abort.signal }),
      fetch('/terrain/everest/context/height-u16.bin', { signal: abort.signal }),
    ])
    if (!metaResponse.ok || !heightResponse.ok) throw new Error('珠峰高程数据加载失败，请刷新重试。')
    const metadata = await metaResponse.json() as Metadata
    resolution.value = metadata.nominalSourceResolutionMeters ?? 70
    const buffer = await heightResponse.arrayBuffer()
    if (buffer.byteLength !== metadata.gridSize ** 2 * 2) throw new Error('高程数据不完整。')
    const values = new DataView(buffer)
    const scale = 180 / metadata.widthMeters
    const depth = metadata.heightMeters * scale
    const [west, south, east, north] = metadata.bboxWGS84
    const heightAt = (u: number, v: number) => {
      const x = THREE.MathUtils.clamp(u, 0, 1) * (metadata.gridSize - 1)
      const y = THREE.MathUtils.clamp(v, 0, 1) * (metadata.gridSize - 1)
      const ix = Math.floor(x), iy = Math.floor(y)
      const read = (col: number, row: number) => values.getUint16((Math.min(row, metadata.gridSize - 1) * metadata.gridSize + Math.min(col, metadata.gridSize - 1)) * 2, true)
      const value = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(read(ix, iy), read(ix + 1, iy), x - ix),
        THREE.MathUtils.lerp(read(ix, iy + 1), read(ix + 1, iy + 1), x - ix), y - iy,
      )
      return metadata.minElevation + value / 65535 * (metadata.maxElevation - metadata.minElevation)
    }
    const surface = (u: number, v: number) => new THREE.Vector3((u - .5) * 180, (heightAt(u, v) - metadata.minElevation) * scale, (v - .5) * depth)
    terrainPoint = surface
    texture = await new THREE.TextureLoader().loadAsync('/terrain/everest/ortho.jpg')
    if (disposed || !host.value) { texture.dispose(); return }
    scene = new THREE.Scene()
    const contextMetadata = contextMetaResponse.ok ? await contextMetaResponse.json() as TerrainMetadata : metadata
    const contextBytes = contextHeightResponse.ok ? await contextHeightResponse.arrayBuffer() : buffer
    if (disposed) return
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, premultipliedAlpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = .9
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.setClearColor(0x0c182b, 1)
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
    document.addEventListener('visibilitychange', onVisibilityChange)
    renderer.domElement.setAttribute('aria-label', '基于真实高程与卫星影像的珠穆朗玛峰三维模型，拖动旋转，滚轮缩放')
    host.value.prepend(renderer.domElement)
    camera = new THREE.PerspectiveCamera(39, 1, 5, 1600)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.autoRotateSpeed = AUTO_ORBIT_SPEED
    controls.minDistance = 65
    controls.maxDistance = 1000
    controls.maxPolarAngle = Math.PI * .47
    controls.enablePan = false
    controls.addEventListener('change', requestRender)
    controls.addEventListener('start', onOrbitStart)
    controls.addEventListener('end', onOrbitEnd)
    resetView()

    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    const terrain = createStableEverestTerrain(metadata, contextMetadata, contextBytes, texture, surface)
    geometries.push(...terrain.geometries, terrain.backgroundGeometry)
    materials.push(terrain.material, terrain.backgroundMaterial)
    drawingBufferResolution = terrain.resolution
    isTerrainOccluded = terrain.isOccluded
    scene.add(terrain.backdrop, terrain.group)

    scene.add(new THREE.HemisphereLight(0xe4efff, 0x565e70, .85))
    const sunlight = new THREE.DirectionalLight(0xfff2dd, 2.1)
    sunlight.position.set(-100, 160, 85)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    Object.assign(sunlight.shadow.camera, { left: -145, right: 145, top: 145, bottom: -145, near: 1, far: 500 })
    sunlight.shadow.normalBias = .35
    sunlight.shadow.bias = -.0003
    scene.add(sunlight)
    renderer.shadowMap.needsUpdate = true
    const [lon, lat] = metadata.summitWGS84
    const u = (lon - west) / (east - west), v = (north - lat) / (north - south)
    demSummit.value = Math.round(heightAt(u, v))
    // Every route's final station meets at the highest sampled terrain vertex.
    let highestIndex = 0
    for (let i = 1; i < metadata.gridSize ** 2; i++) {
      if (values.getUint16(i * 2, true) > values.getUint16(highestIndex * 2, true)) highestIndex = i
    }
    summitUV = [(highestIndex % metadata.gridSize) / (metadata.gridSize - 1), Math.floor(highestIndex / metadata.gridSize) / (metadata.gridSize - 1)]
    peak = surface(...summitUV)
    peak.y += 2
    const dotGeometry = new THREE.SphereGeometry(.65, 16, 12)
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd9c, depthTest: false, transparent: true })
    geometries.push(dotGeometry)
    materials.push(dotMaterial)
    const dot = new THREE.Mesh(dotGeometry, dotMaterial)
    dot.position.copy(peak)
    dot.renderOrder = 5
    scene.add(dot)
    resize = new ResizeObserver(() => {
      if (!host.value || !renderer || !camera) return
      const { clientWidth: width, clientHeight: height } = host.value
      if (width <= 0 || height <= 0 || (width === viewportWidth && height === viewportHeight)) return
      const firstSize = viewportWidth === 0
      viewportWidth = width
      viewportHeight = height
      // Do not repeatedly clear/reallocate the canvas backing store for unchanged sizes.
      renderer.setSize(width, height, false)
      if (drawingBufferResolution) renderer.getDrawingBufferSize(drawingBufferResolution)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      if (firstSize) resetView()
      requestRender()
    })
    resize.observe(host.value)
    visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      autoOrbit.resetClock(); nextAutoFrame = 0
      if (!visible) { cancelAnimationFrame(frame); frame = 0 }
      if (visible) requestRender()
    })
    visibility.observe(host.value)
    loading.value = false
    requestRender()
  } catch (cause) {
    if (!disposed) { error.value = cause instanceof Error ? cause.message : '山体加载失败'; loading.value = false }
  }
})

onBeforeUnmount(() => {
  disposed = true
  window.clearInterval(mottoTimer)
  clearHeadBubble()
  abort.abort()
  cancelAnimationFrame(frame)
  resize?.disconnect()
  visibility?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  renderer?.domElement.removeEventListener('webglcontextlost', onContextLost)
  renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored)
  controls?.removeEventListener('change', requestRender)
  controls?.removeEventListener('start', onOrbitStart)
  controls?.removeEventListener('end', onOrbitEnd)
  controls?.dispose()
  routes.forEach(disposeRoute)
  routes.clear()
  avatarSprites.forEach(({ sprite }) => { sprite.removeFromParent(); sprite.material.dispose() })
  avatarSprites.clear()
  avatarTextures.forEach(texture => texture.dispose())
  avatarTextures.clear()
  geometries.forEach(g => g.dispose())
  materials.forEach(m => m.dispose())
  texture?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div class="everest-scene">
    <div ref="host" class="terrain-viewport">
      <div v-if="!loading && !error" class="summit-label" :style="summitLabel"><i /><strong>珠穆朗玛峰</strong><span>8,848.86 <small>m</small></span></div>
      <div v-if="!loading && !error" class="member-layer" :style="{ '--marker-scale': markerScale }" aria-label="山体周边队员">
        <button
          v-for="member in members"
          v-show="member.visible"
          :key="member.student.id"
          type="button"
          class="terrain-member"
          :class="{ 'is-selected': member.student.id === selectedId, 'is-boosted': member.student.id === boostedId }"
          :style="{ left: `${member.x}px`, top: `${member.y}px`, zIndex: member.depth, '--member-color': member.student.color }"
          :aria-label="`选择${studentLabel(member.student)}，${member.student.score}分，第${routeStep(member.student.score, segmentCount)}段，共${segmentCount}段`"
          :aria-pressed="member.student.id === selectedId"
          @pointerdown.stop
          @dblclick.stop
          @click.stop="selectMember(member.student)"
        >
          <span v-if="headBubble?.id === member.student.id" class="member-motto" aria-live="polite">
            <Transition name="motto-up" mode="out-in">
              <span :key="`${headBubble.id}-${headBubble.index}`">{{ headBubble.texts[headBubble.index] }}</span>
            </Transition>
          </span>
          <span class="member-shadow" />
          <span class="member-avatar member-photo avatar-hit-area" aria-hidden="true" />
          <span class="member-caption" :class="{ 'has-tag': member.student.nameTag }"><strong :title="studentLabel(member.student)"><span class="member-name">{{ member.student.name }}</span><span v-if="member.student.nameTag" class="member-name-tag">（{{ member.student.nameTag }}）</span></strong><b>{{ routeStep(member.student.score, segmentCount) }}/{{ segmentCount }}</b></span>
          <span v-if="member.student.id === boostedId" class="member-bonus">＋1</span>
        </button>
      </div>
    </div>
    <header class="terrain-heading"><span>HIMALAYA · 27°59′ N / 86°55′ E</span><h2>珠穆朗玛峰</h2><p>真实高程 · {{ resolution }} 米级 DEM</p></header>
    <div class="terrain-motto-wrap">
      <div class="terrain-motto" aria-live="polite">
        <Transition name="motto-up" mode="out-in">
          <div v-if="currentMotto" :key="`${mottoTick}-${currentMotto.key}`" class="terrain-motto-slide">
            <small v-if="currentMotto.name">{{ currentMotto.name }}</small>
            <p>{{ currentMotto.text }}</p>
          </div>
        </Transition>
      </div>
      <span v-if="mottoGroups.length > 1" class="motto-group-dot" aria-hidden="true">
        {{ mottoGroupIndex % mottoGroups.length + 1 }}/{{ mottoGroups.length }}
      </span>
    </div>
    <div class="view-actions"><button class="auto-rotate-toggle" type="button" :aria-pressed="autoRotateEnabled" @click="toggleAutoRotate">{{ autoRotateEnabled ? '暂停旋转' : '自动旋转' }}</button><button class="reset-view" type="button" @click="resetView">重置视角 ↗</button></div>
    <div v-if="loading || error" class="terrain-status" role="status">{{ error || '正在载入珠峰高程与卫星影像…' }}</div>
    <footer class="terrain-footer">
      <div class="terrain-hint">每人一条线路 · {{ segmentCount }}段登顶 · 点击人物选中 <span>路线为课堂游戏示意 · 非真实登山路线</span></div>
      <details><summary>真实数据与来源</summary><p>地形：<a href="https://registry.opendata.aws/copernicus-dem/" target="_blank" rel="noreferrer">Copernicus DEM GLO-30</a>（约30米；© DLR / Airbus，由欧盟与 ESA 提供），影像：<a href="https://cloudless.eox.at/" target="_blank" rel="noreferrer">EOxCloudless 2024 / Sentinel-2</a>（10米级影像）。影像为历史合成，非实时画面；保留署名可用于非商业教学，商业发行须按 <a href="https://cloudless.eox.at/documentation/license" target="_blank" rel="noreferrer">EOX 条款</a>取得授权。</p><p>8,848.86 米采用 2020 年中尼公布的峰顶雪面高程。峰顶坐标处 DEM 采样约 {{ demSummit.toLocaleString() }} 米，未人为修高；网格间距不等于测量误差。峰顶标记始终可见以便定位。</p><p>外围山脉：<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen Terrain Tiles</a> 公开高程，© Mapzen，<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">底层数据署名</a>；外围地貌配色与远山雾化为视觉过渡，不表示实际植被分布。</p></details>
    </footer>
  </div>
</template>

<style scoped>
.view-actions{position:absolute;top:20px;right:22px;display:flex;gap:6px}.view-actions .reset-view{position:static}.auto-rotate-toggle{padding:6px 9px;border:1px solid #c0d6e533;border-radius:8px;background:#0b1d3299;color:#d0e1ef;cursor:pointer;font-size:10px}.auto-rotate-toggle[aria-pressed=true]{border-color:#7bb8da55;color:#b9e0f4}@media(max-width:560px){.view-actions{right:15px;gap:4px}}
.member-avatar.avatar-hit-area{background:none;filter:none}
.member-caption.has-tag{max-width:148px}.member-caption.has-tag strong{display:flex;align-items:center;max-width:100px;flex-shrink:0}.member-name{overflow:hidden;text-overflow:ellipsis}.member-name-tag{flex-shrink:0;color:#f3dfa6}
.everest-scene{position:relative;min-height:660px;height:100%;overflow:hidden;border-radius:26px;border:1px solid #c5d8f02b;background:radial-gradient(ellipse at 55% 58%,#71849745,transparent 58%),linear-gradient(160deg,#0c182b,#23384b 65%,#415362);isolation:isolate}
.terrain-viewport{position:absolute;inset:0;touch-action:none}.terrain-viewport :deep(canvas){display:block;width:100%;height:100%;outline:none;cursor:grab}.terrain-viewport :deep(canvas:active){cursor:grabbing}
.member-layer{position:absolute;inset:0;pointer-events:none}.terrain-member{position:absolute;display:grid;justify-items:center;width:76px;padding:0;border:0;background:none;transform:translate(-50%,calc(-100% + 11px));pointer-events:auto;cursor:pointer;color:#fff;isolation:isolate;touch-action:manipulation}.member-avatar{display:block;width:45px;height:55px;background:url('/images/leaderboard/chibi-climber-8frames.png') 0 0 / 400% 200% no-repeat;filter:drop-shadow(0 2px 2px #0a152a88);transition:filter .2s}.member-shadow{position:absolute;left:50%;top:49px;transform:translateX(-50%);width:31px;height:9px;background:#0c1d3380;border-radius:50%;filter:blur(2px);z-index:-1}.member-caption{display:flex;align-items:center;gap:5px;max-width:88px;padding:3px 6px;border:1px solid #bcd1e647;border-radius:7px;background:#102035e8;box-shadow:0 3px 8px #07112055;white-space:nowrap}.member-caption strong{font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;max-width:60px}.member-caption b{color:var(--member-color);font-size:10px;font-variant-numeric:tabular-nums}.terrain-member:hover .member-avatar,.terrain-member.is-selected .member-avatar{filter:drop-shadow(0 0 5px var(--member-color))}.terrain-member:hover .member-caption,.terrain-member.is-selected .member-caption{border-color:var(--member-color);background:#172b43}.terrain-member:focus-visible{outline:2px solid var(--member-color);outline-offset:4px;border-radius:8px}.member-bonus{position:absolute;top:-10px;right:5px;color:#ffde8b;font-size:18px;font-weight:800;text-shadow:0 2px 5px #071120;animation:score-rise 1s ease-out both}.member-motto{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:2;min-width:96px;max-width:148px;padding:5px 8px;border:1px solid #bcd1e66a;border-radius:8px;background:#102035f0;box-shadow:0 4px 12px #07112066,0 0 0 1px var(--member-color);color:#eef6ff;font-size:10px;line-height:1.4;text-align:center;pointer-events:none}.member-motto::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#102035f0}.member-motto span{display:block}.terrain-member.is-boosted .member-caption{border-color:#ffde8b}@keyframes score-rise{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-22px)}}
.terrain-member{transform:translate(-50%,calc(-100% + 11px)) scale(var(--marker-scale));transform-origin:center bottom}.summit-label{z-index:1100}.summit-label i{height:89px;opacity:.6}
@media(prefers-reduced-motion:reduce){.member-bonus{animation:none}.member-avatar{transition:none}.motto-up-enter-active,.motto-up-leave-active{transition:none}}
.terrain-heading{position:absolute;top:30px;left:30px;pointer-events:none;text-shadow:0 2px 16px #081522}.terrain-heading>span{font-size:9px;color:#b0c6d8;letter-spacing:.17em}.terrain-heading h2{font-size:30px;font-weight:500;letter-spacing:.16em;margin:10px 0 7px;color:#f3f5f7}.terrain-heading p{font-size:11px;color:#b6c8d8;margin:0}.terrain-motto-wrap{position:absolute;top:28px;left:50%;transform:translateX(-50%);width:min(440px,54vw);pointer-events:none;text-align:center}.terrain-motto{height:3.4em;margin:0;padding:0 12px;overflow:hidden;font-size:13px;line-height:1.45;letter-spacing:.04em;color:#dce8f2;text-shadow:0 2px 14px #081522}.terrain-motto-slide{display:grid;gap:2px;justify-items:center}.terrain-motto-slide small{font-size:10px;letter-spacing:.12em;color:#9eb6c9}.terrain-motto-slide p{margin:0}.motto-group-dot{display:block;margin-top:2px;font-size:9px;color:#8ea6ba;letter-spacing:.08em}.motto-up-enter-active,.motto-up-leave-active{transition:opacity .55s ease,transform .55s ease}.motto-up-enter-from{opacity:0;transform:translateY(12px)}.motto-up-leave-to{opacity:0;transform:translateY(-12px)}.reset-view{position:absolute;top:30px;right:24px;padding:8px 12px;border:1px solid #c0d6e533;border-radius:8px;background:#0b1d3299;color:#d0e1ef;cursor:pointer;font-size:11px}
.summit-label{position:absolute;display:flex;flex-direction:column;transform:translate(-50%,calc(-100% - 14px));pointer-events:none;text-align:center;text-shadow:0 2px 6px #081629,0 0 18px #081629}.summit-label strong{font-size:12px;font-weight:500;letter-spacing:.12em;color:#fff1cc}.summit-label span{font-size:21px;letter-spacing:.03em;color:white;font-variant-numeric:tabular-nums}.summit-label small{font-size:11px;color:#d0dee7}.summit-label i{position:absolute;top:100%;left:50%;height:13px;width:1px;background:#f6dfac}
.terrain-status{position:absolute;inset:0;display:grid;place-items:center;color:#d6e7f6;font-size:13px;background:#0c192b99}.terrain-footer{position:absolute;bottom:0;left:0;right:0;padding:16px 24px;background:linear-gradient(transparent,#0a1729e8);color:#b1c5d6;font-size:10px}.terrain-hint{display:flex;justify-content:space-between;gap:10px;margin-bottom:9px}.terrain-hint span{color:#d0dfe9}.terrain-footer details{font-size:9px;line-height:1.7;max-width:660px}.terrain-footer summary{cursor:pointer;color:#90a9bc;width:fit-content}.terrain-footer p{margin:5px 0}.terrain-footer a{color:#bad9eb}
.summit-label i{height:89px}
@media(max-width:560px){.everest-scene{min-height:520px}.terrain-heading{top:22px;left:20px}.terrain-heading h2{font-size:25px}.terrain-heading>span{font-size:8px}.terrain-motto-wrap{top:18px;width:min(280px,48vw)}.terrain-motto{font-size:11px;height:3.6em}.reset-view{top:22px;right:15px;padding:7px;font-size:10px}.terrain-footer{padding:14px 18px}.terrain-hint{font-size:9px}}
.everest-scene{height:100%;min-height:0;border-radius:0;border:0}.terrain-heading{top:20px;left:24px}.terrain-heading h2{font-size:20px;letter-spacing:.1em;margin:6px 0}.terrain-heading>span{font-size:8px}.terrain-heading p{font-size:10px}.terrain-motto-wrap{top:18px}.terrain-motto{font-size:12px;height:3.6em}.reset-view{top:20px;right:22px;padding:6px 9px;font-size:10px}.terrain-footer{bottom:76px;padding:8px 22px;background:linear-gradient(transparent,#0a172999);pointer-events:none}.terrain-footer details{pointer-events:auto}.terrain-hint{font-size:9px;margin-bottom:4px}.summit-label strong{font-size:10px}.summit-label span{font-size:17px}
@media(max-width:760px){.terrain-footer{bottom:108px}.terrain-hint span{display:none}}
.member-photo{background:none;object-fit:contain;border-radius:7px}
</style>
