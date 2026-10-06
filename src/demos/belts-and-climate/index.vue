<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import * as echarts from 'echarts'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
const playing = ref(true)
/** 0 = 一月（南移），1 = 七月（北移）；连续插值 */
const seasonT = ref(1)
const hoverBelt = ref<BeltId | null>(null)

const W = 780
const H = 440

type BeltId = 'polar' | 'subpolar' | 'westerly' | 'subtrop' | 'trade' | 'equator'
type ClimateId = 'tropical' | 'savanna' | 'desert' | 'mediterranean' | 'oceanic' | 'tundra'

/** 北半球示意：中心纬度（°），半宽（°）——季节移动改中心纬 */
const BELTS: Array<{
  id: BeltId
  name: string
  short: string
  kind: 'H' | 'L' | 'wind'
  latJul: number
  latJan: number
  half: number
  climates: ClimateId[]
  note: string
  windDir?: 'W' | 'E'
}> = [
  { id: 'polar', name: '极地高压', short: '极高', kind: 'H', latJul: 88, latJan: 85, half: 6, climates: ['tundra'], note: '干冷下沉 · 极地东风源地' },
  { id: 'subpolar', name: '副极地低压', short: '副极低', kind: 'L', latJul: 65, latJan: 55, half: 6, climates: ['tundra'], note: '极锋交绥 · 多气旋' },
  { id: 'westerly', name: '中纬西风带', short: '西风', kind: 'wind', latJul: 50, latJan: 40, half: 7, climates: ['oceanic', 'mediterranean'], note: '西风送湿', windDir: 'E' },
  { id: 'subtrop', name: '副热带高压', short: '副高', kind: 'H', latJul: 35, latJan: 25, half: 7, climates: ['mediterranean', 'desert'], note: '下沉干燥', windDir: undefined },
  { id: 'trade', name: '东北信风带', short: '信风', kind: 'wind', latJul: 20, latJan: 10, half: 7, climates: ['savanna', 'desert'], note: '东北信风', windDir: 'W' },
  { id: 'equator', name: '赤道低压', short: '赤道低', kind: 'L', latJul: 8, latJan: -2, half: 7, climates: ['tropical', 'savanna'], note: '辐合上升 · 对流雨' },
]

const CLIMATES: Record<
  ClimateId,
  { name: string; belt: BeltId; cause: string; t: number[]; p: number[] }
> = {
  tropical: {
    name: '热带雨林',
    belt: 'equator',
    cause: '终年受赤道低压控制，对流雨旺盛',
    t: [26, 26, 27, 27, 27, 26, 26, 26, 26, 27, 27, 26],
    p: [280, 270, 300, 320, 250, 180, 160, 170, 220, 260, 290, 300],
  },
  savanna: {
    name: '热带草原',
    belt: 'trade',
    cause: '赤道低压与信风带季节交替，干湿分明',
    t: [25, 26, 27, 28, 27, 25, 24, 24, 25, 26, 26, 25],
    p: [20, 30, 70, 120, 160, 180, 140, 100, 80, 50, 25, 15],
  },
  desert: {
    name: '热带沙漠',
    belt: 'subtrop',
    cause: '副高下沉或信风离岸，终年干旱',
    t: [15, 18, 22, 27, 31, 34, 35, 35, 32, 27, 21, 16],
    p: [5, 4, 3, 2, 1, 0, 0, 0, 1, 2, 3, 5],
  },
  mediterranean: {
    name: '地中海气候',
    belt: 'subtrop',
    cause: '夏季副高、冬季西风交替控制',
    t: [10, 11, 13, 16, 20, 24, 27, 27, 23, 19, 14, 11],
    p: [90, 70, 55, 40, 20, 8, 4, 5, 22, 60, 85, 95],
  },
  oceanic: {
    name: '温带海洋性',
    belt: 'westerly',
    cause: '常年西风带控制，温和多雨',
    t: [5, 5, 7, 9, 12, 15, 17, 17, 15, 12, 8, 6],
    p: [70, 55, 55, 50, 50, 55, 60, 70, 70, 80, 80, 80],
  },
  tundra: {
    name: '苔原气候',
    belt: 'polar',
    cause: '极地气团与副极地低压影响，暖季短促',
    t: [-25, -24, -18, -10, -1, 6, 9, 7, 1, -8, -16, -22],
    p: [12, 10, 10, 12, 15, 20, 28, 30, 22, 18, 14, 12],
  },
}

const activeBelt = ref<BeltId>('equator')
const climateId = ref<ClimateId>('tropical')

const seasonLabel = computed(() => (seasonT.value > 0.55 ? '七月 · 气压带北移' : seasonT.value < 0.45 ? '一月 · 气压带南移' : '季节过渡中…'))

const hint = computed(() => {
  if (props.stepId === 'climate') return CLIMATES[climateId.value].cause
  const b = BELTS.find((x) => x.id === activeBelt.value)!
  return `点色带选带 · 拖季节或自动往复 · ${b.note} · ${seasonLabel.value}`
})

const climateKeys = computed(() => Object.keys(CLIMATES) as ClimateId[])

let chart: echarts.ECharts | null = null
let raf = 0
let disposed = false
let lastT = 0
let phase = 0
let drawAccum = 0

/** 地图区：纬度 → y（北在上，约 90°N～10°S） */
const MAP = { x: 36, y: 52, w: 420, h: 320, latMax: 92, latMin: -12 }

function latToY(lat: number) {
  const u = (MAP.latMax - lat) / (MAP.latMax - MAP.latMin)
  return MAP.y + u * MAP.h
}

function beltLat(b: (typeof BELTS)[number]) {
  return b.latJan + (b.latJul - b.latJan) * seasonT.value
}

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#bc-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'bc-anim')
    .text(`
      .bc-flow { stroke-dasharray: 8 10; animation: bc-dash 2.4s linear infinite; }
      .bc-flow-slow { stroke-dasharray: 7 12; animation: bc-dash 3.6s linear infinite; }
      .bc-pulse { animation: bc-pulse 2.4s ease-in-out infinite; }
      @keyframes bc-dash { to { stroke-dashoffset: -36; } }
      @keyframes bc-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
    `)
}

function marker(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>, id: string, color: string) {
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 12 12')
    .attr('refX', 10)
    .attr('refY', 6)
    .attr('markerWidth', 11)
    .attr('markerHeight', 11)
    .attr('orient', 'auto')
    .attr('markerUnits', 'userSpaceOnUse')
    .append('path')
    .attr('d', 'M 1 1.5 L 11 6 L 1 10.5 Z')
    .attr('fill', color)
}

function selectBelt(id: BeltId) {
  activeBelt.value = id
  const first = BELTS.find((b) => b.id === id)?.climates[0]
  if (first) climateId.value = first
}

function drawControl() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'bc-wind', DemoHex.coldSoft)
  marker(defs, 'bc-hi', DemoHex.lift)
  marker(defs, 'bc-link', DemoHex.sink)

  const sky = defs.append('linearGradient').attr('id', 'bc-sky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', '#152838')
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#bc-sky)').attr('rx', 12)

  // 地球影像裁剪（北半球纬度条带）
  defs
    .append('clipPath')
    .attr('id', 'bc-map-clip')
    .append('rect')
    .attr('x', MAP.x)
    .attr('y', MAP.y)
    .attr('width', MAP.w)
    .attr('height', MAP.h)
    .attr('rx', 10)

  const mapG = svg.append('g').attr('clip-path', 'url(#bc-map-clip)')
  // Blue Marble 作地理底图（示意）
  mapG
    .append('image')
    .attr('href', '/textures/earth-blue-marble.jpg')
    .attr('x', MAP.x - 40)
    .attr('y', MAP.y - 20)
    .attr('width', MAP.w + 120)
    .attr('height', MAP.h + 80)
    .attr('opacity', 0.92)
    .attr('preserveAspectRatio', 'xMidYMid slice')
  // 压暗一点好读色带
  mapG
    .append('rect')
    .attr('x', MAP.x)
    .attr('y', MAP.y)
    .attr('width', MAP.w)
    .attr('height', MAP.h)
    .attr('fill', '#041018')
    .attr('opacity', 0.28)

  svg
    .append('rect')
    .attr('x', MAP.x)
    .attr('y', MAP.y)
    .attr('width', MAP.w)
    .attr('height', MAP.h)
    .attr('rx', 10)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.inkFaint)
    .attr('stroke-width', 1.5)

  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('气压带 · 风带 → 气候')
  svg.append('text').attr('x', 24).attr('y', 44).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(`${seasonLabel.value} · 底图 Blue Marble（示意）`)

  // 纬度刻度
  for (const lat of [90, 60, 30, 0]) {
    const y = latToY(lat)
    if (y < MAP.y || y > MAP.y + MAP.h) continue
    svg
      .append('line')
      .attr('x1', MAP.x)
      .attr('x2', MAP.x + MAP.w)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', lat === 0 ? DemoHex.lift : 'rgba(200,220,240,0.28)')
      .attr('stroke-width', lat === 0 ? 1.4 : 1)
      .attr('stroke-dasharray', lat === 0 ? '5 4' : '2 6')
    svg
      .append('text')
      .attr('x', MAP.x + 6)
      .attr('y', y - 4)
      .attr('fill', lat === 0 ? DemoHex.lift : DemoHex.inkDim)
      .attr('font-size', 10)
      .text(lat === 0 ? '赤道' : `${lat}°N`)
  }

  const hi = activeBelt.value
  const hovered = hoverBelt.value

  // 色带（可点）
  for (const b of BELTS) {
    const lat = beltLat(b)
    const y0 = latToY(lat + b.half)
    const y1 = latToY(lat - b.half)
    const top = Math.min(y0, y1)
    const bot = Math.max(y0, y1)
    const h = Math.max(10, bot - top)
    const on = b.id === hi
    const soft = b.id === hovered
    const fill = b.kind === 'H' ? DemoHex.high : b.kind === 'L' ? DemoHex.low : DemoHex.cold
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverBelt.value = b.id
      })
      .on('mouseleave', () => {
        if (hoverBelt.value === b.id) hoverBelt.value = null
      })
      .on('click', () => selectBelt(b.id))

    g.append('rect')
      .attr('x', MAP.x + 8)
      .attr('y', top)
      .attr('width', MAP.w - 16)
      .attr('height', h)
      .attr('rx', 6)
      .attr('fill', fill)
      .attr('opacity', on ? 0.55 : soft ? 0.4 : 0.28)
      .attr('stroke', on ? DemoHex.ink : soft ? DemoHex.inkMuted : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', on ? 2.2 : 1)

    g.append('text')
      .attr('x', MAP.x + 20)
      .attr('y', top + Math.min(h * 0.55, 22))
      .attr('fill', DemoHex.ink)
      .attr('font-size', on ? 12 : 11)
      .attr('font-weight', 600)
      .attr('style', 'pointer-events:none')
      .text(`${b.short} · ${b.name}`)

    // 风带箭头 / 升降箭头
    if (b.kind === 'wind' && (on || soft)) {
      const dirRight = b.windDir === 'E'
      const midY = top + h / 2
      for (const yy of [midY - 8, midY + 8]) {
        const x0 = dirRight ? MAP.x + 160 : MAP.x + MAP.w - 40
        const x1 = dirRight ? MAP.x + MAP.w - 40 : MAP.x + 160
        svg
          .append('path')
          .attr('d', `M ${x0} ${yy} L ${x1} ${yy}`)
          .attr('fill', 'none')
          .attr('stroke', DemoHex.coldSoft)
          .attr('stroke-width', 2.4)
          .attr('marker-end', 'url(#bc-wind)')
          .attr('class', 'bc-flow')
          .attr('style', 'pointer-events:none')
      }
    }
    if (b.kind !== 'wind' && on) {
      const midY = top + h / 2
      const x = MAP.x + MAP.w - 56
      const up = b.kind === 'L'
      svg
        .append('path')
        .attr('d', up ? `M ${x} ${midY + 14} L ${x} ${midY - 14}` : `M ${x} ${midY - 14} L ${x} ${midY + 14}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.lift)
        .attr('stroke-width', 2.4)
        .attr('marker-end', 'url(#bc-hi)')
        .attr('class', 'bc-pulse')
        .attr('style', 'pointer-events:none')
      svg
        .append('text')
        .attr('x', x - 28)
        .attr('y', midY + 4)
        .attr('fill', DemoHex.lift)
        .attr('font-size', 10)
        .attr('style', 'pointer-events:none')
        .text(up ? '上升' : '下沉')
    }
  }

  // 右侧气候卡
  const cur = BELTS.find((b) => b.id === hi)!
  svg.append('rect').attr('x', 476).attr('y', 52).attr('width', 280).attr('height', 318).attr('rx', 10).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', 492).attr('y', 78).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('控制下的气候')
  svg.append('text').attr('x', 492).attr('y', 98).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(cur.note)
  svg.append('text').attr('x', 492).attr('y', 116).attr('fill', DemoHex.accent).attr('font-size', 10).text('点击色带或下方卡片 · 可切到「气候统计」')

  cur.climates.forEach((cid, i) => {
    const c = CLIMATES[cid]
    const y = 134 + i * 78
    const on = climateId.value === cid
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('click', () => {
        climateId.value = cid
      })
    g.append('rect')
      .attr('x', 490)
      .attr('y', y)
      .attr('width', 252)
      .attr('height', 66)
      .attr('rx', 8)
      .attr('fill', on ? 'rgba(74,163,217,0.18)' : DemoHex.panelSoft)
      .attr('stroke', on ? DemoHex.accent : DemoHex.inkFaint)
      .attr('stroke-width', on ? 1.8 : 1)
    g.append('text').attr('x', 506).attr('y', y + 26).attr('fill', on ? DemoHex.lift : DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text(c.name)
    g.append('text').attr('x', 506).attr('y', y + 46).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(c.cause.slice(0, 20) + (c.cause.length > 20 ? '…' : ''))

    if (on) {
      const lat = beltLat(cur)
      const yBand = latToY(lat)
      svg
        .append('path')
        .attr('d', `M ${MAP.x + MAP.w} ${yBand} L 488 ${y + 33}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.sink)
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#bc-link)')
        .attr('class', 'bc-flow-slow')
        .attr('style', 'pointer-events:none')
    }
  })

  // 底部操作提示
  svg.append('rect').attr('x', 24).attr('y', 400).attr('width', W - 48).attr('height', 28).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 418)
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text('交互：点左侧地理色带选气压带/风带 · 点右侧气候卡 · 工具条拖「季节」看带状南北移动')
}

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value, undefined, { renderer: 'canvas' })
  const c = CLIMATES[climateId.value]
  const belt = BELTS.find((b) => b.id === c.belt)!
  const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  chart.setOption({
    backgroundColor: 'transparent',
    animationDuration: 600,
    title: [
      {
        text: c.name,
        left: 16,
        top: 10,
        textStyle: { color: DemoHex.cloud, fontSize: 13, fontWeight: 600 },
      },
      {
        text: `成因：${c.cause}（关联：${belt.name}）`,
        left: 16,
        top: 32,
        textStyle: { color: DemoHex.inkDim, fontSize: 10, fontWeight: 400 },
      },
    ],
    legend: { right: 16, top: 12, textStyle: { color: DemoHex.inkDim, fontSize: 11 } },
    grid: { left: 52, right: 52, top: 64, bottom: 36 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: months,
      axisLine: { lineStyle: { color: DemoHex.inkFaint } },
      axisLabel: { color: DemoHex.inkDim, fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: '℃',
        nameTextStyle: { color: DemoHex.inkDim, fontSize: 10 },
        splitLine: { lineStyle: { color: DemoHex.panelSoft } },
        axisLabel: { color: DemoHex.inkDim, fontSize: 10 },
      },
      {
        type: 'value',
        name: 'mm',
        nameTextStyle: { color: DemoHex.inkDim, fontSize: 10 },
        splitLine: { show: false },
        axisLabel: { color: DemoHex.inkDim, fontSize: 10 },
      },
    ],
    series: [
      {
        name: '气温',
        type: 'line',
        data: [...c.t],
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: DemoHex.warm },
        lineStyle: { width: 2.5 },
      },
      {
        name: '降水',
        type: 'bar',
        yAxisIndex: 1,
        data: [...c.p],
        barMaxWidth: 18,
        itemStyle: { color: DemoHex.cold, opacity: 0.8, borderRadius: [3, 3, 0, 0] },
      },
    ],
  })
}

function redraw() {
  if (props.stepId === 'control') drawControl()
  else renderChart()
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  phase += dt
  drawAccum += dt

  if (playing.value && props.stepId === 'control') {
    // 缓慢往复 0↔1
    seasonT.value = (Math.sin(phase * 0.32) + 1) / 2
  }

  if (props.stepId === 'control' && drawAccum >= 0.05) {
    drawAccum = 0
    drawControl()
  }
}

watch(
  () => props.stepId,
  (id) => {
    if (id === 'control') {
      playing.value = true
      requestAnimationFrame(drawControl)
    } else {
      playing.value = false
      requestAnimationFrame(() => {
        renderChart()
        chart?.resize()
      })
    }
  },
)

watch([activeBelt, climateId, hoverBelt], () => {
  if (props.stepId === 'control' && !playing.value) drawControl()
})

watch(climateId, () => {
  if (props.stepId === 'climate') renderChart()
})

onMounted(() => {
  disposed = false
  lastT = performance.now()
  redraw()
  loop()
  window.addEventListener('resize', () => chart?.resize())
})
onUnmounted(() => {
  disposed = true
  cancelAnimationFrame(raf)
  chart?.dispose()
  chart = null
  d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <template v-if="stepId === 'control'">
        <label class="ctrl">
          <span>季节</span>
          <input
            v-model.number="seasonT"
            type="range"
            min="0"
            max="1"
            step="0.01"
            @pointerdown="playing = false"
          />
          <span class="season-tag">{{ seasonT > 0.55 ? '七月' : seasonT < 0.45 ? '一月' : '过渡' }}</span>
        </label>
        <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
          {{ playing ? '暂停季节' : '季节往复' }}
        </button>
      </template>
      <div v-else class="chips">
        <button
          v-for="id in climateKeys"
          :key="id"
          type="button"
          class="chip"
          :class="{ on: climateId === id }"
          @click="climateId = id"
        >
          {{ CLIMATES[id].name }}
        </button>
      </div>
    </div>
    <svg v-show="stepId === 'control'" ref="svgRef" class="canvas" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" />
    <div v-show="stepId === 'climate'" ref="chartRef" class="chart" />
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
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.hint {
  font-size: 12px;
  color: var(--text-400);
  margin-right: auto;
  max-width: 42%;
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
.season-tag {
  min-width: 2.5em;
  color: var(--demo-accent-soft);
  font-size: 12px;
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  border-radius: 999px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
.chip.on {
  border-color: var(--demo-accent);
  color: var(--demo-accent-soft);
  background: var(--demo-accent-on);
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
.canvas,
.chart {
  flex: 1;
  width: 100%;
  min-height: 300px;
}
</style>
