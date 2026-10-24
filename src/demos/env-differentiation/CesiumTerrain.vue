<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  CustomHeightmapTerrainProvider,
  defined,
  Ellipsoid,
  GeographicTilingScheme,
  HeadingPitchRange,
  HorizontalOrigin,
  JulianDate,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  VerticalOrigin,
  Viewer,
  Cartesian2,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

interface TerrainMeta {
  gridSize: number
  bboxWGS84: [number, number, number, number]
  minElevation: number
  maxElevation: number
  officialSummitElevation: number
  summitWGS84: [number, number]
}

interface Zone {
  name: string
  range: string
  elevation: number
  color: string
}

const ZONES: Zone[] = [
  { name: '冰雪带', range: '≥ 5000 m', elevation: 5200, color: '#eaf4ff' },
  { name: '高山荒漠带', range: '4000–5000 m', elevation: 4450, color: '#c6aa78' },
  { name: '高山荒原带', range: '3200–4000 m', elevation: 3600, color: '#91a66b' },
  { name: '石楠灌丛带', range: '2800–3200 m', elevation: 3000, color: '#587d50' },
  { name: '山地雨林带', range: '2200–2800 m', elevation: 2500, color: '#2f7047' },
  { name: '山地森林下缘', range: '1800–2200 m', elevation: 2000, color: '#4b864e' },
  { name: '稀树草原与农耕带', range: '1500–1800 m', elevation: 1700, color: '#9ca85b' },
]

const hostRef = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const failed = ref('')
const selectedZone = ref<Zone>(ZONES[2]!)
const cursorInfo = ref('经纬度与地形海拔')
const exaggeration = ref(1.2)
const orbiting = ref(false)

let viewer: Viewer | null = null
let handler: ScreenSpaceEventHandler | null = null
let orbitHeading = 0
let removeTick: (() => void) | null = null

function decodeHeights(encoded: Uint16Array, meta: TerrainMeta) {
  const heights = new Float32Array(encoded.length)
  const span = meta.maxElevation - meta.minElevation
  for (let i = 0; i < encoded.length; i++) {
    heights[i] = meta.minElevation + (encoded[i]! / 65535) * span
  }
  return heights
}

function bilinearHeight(
  heights: Float32Array,
  size: number,
  u: number,
  v: number,
) {
  const x = Math.min(size - 1, Math.max(0, u * (size - 1)))
  const y = Math.min(size - 1, Math.max(0, v * (size - 1)))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const a = heights[y0 * size + x0]!
  const b = heights[y0 * size + x1]!
  const c = heights[y1 * size + x0]!
  const d = heights[y1 * size + x1]!
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

function createTerrainProvider(meta: TerrainMeta, heights: Float32Array) {
  const tilingScheme = new GeographicTilingScheme()
  const [westDeg, southDeg, eastDeg, northDeg] = meta.bboxWGS84
  const west = CesiumMath.toRadians(westDeg)
  const south = CesiumMath.toRadians(southDeg)
  const east = CesiumMath.toRadians(eastDeg)
  const north = CesiumMath.toRadians(northDeg)
  const feather = CesiumMath.toRadians(0.2)
  const tileSize = 32

  return new CustomHeightmapTerrainProvider({
    width: tileSize,
    height: tileSize,
    tilingScheme,
    credit: new Credit('地形数据 © Mapzen；SRTM courtesy of USGS'),
    callback(x, y, level) {
      const tile = tilingScheme.tileXYToRectangle(x, y, level)
      const result = new Float32Array(tileSize * tileSize)
      for (let row = 0; row < tileSize; row++) {
        const latitude = tile.north + (tile.south - tile.north) * (row / (tileSize - 1))
        for (let column = 0; column < tileSize; column++) {
          const longitude = tile.west + (tile.east - tile.west) * (column / (tileSize - 1))
          if (longitude < west || longitude > east || latitude < south || latitude > north) {
            const outsideLon = Math.max(west - longitude, longitude - east, 0)
            const outsideLat = Math.max(south - latitude, latitude - north, 0)
            const fade = Math.max(0, 1 - Math.max(outsideLon, outsideLat) / feather)
            result[row * tileSize + column] = meta.minElevation * fade
            continue
          }
          const u = (longitude - west) / (east - west)
          const v = (north - latitude) / (north - south)
          result[row * tileSize + column] = bilinearHeight(heights, meta.gridSize, u, v)
        }
      }
      return result
    },
  })
}

function stopOrbit() {
  orbiting.value = false
}

function showGlobe() {
  if (!viewer) return
  stopOrbit()
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(34, 2, 15_500_000),
    orientation: {
      heading: 0,
      pitch: -CesiumMath.PI_OVER_TWO,
      roll: 0,
    },
    duration: 2.2,
  })
}

function flyToMountain() {
  if (!viewer) return
  stopOrbit()
  const target = Cartesian3.fromDegrees(37.3556, -3.0674, 3600)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 12_000), {
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(195),
      CesiumMath.toRadians(-24),
      43_000,
    ),
    duration: 3.2,
  })
}

function flyNear() {
  if (!viewer) return
  stopOrbit()
  const target = Cartesian3.fromDegrees(37.3556, -3.0674, 3900)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 5_000), {
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(195),
      CesiumMath.toRadians(-22),
      14_000,
    ),
    duration: 2.4,
  })
}

function toggleOrbit() {
  if (!viewer) return
  orbiting.value = !orbiting.value
  orbitHeading = viewer.camera.heading
}

function updateExaggeration(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  exaggeration.value = value
  if (viewer) {
    viewer.scene.verticalExaggeration = value
    viewer.scene.requestRender()
  }
}

function selectZone(zone: Zone) {
  selectedZone.value = zone
  if (!viewer) return
  viewer.selectedEntity = viewer.entities.getById(`zone-${zone.elevation}`)
}

function addTeachingEntities(meta: TerrainMeta) {
  if (!viewer) return
  const [summitLon, summitLat] = meta.summitWGS84
  viewer.entities.add({
    id: 'kilimanjaro-summit',
    position: Cartesian3.fromDegrees(summitLon, summitLat, meta.officialSummitElevation + 140),
    point: {
      pixelSize: 10,
      color: Color.fromCssColorString('#f4d97c'),
      outlineColor: Color.fromCssColorString('#172231'),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: `乌呼鲁峰\n${meta.officialSummitElevation.toLocaleString('zh-CN')} m`,
      font: '600 14px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#101820'),
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
      pixelOffset: new Cartesian2(14, 0),
      scaleByDistance: new NearFarScalar(8_000, 1.15, 120_000, 0.55),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  ZONES.forEach((zone, index) => {
    const lon = summitLon - 0.065 - index * 0.006
    const lat = summitLat - 0.012 - index * 0.01
    viewer!.entities.add({
      id: `zone-${zone.elevation}`,
      position: Cartesian3.fromDegrees(lon, lat, zone.elevation + 80),
      point: {
        pixelSize: 8,
        color: Color.fromCssColorString(zone.color),
        outlineColor: Color.fromCssColorString('#f4f7fa'),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${zone.name}  ${zone.range}`,
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString('#0e1721'),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.RIGHT,
        pixelOffset: new Cartesian2(-12, 0),
        scaleByDistance: new NearFarScalar(5_000, 1, 80_000, 0.45),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  })
}

function installPicking() {
  if (!viewer) return
  handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
  for (const eventType of [
    ScreenSpaceEventType.LEFT_DOWN,
    ScreenSpaceEventType.MIDDLE_DOWN,
    ScreenSpaceEventType.RIGHT_DOWN,
    ScreenSpaceEventType.WHEEL,
  ]) {
    handler.setInputAction(stopOrbit, eventType)
  }
  handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    if (!viewer) return
    const ray = viewer.camera.getPickRay(movement.endPosition)
    if (!defined(ray)) return
    const position = viewer.scene.globe.pick(ray, viewer.scene)
    if (!defined(position)) return
    const cartographic = Cartographic.fromCartesian(position, Ellipsoid.WGS84)
    cursorInfo.value = [
      `经度 ${CesiumMath.toDegrees(cartographic.longitude).toFixed(5)}°`,
      `纬度 ${CesiumMath.toDegrees(cartographic.latitude).toFixed(5)}°`,
      `海拔 ${Math.round(cartographic.height).toLocaleString('zh-CN')} m`,
    ].join(' · ')
  }, ScreenSpaceEventType.MOUSE_MOVE)
}

async function setup() {
  if (!hostRef.value) return
  try {
    const [metaResponse, heightResponse] = await Promise.all([
      fetch('/terrain/kilimanjaro/metadata.json'),
      fetch('/terrain/kilimanjaro/height-u16.bin'),
    ])
    if (!metaResponse.ok || !heightResponse.ok) throw new Error('乞力马扎罗离线资源不可用')
    const meta = (await metaResponse.json()) as TerrainMeta
    const encoded = new Uint16Array(await heightResponse.arrayBuffer())
    if (encoded.length !== meta.gridSize * meta.gridSize) throw new Error('高程网格尺寸不一致')
    const terrainProvider = createTerrainProvider(meta, decodeHeights(encoded, meta))

    viewer = new Viewer(hostRef.value, {
      baseLayer: false,
      terrainProvider,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: false,
    })
    viewer.scene.verticalExaggeration = exaggeration.value
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.globe.enableLighting = true
    // 乞力马扎罗经度约 37°E，固定在当地正午，避免缩放到背光坡后一片漆黑。
    viewer.clock.currentTime = JulianDate.fromIso8601('2026-10-21T09:30:00Z')
    viewer.clock.shouldAnimate = false
    viewer.scene.globe.maximumScreenSpaceError = 1.5
    viewer.scene.fog.enabled = true
    const camera = viewer.scene.screenSpaceCameraController
    camera.enableZoom = true
    camera.enableRotate = true
    camera.enableTilt = true
    camera.minimumZoomDistance = 180
    camera.maximumZoomDistance = 40_000_000
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true

    const globalImagery = await SingleTileImageryProvider.fromUrl(
      '/textures/earth-blue-marble.jpg',
      {
        rectangle: Rectangle.MAX_VALUE,
        credit: 'NASA Blue Marble · public domain',
      },
    )
    viewer.imageryLayers.addImageryProvider(globalImagery)
    const localImagery = await SingleTileImageryProvider.fromUrl(
      '/terrain/kilimanjaro/ortho.jpg',
      {
        rectangle: Rectangle.fromDegrees(...meta.bboxWGS84),
        credit: 'EOxCloudless 2016 · CC BY 4.0 · Contains modified Copernicus Sentinel data',
      },
    )
    const layer = viewer.imageryLayers.addImageryProvider(localImagery)
    layer.brightness = 1.15
    layer.contrast = 1.1
    layer.saturation = 1.06

    addTeachingEntities(meta)
    installPicking()
    const target = Cartesian3.fromDegrees(...meta.summitWGS84, 3200)
    removeTick = viewer.clock.onTick.addEventListener(() => {
      if (!viewer || !orbiting.value) return
      orbitHeading += 0.0017
      viewer.camera.lookAt(
        target,
        new HeadingPitchRange(orbitHeading, CesiumMath.toRadians(-24), 38_000),
      )
    })
    showGlobe()
    ready.value = true
  } catch (error) {
    failed.value = error instanceof Error ? error.message : 'Cesium 场景初始化失败'
    console.error(error)
  }
}

onMounted(setup)
onUnmounted(() => {
  handler?.destroy()
  handler = null
  removeTick?.()
  removeTick = null
  viewer?.destroy()
  viewer = null
})
</script>

<template>
  <div class="cesium-terrain">
    <div ref="hostRef" class="cesium-host" />

    <div v-if="!ready && !failed" class="loading">正在加载离线地形…</div>
    <div v-if="failed" class="loading error">{{ failed }}</div>

    <section class="title-card">
      <strong>乞力马扎罗山 · 离线三维地形</strong>
      <span>本地 SRTM 高程与 Sentinel-2 影像，无需联网</span>
    </section>

    <section class="camera-card">
      <button type="button" @click="showGlobe">全球视角</button>
      <button type="button" @click="flyToMountain">飞向山峰</button>
      <button type="button" @click="flyNear">山体近景</button>
      <button type="button" :class="{ active: orbiting }" @click="toggleOrbit">
        {{ orbiting ? '停止环绕' : '环绕山峰' }}
      </button>
      <label>
        <span>垂直夸张 {{ exaggeration.toFixed(1) }}×</span>
        <input
          :value="exaggeration"
          type="range"
          min="1"
          max="2.6"
          step="0.1"
          @input="updateExaggeration"
        />
      </label>
    </section>

    <section class="zone-card">
      <header>垂直自然带</header>
      <button
        v-for="zone in ZONES"
        :key="zone.name"
        type="button"
        :class="{ active: selectedZone.name === zone.name }"
        @click="selectZone(zone)"
      >
        <i :style="{ background: zone.color }" />
        <span>{{ zone.range }}</span>
        <b>{{ zone.name }}</b>
      </button>
      <small>自然带位置为课堂示意，不作为精确调查边界。</small>
    </section>

    <div class="cursor-readout">{{ cursorInfo }}</div>
  </div>
</template>

<style scoped>
.cesium-terrain {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  overflow: hidden;
  background: #02070c;
}
.cesium-host {
  position: absolute;
  inset: 0;
}
.cesium-host :deep(.cesium-viewer),
.cesium-host :deep(.cesium-viewer-cesiumWidgetContainer),
.cesium-host :deep(.cesium-widget),
.cesium-host :deep(canvas) {
  width: 100%;
  height: 100%;
}
.loading {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  color: #dbeaf5;
  background: #07111d;
}
.loading.error {
  color: #ffb4aa;
}
.title-card,
.camera-card,
.zone-card,
.cursor-readout {
  position: absolute;
  z-index: 4;
  color: #edf6fb;
  border: 1px solid rgb(147 190 218 / 24%);
  background: rgb(7 18 30 / 84%);
  box-shadow: 0 12px 32px rgb(0 0 0 / 28%);
  backdrop-filter: blur(12px);
}
.title-card {
  top: 14px;
  left: 14px;
  display: grid;
  gap: 3px;
  padding: 11px 14px;
  border-radius: 12px;
}
.title-card strong {
  font-size: 15px;
}
.title-card span,
.zone-card small {
  color: #9eb5c6;
  font-size: 11px;
}
.camera-card {
  right: 14px;
  bottom: 42px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 12px;
}
button {
  border: 1px solid rgb(158 197 222 / 28%);
  color: #dcebf4;
  background: rgb(22 43 59 / 78%);
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
button:hover,
button.active {
  border-color: #86c9ef;
  background: #285775;
}
.camera-card label {
  display: grid;
  gap: 2px;
  min-width: 126px;
  padding: 0 6px;
  font-size: 10px;
  color: #aac0cf;
}
.camera-card input {
  width: 100%;
  accent-color: #79c8f1;
}
.zone-card {
  top: 76px;
  left: 14px;
  display: grid;
  gap: 5px;
  width: 240px;
  padding: 11px;
  border-radius: 12px;
}
.zone-card header {
  margin-bottom: 2px;
  font-size: 12px;
  color: #b9d1df;
}
.zone-card button {
  display: grid;
  grid-template-columns: 8px 68px 1fr;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  text-align: left;
}
.zone-card button i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.zone-card button span {
  color: #9fb5c4;
  font-size: 10px;
}
.zone-card button b {
  font-size: 11px;
  font-weight: 600;
}
.cursor-readout {
  right: 14px;
  bottom: 10px;
  padding: 5px 9px;
  border-radius: 8px;
  color: #aac0cf;
  font-size: 10px;
}
@media (max-width: 760px) {
  .zone-card {
    width: 205px;
  }
  .camera-card {
    left: 14px;
    right: 14px;
    overflow-x: auto;
  }
}
</style>
