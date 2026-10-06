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
const playing = ref(true)
const focus = ref<'valley' | 'plain' | 'hill' | 'pass'>('valley')

const W = 780
const H = 420

const hint = computed(() => {
  if (props.stepId === 'transport') return '交通线优先沿河谷、平原铺设；遇山地走垭口或绕行'
  return '聚落多选河谷与平原 · 点下方类型看分布规律'
})

const FOCUS_META = {
  valley: { name: '河谷聚落', note: '取水方便 · 耕地较近 · 易成交通走廊' },
  plain: { name: '平原聚落', note: '耕地广阔 · 规模较大 · 路网密集' },
  hill: { name: '山地聚落', note: '多在缓坡/盆地 · 规模较小 · 交通受限' },
  pass: { name: '垭口通道', note: '山脉缺口 · 省工省时 · 常成干线必经' },
} as const

let phase = 0
let raf = 0
let disposed = false
let lastT = 0
let drawAccum = 0

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#lh-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'lh-anim')
    .text(`
      .lh-flow { stroke-dasharray: 8 10; animation: lh-dash 2.8s linear infinite; }
      .lh-flow-slow { stroke-dasharray: 7 12; animation: lh-dash 4.2s linear infinite; }
      .lh-pulse { animation: lh-pulse 2.6s ease-in-out infinite; }
      .lh-bob { animation: lh-bob 3.4s ease-in-out infinite; }
      @keyframes lh-dash { to { stroke-dashoffset: -36; } }
      @keyframes lh-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      @keyframes lh-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
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

function labelChip(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  const tw = text.length * 10 + 12
  svg
    .append('rect')
    .attr('x', x - tw / 2)
    .attr('y', y - 10)
    .attr('width', tw)
    .attr('height', 16)
    .attr('rx', 4)
    .attr('fill', DemoHex.canvasFog)
    .attr('opacity', 0.9)
  svg
    .append('text')
    .attr('x', x)
    .attr('y', y + 2)
    .attr('text-anchor', 'middle')
    .attr('fill', color)
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text(text)
}

/** 示意山脊线（左山地 → 中丘陵 → 右平原） */
function terrainPath() {
  return 'M 20 360 L 20 210 C 60 120, 110 90, 160 130 C 200 165, 230 150, 260 120 C 300 80, 340 95, 370 140 C 400 180, 430 200, 470 210 C 520 225, 580 240, 640 255 C 690 265, 730 270, 760 272 L 760 360 Z'
}

function riverPath() {
  return 'M 250 360 C 280 300, 310 270, 360 250 C 420 225, 500 235, 580 250 C 640 260, 700 268, 760 272'
}

type Settle = { x: number; y: number; r: number; kind: 'valley' | 'plain' | 'hill' }

const SETTLES: Settle[] = [
  // 河谷
  { x: 300, y: 286, r: 5, kind: 'valley' },
  { x: 340, y: 268, r: 6, kind: 'valley' },
  { x: 390, y: 252, r: 7, kind: 'valley' },
  { x: 450, y: 248, r: 5, kind: 'valley' },
  // 平原
  { x: 560, y: 278, r: 8, kind: 'plain' },
  { x: 620, y: 288, r: 10, kind: 'plain' },
  { x: 680, y: 292, r: 7, kind: 'plain' },
  { x: 720, y: 300, r: 6, kind: 'plain' },
  { x: 590, y: 310, r: 5, kind: 'plain' },
  // 山地散居
  { x: 120, y: 200, r: 3.5, kind: 'hill' },
  { x: 180, y: 175, r: 3.5, kind: 'hill' },
  { x: 220, y: 195, r: 3, kind: 'hill' },
  { x: 280, y: 155, r: 3, kind: 'hill' },
]

function drawBase(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
) {
  const sky = defs.append('linearGradient').attr('id', 'lh-sky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', '#0c1828')
  sky.append('stop').attr('offset', '55%').attr('stop-color', '#152436')
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.groundDark)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#lh-sky)').attr('rx', 12)

  // 云
  const cg = svg.append('g').attr('class', 'lh-bob').attr('opacity', 0.45)
  cg.append('ellipse').attr('cx', 480).attr('cy', 58).attr('rx', 40).attr('ry', 12).attr('fill', '#c8d6e4')
  cg.append('ellipse').attr('cx', 508).attr('cy', 54).attr('rx', 22).attr('ry', 10).attr('fill', DemoHex.ink)

  // 地形
  svg.append('path').attr('d', terrainPath()).attr('fill', '#2f4a36')
  // 山地加深
  svg
    .append('path')
    .attr('d', 'M 20 360 L 20 210 C 60 120, 110 90, 160 130 C 200 165, 230 150, 260 120 C 300 80, 340 95, 370 140 L 370 360 Z')
    .attr('fill', '#3a5540')
    .attr('opacity', 0.55)

  // 河
  svg
    .append('path')
    .attr('d', riverPath())
    .attr('fill', 'none')
    .attr('stroke', '#3a90b8')
    .attr('stroke-width', 14)
    .attr('opacity', 0.35)
  svg
    .append('path')
    .attr('d', riverPath())
    .attr('fill', 'none')
    .attr('stroke', DemoHex.cold)
    .attr('stroke-width', 4)
    .attr('class', 'lh-flow')
    .attr('marker-end', 'url(#lh-river)')

  labelChip(svg, 100, 100, '山地', '#a8c0a0')
  labelChip(svg, 320, 130, '丘陵', '#b8c890')
  labelChip(svg, 640, 230, '平原', '#c9d4a0')
  labelChip(svg, 480, 220, '河流', DemoHex.coldSoft)
}

function drawSettlement(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  marker(defs, 'lh-river', DemoHex.cold)
  marker(defs, 'lh-grow', DemoHex.lift)
  drawBase(svg, defs)

  svg.append('text').attr('x', 390).attr('y', 28).attr('text-anchor', 'middle').attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('地貌与聚落分布（示意）')

  const hi = focus.value === 'pass' ? 'valley' : focus.value

  for (const s of SETTLES) {
    const on = s.kind === hi
    const g = svg.append('g').attr('opacity', on ? 1 : 0.28)
    if (on) {
      g.append('circle')
        .attr('cx', s.x)
        .attr('cy', s.y)
        .attr('r', s.r + 6)
        .attr('fill', DemoHex.lift)
        .attr('opacity', 0.2)
        .attr('class', 'lh-pulse')
    }
    g.append('circle')
      .attr('cx', s.x)
      .attr('cy', s.y)
      .attr('r', s.r)
      .attr('fill', on ? DemoHex.lift : DemoHex.cloud)
      .attr('stroke', on ? '#fff' : 'transparent')
      .attr('stroke-width', 1.5)
  }

  // 选中类型说明箭头（仅相关）
  if (hi === 'valley') {
    svg
      .append('path')
      .attr('d', 'M 360 200 L 360 240')
      .attr('fill', 'none')
      .attr('stroke', DemoHex.lift)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#lh-grow)')
      .attr('class', 'lh-flow')
    labelChip(svg, 360, 188, '沿河集聚', DemoHex.lift)
  } else if (hi === 'plain') {
    svg
      .append('path')
      .attr('d', 'M 620 250 L 620 275')
      .attr('fill', 'none')
      .attr('stroke', DemoHex.lift)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#lh-grow)')
      .attr('class', 'lh-flow')
    labelChip(svg, 620, 238, '平原成片', DemoHex.lift)
  } else {
    svg
      .append('path')
      .attr('d', 'M 180 140 L 180 165')
      .attr('fill', 'none')
      .attr('stroke', DemoHex.lift)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#lh-grow)')
      .attr('class', 'lh-flow')
    labelChip(svg, 180, 128, '山地零星', DemoHex.lift)
  }

  const meta = FOCUS_META[hi]
  svg.append('rect').attr('x', 24).attr('y', 378).attr('width', W - 48).attr('height', 28).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', 40).attr('y', 396).attr('fill', DemoHex.lift).attr('font-size', 10).attr('font-weight', 600).text(meta.name)
  svg.append('text').attr('x', 120).attr('y', 396).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(meta.note)
}

function drawTransport(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  marker(defs, 'lh-river', DemoHex.cold)
  marker(defs, 'lh-road', DemoHex.sink)
  marker(defs, 'lh-rail', DemoHex.coldSoft)
  marker(defs, 'lh-pass', DemoHex.lift)
  drawBase(svg, defs)

  svg.append('text').attr('x', 390).attr('y', 28).attr('text-anchor', 'middle').attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('地貌与交通走向（示意）')

  // 垭口位置（两峰之间）
  const passX = 260
  const passY = 128

  // 干线：平原 → 河谷 → 垭口 → 山外（示意）
  const mainRoad = `M 740 300 C 660 290, 560 275, 470 255 C 400 240, 340 220, ${passX + 20} ${passY + 30} L ${passX - 30} ${passY + 10} C 180 110, 120 140, 60 180`
  // 绕行支线（不走垭口，沿山脚更长）
  const detour = 'M 470 255 C 420 280, 360 300, 300 310 C 240 320, 180 300, 120 250'

  const showPass = focus.value === 'pass' || focus.value === 'valley'
  const showDetour = focus.value === 'hill'
  const showPlainNet = focus.value === 'plain' || focus.value === 'valley' || focus.value === 'pass'

  if (showPlainNet || focus.value === 'valley') {
    // 平原路网
    for (const d of [
      'M 560 300 L 700 310',
      'M 600 270 L 600 320',
      'M 660 275 L 720 295',
    ]) {
      svg
        .append('path')
        .attr('d', d)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.sink)
        .attr('stroke-width', 2)
        .attr('opacity', focus.value === 'plain' ? 1 : 0.55)
        .attr('marker-end', 'url(#lh-road)')
        .attr('class', focus.value === 'plain' ? 'lh-flow' : null)
    }
  }

  if (showPass) {
    svg
      .append('path')
      .attr('d', mainRoad)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.sink)
      .attr('stroke-width', 3)
      .attr('marker-end', 'url(#lh-road)')
      .attr('class', 'lh-flow')

    // 垭口高亮
    svg
      .append('circle')
      .attr('cx', passX)
      .attr('cy', passY + 8)
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.lift)
      .attr('stroke-width', 2)
      .attr('class', focus.value === 'pass' ? 'lh-pulse' : null)
    labelChip(svg, passX, passY - 8, '垭口', DemoHex.lift)

    // 沿河走廊标注
    if (focus.value === 'valley') {
      labelChip(svg, 400, 210, '河谷走廊', DemoHex.sink)
      svg
        .append('path')
        .attr('d', 'M 400 225 L 400 245')
        .attr('fill', 'none')
        .attr('stroke', DemoHex.sink)
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#lh-road)')
        .attr('class', 'lh-flow')
    }
  }

  if (showDetour) {
    svg
      .append('path')
      .attr('d', detour)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.inkDim)
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', '6 5')
      .attr('marker-end', 'url(#lh-rail)')
      .attr('class', 'lh-flow-slow')
    labelChip(svg, 280, 330, '绕行（更长）', DemoHex.inkDim)
  }

  // 移动「车流」示意点（仅显示当前相关路线）
  if (playing.value && (showPass || showDetour)) {
    const u = (phase * 0.12) % 1
    if (showPass) {
      // 在干线上近似插值几个站点
      const pts = [
        [720, 298],
        [600, 275],
        [480, 252],
        [360, 220],
        [passX, passY + 20],
        [120, 150],
      ] as const
      const idx = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)))
      const t = u * (pts.length - 1) - idx
      const a = pts[idx]!
      const b = pts[idx + 1]!
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      svg.append('circle').attr('cx', x).attr('cy', y).attr('r', 4).attr('fill', DemoHex.lift)
      // 短方向箭头
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
      const x2 = x + Math.cos(ang) * 14
      const y2 = y + Math.sin(ang) * 14
      svg
        .append('path')
        .attr('d', `M ${x} ${y} L ${x2} ${y2}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.lift)
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#lh-pass)')
    }
  }

  const meta = FOCUS_META[focus.value === 'hill' ? 'hill' : focus.value === 'plain' ? 'plain' : focus.value === 'pass' ? 'pass' : 'valley']
  const barNote =
    focus.value === 'pass'
      ? FOCUS_META.pass.note
      : focus.value === 'hill'
        ? '山地阻隔迫使线路绕行或寻垭口穿越'
        : focus.value === 'plain'
          ? '平原路网密、走向较自由'
          : FOCUS_META.valley.note

  svg.append('rect').attr('x', 24).attr('y', 378).attr('width', W - 48).attr('height', 28).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', 40).attr('y', 396).attr('fill', DemoHex.sink).attr('font-size', 10).attr('font-weight', 600).text(meta.name)
  svg.append('text').attr('x', 120).attr('y', 396).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(barNote)
}

function redraw() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)

  if (props.stepId === 'transport') drawTransport(svg, defs)
  else drawSettlement(svg, defs)
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  if (!playing.value || props.stepId !== 'transport') return
  phase += dt
  drawAccum += dt
  if (drawAccum >= 0.066) {
    drawAccum = 0
    redraw()
  }
}

watch(
  () => props.stepId,
  (id) => {
    focus.value = id === 'transport' ? 'pass' : 'valley'
    playing.value = true
    phase = 0
    redraw()
  },
)

watch([focus, playing], () => redraw())

onMounted(() => {
  disposed = false
  lastT = performance.now()
  redraw()
  loop()
})
onUnmounted(() => {
  disposed = true
  cancelAnimationFrame(raf)
  d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <div class="chips">
        <button
          v-for="k in (stepId === 'transport' ? (['valley', 'pass', 'plain', 'hill'] as const) : (['valley', 'plain', 'hill'] as const))"
          :key="k"
          type="button"
          class="chip"
          :class="{ on: focus === k }"
          @click="focus = k"
        >
          {{ FOCUS_META[k].name }}
        </button>
      </div>
      <button type="button" class="btn" :class="{ on: playing }" @click="playing = !playing">
        {{ playing ? '暂停' : '演示' }}
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
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.chip.on {
  border-color: #c9a227;
  color: #f0e0a8;
  background: rgba(201, 162, 39, 0.12);
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
  border-color: #6ec8f0;
  color: #d8eef8;
  background: rgba(110, 200, 240, 0.12);
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
