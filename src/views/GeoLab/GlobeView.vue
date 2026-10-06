<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { GlobeHost, conflictingLayerIds, type LayerId } from '@/engine/globe'
import { useGeoSceneStore } from '@/stores/geoScene'

const store = useGeoSceneStore()
const {
  month,
  axialTilt,
  coriolis,
  landSea,
  sectioned,
  highlightId,
  layers,
} = storeToRefs(store)

const canvasRef = ref<HTMLCanvasElement>()
const wrapRef = ref<HTMLElement>()
let host: GlobeHost | null = null
let ro: ResizeObserver | null = null

function pushState() {
  if (!host) return
  host.update({
    month: month.value,
    axialTilt: axialTilt.value,
    coriolis: coriolis.value,
    landSea: landSea.value,
    sectioned: sectioned.value,
    highlightId: highlightId.value,
    layers: { ...layers.value },
  })
}

function onTagClick(id: LayerId) {
  store.toggleLayer(id)
}

/** 当前已开图层里，与该 Tag 互斥的是否有开着的 */
function tagBlockedBy(id: LayerId): boolean {
  if (layers.value[id]) return false
  return conflictingLayerIds(id).some((other) => layers.value[other])
}

onMounted(() => {
  if (!canvasRef.value) return
  host = new GlobeHost(
    canvasRef.value,
    {
      month: month.value,
      axialTilt: axialTilt.value,
      coriolis: coriolis.value,
      landSea: landSea.value,
      sectioned: sectioned.value,
      highlightId: highlightId.value,
      layers: { ...layers.value },
    },
    (id) => store.setHighlight(id),
  )
  host.onCountriesReady = (text) => {
    store.countriesDisclaimer = text
  }
  host.onCityPick = (city) => {
    void store.pickCity(city)
  }
  pushState()
  ro = new ResizeObserver(() => {
    if (!wrapRef.value || !host) return
    host.resize(wrapRef.value.clientWidth, wrapRef.value.clientHeight)
  })
  if (wrapRef.value) ro.observe(wrapRef.value)
})

onUnmounted(() => {
  ro?.disconnect()
  host?.dispose()
  host = null
})

// 必须用 storeToRefs，否则月份等标量变化有时推不进 GlobeHost
watch(
  [month, axialTilt, coriolis, landSea, sectioned, highlightId, layers],
  () => pushState(),
  { deep: true },
)
</script>

<template>
  <div ref="wrapRef" class="globe-wrap">
    <div class="layer-tags" role="toolbar" aria-label="地球图层">
      <button
        v-for="tag in store.layerTags"
        :key="tag.id"
        type="button"
        class="tag"
        :class="{
          on: store.layers[tag.id],
          stub: tag.stub,
          conflict: tagBlockedBy(tag.id),
        }"
        :title="store.tagTitle(tag.id)"
        @click="onTagClick(tag.id)"
      >
        {{ tag.label }}
        <span v-if="tag.stub" class="badge">筹</span>
        <span v-else-if="tagBlockedBy(tag.id)" class="badge warn">互斥</span>
      </button>
    </div>

    <p v-if="store.layerConflictNotice" class="conflict-toast" role="status">
      {{ store.layerConflictNotice }}
    </p>

    <aside v-if="store.cityWeather" class="weather-card">
      <header>
        <strong>{{ store.cityWeather.city.nameZh }}</strong>
        <button type="button" class="x" @click="store.clearCityWeather()">×</button>
      </header>
      <p v-if="store.cityWeather.loading" class="muted">查询 Open-Meteo…</p>
      <p v-else-if="store.cityWeather.error" class="err">{{ store.cityWeather.error }}</p>
      <dl v-else>
        <div><dt>天气</dt><dd>{{ store.cityWeather.summary }}</dd></div>
        <div><dt>气温</dt><dd>{{ store.cityWeather.tempC ?? '—' }} ℃</dd></div>
        <div><dt>湿度</dt><dd>{{ store.cityWeather.humidity ?? '—' }} %</dd></div>
        <div><dt>风速</dt><dd>{{ store.cityWeather.windKmh ?? '—' }} km/h</dd></div>
      </dl>
      <p class="src">数据：Open-Meteo（免费）</p>
    </aside>

    <canvas ref="canvasRef" />
    <p class="hint">
      拖动旋转 · Tag 插拔图层 · 开启「主要城市」后点击城市查天气
      <template v-if="store.layers.countries && store.countriesDisclaimer">
        · {{ store.countriesDisclaimer }}
      </template>
      <template v-else-if="!store.axialTilt && (store.layers.sun || store.layers.pressure || store.layers.terminator)">
        · 已关闭黄赤交角：直射点停在赤道，气压带/晨昏线不随月份移动
      </template>
      <template v-else-if="store.layers.timezones">
        · 时区：橙色加粗边界（每 15° 理论分区）；经纬网为青色，便于区分
      </template>
      <template v-else-if="store.layers.insolation">
        · 太阳辐射：NASA CERES 大气顶入射通量（需联网；随月份）
      </template>
      <template v-else-if="store.layers.sst">
        · 海表温度：NASA GHRSST（需联网，首次约数秒）
      </template>
      <template v-else-if="store.layers.chlorophyll">
        · 叶绿素：PACE 叶绿素 a（需联网）
      </template>
      <template v-else-if="store.layers.snowice">
        · 积雪海冰：MODIS（需联网）
      </template>
      <template v-else-if="store.layers.precip">
        · 降水估测：GPM IMERG（需联网）
      </template>
      <template v-else-if="store.layers.popdensity">
        · 人口密度：GPW 2020（需联网）
      </template>
      <template v-else-if="store.layers.earthquakes">
        · 近期地震：USGS 一周 M4.5+（需联网）
      </template>
      <template v-else-if="store.layers.windfield">
        · 实况风场：Open-Meteo 稀疏格点（需联网；与示意环流互斥）
      </template>
      <template v-else-if="store.layers.nightlights">
        · 夜间灯光：本地地球夜景贴图（无光照显示）
      </template>
    </p>
  </div>
</template>

<style scoped>
.globe-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  background: var(--bg-canvas);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--glow-teal);
}
.layer-tags {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}
.tag {
  pointer-events: auto;
  border: 1px solid var(--border);
  background: rgba(12, 22, 40, 0.82);
  color: var(--text-500);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tag:hover {
  color: var(--text-700);
  border-color: var(--text-400);
}
.tag.on {
  border-color: var(--primary);
  color: var(--primary-mid);
  box-shadow: var(--glow-teal);
}
.tag.conflict {
  border-style: dashed;
  color: var(--text-400);
}
.badge {
  font-size: 10px;
  color: var(--text-400);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 3px;
}
.badge.warn {
  color: #e8b84a;
  border-color: rgba(232, 184, 74, 0.45);
}
.conflict-toast {
  position: absolute;
  top: 48px;
  left: 10px;
  right: 10px;
  z-index: 3;
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(232, 184, 74, 0.45);
  background: rgba(28, 22, 8, 0.92);
  color: #f0d78c;
  font-size: 12px;
  line-height: 1.45;
  pointer-events: none;
}
.weather-card {
  position: absolute;
  right: 12px;
  bottom: 40px;
  z-index: 3;
  width: 200px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(12, 22, 40, 0.92);
  backdrop-filter: blur(8px);
  color: var(--text-700);
  font-size: 12px;
}
.weather-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.weather-card .x {
  border: none;
  background: transparent;
  color: var(--text-400);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.weather-card dl {
  margin: 0;
  display: grid;
  gap: 4px;
}
.weather-card dl > div {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 8px;
}
.weather-card dt {
  color: var(--text-400);
}
.weather-card dd {
  margin: 0;
}
.weather-card .muted {
  color: var(--text-400);
  margin: 0;
}
.weather-card .err {
  color: #e8a317;
  margin: 0;
}
.weather-card .src {
  margin: 8px 0 0;
  font-size: 10px;
  color: var(--text-400);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.hint {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 8px;
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-400);
  pointer-events: none;
}
</style>
