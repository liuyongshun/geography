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

/** 纬度地带：从赤道到极地（北半球示意）+ 大致纬度范围 */
const LAT_BELTS = [
  { name: '热带雨林', climate: '全年高温多雨', color: '#1f8a4a', trees: 'dense' as const, lat0: 0, lat1: 10, tip: '赤道低压控制 · 对流雨' },
  { name: '热带草原', climate: '干湿季分明', color: '#7aab3a', trees: 'savanna' as const, lat0: 10, lat1: 20, tip: '赤道低压与信风交替' },
  { name: '亚热带常绿', climate: '冬温夏热', color: '#3d9a55', trees: 'mixed' as const, lat0: 20, lat1: 35, tip: '副高与季风影响' },
  { name: '温带落叶阔叶', climate: '四季分明', color: '#5a9a3a', trees: 'broad' as const, lat0: 35, lat1: 50, tip: '西风带 / 季风温带' },
  { name: '亚寒带针叶', climate: '冬长严寒', color: '#2d6a45', trees: 'conifer' as const, lat0: 50, lat1: 65, tip: '大陆性冷湿' },
  { name: '苔原', climate: '寒、短促暖季', color: '#7a9a8a', trees: 'tundra' as const, lat0: 65, lat1: 75, tip: '极地气团边缘' },
  { name: '冰原', climate: '终年严寒', color: '#d0dce8', trees: 'ice' as const, lat0: 75, lat1: 90, tip: '极地高压 · 冰雪覆盖' },
]

const LON_BELTS = [
  { name: '森林', note: '降水较多', color: '#2f7a50', tip: '距海近 · 水汽充足' },
  { name: '森林草原', note: '过渡', color: '#5a9a3a', tip: '半湿润过渡带' },
  { name: '草原', note: '半干旱', color: '#aaba3a', tip: '降水减少 · 草本为主' },
  { name: '荒漠', note: '干旱', color: '#c4a06a', tip: '深内陆 · 蒸发远大于降水' },
]

const VERT_BELTS = [
  { name: '基带阔叶林', color: '#3d9a55', h: 0.18, tip: '与当地水平地带一致' },
  { name: '针阔混交', color: '#2f7a48', h: 0.16, tip: '过渡带' },
  { name: '针叶林', color: '#1f5a38', h: 0.18, tip: '类似亚寒带针叶林' },
  { name: '高山草甸', color: '#6aaa5a', h: 0.14, tip: '类似温带草原气候带' },
  { name: '高山苔原', color: '#8aa898', h: 0.14, tip: '类似苔原带' },
  { name: '冰雪带', color: '#e8eef4', h: 0.2, tip: '类似冰原带 · 终年积雪' },
]

const latHi = ref(0)
const lonHi = ref(0)
const vertHi = ref(0)
const hoverLat = ref<number | null>(null)
const hoverLon = ref<number | null>(null)
const hoverVert = ref<number | null>(null)

const mode = computed(() => {
  if (props.stepId === 'longitudinal') return 'longitudinal'
  if (props.stepId === 'vertical') return 'vertical'
  return 'latitudinal'
})

const hint = computed(() => {
  if (mode.value === 'latitudinal') {
    const b = LAT_BELTS[latHi.value]!
    return `点色带 / 地球纬圈 · ${b.name}（约 ${b.lat0}°–${b.lat1}°N）· ${b.tip}`
  }
  if (mode.value === 'longitudinal') {
    const b = LON_BELTS[lonHi.value]!
    return `点景观带 · ${b.name} · ${b.tip}`
  }
  const b = VERT_BELTS[vertHi.value]!
  return `点山带或图例 · ${b.name} · ${b.tip} · 垂直带≈纬度带压缩版`
})

let disposed = false

function ensureAnim(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#ed-anim').empty()) return
  defs
    .append('style')
    .attr('id', 'ed-anim')
    .text(`
      .ed-flow { stroke-dasharray: 8 12; animation: ed-dash 3.2s linear infinite; }
      .ed-pulse { animation: ed-pulse 2.6s ease-in-out infinite; }
      .ed-bob { animation: ed-bob 3.6s ease-in-out infinite; }
      .ed-glow { animation: ed-glow 2.4s ease-in-out infinite; }
      @keyframes ed-dash { to { stroke-dashoffset: -40; } }
      @keyframes ed-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      @keyframes ed-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes ed-glow {
        0%, 100% { stroke-opacity: 0.5; }
        50% { stroke-opacity: 1; }
      }
    `)
}

function marker(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>, id: string, color: string) {
  if (!defs.select(`#${id}`).empty()) return
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 12 12')
    .attr('refX', 10)
    .attr('refY', 6)
    .attr('markerWidth', 10)
    .attr('markerHeight', 10)
    .attr('orient', 'auto')
    .attr('markerUnits', 'userSpaceOnUse')
    .append('path')
    .attr('d', 'M 1 1.5 L 11 6 L 1 10.5 Z')
    .attr('fill', color)
}

/** 地球圆形里的纬度 y：90°N 在上，0° 在赤道 */
function globeLatY(cy: number, r: number, lat: number) {
  // 简单等距圆柱在圆内裁切：lat 90→-r*0.92, 0→0
  return cy - (lat / 90) * r * 0.92
}

function globeParallel(cx: number, cy: number, r: number, lat: number) {
  const y = globeLatY(cy, r, lat)
  const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)))
  return { y, xL: cx - half, xR: cx + half }
}

function drawGlobeLatMarks(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  cx: number,
  cy: number,
  r: number,
  lats: number[],
) {
  for (const lat of lats) {
    const { y, xL, xR } = globeParallel(cx, cy, r, lat)
    const isEq = lat === 0
    if (!isEq) {
      svg
        .append('line')
        .attr('x1', xL)
        .attr('x2', xR)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', lat === 90 ? 'rgba(230,240,255,0.45)' : 'rgba(230,240,255,0.22)')
        .attr('stroke-width', lat === 90 ? 1 : 0.7)
        .attr('stroke-dasharray', lat === 90 ? 'none' : '2 3')
        .attr('style', 'pointer-events:none')
    }
    svg
      .append('line')
      .attr('x1', xL)
      .attr('x2', xL - 5)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', isEq ? DemoHex.lift : DemoHex.inkMuted)
      .attr('stroke-width', 1)
      .attr('style', 'pointer-events:none')
    svg
      .append('text')
      .attr('x', xL - 7)
      .attr('y', y + 2.5)
      .attr('text-anchor', 'end')
      .attr('fill', isEq ? DemoHex.lift : DemoHex.inkMuted)
      .attr('font-size', 8)
      .attr('font-weight', isEq || lat === 90 ? 600 : 500)
      .attr('style', 'pointer-events:none')
      .text(isEq ? '0°' : `${lat}°N`)
  }
}

function drawEarthDisc(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  cx: number,
  cy: number,
  r: number,
  opts?: { equatorLabel?: boolean },
) {
  defs.append('clipPath').attr('id', 'ed-globe-clip').append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
  const g = svg.append('g').attr('clip-path', 'url(#ed-globe-clip)')
  // Blue Marble：偏移使北半球居中偏上
  g.append('image')
    .attr('href', '/textures/earth-blue-marble.jpg')
    .attr('x', cx - r * 1.15)
    .attr('y', cy - r * 1.05)
    .attr('width', r * 2.3)
    .attr('height', r * 2.3)
    .attr('preserveAspectRatio', 'xMidYMid slice')
  g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', '#041018').attr('opacity', 0.22)
  svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', r)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.inkFaint)
    .attr('stroke-width', 1.5)
  // 赤道线
  const ey = globeLatY(cy, r, 0)
  svg
    .append('line')
    .attr('x1', cx - Math.sqrt(Math.max(0, r * r - (ey - cy) * (ey - cy))))
    .attr('x2', cx + Math.sqrt(Math.max(0, r * r - (ey - cy) * (ey - cy))))
    .attr('y1', ey)
    .attr('y2', ey)
    .attr('stroke', DemoHex.lift)
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', '4 3')
    .attr('opacity', 0.85)
  if (opts?.equatorLabel !== false) {
    svg.append('text').attr('x', cx + r + 4).attr('y', ey + 3).attr('fill', DemoHex.lift).attr('font-size', 9).text('赤道')
  }
}

function drawLat() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'ed-heat', DemoHex.warm)

  const sky = defs.append('linearGradient').attr('id', 'ed-sky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', '#152838')
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ed-sky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 26).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('从赤道到两极的地域分异')
  svg.append('text').attr('x', 24).attr('y', 42).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('主导因素：热量 · Blue Marble 示意 · 点色带或地球纬圈')

  // 左侧地球（略右移，给纬度标注留空）
  const cx = 148
  const cy = 210
  const r = 108
  drawEarthDisc(svg, defs, cx, cy, r, { equatorLabel: false })

  const hi = latHi.value
  const soft = hoverLat.value

  // 地球上高亮当前纬度带
  LAT_BELTS.forEach((b, i) => {
    const y0 = globeLatY(cy, r, b.lat1)
    const y1 = globeLatY(cy, r, b.lat0)
    const top = Math.min(y0, y1)
    const bot = Math.max(y0, y1)
    const on = i === hi
    const hov = i === soft
    // 用矩形近似纬带（再被圆裁切）
    const band = svg
      .append('g')
      .attr('clip-path', 'url(#ed-globe-clip)')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverLat.value = i
      })
      .on('mouseleave', () => {
        if (hoverLat.value === i) hoverLat.value = null
      })
      .on('click', () => {
        latHi.value = i
      })
    band
      .append('rect')
      .attr('x', cx - r)
      .attr('y', top)
      .attr('width', r * 2)
      .attr('height', Math.max(4, bot - top))
      .attr('fill', b.color)
      .attr('opacity', on ? 0.55 : hov ? 0.38 : 0.16)
      .attr('stroke', on ? DemoHex.ink : 'none')
      .attr('stroke-width', on ? 1.5 : 0)
  })

  // 色带界线纬度：与右侧列表上下对应
  const latTicks = [...new Set(LAT_BELTS.flatMap((b) => [b.lat0, b.lat1]))].sort((a, b) => a - b)
  drawGlobeLatMarks(svg, cx, cy, r, latTicks)

  // 太阳热量示意（赤道侧）
  svg
    .append('circle')
    .attr('cx', cx)
    .attr('cy', cy + 8)
    .attr('r', 14)
    .attr('fill', DemoHex.warm)
    .attr('opacity', 0.18)
  svg
    .append('text')
    .attr('x', cx)
    .attr('y', cy + r + 22)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text('北半球示意')

  // 右侧色带列表 + 地面贴图条
  const x0 = 268
  const y0 = 58
  const bw = 360
  const bh = 42
  const gap = 5

  // 植被质感：用地面贴图作底层
  defs
    .append('pattern')
    .attr('id', 'ed-ground')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 120)
    .attr('height', 48)
    .append('image')
    .attr('href', '/textures/weather/ground-color.jpg')
    .attr('width', 120)
    .attr('height', 48)
    .attr('preserveAspectRatio', 'xMidYMid slice')

  const nLat = LAT_BELTS.length
  LAT_BELTS.forEach((b, i) => {
    // 与地球一致：极地在上、赤道在下
    const y = y0 + (nLat - 1 - i) * (bh + gap)
    const on = hi === i
    const hov = soft === i
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverLat.value = i
      })
      .on('mouseleave', () => {
        if (hoverLat.value === i) hoverLat.value = null
      })
      .on('click', () => {
        latHi.value = i
      })

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', 'url(#ed-ground)')
      .attr('opacity', on ? 0.55 : 0.25)

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', b.color)
      .attr('opacity', on ? 0.78 : hov ? 0.58 : 0.4)
      .attr('stroke', on ? DemoHex.ink : hov ? DemoHex.inkMuted : 'transparent')
      .attr('stroke-width', on ? 2 : 1.2)
      .attr('class', on ? 'ed-pulse' : null)

    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 18)
      .attr('fill', i >= 5 ? '#1a2430' : DemoHex.ink)
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('style', 'pointer-events:none')
      .text(b.name)
    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 34)
      .attr('fill', i >= 5 ? '#3a4a58' : '#e0f0e8')
      .attr('font-size', 10)
      .attr('style', 'pointer-events:none')
      .text(`${b.climate} · ${b.lat0}°–${b.lat1}°N`)

    const treeG = g.append('g').attr('opacity', on ? 1 : 0.6).attr('style', 'pointer-events:none')
    drawTreeGlyph(treeG, x0 + bw - 72, y + bh - 6, b.trees, i >= 5)

    // 连线到地球
    if (on) {
      const midLat = (b.lat0 + b.lat1) / 2
      const gy = globeLatY(cy, r, midLat)
      svg
        .append('path')
        .attr('d', `M ${cx + r * 0.75} ${gy} L ${x0} ${y + bh / 2}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.sink)
        .attr('stroke-width', 1.8)
        .attr('marker-end', 'url(#ed-heat)')
        .attr('class', 'ed-flow')
        .attr('opacity', 0.85)
        .attr('style', 'pointer-events:none')
    }
  })

  // 热量：赤道高、向极地递减（箭头从下往上）
  const listBottom = y0 + nLat * (bh + gap) - 8
  const heatX = 652
  const heatGrad = defs.append('linearGradient').attr('id', 'ed-heat-bar').attr('x1', '0').attr('y1', '1').attr('x2', '0').attr('y2', '0')
  heatGrad.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.warm)
  heatGrad.append('stop').attr('offset', '100%').attr('stop-color', '#8ec8e8')
  svg
    .append('rect')
    .attr('x', heatX - 4)
    .attr('y', y0 + 8)
    .attr('width', 6)
    .attr('height', listBottom - (y0 + 8))
    .attr('rx', 3)
    .attr('fill', 'url(#ed-heat-bar)')
    .attr('opacity', 0.9)
  svg
    .append('path')
    .attr('d', `M ${heatX} ${listBottom} L ${heatX} ${y0 + 22}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.warm)
    .attr('stroke-width', 2.2)
    .attr('marker-end', 'url(#ed-heat)')
    .attr('class', 'ed-flow')
  svg.append('text').attr('x', heatX + 12).attr('y', y0 + 18).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('极地')
  svg
    .append('text')
    .attr('x', heatX + 12)
    .attr('y', (y0 + 8 + listBottom) / 2)
    .attr('fill', DemoHex.warm)
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text('热量递减')
  svg.append('text').attr('x', heatX + 12).attr('y', listBottom).attr('fill', DemoHex.warm).attr('font-size', 10).text('赤道')

  // 信息卡
  const cur = LAT_BELTS[hi]!
  svg.append('rect').attr('x', 24).attr('y', 388).attr('width', W - 48).attr('height', 40).attr('rx', 8).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 412)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text(`当前：${cur.name}  ·  ${cur.tip}  ·  沿纬线延伸、随纬度更替  ·  底图 Blue Marble + 地表贴图`)
}

function drawLon() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'ed-rain', DemoHex.cold)

  const sky = defs.append('linearGradient').attr('id', 'ed-lsky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', '#152838')
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ed-lsky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 26).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('从沿海到内陆的地域分异')
  svg.append('text').attr('x', 24).attr('y', 42).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('主导因素：水分 · 中纬度大陆示意 · 点色带或地球经向带')

  // 左侧地球：西侧海洋 → 东侧内陆，竖向水分带
  const cx = 148
  const cy = 210
  const r = 108
  drawEarthDisc(svg, defs, cx, cy, r, { equatorLabel: true })

  const hi = lonHi.value
  const soft = hoverLon.value
  const bandTop = globeLatY(cy, r, 55)
  const bandBot = globeLatY(cy, r, 30)
  const bandH = Math.max(8, bandBot - bandTop)
  const oceanW = r * 0.28
  const landL = cx - r + oceanW
  const landR = cx + r * 0.92
  const landW = landR - landL
  const nLon = LON_BELTS.length
  const stripW = landW / nLon

  // 中纬度窗口底
  svg
    .append('g')
    .attr('clip-path', 'url(#ed-globe-clip)')
    .append('rect')
    .attr('x', cx - r)
    .attr('y', bandTop)
    .attr('width', r * 2)
    .attr('height', bandH)
    .attr('fill', 'rgba(4,16,24,0.18)')

  // 海洋
  const oceanG = svg.append('g').attr('clip-path', 'url(#ed-globe-clip)')
  oceanG
    .append('rect')
    .attr('x', cx - r)
    .attr('y', bandTop)
    .attr('width', oceanW)
    .attr('height', bandH)
    .attr('fill', DemoHex.coldDeep)
    .attr('opacity', 0.72)

  LON_BELTS.forEach((b, i) => {
    const x = landL + i * stripW
    const on = i === hi
    const hov = i === soft
    const band = svg
      .append('g')
      .attr('clip-path', 'url(#ed-globe-clip)')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverLon.value = i
      })
      .on('mouseleave', () => {
        if (hoverLon.value === i) hoverLon.value = null
      })
      .on('click', () => {
        lonHi.value = i
      })
    band
      .append('rect')
      .attr('x', x)
      .attr('y', bandTop)
      .attr('width', stripW)
      .attr('height', bandH)
      .attr('fill', b.color)
      .attr('opacity', on ? 0.58 : hov ? 0.4 : 0.18)
      .attr('stroke', on ? DemoHex.ink : 'none')
      .attr('stroke-width', on ? 1.5 : 0)
  })

  // 沿海 / 内陆刻度
  svg
    .append('text')
    .attr('x', cx - r + oceanW * 0.45)
    .attr('y', bandBot + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.coldSoft)
    .attr('font-size', 8)
    .attr('font-weight', 600)
    .text('海')
  svg
    .append('text')
    .attr('x', landL + stripW * 0.5)
    .attr('y', bandBot + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 8)
    .text('沿海')
  svg
    .append('text')
    .attr('x', landR - stripW * 0.35)
    .attr('y', bandBot + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 8)
    .text('内陆')
  svg
    .append('text')
    .attr('x', cx)
    .attr('y', cy + r + 22)
    .attr('text-anchor', 'middle')
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text('中纬度大陆示意')

  // 右侧色带卡片（与纬度带同款）
  const x0 = 268
  const y0 = 72
  const bw = 360
  const bh = 56
  const gap = 10

  defs
    .append('pattern')
    .attr('id', 'ed-lon-ground')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 120)
    .attr('height', 56)
    .append('image')
    .attr('href', '/textures/weather/ground-color.jpg')
    .attr('width', 120)
    .attr('height', 56)
    .attr('preserveAspectRatio', 'xMidYMid slice')

  LON_BELTS.forEach((b, i) => {
    const y = y0 + i * (bh + gap)
    const on = hi === i
    const hov = soft === i
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverLon.value = i
      })
      .on('mouseleave', () => {
        if (hoverLon.value === i) hoverLon.value = null
      })
      .on('click', () => {
        lonHi.value = i
      })

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', 'url(#ed-lon-ground)')
      .attr('opacity', on ? 0.55 : 0.25)

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', b.color)
      .attr('opacity', on ? 0.78 : hov ? 0.58 : 0.4)
      .attr('stroke', on ? DemoHex.ink : hov ? DemoHex.inkMuted : 'transparent')
      .attr('stroke-width', on ? 2 : 1.2)
      .attr('class', on ? 'ed-pulse' : null)

    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 22)
      .attr('fill', DemoHex.ink)
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('style', 'pointer-events:none')
      .text(b.name)
    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 40)
      .attr('fill', '#e0f0e8')
      .attr('font-size', 10)
      .attr('style', 'pointer-events:none')
      .text(`${b.note} · ${b.tip}`)

    // 简易景观符号
    const ix = x0 + bw - 70
    const iy = y + bh - 10
    const icon = g.append('g').attr('opacity', on ? 1 : 0.65).attr('style', 'pointer-events:none')
    if (i === 0) {
      icon.append('line').attr('x1', ix + 8).attr('x2', ix + 8).attr('y1', iy).attr('y2', iy - 16).attr('stroke', '#5a4030').attr('stroke-width', 2)
      icon.append('circle').attr('cx', ix + 8).attr('cy', iy - 22).attr('r', 9).attr('fill', '#0e2818')
      icon.append('line').attr('x1', ix + 28).attr('x2', ix + 28).attr('y1', iy).attr('y2', iy - 14).attr('stroke', '#5a4030').attr('stroke-width', 2)
      icon.append('circle').attr('cx', ix + 28).attr('cy', iy - 20).attr('r', 8).attr('fill', '#0e2818')
    } else if (i === 1) {
      icon.append('line').attr('x1', ix + 10).attr('x2', ix + 10).attr('y1', iy).attr('y2', iy - 14).attr('stroke', '#5a4030').attr('stroke-width', 2)
      icon.append('circle').attr('cx', ix + 10).attr('cy', iy - 20).attr('r', 8).attr('fill', '#0e2818')
      icon.append('rect').attr('x', ix + 22).attr('y', iy - 8).attr('width', 22).attr('height', 5).attr('rx', 2).attr('fill', '#6a8a3a')
    } else if (i === 2) {
      icon.append('rect').attr('x', ix + 4).attr('y', iy - 8).attr('width', 40).attr('height', 6).attr('rx', 2).attr('fill', '#8aaa3a')
      icon.append('rect').attr('x', ix + 10).attr('y', iy - 14).attr('width', 28).attr('height', 4).attr('rx', 2).attr('fill', '#aaba4a')
    } else {
      icon.append('ellipse').attr('cx', ix + 24).attr('cy', iy - 6).attr('rx', 22).attr('ry', 8).attr('fill', '#c4a06a')
      icon.append('circle').attr('cx', ix + 14).attr('cy', iy - 14).attr('r', 2).attr('fill', '#d8c090')
      icon.append('circle').attr('cx', ix + 30).attr('cy', iy - 18).attr('r', 1.6).attr('fill', '#d8c090')
    }

    if (on) {
      const gx = landL + i * stripW + stripW * 0.5
      const gy = (bandTop + bandBot) / 2
      svg
        .append('path')
        .attr('d', `M ${Math.min(cx + r * 0.85, gx + 8)} ${gy} L ${x0} ${y + bh / 2}`)
        .attr('fill', 'none')
        .attr('stroke', DemoHex.sink)
        .attr('stroke-width', 1.8)
        .attr('marker-end', 'url(#ed-rain)')
        .attr('class', 'ed-flow')
        .attr('opacity', 0.85)
        .attr('style', 'pointer-events:none')
    }
  })

  // 水分：沿海高 → 内陆低（箭头向下）
  const listBottom = y0 + nLon * (bh + gap) - 8
  const moistX = 652
  const moistGrad = defs.append('linearGradient').attr('id', 'ed-moist-bar').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  moistGrad.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.cold)
  moistGrad.append('stop').attr('offset', '100%').attr('stop-color', '#c4a06a')
  svg
    .append('rect')
    .attr('x', moistX - 4)
    .attr('y', y0 + 8)
    .attr('width', 6)
    .attr('height', listBottom - (y0 + 8))
    .attr('rx', 3)
    .attr('fill', 'url(#ed-moist-bar)')
    .attr('opacity', 0.9)
  svg
    .append('path')
    .attr('d', `M ${moistX} ${y0 + 18} L ${moistX} ${listBottom - 6}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.cold)
    .attr('stroke-width', 2.2)
    .attr('marker-end', 'url(#ed-rain)')
    .attr('class', 'ed-flow')
  svg.append('text').attr('x', moistX + 12).attr('y', y0 + 18).attr('fill', DemoHex.coldSoft).attr('font-size', 10).text('沿海')
  svg
    .append('text')
    .attr('x', moistX + 12)
    .attr('y', (y0 + 8 + listBottom) / 2)
    .attr('fill', DemoHex.coldSoft)
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text('降水递减')
  svg.append('text').attr('x', moistX + 12).attr('y', listBottom).attr('fill', '#c4a06a').attr('font-size', 10).text('内陆')

  const cur = LON_BELTS[hi]!
  svg.append('rect').attr('x', 24).attr('y', 388).attr('width', W - 48).attr('height', 40).attr('rx', 8).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 412)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text(`当前：${cur.name}  ·  ${cur.tip}  ·  沿经线方向更替、大致与海岸平行  ·  底图 Blue Marble`)
}

function drawVert() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()
  const defs = svg.append('defs')
  ensureAnim(defs)
  marker(defs, 'ed-alt', DemoHex.lift)

  const sky = defs.append('linearGradient').attr('id', 'ed-vsky').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
  sky.append('stop').attr('offset', '0%').attr('stop-color', '#1a3048')
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ed-vsky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 26).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('山地垂直地域分异')
  svg.append('text').attr('x', 24).attr('y', 42).attr('fill', DemoHex.inkDim).attr('font-size', 10).text('水热随海拔变化 · 垂直带 ≈「赤道→两极」压缩版 · 点山带或图例')

  // 右侧小地球对照
  drawEarthDisc(svg, defs, 680, 160, 58)
  svg.append('text').attr('x', 680).attr('y', 232).attr('text-anchor', 'middle').attr('fill', DemoHex.inkDim).attr('font-size', 9).text('对照纬度带')

  const hi = vertHi.value
  // 在小地球上标对应纬度带（垂直带 i 对应 LAT 大致 i）
  const mapIdx = Math.min(LAT_BELTS.length - 1, hi === 5 ? 6 : hi === 4 ? 5 : hi)
  const lb = LAT_BELTS[mapIdx]!
  const cy = 160
  const r = 58
  const y0e = globeLatY(cy, r, lb.lat1)
  const y1e = globeLatY(cy, r, lb.lat0)
  svg
    .append('g')
    .attr('clip-path', 'url(#ed-globe-clip)')
    .append('rect')
    .attr('x', 680 - r)
    .attr('y', Math.min(y0e, y1e))
    .attr('width', r * 2)
    .attr('height', Math.max(4, Math.abs(y1e - y0e)))
    .attr('fill', lb.color)
    .attr('opacity', 0.55)
    .attr('class', 'ed-pulse')

  // 山体
  const peakX = 260
  const baseY = 372
  const peakY = 72
  const totalH = baseY - peakY

  defs
    .append('pattern')
    .attr('id', 'ed-rock')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 160)
    .attr('height', 120)
    .append('image')
    .attr('href', '/textures/rocks/sedimentary-color.jpg')
    .attr('width', 160)
    .attr('height', 120)
    .attr('preserveAspectRatio', 'xMidYMid slice')

  // 山体底（岩石贴图）
  svg
    .append('path')
    .attr('d', `M 48 ${baseY} L ${peakX} ${peakY} L 480 ${baseY} Z`)
    .attr('fill', 'url(#ed-rock)')
    .attr('opacity', 0.85)
  svg
    .append('path')
    .attr('d', `M 48 ${baseY} L ${peakX} ${peakY} L 480 ${baseY} Z`)
    .attr('fill', '#1a2838')
    .attr('opacity', 0.35)

  let acc = 0
  VERT_BELTS.forEach((b, i) => {
    const y1 = peakY + acc * totalH
    acc += b.h
    const y2 = peakY + acc * totalH
    const on = hi === i
    const hov = hoverVert.value === i
    const t1 = (y1 - peakY) / totalH
    const t2 = (y2 - peakY) / totalH
    const left1 = peakX - (peakX - 48) * t1
    const right1 = peakX + (480 - peakX) * t1
    const left2 = peakX - (peakX - 48) * t2
    const right2 = peakX + (480 - peakX) * t2
    const g = svg
      .append('g')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        hoverVert.value = i
      })
      .on('mouseleave', () => {
        if (hoverVert.value === i) hoverVert.value = null
      })
      .on('click', () => {
        vertHi.value = i
      })
    g.append('path')
      .attr('d', `M ${left1} ${y1} L ${right1} ${y1} L ${right2} ${y2} L ${left2} ${y2} Z`)
      .attr('fill', b.color)
      .attr('opacity', on ? 0.88 : hov ? 0.68 : 0.48)
      .attr('stroke', on ? DemoHex.ink : hov ? DemoHex.inkMuted : 'rgba(255,255,255,0.15)')
      .attr('stroke-width', on ? 2.2 : 0.8)
      .attr('class', on ? 'ed-glow' : null)

    // 图例
    const lx = 520
    const ly = 78 + i * 46
    g.append('rect')
      .attr('x', lx)
      .attr('y', ly)
      .attr('width', 88)
      .attr('height', 36)
      .attr('rx', 7)
      .attr('fill', b.color)
      .attr('opacity', on ? 0.95 : 0.5)
      .attr('stroke', on ? DemoHex.ink : 'transparent')
      .attr('stroke-width', 1.5)
    g.append('text')
      .attr('x', lx + 8)
      .attr('y', ly + 22)
      .attr('fill', i === VERT_BELTS.length - 1 ? '#1a2430' : DemoHex.ink)
      .attr('font-size', 10)
      .attr('font-weight', on ? 600 : 500)
      .attr('style', 'pointer-events:none')
      .text(b.name)
  })

  // 雪帽
  svg
    .append('path')
    .attr('d', `M ${peakX - 30} ${peakY + 38} L ${peakX} ${peakY} L ${peakX + 30} ${peakY + 38} Z`)
    .attr('fill', '#f2f6fa')
    .attr('opacity', 0.92)
    .attr('class', 'ed-bob')

  svg
    .append('path')
    .attr('d', `M 36 ${baseY} L 36 ${peakY + 12}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.lift)
    .attr('stroke-width', 2)
    .attr('marker-end', 'url(#ed-alt)')
    .attr('class', 'ed-flow')
  svg.append('text').attr('x', 28).attr('y', 220).attr('fill', DemoHex.lift).attr('font-size', 10).attr('transform', 'rotate(-90,28,220)').text('海拔升高')

  // 对照连线
  svg
    .append('path')
    .attr('d', `M 500 ${78 + hi * 46 + 18} L 620 ${globeLatY(160, 58, (lb.lat0 + lb.lat1) / 2)}`)
    .attr('fill', 'none')
    .attr('stroke', DemoHex.sink)
    .attr('stroke-width', 1.6)
    .attr('stroke-dasharray', '5 4')
    .attr('class', 'ed-flow')
    .attr('opacity', 0.8)

  const cur = VERT_BELTS[hi]!
  svg.append('rect').attr('x', 24).attr('y', 388).attr('width', W - 48).attr('height', 40).attr('rx', 8).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 412)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text(`当前：${cur.name}  ·  ${cur.tip}  ·  对照地球上「${lb.name}」  ·  山体岩石贴图 ambientCG`)
}

function drawTreeGlyph(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  x: number,
  y: number,
  kind: (typeof LAT_BELTS)[number]['trees'],
  dark = false,
) {
  const fill = dark ? '#3a4a58' : '#0e2818'
  if (kind === 'ice') {
    g.append('path').attr('d', `M ${x} ${y} L ${x + 18} ${y - 16} L ${x + 36} ${y} Z`).attr('fill', DemoHex.ink).attr('opacity', 0.7)
    return
  }
  if (kind === 'tundra') {
    g.append('rect').attr('x', x).attr('y', y - 8).attr('width', 40).attr('height', 6).attr('rx', 2).attr('fill', '#4a6a5a')
    return
  }
  if (kind === 'conifer' || kind === 'dense') {
    const n = kind === 'dense' ? 4 : 3
    for (let i = 0; i < n; i++) {
      const tx = x + i * 12
      g.append('path').attr('d', `M ${tx} ${y} L ${tx + 6} ${y - 22} L ${tx + 12} ${y} Z`).attr('fill', fill)
    }
    return
  }
  if (kind === 'savanna') {
    g.append('line').attr('x1', x + 8).attr('x2', x + 8).attr('y1', y).attr('y2', y - 16).attr('stroke', '#5a4030').attr('stroke-width', 2)
    g.append('ellipse').attr('cx', x + 8).attr('cy', y - 20).attr('rx', 10).attr('ry', 6).attr('fill', fill)
    g.append('rect').attr('x', x + 22).attr('y', y - 6).attr('width', 20).attr('height', 4).attr('fill', '#6a8a3a')
    return
  }
  g.append('line').attr('x1', x + 10).attr('x2', x + 10).attr('y1', y).attr('y2', y - 14).attr('stroke', '#5a4030').attr('stroke-width', 2)
  g.append('circle').attr('cx', x + 10).attr('cy', y - 22).attr('r', 10).attr('fill', fill)
  g.append('line').attr('x1', x + 28).attr('x2', x + 28).attr('y1', y).attr('y2', y - 12).attr('stroke', '#5a4030').attr('stroke-width', 2)
  g.append('circle').attr('cx', x + 28).attr('cy', y - 20).attr('r', 8).attr('fill', fill)
}

function redraw() {
  if (disposed) return
  if (mode.value === 'longitudinal') drawLon()
  else if (mode.value === 'vertical') drawVert()
  else drawLat()
}

watch([() => props.stepId], () => {
  requestAnimationFrame(redraw)
})

watch([latHi, lonHi, vertHi, hoverLat, hoverLon, hoverVert], () => {
  requestAnimationFrame(redraw)
})

onMounted(() => {
  disposed = false
  redraw()
})
onUnmounted(() => {
  disposed = true
  if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <template v-if="mode === 'latitudinal'">
        <button type="button" class="chip" @click="latHi = (latHi + 1) % LAT_BELTS.length">上一带（向极）</button>
        <button type="button" class="chip" @click="latHi = (latHi + LAT_BELTS.length - 1) % LAT_BELTS.length">下一带（向赤）</button>
      </template>
      <template v-else-if="mode === 'longitudinal'">
        <button type="button" class="chip" @click="lonHi = (lonHi + LON_BELTS.length - 1) % LON_BELTS.length">上一带</button>
        <button type="button" class="chip" @click="lonHi = (lonHi + 1) % LON_BELTS.length">下一带</button>
      </template>
      <template v-else>
        <button type="button" class="chip" @click="vertHi = (vertHi + VERT_BELTS.length - 1) % VERT_BELTS.length">上一带</button>
        <button type="button" class="chip" @click="vertHi = (vertHi + 1) % VERT_BELTS.length">下一带</button>
      </template>
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
  max-width: 52%;
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
.canvas {
  flex: 1;
  width: 100%;
  min-height: 320px;
}
</style>
