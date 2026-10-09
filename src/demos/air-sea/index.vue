<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import { GlobeHost, defaultLayerMap, type EnsoMode, type LayerId } from '@/engine/globe'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const wrapRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const svgRef = ref<SVGSVGElement | null>(null)

const SW = 320
const SH = 420

interface ModeState {
  title: string
  slogan: string
  trade: number
  warmCenter: number
  thermoTilt: number
  westRain: number
  eastRain: number
  upwelling: number
  fish: number
  westImpact: string
  eastImpact: string
  steps: [string, string, string]
}

const MODE_META: Record<EnsoMode, ModeState> = {
  normal: {
    title: '正常年 · 沃克环流',
    slogan: '信风把热水吹到西边 → 印尼多雨 · 秘鲁渔场旺',
    trade: 1,
    warmCenter: 0.22,
    thermoTilt: 1,
    westRain: 1,
    eastRain: 0.06,
    upwelling: 0.9,
    fish: 1,
    westImpact: '印尼 / 澳北：湿热多雨',
    eastImpact: '秘鲁：冷水上升 · 渔场旺',
    steps: ['信风把海表热水往西吹', '热水堆在西边，上升成云下雨', '东边冷水涌上，鱼群聚集'],
  },
  elnino: {
    title: '厄尔尼诺年',
    slogan: '风弱了 → 热水东移 → 西旱东涝 · 渔场衰',
    trade: -0.45,
    warmCenter: 0.68,
    thermoTilt: 0.2,
    westRain: 0.1,
    eastRain: 1,
    upwelling: 0.12,
    fish: 0.12,
    westImpact: '印尼 / 澳北：干旱少雨',
    eastImpact: '南美西岸：暴雨 · 渔场衰退',
    steps: ['信风减弱，甚至西风异常', '暖水向东铺开，东太平洋变暖', '雨带东移：西旱东涝'],
  },
  lanina: {
    title: '拉尼娜年',
    slogan: '信风更猛 → 暖池更西 → 西更涝 · 渔场更旺',
    trade: 1.45,
    warmCenter: 0.1,
    thermoTilt: 1.45,
    westRain: 1,
    eastRain: 0,
    upwelling: 1,
    fish: 1.2,
    westImpact: '印尼 / 澳北：更涝',
    eastImpact: '秘鲁：更冷 · 渔场更旺',
    steps: ['信风比正常年更强', '暖水更西，东侧冷舌加强', '西边更湿；东岸渔场更旺'],
  },
}

const targetMode = computed<EnsoMode>(() => {
  if (props.stepId === 'elnino' || props.stepId === 'lanina') return props.stepId
  return 'normal'
})

const hint = computed(() => MODE_META[targetMode.value].slogan)

const vis = ref<ModeState>({ ...MODE_META.normal })
let fromState: ModeState = { ...MODE_META.normal }
let toState: ModeState = { ...MODE_META.normal }
let morphT = 1
let morphing = false
let raf = 0
let disposed = false
let lastT = 0
let drawAccum = 0
let storyBeat = 0
let storyTimer = 0

let host: GlobeHost | null = null
let ro: ResizeObserver | null = null

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function blendState(a: ModeState, b: ModeState, t: number): ModeState {
  const e = easeInOut(t)
  const meta = e < 0.45 ? a : b
  return {
    title: meta.title,
    slogan: meta.slogan,
    westImpact: meta.westImpact,
    eastImpact: meta.eastImpact,
    steps: meta.steps,
    trade: lerp(a.trade, b.trade, e),
    warmCenter: lerp(a.warmCenter, b.warmCenter, e),
    thermoTilt: lerp(a.thermoTilt, b.thermoTilt, e),
    westRain: lerp(a.westRain, b.westRain, e),
    eastRain: lerp(a.eastRain, b.eastRain, e),
    upwelling: lerp(a.upwelling, b.upwelling, e),
    fish: lerp(a.fish, b.fish, e),
  }
}

function ensoLayers(): Record<LayerId, boolean> {
  const layers = defaultLayerMap()
  for (const id of Object.keys(layers) as LayerId[]) {
    if (id !== 'earth') layers[id] = false
  }
  layers.enso = true
  layers.countries = true
  layers.sun = true
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
      layers: ensoLayers(),
      ensoMode: targetMode.value,
    },
    () => {},
  )
  requestAnimationFrame(() => {
    if (!wrapRef.value || !host) return
    host.resize(wrapRef.value.clientWidth, wrapRef.value.clientHeight)
    host.framePacific()
  })
}

function pushGlobeMode(mode: EnsoMode) {
  host?.update({ ensoMode: mode, layers: { enso: true, countries: true, sun: true } })
}

function disposeGlobe() {
  ro?.disconnect()
  ro = null
  host?.dispose()
  host = null
}

function startMorph(next: EnsoMode) {
  fromState = { ...vis.value }
  toState = { ...MODE_META[next] }
  morphT = 0
  morphing = true
  storyBeat = 0
  storyTimer = 0
  pushGlobeMode(next)
}

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#as-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'as-anim')
    .text(`
      .as-flow { stroke-dasharray: 8 12; animation: as-dash 3s linear infinite; }
      .as-flow-fast { stroke-dasharray: 7 10; animation: as-dash 2.2s linear infinite; }
      .as-rain { animation: as-rain 1.35s linear infinite; }
      .as-up { animation: as-up 2.4s ease-in-out infinite; }
      @keyframes as-dash { to { stroke-dashoffset: -40; } }
      @keyframes as-rain { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 18; } }
      @keyframes as-up {
        0%, 100% { transform: translateY(4px); opacity: 0.3; }
        50% { transform: translateY(-6px); opacity: 1; }
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
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .attr('markerUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', color)
  }
  mk('as-wind', DemoHex.inkMuted)
  mk('as-warm', DemoHex.warm)
  mk('as-cold', '#6ed0a0')
  mk('as-lift', DemoHex.lift)
}

/** 右侧窄剖面：补地球上看不清的「海面以下」 */
function drawSide() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const m = vis.value
  const defs = svg.append('defs')
  ensureAnim(defs)
  markers(defs)

  const sst = defs.append('linearGradient').attr('id', 'as-sst').attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '0')
  const wc = m.warmCenter
  const warmBoost = Math.max(0, 1 - m.thermoTilt)
  sst.append('stop').attr('offset', '0%').attr('stop-color', warmBoost > 0.45 ? '#d07040' : '#e89850')
  sst.append('stop').attr('offset', `${wc * 100}%`).attr('stop-color', '#ffe8b0')
  sst.append('stop').attr('offset', '100%').attr('stop-color', m.thermoTilt > 1.05 ? '#071e30' : '#143e58')

  const deep = defs.append('linearGradient').attr('id', 'as-deep').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  deep.append('stop').attr('offset', '0%').attr('stop-color', '#1a5080').attr('stop-opacity', 0.5)
  deep.append('stop').attr('offset', '100%').attr('stop-color', '#040a10')

  const thermo = defs.append('linearGradient').attr('id', 'as-thermo').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  thermo.append('stop').attr('offset', '0%').attr('stop-color', '#ffc070').attr('stop-opacity', 0.6)
  thermo.append('stop').attr('offset', '100%').attr('stop-color', '#1a4060').attr('stop-opacity', 0.1)

  svg.append('rect').attr('width', SW).attr('height', SH).attr('fill', DemoHex.panel).attr('rx', 10)

  svg.append('text').attr('x', 14).attr('y', 22).attr('fill', DemoHex.ink).attr('font-size', 12).attr('font-weight', 700).text(m.title)
  svg.append('text').attr('x', 14).attr('y', 40).attr('fill', DemoHex.lift).attr('font-size', 10).attr('font-weight', 600).text('剖面 · 看斜温层')

  const seaY = 150
  const seaH = 110
  const x0 = 36
  const x1 = 284
  const seaW = x1 - x0

  svg.append('text').attr('x', x0).attr('y', 58).attr('fill', DemoHex.inkFaint).attr('font-size', 9).text('西·亚洲')
  svg.append('text').attr('x', x1).attr('y', 58).attr('text-anchor', 'end').attr('fill', DemoHex.inkFaint).attr('font-size', 9).text('东·南美')

  // 大气带
  svg.append('rect').attr('x', x0).attr('y', 64).attr('width', seaW).attr('height', seaY - 64).attr('fill', '#101c2a').attr('opacity', 0.7)
  svg.append('rect').attr('x', x0).attr('y', seaY).attr('width', seaW).attr('height', seaH).attr('fill', 'url(#as-deep)')

  const tw = x0 + 8
  const te = x1 - 8
  const westDeep = seaY + 28 + m.thermoTilt * 42
  const eastDeep = seaY + 28 + Math.max(4, (1.5 - m.thermoTilt) * 22)
  const midY = (westDeep + eastDeep) / 2
  svg
    .append('path')
    .attr('d', `M ${x0} ${seaY} L ${x1} ${seaY} L ${te} ${eastDeep} Q ${(tw + te) / 2} ${midY}, ${tw} ${westDeep} L ${x0} ${westDeep} Z`)
    .attr('fill', 'url(#as-thermo)')
  svg.append('rect').attr('x', x0).attr('y', seaY - 2).attr('width', seaW).attr('height', 14).attr('fill', 'url(#as-sst)')
  svg
    .append('path')
    .attr('d', `M ${tw} ${westDeep} Q ${(tw + te) / 2} ${midY}, ${te} ${eastDeep}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.inkMuted)
    .attr('stroke-width', 1.6)
    .attr('stroke-dasharray', '5 4')
  svg
    .append('text')
    .attr('x', (x0 + x1) / 2)
    .attr('y', midY + 16)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 9)
    .attr('font-weight', 600)
    .text(m.thermoTilt > 0.85 ? '斜温层西深东浅' : m.thermoTilt < 0.4 ? '斜温层趋平' : '斜温层')

  const warmX = x0 + seaW * m.warmCenter
  svg
    .append('ellipse')
    .attr('cx', warmX)
    .attr('cy', seaY + 10)
    .attr('rx', 28 + warmBoost * 16)
    .attr('ry', 10)
    .attr('fill', DemoHex.warm)
    .attr('opacity', 0.45)
  svg
    .append('text')
    .attr('x', warmX)
    .attr('y', seaY + 28)
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff0e0')
    .attr('font-size', 9)
    .attr('font-weight', 700)
    .text(m.warmCenter > 0.5 ? '热水在东' : '暖池')

  // 信风
  const wy = seaY - 28
  if (m.trade > 0.08) {
    svg
      .append('path')
      .attr('d', `M ${x1 - 16} ${wy} C ${x0 + seaW * 0.6} ${wy - 4}, ${x0 + seaW * 0.35} ${wy + 4}, ${x0 + 20} ${wy}`)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.inkMuted)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#as-wind)')
      .attr('class', m.trade > 1.1 ? 'as-flow-fast' : 'as-flow')
    svg.append('text').attr('x', (x0 + x1) / 2).attr('y', wy - 10).attr('text-anchor', 'middle').attr('fill', DemoHex.inkMuted).attr('font-size', 9).attr('font-weight', 600).text('信风→西')
  } else if (m.trade < -0.08) {
    svg
      .append('path')
      .attr('d', `M ${x0 + 20} ${wy} C ${x0 + seaW * 0.35} ${wy + 4}, ${x0 + seaW * 0.6} ${wy - 4}, ${x1 - 16} ${wy}`)
      .attr('fill', 'none')
      .attr('stroke', DemoHex.warm)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#as-warm)')
      .attr('class', 'as-flow')
    svg.append('text').attr('x', (x0 + x1) / 2).attr('y', wy - 10).attr('text-anchor', 'middle').attr('fill', DemoHex.warm).attr('font-size', 9).attr('font-weight', 600).text('西风异常→东')
  }

  // 上升成云
  const riseX = x0 + seaW * Math.min(0.8, Math.max(0.15, m.warmCenter))
  svg
    .append('path')
    .attr('d', `M ${riseX} ${seaY - 4} L ${riseX} ${76}`)
    .attr('stroke', DemoHex.lift)
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#as-lift)')
    .attr('class', 'as-flow')

  // 上升流
  const upOp = Math.max(0.12, m.upwelling)
  const upG = svg.append('g').attr('opacity', upOp)
  for (const x of [x1 - 40, x1 - 24]) {
    upG
      .append('path')
      .attr('d', `M ${x} ${seaY + 90} L ${x} ${seaY + 24}`)
      .attr('stroke', '#6ed0a0')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#as-cold)')
      .attr('class', 'as-up')
  }
  upG
    .append('text')
    .attr('x', x1 - 32)
    .attr('y', seaY + 104)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6ed0a0')
    .attr('font-size', 9)
    .attr('font-weight', 700)
    .text(m.upwelling < 0.3 ? '上升流弱' : '上升流')

  // 结果
  svg.append('rect').attr('x', 12).attr('y', 278).attr('width', 142).attr('height', 48).attr('rx', 6).attr('fill', DemoHex.panelSoft).attr('stroke', 'rgba(94,200,240,0.3)')
  svg.append('rect').attr('x', 166).attr('y', 278).attr('width', 142).attr('height', 48).attr('rx', 6).attr('fill', DemoHex.panelSoft).attr('stroke', 'rgba(224,122,95,0.35)')
  svg.append('text').attr('x', 20).attr('y', 296).attr('fill', DemoHex.coldSoft).attr('font-size', 10).attr('font-weight', 700).text('西太平洋')
  svg.append('text').attr('x', 20).attr('y', 314).attr('fill', DemoHex.inkMuted).attr('font-size', 10).text(m.westImpact)
  svg.append('text').attr('x', 174).attr('y', 296).attr('fill', DemoHex.warm).attr('font-size', 10).attr('font-weight', 700).text('东太平洋')
  svg.append('text').attr('x', 174).attr('y', 314).attr('fill', DemoHex.inkMuted).attr('font-size', 10).text(m.eastImpact)

  const beat = Math.floor(storyBeat) % 3
  svg.append('text').attr('x', 14).attr('y', 348).attr('fill', DemoHex.lift).attr('font-size', 10).attr('font-weight', 700).text('成因 1→2→3')
  m.steps.forEach((s, i) => {
    const on = i === beat
    const y = 366 + i * 16
    svg
      .append('circle')
      .attr('cx', 22)
      .attr('cy', y - 3)
      .attr('r', on ? 7 : 5)
      .attr('fill', on ? (i === 0 ? DemoHex.inkMuted : i === 1 ? DemoHex.warm : DemoHex.lift) : DemoHex.panelSoft)
    svg
      .append('text')
      .attr('x', 22)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('fill', on ? DemoHex.canvas : DemoHex.inkFaint)
      .attr('font-size', 8)
      .attr('font-weight', 800)
      .text(String(i + 1))
    svg
      .append('text')
      .attr('x', 34)
      .attr('y', y)
      .attr('fill', on ? DemoHex.ink : DemoHex.inkFaint)
      .attr('font-size', on ? 10 : 9)
      .attr('font-weight', on ? 700 : 400)
      .text(s.length > 16 ? s.slice(0, 15) + '…' : s)
  })
}

function loop() {
  if (disposed) return
  raf = requestAnimationFrame(loop)
  const now = performance.now()
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  drawAccum += dt
  storyTimer += dt
  if (storyTimer >= 2.4) {
    storyTimer = 0
    storyBeat = (storyBeat + 1) % 3
  }

  if (morphing) {
    morphT = Math.min(1, morphT + dt / 1.35)
    vis.value = blendState(fromState, toState, morphT)
    if (morphT >= 1) {
      morphing = false
      vis.value = { ...toState }
    }
    drawSide()
    drawAccum = 0
  } else if (drawAccum >= 0.14) {
    drawAccum = 0
    drawSide()
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
  mountGlobe()
  if (wrapRef.value) {
    ro = new ResizeObserver(() => {
      if (!wrapRef.value || !host) return
      host.resize(wrapRef.value.clientWidth, wrapRef.value.clientHeight)
    })
    ro.observe(wrapRef.value)
  }
  drawSide()
  loop()
})

onUnmounted(() => {
  disposed = true
  cancelAnimationFrame(raf)
  disposeGlobe()
  d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="demo">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <span class="note">左地球看暖池怎么移 · 右剖面看斜温层 · 切课步过渡</span>
    </div>
    <div class="body">
      <div ref="wrapRef" class="globe-wrap">
        <canvas ref="canvasRef" class="globe" />
        <div class="legend">
          <span class="warm">暖池</span>
          <span class="wind">信风箭头</span>
          <span class="up">上升流 / 鱼</span>
          <em>可拖转地球</em>
        </div>
      </div>
      <svg ref="svgRef" class="side" :viewBox="`0 0 ${SW} ${SH}`" preserveAspectRatio="xMidYMid meet" />
    </div>
  </div>
</template>

<style scoped>
.demo {
  height: 100%;
  min-height: 0;
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
  font-size: 13px;
  color: var(--demo-lift, #f0d078);
  font-weight: 600;
  margin-right: auto;
}
.note {
  font-size: 11px;
  color: var(--text-400);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
  padding: 10px;
}
.globe-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
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
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(8, 14, 28, 0.75);
  font-size: 11px;
  color: #8aa0b4;
}
.legend .warm {
  color: #ffb070;
}
.legend .wind {
  color: #c5d4e4;
}
.legend .up {
  color: #7fd4a0;
}
.legend em {
  font-style: normal;
  color: #5a7388;
}
.side {
  width: min(340px, 36vw);
  flex-shrink: 0;
  height: 100%;
  min-height: 360px;
  border-radius: 12px;
  background: #101820;
}
@media (max-width: 900px) {
  .body {
    flex-direction: column;
  }
  .side {
    width: 100%;
    height: 280px;
    min-height: 260px;
  }
}
</style>
