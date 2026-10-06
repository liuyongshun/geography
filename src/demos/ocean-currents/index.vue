<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import { GlobeHost, defaultLayerMap, type LayerId } from '@/engine/globe'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const svgRef = ref<SVGSVGElement | null>(null)

const W = 760
const H = 430

type ImpactId = 'gulf' | 'peru' | 'kuroshio' | 'california'
const impactId = ref<ImpactId>('gulf')

const IMPACTS: Record<
  ImpactId,
  { name: string; current: string; kind: 'warm' | 'cold'; climate: string; extra: string; region: string }
> = {
  gulf: {
    name: '西欧温和湿润',
    current: '北大西洋暖流',
    kind: 'warm',
    climate: '同纬度偏暖，冬不甚寒',
    extra: '暖流带来热量与水汽 → 温带海洋性气候',
    region: '西欧沿海',
  },
  peru: {
    name: '沿岸荒漠 + 渔场',
    current: '秘鲁寒流',
    kind: 'cold',
    climate: '降温减湿，沿岸多荒漠',
    extra: '上升流带来营养盐 → 世界著名渔场',
    region: '南美西岸',
  },
  kuroshio: {
    name: '东亚暖湿输送',
    current: '黑潮',
    kind: 'warm',
    climate: '增温增湿，影响季风区',
    extra: '北上暖水对东亚气候与航行意义大',
    region: '西北太平洋',
  },
  california: {
    name: '西岸凉爽干燥',
    current: '加利福尼亚寒流',
    kind: 'cold',
    climate: '降温减湿，夏凉少雨',
    extra: '与同纬度东岸形成鲜明对比',
    region: '北美西岸',
  },
}

const isPattern = computed(() => props.stepId === 'pattern')

let host: GlobeHost | null = null
let ro: ResizeObserver | null = null

function patternLayers(): Record<LayerId, boolean> {
  const layers = defaultLayerMap()
  for (const id of Object.keys(layers) as LayerId[]) {
    if (id !== 'earth') layers[id] = false
  }
  layers.oceanCurrents = true
  // 洋流课以流向为主，默认不开经纬网（避免抢戏；地球预览里可手动开）
  return layers
}

function mountGlobe() {
  if (!canvasRef.value || host) return
  host = new GlobeHost(
    canvasRef.value,
    {
      month: 6,
      axialTilt: true,
      coriolis: true,
      landSea: false,
      sectioned: false,
      highlightId: null,
      layers: patternLayers(),
    },
    () => {},
  )
  // 略偏太平洋，便于看环流
  requestAnimationFrame(() => {
    if (!wrapRef.value || !host) return
    host.resize(wrapRef.value.clientWidth, wrapRef.value.clientHeight)
  })
}

function disposeGlobe() {
  ro?.disconnect()
  ro = null
  host?.dispose()
  host = null
}

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#oc-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'oc-anim')
    .text(`
      .oc-flow { stroke-dasharray: 10 14; animation: oc-dash 3.6s linear infinite; }
      .oc-flow-slow { stroke-dasharray: 8 16; animation: oc-dash 5s linear infinite; }
      .oc-pulse { animation: oc-pulse 3.2s ease-in-out infinite; }
      .oc-up { animation: oc-up 2.8s ease-in-out infinite; }
      @keyframes oc-dash { to { stroke-dashoffset: -48; } }
      @keyframes oc-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
      @keyframes oc-up {
        0%, 100% { transform: translateY(4px); opacity: 0.45; }
        50% { transform: translateY(-6px); opacity: 1; }
      }
    `)
}

function drawImpact() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)

  const warmM = defs
    .append('marker')
    .attr('id', 'oc-warm')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
  warmM.append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#ff8c42')
  const coldM = defs
    .append('marker')
    .attr('id', 'oc-cold')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
  coldM.append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', '#4cc9f0')

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', DemoHex.canvas).attr('rx', 12)

  const info = IMPACTS[impactId.value]
  const warm = info.kind === 'warm'
  const accent = warm ? '#ff8c42' : '#4cc9f0'

  // 左：剖面示意（洋流—大气—陆地）
  const g = svg.append('g').attr('transform', 'translate(40, 36)')
  g.append('text').attr('x', 0).attr('y', 0).attr('fill', DemoHex.inkMuted).attr('font-size', 11).attr('font-weight', 600).text(info.region)
  g.append('text').attr('x', 0).attr('y', 18).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(`${info.current} · ${warm ? '暖流' : '寒流'}`)

  // 海面
  g.append('rect').attr('x', 0).attr('y', 200).attr('width', 320).attr('height', 120).attr('fill', '#0d2137').attr('rx', 8)
  g.append('rect')
    .attr('x', 0)
    .attr('y', 200)
    .attr('width', 320)
    .attr('height', 18)
    .attr('fill', accent)
    .attr('opacity', 0.35)
    .attr('class', 'oc-pulse')

  // 洋流箭头
  g.append('path')
    .attr('d', warm ? 'M 40 230 C 100 218, 180 218, 280 230' : 'M 280 230 C 200 218, 120 218, 40 230')
    .attr('fill', 'none')
    .attr('stroke', accent)
    .attr('stroke-width', 2.4)
    .attr('marker-end', warm ? 'url(#oc-warm)' : 'url(#oc-cold)')
    .attr('class', 'oc-flow')

  g.append('text')
    .attr('x', 160)
    .attr('y', 252)
    .attr('text-anchor', 'middle')
    .attr('fill', accent)
    .attr('font-size', 10)
    .text(warm ? '暖流输送热量 / 水汽' : '寒流降温减湿')

  // 上升流（秘鲁）
  if (impactId.value === 'peru') {
    for (const x of [120, 160, 200]) {
      g.append('path')
        .attr('d', `M ${x} 300 L ${x} 250`)
        .attr('stroke', '#7dd3a0')
        .attr('stroke-width', 1.6)
        .attr('marker-end', 'url(#oc-cold)')
        .attr('class', 'oc-up')
        .attr('style', `transform-box: fill-box; transform-origin: center; animation-delay: ${(x - 120) * 0.02}s`)
    }
    g.append('text').attr('x', 160).attr('y', 318).attr('text-anchor', 'middle').attr('fill', '#7dd3a0').attr('font-size', 10).text('上升流 · 营养盐')
    // 鱼点
    for (const [x, y] of [
      [130, 268],
      [155, 275],
      [180, 265],
      [205, 272],
    ] as const) {
      g.append('ellipse').attr('cx', x).attr('cy', y).attr('rx', 5).attr('ry', 2.5).attr('fill', '#9ee5c0').attr('opacity', 0.85).attr('class', 'oc-pulse')
    }
  }

  // 陆地块
  g.append('path')
    .attr('d', 'M 250 80 L 320 80 L 320 200 L 250 200 Z')
    .attr('fill', warm ? '#2a3f2e' : '#3a3428')
    .attr('opacity', 0.9)
  g.append('text').attr('x', 285).attr('y', 145).attr('text-anchor', 'middle').attr('fill', DemoHex.inkMuted).attr('font-size', 10).text('陆地')

  // 大气影响箭头
  g.append('path')
    .attr('d', 'M 200 190 Q 230 140 260 110')
    .attr('fill', 'none')
    .attr('stroke', warm ? '#ffb070' : '#8ad4f0')
    .attr('stroke-width', 1.8)
    .attr('marker-end', warm ? 'url(#oc-warm)' : 'url(#oc-cold)')
    .attr('class', 'oc-flow-slow')
  g.append('text').attr('x', 175).attr('y', 130).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(warm ? '增温增湿' : '降温减湿')

  // 右：要点卡
  const card = svg.append('g').attr('transform', 'translate(400, 70)')
  card.append('rect').attr('width', 320).attr('height', 280).attr('rx', 10).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  card.append('text').attr('x', 20).attr('y', 36).attr('fill', DemoHex.ink).attr('font-size', 12).attr('font-weight', 600).text(info.name)
  card.append('text').attr('x', 20).attr('y', 60).attr('fill', accent).attr('font-size', 10).text(info.current)
  card
    .append('text')
    .attr('x', 20)
    .attr('y', 100)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text('气候影响')
  card
    .append('text')
    .attr('x', 20)
    .attr('y', 122)
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text(info.climate)
  card
    .append('text')
    .attr('x', 20)
    .attr('y', 160)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text(impactId.value === 'peru' ? '渔场与生态' : '机制要点')
  // 换行简单处理
  const lines = wrapText(info.extra, 18)
  lines.forEach((line, i) => {
    card
      .append('text')
      .attr('x', 20)
      .attr('y', 182 + i * 18)
      .attr('fill', DemoHex.inkDim)
      .attr('font-size', 10)
      .text(line)
  })
  card
    .append('text')
    .attr('x', 20)
    .attr('y', 250)
    .attr('fill', DemoHex.inkFaint)
    .attr('font-size', 10)
    .text(warm ? '口诀：暖流暖湿' : '口诀：寒流干冷（上升流除外）')
}

function wrapText(s: string, max: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of s) {
    cur += ch
    if (cur.length >= max) {
      out.push(cur)
      cur = ''
    }
  }
  if (cur) out.push(cur)
  return out
}

function syncStep() {
  if (isPattern.value) {
    disposeGlobe()
    requestAnimationFrame(() => {
      mountGlobe()
      if (wrapRef.value) {
        ro = new ResizeObserver(() => {
          if (!wrapRef.value || !host) return
          host.resize(wrapRef.value.clientWidth, wrapRef.value.clientHeight)
        })
        ro.observe(wrapRef.value)
      }
    })
  } else {
    disposeGlobe()
    requestAnimationFrame(drawImpact)
  }
}

watch(() => props.stepId, syncStep)
watch(impactId, () => {
  if (!isPattern.value) drawImpact()
})

onMounted(syncStep)
onUnmounted(disposeGlobe)

const impactKeys = computed(() => Object.keys(IMPACTS) as ImpactId[])
</script>

<template>
  <div class="demo">
    <div v-show="isPattern" ref="wrapRef" class="globe-wrap">
      <canvas ref="canvasRef" class="globe" />
      <div class="legend">
        <span class="warm">暖流 →</span>
        <span class="cold">寒流 →</span>
        <em>箭头沿流向缓慢前进</em>
      </div>
    </div>

    <div v-show="!isPattern" class="impact">
      <div class="toolbar">
        <button
          v-for="id in impactKeys"
          :key="id"
          type="button"
          class="chip"
          :class="{ on: impactId === id }"
          @click="impactId = id"
        >
          {{ IMPACTS[id].current }}
        </button>
      </div>
      <svg ref="svgRef" class="canvas" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" />
    </div>
  </div>
</template>

<style scoped>
.demo {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.globe-wrap {
  position: relative;
  flex: 1;
  min-height: 360px;
  border-radius: 12px;
  overflow: hidden;
  background: #080c12;
}
.globe {
  width: 100%;
  height: 100%;
  display: block;
}
.legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(8, 14, 28, 0.72);
  font-size: 11px;
  color: #8aa0b4;
}
.legend .warm::before,
.legend .cold::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 3px;
  margin-right: 5px;
  vertical-align: middle;
  border-radius: 1px;
}
.legend .warm {
  color: #ffb070;
}
.legend .warm::before {
  background: #ff8c42;
}
.legend .cold {
  color: #8ad4f0;
}
.legend .cold::before {
  background: #4cc9f0;
}
.legend em {
  font-style: normal;
  color: #5a7388;
  margin-left: 4px;
}
.impact {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid #2a3f5a;
  background: #0e1628;
  color: #9eb6cc;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.chip.on {
  border-color: #4cc9f0;
  color: #e8f4f8;
  background: rgba(76, 201, 240, 0.12);
}
.canvas {
  width: 100%;
  flex: 1;
  min-height: 320px;
}
</style>
