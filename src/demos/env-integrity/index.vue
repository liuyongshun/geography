<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const W = 780
const H = 440

type ElemId = 'climate' | 'water' | 'landform' | 'soil' | 'bio'

const ELEMS: Array<{
  id: ElemId
  name: string
  hint: string
  fill: string
  x: number
  y: number
}> = [
  { id: 'climate', name: '气候', hint: '水热条件', fill: DemoHex.cold, x: 390, y: 86 },
  { id: 'water', name: '水文', hint: '径流 · 地下水', fill: '#4cc9f0', x: 590, y: 190 },
  { id: 'landform', name: '地貌', hint: '侵蚀 · 堆积', fill: DemoHex.sink, x: 520, y: 350 },
  { id: 'soil', name: '土壤', hint: '成土 · 肥力', fill: '#c45c26', x: 260, y: 350 },
  { id: 'bio', name: '生物', hint: '植被 · 动物', fill: '#5cb87a', x: 190, y: 190 },
]

const LINKS: Array<{ from: ElemId; to: ElemId; label: string }> = [
  { from: 'climate', to: 'water', label: '降水补给' },
  { from: 'climate', to: 'bio', label: '水热控制' },
  { from: 'climate', to: 'soil', label: '风化速率' },
  { from: 'water', to: 'landform', label: '侵蚀搬运' },
  { from: 'water', to: 'bio', label: '水分供应' },
  { from: 'bio', to: 'soil', label: '有机质' },
  { from: 'bio', to: 'climate', label: '蒸腾调节' },
  { from: 'soil', to: 'bio', label: '养分支撑' },
  { from: 'landform', to: 'climate', label: '地形降水' },
  { from: 'landform', to: 'water', label: '汇流路径' },
  { from: 'soil', to: 'water', label: '下渗蓄水' },
  { from: 'water', to: 'soil', label: '淋溶淀积' },
]

const active = ref<ElemId>('bio')
const broken = ref(false)

const isChain = computed(() => props.stepId === 'chain')

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#ei-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'ei-anim')
    .text(`
      .ei-flow { stroke-dasharray: 8 12; animation: ei-dash 3.6s linear infinite; }
      .ei-flow-dim { stroke-dasharray: 6 16; animation: ei-dash 5.2s linear infinite; opacity: 0.22; }
      .ei-pulse { animation: ei-pulse 3.2s ease-in-out infinite; }
      .ei-bob { animation: ei-bob 4s ease-in-out infinite; }
      .ei-fall { animation: ei-fall 2.4s linear infinite; }
      .ei-wilt { animation: ei-wilt 3.6s ease-in-out infinite; }
      @keyframes ei-dash { to { stroke-dashoffset: -40; } }
      @keyframes ei-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
      @keyframes ei-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes ei-fall { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 16; } }
      @keyframes ei-wilt { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
    `)
}

function marker(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>, id: string, color: string) {
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', color)
}

function relatedOf(id: ElemId) {
  return LINKS.filter((e) => e.from === id || e.to === id)
}

function drawElements() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'ei-on', DemoHex.coldSoft)
  marker(defs, 'ei-off', DemoHex.inkFaint)

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', DemoHex.canvas).attr('rx', 12)
  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('五大要素相互制约')
  svg.append('text').attr('x', 24).attr('y', 46).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('点某一要素，看它牵动哪些联系')

  const cx = 390
  const cy = 230
  svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 46).attr('fill', '#101828').attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', cx).attr('y', cy - 4).attr('text-anchor', 'middle').attr('fill', DemoHex.ink).attr('font-size', 11).attr('font-weight', 600).text('整体性')
  svg.append('text').attr('x', cx).attr('y', cy + 14).attr('text-anchor', 'middle').attr('fill', DemoHex.inkDim).attr('font-size', 10).text('牵一发而动全身')

  const hi = active.value
  const rel = relatedOf(hi)
  const by = Object.fromEntries(ELEMS.map((n) => [n.id, n]))

  for (const e of LINKS) {
    const a = by[e.from]
    const b = by[e.to]
    if (!a || !b) continue
    const on = rel.some((r) => r.from === e.from && r.to === e.to)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    svg
      .append('line')
      .attr('x1', a.x)
      .attr('y1', a.y)
      .attr('x2', b.x)
      .attr('y2', b.y)
      .attr('stroke', on ? '#6ec8f0' : '#24344c')
      .attr('stroke-width', on ? 2.2 : 1)
      .attr('marker-end', on ? 'url(#ei-on)' : 'url(#ei-off)')
      .attr('class', on ? 'ei-flow' : 'ei-flow-dim')
    if (on) {
      svg
        .append('text')
        .attr('x', mx)
        .attr('y', my - 7)
        .attr('text-anchor', 'middle')
        .attr('fill', DemoHex.rain)
        .attr('font-size', 10)
        .text(e.label)
    }
  }

  for (const n of ELEMS) {
    const linked = n.id === hi || rel.some((r) => r.from === n.id || r.to === n.id)
    const g = svg.append('g').style('cursor', 'pointer').on('click', () => {
      active.value = n.id
    })
    g.append('circle')
      .attr('cx', n.x)
      .attr('cy', n.y)
      .attr('r', n.id === hi ? 38 : 32)
      .attr('fill', n.fill)
      .attr('opacity', linked ? 0.95 : 0.28)
      .attr('stroke', n.id === hi ? DemoHex.ink : 'transparent')
      .attr('stroke-width', 2)
      .attr('class', n.id === hi ? 'ei-pulse' : null)
    g.append('text')
      .attr('x', n.x)
      .attr('y', n.y + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text(n.name)
  }

  const cur = ELEMS.find((n) => n.id === hi)!
  svg.append('rect').attr('x', 24).attr('y', 392).attr('width', 732).attr('height', 32).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', 40).attr('y', 412).attr('fill', cur.fill).attr('font-size', 10).attr('font-weight', 600).text(cur.name)
  svg.append('text').attr('x', 88).attr('y', 412).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(`${cur.hint}  ·  变化会通过箭头传到其余要素`)
}

function drawChain() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'ei-bad', DemoHex.warm)
  marker(defs, 'ei-ok', '#7dd3a0')

  const sky = defs.append('linearGradient').attr('id', 'ei-sky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', broken.value ? '#1a1420' : '#0d1a28')
  sky.append('stop').attr('offset', '100%').attr('stop-color', broken.value ? '#241820' : '#152436')

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ei-sky)').attr('rx', 12)
  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('案例：森林破坏')
  svg
    .append('text')
    .attr('x', 24)
    .attr('y', 46)
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text(broken.value ? '生物减少 → 气候变干、径流暴涨、土壤流失、地貌侵蚀加重' : '植被完好：涵养水源、调节气候、保护土壤')

  // 地面
  svg
    .append('path')
    .attr('d', broken.value ? 'M 20 328 C 140 318, 260 342, 400 326 C 540 308, 660 338, 760 322 L 760 420 L 20 420 Z' : 'M 20 328 C 160 318, 280 322, 420 320 C 560 318, 660 324, 760 320 L 760 420 L 20 420 Z')
    .attr('fill', broken.value ? '#3a2a22' : DemoHex.ground)

  // 河
  const riverY = broken.value ? 338 : 332
  svg
    .append('path')
    .attr('d', `M 0 ${riverY} C 180 ${riverY + (broken.value ? 18 : 6)}, 360 ${riverY - 4}, 780 ${riverY + 8}`)
    .attr('fill', 'none')
    .attr('stroke', broken.value ? '#7aa0b8' : '#4cc9f0')
    .attr('stroke-width', broken.value ? 16 : 10)
    .attr('opacity', 0.85)
    .attr('class', 'ei-flow')

  // 树
  const trees = [
    [80, 318],
    [130, 322],
    [190, 316],
    [250, 324],
    [320, 318],
    [390, 322],
    [460, 316],
    [530, 324],
  ] as const
  trees.forEach(([x, y], i) => {
    if (broken.value && i % 2 === 0) {
      svg.append('line').attr('x1', x).attr('x2', x).attr('y1', y).attr('y2', y - 10).attr('stroke', '#5a4030').attr('stroke-width', 3)
      svg.append('circle').attr('cx', x + 8).attr('cy', y - 4).attr('r', 4).attr('fill', '#6a5040').attr('opacity', 0.7)
      return
    }
    if (broken.value) return
    const g = svg.append('g').attr('class', 'ei-bob').attr('style', `animation-delay:${i * 0.12}s`)
    g.append('rect').attr('x', x - 2).attr('y', y - 18).attr('width', 4).attr('height', 18).attr('fill', '#3a2a1c')
    g.append('path').attr('d', `M ${x} ${y - 46} L ${x + 16} ${y - 16} L ${x - 16} ${y - 16} Z`).attr('fill', '#2f6a48')
    g.append('path').attr('d', `M ${x} ${y - 36} L ${x + 12} ${y - 12} L ${x - 12} ${y - 12} Z`).attr('fill', '#3d8658')
  })

  // 云
  const cloudOp = broken.value ? 0.28 : 0.75
  const cg = svg.append('g').attr('opacity', cloudOp).attr('class', 'ei-bob')
  cg.append('ellipse').attr('cx', 420).attr('cy', 78).attr('rx', 42).attr('ry', 16).attr('fill', '#c8d6e4')
  cg.append('ellipse').attr('cx', 448).attr('cy', 74).attr('rx', 24).attr('ry', 14).attr('fill', DemoHex.ink)
  if (!broken.value) {
    for (let i = 0; i < 5; i++) {
      svg
        .append('line')
        .attr('x1', 400 + i * 10)
        .attr('x2', 397 + i * 10)
        .attr('y1', 96)
        .attr('y2', 128)
        .attr('stroke', DemoHex.rain)
        .attr('stroke-width', 1.1)
        .attr('stroke-dasharray', '3 5')
        .attr('class', 'ei-fall')
        .attr('style', `animation-delay:${i * 0.1}s`)
    }
  }

  if (broken.value) {
    // 侵蚀沟
    svg.append('path').attr('d', 'M 210 328 L 200 360 L 222 360 Z').attr('fill', '#5a3a28').attr('opacity', 0.8)
    svg.append('path').attr('d', 'M 470 326 L 458 362 L 486 362 Z').attr('fill', '#5a3a28').attr('opacity', 0.8)
    for (const x of [240, 300, 500, 560]) {
      svg
        .append('path')
        .attr('d', `M ${x} 250 L ${x + 8} 310`)
        .attr('stroke', DemoHex.warm)
        .attr('stroke-width', 1.6)
        .attr('marker-end', 'url(#ei-bad)')
        .attr('class', 'ei-wilt')
    }
    svg.append('text').attr('x', 390).attr('y', 250).attr('text-anchor', 'middle').attr('fill', DemoHex.warm).attr('font-size', 10).text('暴雨冲刷 · 水土流失')
  } else {
    svg.append('text').attr('x', 390).attr('y', 250).attr('text-anchor', 'middle').attr('fill', '#7dd3a0').attr('font-size', 10).text('林冠截留 · 枯枝落叶护土')
  }

  // 连锁卡片
  const cards = broken.value
    ? [
        { t: '生物', d: '森林锐减' },
        { t: '气候', d: '变干变热' },
        { t: '水文', d: '洪枯加剧' },
        { t: '土壤', d: '肥力下降' },
        { t: '地貌', d: '沟蚀加重' },
      ]
    : [
        { t: '生物', d: '植被完好' },
        { t: '气候', d: '湿润稳定' },
        { t: '水文', d: '径流平稳' },
        { t: '土壤', d: '有机质高' },
        { t: '地貌', d: '坡面稳定' },
      ]
  cards.forEach((c, i) => {
    const x = 24 + i * 150
    svg.append('rect').attr('x', x).attr('y', 382).attr('width', 140).attr('height', 42).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', broken.value ? '#3a2430' : DemoHex.inkFaint)
    svg.append('text').attr('x', x + 12).attr('y', 400).attr('fill', broken.value ? DemoHex.warm : '#7dd3a0').attr('font-size', 10).attr('font-weight', 600).text(c.t)
    svg.append('text').attr('x', x + 12).attr('y', 416).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(c.d)
    if (i < cards.length - 1) {
      svg
        .append('path')
        .attr('d', `M ${x + 140} 403 L ${x + 150} 403`)
        .attr('stroke', broken.value ? DemoHex.warm : '#5cb87a')
        .attr('stroke-width', 1.4)
        .attr('marker-end', broken.value ? 'url(#ei-bad)' : 'url(#ei-ok)')
        .attr('class', 'ei-flow')
    }
  })
}

function redraw() {
  if (isChain.value) drawChain()
  else drawElements()
}

watch([() => props.stepId, active, broken], () => requestAnimationFrame(redraw))
onMounted(() => requestAnimationFrame(redraw))
onUnmounted(() => {
  if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div v-if="isChain" class="toolbar">
      <button type="button" class="chip" :class="{ on: !broken }" @click="broken = false">森林完好</button>
      <button type="button" class="chip" :class="{ on: broken }" @click="broken = true">森林破坏</button>
      <span class="note">同一坡面，要素连锁变化</span>
    </div>
    <div v-else class="toolbar">
      <button
        v-for="e in ELEMS"
        :key="e.id"
        type="button"
        class="chip"
        :class="{ on: active === e.id }"
        @click="active = e.id"
      >
        {{ e.name }}
      </button>
    </div>
    <svg ref="svgRef" class="canvas" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" />
  </div>
</template>

<style scoped>
.wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-canvas);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
}
.chip.on {
  border-color: var(--primary);
  color: var(--primary-mid);
  background: var(--primary-light);
  font-weight: 600;
}
.note {
  font-size: 11px;
  color: var(--text-400);
  margin-left: 6px;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
