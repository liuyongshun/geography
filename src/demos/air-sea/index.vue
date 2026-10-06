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

type Mode = 'normal' | 'elnino' | 'lanina'

interface ModeState {
  title: string
  subtitle: string
  trade: number
  warmCenter: number
  thermoTilt: number
  westRain: number
  eastRain: number
  upwelling: number
  westImpact: string
  eastImpact: string
}

const MODE_META: Record<Mode, ModeState> = {
  normal: {
    title: '正常年 · 沃克环流',
    subtitle: '西暖东冷，信风把暖水吹向西太平洋',
    trade: 1,
    warmCenter: 0.22,
    thermoTilt: 1,
    westRain: 1,
    eastRain: 0,
    upwelling: 0.75,
    westImpact: '印尼 / 澳北：多雨',
    eastImpact: '秘鲁沿岸：上升流渔场',
  },
  elnino: {
    title: '厄尔尼诺',
    subtitle: '信风减弱，暖水东移，东太平洋异常增温',
    trade: -0.35,
    warmCenter: 0.62,
    thermoTilt: 0.25,
    westRain: 0.15,
    eastRain: 1,
    upwelling: 0.18,
    westImpact: '印尼 / 澳北：干旱少雨',
    eastImpact: '南美西岸：暴雨；渔场衰退',
  },
  lanina: {
    title: '拉尼娜',
    subtitle: '信风偏强，冷舌更强，暖池更偏西',
    trade: 1.35,
    warmCenter: 0.12,
    thermoTilt: 1.35,
    westRain: 1,
    eastRain: 0,
    upwelling: 1,
    westImpact: '印尼 / 澳北：更涝',
    eastImpact: '秘鲁沿岸：更冷、渔场旺',
  },
}

const targetMode = computed<Mode>(() => {
  if (props.stepId === 'elnino' || props.stepId === 'lanina') return props.stepId
  return 'normal'
})

const hint = computed(() => {
  const m = MODE_META[targetMode.value]
  return `${m.title} · 课步切换时平滑过渡 · ${m.subtitle}`
})

/** 当前插值后的可视状态 */
const vis = ref<ModeState>({ ...MODE_META.normal })
let fromState: ModeState = { ...MODE_META.normal }
let toState: ModeState = { ...MODE_META.normal }
let morphT = 1
let morphing = false
let raf = 0
let disposed = false
let lastT = 0
let phase = 0
let drawAccum = 0

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function blendState(a: ModeState, b: ModeState, t: number): ModeState {
  const e = easeInOut(t)
  // 标题在后半段切换，避免中途文案错乱
  const meta = e < 0.45 ? a : b
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    westImpact: meta.westImpact,
    eastImpact: meta.eastImpact,
    trade: lerp(a.trade, b.trade, e),
    warmCenter: lerp(a.warmCenter, b.warmCenter, e),
    thermoTilt: lerp(a.thermoTilt, b.thermoTilt, e),
    westRain: lerp(a.westRain, b.westRain, e),
    eastRain: lerp(a.eastRain, b.eastRain, e),
    upwelling: lerp(a.upwelling, b.upwelling, e),
  }
}

function startMorph(next: Mode) {
  fromState = { ...vis.value }
  toState = { ...MODE_META[next] }
  morphT = 0
  morphing = true
}

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#as-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'as-anim')
    .text(`
      .as-flow { stroke-dasharray: 9 12; animation: as-dash 3.4s linear infinite; }
      .as-flow-rev { stroke-dasharray: 9 12; animation: as-dash 4.2s linear infinite reverse; }
      .as-flow-fast { stroke-dasharray: 8 10; animation: as-dash 2.6s linear infinite; }
      .as-bob { animation: as-bob 3.8s ease-in-out infinite; }
      .as-rain { animation: as-rain 1.6s linear infinite; }
      .as-pulse { animation: as-pulse 3.2s ease-in-out infinite; }
      .as-up { animation: as-up 2.8s ease-in-out infinite; }
      @keyframes as-dash { to { stroke-dashoffset: -42; } }
      @keyframes as-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes as-rain { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 18; } }
      @keyframes as-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      @keyframes as-up {
        0%, 100% { transform: translateY(3px); opacity: 0.4; }
        50% { transform: translateY(-5px); opacity: 1; }
      }
    `)
}

function markers(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  const mk = (id: string, color: string) => {
    defs
      .append('marker')
      .attr('id', id)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 9)
      .attr('markerHeight', 9)
      .attr('orient', 'auto')
      .attr('markerUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', color)
  }
  mk('as-wind', DemoHex.inkMuted)
  mk('as-warm', DemoHex.warm)
  mk('as-cold', DemoHex.cold)
  mk('as-cell', DemoHex.rain)
  mk('as-lift', DemoHex.lift)
}

function drawCloud(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  x: number,
  y: number,
  opacity: number,
) {
  if (opacity < 0.05) return
  const g = svg.append('g').attr('opacity', opacity).attr('class', 'as-bob')
  g.append('ellipse').attr('cx', x + 28).attr('cy', y + 8).attr('rx', 34).attr('ry', 14).attr('fill', DemoHex.cloud)
  g.append('ellipse').attr('cx', x + 10).attr('cy', y + 10).attr('rx', 18).attr('ry', 11).attr('fill', '#d8e4f0')
  g.append('ellipse').attr('cx', x + 48).attr('cy', y + 6).attr('rx', 20).attr('ry', 12).attr('fill', '#e8f0f8')
}

function drawRain(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  x: number,
  y: number,
  h: number,
  opacity: number,
) {
  if (opacity < 0.08) return
  const g = svg.append('g').attr('opacity', opacity)
  for (let i = 0; i < 7; i++) {
    const xx = x + i * 9
    g.append('line')
      .attr('x1', xx)
      .attr('x2', xx - 2)
      .attr('y1', y)
      .attr('y2', y + h)
      .attr('stroke', DemoHex.rain)
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '3 5')
      .attr('class', 'as-rain')
      .attr('style', `animation-delay: ${i * 0.12}s`)
  }
}

function draw() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()

  const m = vis.value
  const defs = svg.append('defs')
  ensureAnim(defs)
  markers(defs)

  const wc = m.warmCenter
  const sst = defs.append('linearGradient').attr('id', 'as-sst').attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '0')
  // 用连续参数驱动色停，避免模式硬切
  const warmBoost = Math.max(0, 1 - m.thermoTilt) // 厄尔尼诺时倾斜小 → 暖色东扩
  sst.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.coldDeep)
  sst
    .append('stop')
    .attr('offset', `${Math.max(5, wc * 100 - 18)}%`)
    .attr('stop-color', warmBoost > 0.5 ? '#3a6a88' : DemoHex.warmDeep)
  sst
    .append('stop')
    .attr('offset', `${wc * 100}%`)
    .attr('stop-color', warmBoost > 0.5 ? DemoHex.warm : '#ff9a4a')
  sst
    .append('stop')
    .attr('offset', `${Math.min(95, wc * 100 + 22)}%`)
    .attr('stop-color', m.thermoTilt > 1.1 ? '#0d3a58' : warmBoost > 0.5 ? '#ffb070' : DemoHex.coldDeep)
  sst.append('stop').attr('offset', '100%').attr('stop-color', warmBoost > 0.5 ? '#6aa0b8' : DemoHex.canvasFog)

  const sky = defs.append('linearGradient').attr('id', 'as-sky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.canvasFog)
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.panel)

  const deep = defs.append('linearGradient').attr('id', 'as-deep').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  deep.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.coldGlow).attr('stop-opacity', 0.35)
  deep.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#as-sky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 28).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text(m.title)
  svg.append('text').attr('x', 24).attr('y', 46).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(m.subtitle)
  if (morphing) {
    svg
      .append('text')
      .attr('x', 620)
      .attr('y', 28)
      .attr('fill', DemoHex.accent)
      .attr('font-size', 10)
      .text(`过渡 ${Math.round(morphT * 100)}%`)
  } else {
    svg.append('text').attr('x', 600).attr('y', 28).attr('fill', DemoHex.inkFaint).attr('font-size', 10).text('赤道太平洋剖面示意')
  }

  const seaY = 210
  const seaH = 150
  const seaX0 = 110
  const seaX1 = 670
  const seaW = seaX1 - seaX0

  svg
    .append('path')
    .attr('d', `M 20 ${seaY - 20} L 110 ${seaY - 8} L 110 ${seaY + seaH} L 20 ${seaY + seaH + 10} Z`)
    .attr('fill', DemoHex.ground)
  svg.append('text').attr('x', 58).attr('y', seaY + 70).attr('text-anchor', 'middle').attr('fill', DemoHex.inkDim).attr('font-size', 10).text('亚洲 / 澳')
  svg
    .append('path')
    .attr('d', `M 670 ${seaY - 10} L 760 ${seaY - 30} L 760 ${seaY + seaH + 10} L 670 ${seaY + seaH} Z`)
    .attr('fill', DemoHex.groundDark)
  svg.append('text').attr('x', 715).attr('y', seaY + 70).attr('text-anchor', 'middle').attr('fill', DemoHex.inkDim).attr('font-size', 10).text('南美')

  svg
    .append('rect')
    .attr('x', seaX0)
    .attr('y', 58)
    .attr('width', seaW)
    .attr('height', seaY - 58)
    .attr('fill', DemoHex.panelSoft)
    .attr('opacity', 0.45)

  svg.append('rect').attr('x', seaX0).attr('y', seaY).attr('width', seaW).attr('height', seaH).attr('fill', 'url(#as-deep)')
  svg
    .append('rect')
    .attr('x', seaX0)
    .attr('y', seaY)
    .attr('width', seaW)
    .attr('height', 28)
    .attr('fill', 'url(#as-sst)')
    .attr('opacity', 0.92)
    .attr('class', 'as-pulse')

  const tw = seaX0 + 30
  const te = seaX1 - 30
  const westDeep = seaY + 55 + m.thermoTilt * 48
  const eastDeep = seaY + 55 + (1.5 - m.thermoTilt) * 28
  svg
    .append('path')
    .attr('d', `M ${tw} ${westDeep} Q ${(tw + te) / 2} ${(westDeep + eastDeep) / 2 + 10}, ${te} ${eastDeep}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.inkDim)
    .attr('stroke-width', 1.6)
    .attr('stroke-dasharray', '6 5')
    .attr('opacity', 0.85)
  svg
    .append('text')
    .attr('x', (tw + te) / 2)
    .attr('y', (westDeep + eastDeep) / 2 + 22)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkFaint)
    .attr('font-size', 10)
    .text('斜温层')

  const upG = svg.append('g').attr('opacity', m.upwelling)
  for (const x of [seaX1 - 70, seaX1 - 50, seaX1 - 30]) {
    upG
      .append('path')
      .attr('d', `M ${x} ${seaY + 120} L ${x} ${seaY + 40}`)
      .attr('stroke', '#7dd3a0')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#as-cold)')
      .attr('class', 'as-up')
  }
  upG
    .append('text')
    .attr('x', seaX1 - 50)
    .attr('y', seaY + 138)
    .attr('text-anchor', 'middle')
    .attr('fill', '#7dd3a0')
    .attr('font-size', 10)
    .text(m.upwelling < 0.35 ? '上升流减弱' : '上升流')

  const windY = seaY - 28
  // 信风：按 trade 符号/强度连续显隐，避免过零硬切
  if (m.trade > 0.08) {
    const windClass = m.trade > 1.1 ? 'as-flow-fast' : 'as-flow'
    const sw = 1.8 + Math.max(0, m.trade - 1) * 0.6
    const op = 0.35 + Math.min(1, m.trade) * 0.5
    for (const y of [windY - 18, windY, windY + 18]) {
      svg
        .append('path')
        .attr('d', `M ${seaX1 - 40} ${y} C ${seaX0 + seaW * 0.65} ${y - 4}, ${seaX0 + seaW * 0.35} ${y + 4}, ${seaX0 + 50} ${y}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.inkMuted)
        .attr('stroke-width', sw)
        .attr('marker-end', 'url(#as-wind)')
        .attr('class', windClass)
        .attr('opacity', op)
    }
    svg
      .append('text')
      .attr('x', seaX0 + seaW / 2)
      .attr('y', windY - 36)
      .attr('text-anchor', 'middle')
      .attr('fill', DemoHex.inkDim)
      .attr('font-size', 10)
      .attr('opacity', op)
      .text(m.trade > 1.1 ? '信风偏强 → 西' : '信风（东南信风）→ 西')
  }
  if (m.trade < -0.08) {
    const op = 0.35 + Math.min(1, Math.abs(m.trade)) * 0.5
    for (const y of [windY - 10, windY + 10]) {
      svg
        .append('path')
        .attr('d', `M ${seaX0 + 60} ${y} C ${seaX0 + seaW * 0.4} ${y + 6}, ${seaX0 + seaW * 0.65} ${y - 4}, ${seaX1 - 60} ${y}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.warm)
        .attr('stroke-width', 1.6)
        .attr('marker-end', 'url(#as-warm)')
        .attr('class', 'as-flow')
        .attr('opacity', op)
    }
    svg
      .append('text')
      .attr('x', seaX0 + seaW / 2)
      .attr('y', windY - 36)
      .attr('text-anchor', 'middle')
      .attr('fill', DemoHex.warm)
      .attr('font-size', 10)
      .attr('opacity', op)
      .text('信风减弱 · 西风异常')
  }
  if (Math.abs(m.trade) <= 0.08) {
    svg
      .append('text')
      .attr('x', seaX0 + seaW / 2)
      .attr('y', windY - 36)
      .attr('text-anchor', 'middle')
      .attr('fill', DemoHex.inkFaint)
      .attr('font-size', 10)
      .text('信风接近停滞…')
  }

  const riseX = seaX0 + seaW * Math.min(0.85, Math.max(0.15, m.warmCenter))
  // 下沉支：随暖池东移而西移（厄尔尼诺）
  const sinkBlend = Math.max(0, Math.min(1, (m.warmCenter - 0.2) / 0.45))
  const sinkX = lerp(seaX1 - 80, seaX0 + seaW * 0.22, sinkBlend)

  svg
    .append('path')
    .attr('d', `M ${riseX} ${seaY - 8} Q ${riseX - 10} 140, ${riseX} 80`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.lift)
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#as-lift)')
    .attr('class', 'as-flow')
  svg.append('text').attr('x', riseX + 8).attr('y', 120).attr('fill', DemoHex.lift).attr('font-size', 10).text('上升')

  const highEast = riseX > sinkX
  svg
    .append('path')
    .attr('d', `M ${riseX} 78 C ${(riseX + sinkX) / 2} 58, ${(riseX + sinkX) / 2} 58, ${sinkX} 78`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.rain)
    .attr('stroke-width', 1.6)
    .attr('marker-end', 'url(#as-cell)')
    .attr('class', highEast ? 'as-flow-rev' : 'as-flow')
    .attr('opacity', 0.85)

  svg
    .append('path')
    .attr('d', `M ${sinkX} 80 Q ${sinkX + 8} 140, ${sinkX} ${seaY - 8}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.inkDim)
    .attr('stroke-width', 1.8)
    .attr('marker-end', 'url(#as-wind)')
    .attr('class', 'as-flow')
  svg.append('text').attr('x', sinkX - 28).attr('y', 120).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('下沉')

  drawCloud(svg, riseX - 36, 68, Math.max(m.westRain, m.eastRain) * 0.95)
  drawRain(svg, riseX - 28, 95, 55, Math.max(m.westRain, m.eastRain))
  drawCloud(svg, sinkX - 30, 70, 0.15 + (1 - m.eastRain) * 0.12)

  const warmLabelX = seaX0 + seaW * m.warmCenter
  svg
    .append('text')
    .attr('x', warmLabelX)
    .attr('y', seaY + 18)
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff0e0')
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .attr('class', 'as-bob')
    .text(m.warmCenter > 0.45 ? '暖水东移' : '暖池')
  if (m.warmCenter < 0.5) {
    svg
      .append('text')
      .attr('x', seaX1 - 70)
      .attr('y', seaY + 18)
      .attr('text-anchor', 'middle')
      .attr('fill', DemoHex.coldSoft)
      .attr('font-size', 10)
      .text('冷舌')
  }

  svg.append('rect').attr('x', 24).attr('y', 392).attr('width', 360).attr('height', 32).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('rect').attr('x', 396).attr('y', 392).attr('width', 360).attr('height', 32).attr('rx', 6).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg.append('text').attr('x', 36).attr('y', 412).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('西太平洋')
  svg.append('text').attr('x', 110).attr('y', 412).attr('fill', DemoHex.inkMuted).attr('font-size', 10).text(m.westImpact)
  svg.append('text').attr('x', 408).attr('y', 412).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('东太平洋')
  svg.append('text').attr('x', 482).attr('y', 412).attr('fill', DemoHex.inkMuted).attr('font-size', 10).text(m.eastImpact)
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  phase += dt
  drawAccum += dt

  if (morphing) {
    morphT = Math.min(1, morphT + dt / 1.15)
    vis.value = blendState(fromState, toState, morphT)
    if (morphT >= 1) {
      morphing = false
      vis.value = { ...toState }
    }
    draw()
    drawAccum = 0
  } else if (drawAccum >= 0.12) {
    // 低频刷新以驱动 CSS 动画类重建后的雨滴相位
    drawAccum = 0
    draw()
  }
}

watch(targetMode, (m, prev) => {
  if (m === prev) return
  startMorph(m)
})

onMounted(() => {
  disposed = false
  vis.value = { ...MODE_META[targetMode.value] }
  toState = { ...vis.value }
  lastT = performance.now()
  draw()
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
      <span class="badge">模式平滑过渡</span>
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
  gap: 12px;
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
.badge {
  font-size: 11px;
  color: var(--demo-accent-soft);
  border: 1px solid var(--demo-accent);
  background: var(--demo-accent-on);
  padding: 3px 10px;
  border-radius: 999px;
}
.canvas {
  flex: 1;
  width: 100%;
  min-height: 360px;
}
</style>
