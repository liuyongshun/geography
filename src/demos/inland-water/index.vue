<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import * as echarts from 'echarts'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

type SupplyId = 'rain' | 'snow' | 'glacier' | 'ground' | 'lake'
type Season = 'flood' | 'dry'
type RiverId = 'east' | 'northeast' | 'northwest'

const svgRef = ref<SVGSVGElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
const weatherRef = ref<HTMLCanvasElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const supply = ref<SupplyId>('rain')
const season = ref<Season>('flood')
const riverId = ref<RiverId>('east')

const showWeather = computed(() => props.stepId === 'supply')
const weatherMode = computed(() =>
  supply.value === 'rain' ? 'rain' : supply.value === 'snow' ? 'snow' : 'ambient',
)

const W = 760
const H = 440

const SUPPLIES: Record<SupplyId, { name: string; peak: string; note: string; color: string }> = {
  rain: { name: '雨水', peak: '汛期随降雨', note: '我国东部最普遍，夏秋流量大', color: DemoHex.cold },
  snow: { name: '季节性积雪融水', peak: '春汛', note: '东北常见，气温回升积雪融化', color: '#b8d9f5' },
  glacier: { name: '冰川融水', peak: '盛夏', note: '西北内流河，气温越高流量越大', color: '#7dd3e8' },
  ground: { name: '地下水', peak: '全年较稳', note: '枯水期维持基流，变化小', color: '#3db8a8' },
  lake: { name: '湖泊水', peak: '削峰补枯', note: '调节径流，丰补枯泄', color: '#4cc9f0' },
}

const RIVERS: Record<
  RiverId,
  { name: string; mix: string; series: Array<{ id: SupplyId; data: number[] }> }
> = {
  east: {
    name: '东部季风区（雨水为主）',
    mix: '夏秋汛明显，冬季靠地下水维持',
    series: [
      { id: 'rain', data: [18, 20, 32, 48, 90, 140, 180, 160, 110, 60, 30, 20] },
      { id: 'ground', data: [22, 22, 21, 20, 20, 19, 18, 18, 19, 20, 21, 22] },
    ],
  },
  northeast: {
    name: '东北河流（春汛 + 夏汛）',
    mix: '春季积雪融水 + 夏季降雨',
    series: [
      { id: 'snow', data: [8, 12, 40, 95, 50, 22, 16, 14, 12, 10, 8, 7] },
      { id: 'rain', data: [10, 10, 14, 20, 45, 90, 130, 110, 55, 28, 14, 10] },
      { id: 'ground', data: [16, 16, 16, 15, 15, 15, 14, 14, 15, 16, 16, 16] },
    ],
  },
  northwest: {
    name: '西北内流河（冰川 + 地下水）',
    mix: '盛夏气温最高时流量最大',
    series: [
      { id: 'glacier', data: [4, 4, 6, 12, 28, 55, 95, 88, 40, 16, 6, 4] },
      { id: 'ground', data: [14, 14, 14, 14, 13, 13, 12, 12, 13, 14, 14, 14] },
    ],
  },
}

let chart: echarts.ECharts | null = null
let weatherRaf = 0
let weatherAlive = false

type Drop = {
  x: number
  y: number
  len: number
  speed: number
  thick: number
  alpha: number
  wind: number
}
type Flake = { x: number; y: number; r: number; speed: number; drift: number; alpha: number }
type Splash = { x: number; y: number; life: number; max: number }
type Glint = { x: number; y: number; life: number; max: number; kind: 'river' | 'lake' }

let drops: Drop[] = []
let flakes: Flake[] = []
let splashes: Splash[] = []
let glints: Glint[] = []

function ensureAnimStyles(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#iw-anim-style').empty()) return
  defs
    .append('style')
    .attr('id', 'iw-anim-style')
    .text(`
      .iw-flow { stroke-dasharray: 10 14; animation: iw-dash 3.2s linear infinite; }
      .iw-flow-slow { stroke-dasharray: 8 16; animation: iw-dash 4.2s linear infinite; }
      .iw-flow-dim { stroke-dasharray: 6 18; animation: iw-dash 5s linear infinite; opacity: 0.28; }
      .iw-shimmer { animation: iw-pulse 3.6s ease-in-out infinite; }
      .iw-ripple { animation: iw-ripple 3.8s ease-out infinite; transform-origin: center; transform-box: fill-box; }
      .iw-river-shine { animation: iw-shine 6.5s linear infinite; }
      .iw-spark { animation: iw-spark 2.8s ease-in-out infinite; }
      .iw-wt { stroke-dasharray: 6 5; animation: iw-dash 4.8s linear infinite; }
      .iw-ice-flow { stroke-dasharray: 5 11; animation: iw-dash 5.6s linear infinite; }
      @keyframes iw-dash { to { stroke-dashoffset: -48; } }
      @keyframes iw-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      @keyframes iw-ripple {
        0% { opacity: 0.5; transform: scale(0.7); }
        100% { opacity: 0; transform: scale(1.4); }
      }
      @keyframes iw-shine { to { stroke-dashoffset: -120; } }
      @keyframes iw-spark { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.8; } }
    `)
}

function resizeWeatherCanvas() {
  const c = weatherRef.value
  const stage = stageRef.value
  if (!c || !stage) return
  const rect = stage.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.max(1, Math.floor(rect.width * dpr))
  c.height = Math.max(1, Math.floor(rect.height * dpr))
  c.style.width = `${rect.width}px`
  c.style.height = `${rect.height}px`
  const ctx = c.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  seedWeather(rect.width, rect.height)
}

function seedWeather(w: number, h: number) {
  drops = Array.from({ length: 160 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    len: 10 + Math.random() * 16,
    speed: 10 + Math.random() * 14,
    thick: 0.8 + Math.random() * 1.4,
    alpha: 0.25 + Math.random() * 0.45,
    wind: -1.2 - Math.random() * 1.4,
  }))
  flakes = Array.from({ length: 90 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 1.2 + Math.random() * 2.4,
    speed: 0.6 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 0.8,
    alpha: 0.35 + Math.random() * 0.5,
  }))
  splashes = []
  glints = []
}

function paintWaterGlints(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const flood = season.value === 'flood'
  const riverTop = h * (flood ? 0.52 : 0.55)
  const riverBot = h * 0.72
  const lakeCx = w * 0.72
  const lakeCy = h * (flood ? 0.42 : 0.45)
  const lakeRx = w * (flood ? 0.1 : 0.08)
  const lakeRy = h * (flood ? 0.12 : 0.09)

  // 河面薄雾反光带
  const sheen = ctx.createLinearGradient(0, riverTop, 0, riverBot)
  sheen.addColorStop(0, 'rgba(180,230,255,0.07)')
  sheen.addColorStop(0.35, 'rgba(160,220,245,0.03)')
  sheen.addColorStop(1, 'rgba(20,60,80,0)')
  ctx.fillStyle = sheen
  ctx.beginPath()
  ctx.moveTo(w * 0.2, riverTop)
  ctx.bezierCurveTo(w * 0.35, riverTop + 8, w * 0.55, riverTop - 6, w * 0.96, riverTop + 4)
  ctx.lineTo(w * 0.96, riverBot)
  ctx.lineTo(w * 0.2, riverBot)
  ctx.closePath()
  ctx.fill()

  // 偶发高光点
  if (Math.random() < 0.45) {
    glints.push({
      x: w * (0.25 + Math.random() * 0.65),
      y: riverTop + 6 + Math.random() * (riverBot - riverTop - 14),
      life: 0,
      max: 24 + Math.random() * 28,
      kind: 'river',
    })
  }
  if (Math.random() < 0.25) {
    const a = Math.random() * Math.PI * 2
    const rr = Math.random()
    glints.push({
      x: lakeCx + Math.cos(a) * lakeRx * rr * 0.85,
      y: lakeCy + Math.sin(a) * lakeRy * rr * 0.85,
      life: 0,
      max: 30 + Math.random() * 30,
      kind: 'lake',
    })
  }

  glints = glints.filter((g) => {
    g.life += 1
    const t = g.life / g.max
    if (t >= 1) return false
    const a = Math.sin(t * Math.PI) * (g.kind === 'lake' ? 0.7 : 0.55)
    ctx.fillStyle = `rgba(230,248,255,${a})`
    ctx.beginPath()
    ctx.ellipse(g.x, g.y, g.kind === 'lake' ? 2.2 : 3.5, g.kind === 'lake' ? 1.1 : 1.2, -0.3, 0, Math.PI * 2)
    ctx.fill()
    return true
  })

  // 湖面径向柔光
  const lg = ctx.createRadialGradient(lakeCx - 8, lakeCy - 6, 2, lakeCx, lakeCy, lakeRx)
  lg.addColorStop(0, 'rgba(220,245,255,0.18)')
  lg.addColorStop(0.45, 'rgba(120,200,230,0.06)')
  lg.addColorStop(1, 'rgba(20,80,100,0)')
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.ellipse(lakeCx, lakeCy, lakeRx, lakeRy, 0, 0, Math.PI * 2)
  ctx.fill()
}

function stopWeather() {
  weatherAlive = false
  cancelAnimationFrame(weatherRaf)
  const c = weatherRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
}

function startWeather() {
  stopWeather()
  if (!showWeather.value) return
  weatherAlive = true
  nextTick(() => {
    resizeWeatherCanvas()
    const loop = () => {
      if (!weatherAlive) return
      weatherRaf = requestAnimationFrame(loop)
      paintWeather()
    }
    weatherRaf = requestAnimationFrame(loop)
  })
}

function paintWeather() {
  const c = weatherRef.value
  const stage = stageRef.value
  if (!c || !stage) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const w = stage.clientWidth
  const h = stage.clientHeight
  ctx.clearRect(0, 0, w, h)

  const rainLeft = w * 0.28
  const rainRight = w * 0.72
  const rainTop = h * 0.08
  const waterY = h * (season.value === 'flood' ? 0.58 : 0.62)

  // 河湖常驻反光（真实感）
  paintWaterGlints(ctx, w, h)

  if (weatherMode.value === 'rain') {
    const mist = ctx.createLinearGradient(0, rainTop, 0, waterY)
    mist.addColorStop(0, 'rgba(140,180,210,0.02)')
    mist.addColorStop(0.55, 'rgba(150,190,220,0.08)')
    mist.addColorStop(1, 'rgba(120,170,200,0.03)')
    ctx.fillStyle = mist
    ctx.fillRect(rainLeft - 20, rainTop, rainRight - rainLeft + 40, waterY - rainTop)

    for (const d of drops) {
      d.y += d.speed
      d.x += d.wind
      if (d.y > waterY + 8 || d.x < rainLeft - 40 || d.x > rainRight + 40) {
        d.y = rainTop + Math.random() * 40
        d.x = rainLeft + Math.random() * (rainRight - rainLeft)
        if (Math.random() < 0.35) {
          splashes.push({ x: d.x, y: waterY + Math.random() * 6, life: 0, max: 10 + Math.random() * 10 })
        }
      }
      if (d.x < rainLeft - 10 || d.x > rainRight + 10) continue
      const grad = ctx.createLinearGradient(d.x, d.y, d.x + d.wind * 0.4, d.y + d.len)
      grad.addColorStop(0, `rgba(200,230,255,0)`)
      grad.addColorStop(0.35, `rgba(190,225,255,${d.alpha})`)
      grad.addColorStop(1, `rgba(160,210,240,0)`)
      ctx.strokeStyle = grad
      ctx.lineWidth = d.thick
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x + d.wind * 0.55, d.y + d.len)
      ctx.stroke()
    }

    splashes = splashes.filter((s) => {
      s.life += 1
      const t = s.life / s.max
      if (t >= 1) return false
      ctx.strokeStyle = `rgba(200,235,255,${(1 - t) * 0.55})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(s.x, s.y, 2 + t * 8, 1 + t * 2.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      return true
    })
  } else if (weatherMode.value === 'snow') {
    for (const f of flakes) {
      f.y += f.speed
      f.x += f.drift + Math.sin(f.y * 0.03) * 0.35
      if (f.y > h + 4) {
        f.y = -4
        f.x = Math.random() * w
      }
      if (f.x < w * 0.02 || f.x > w * 0.36 || f.y > h * 0.52) continue
      ctx.fillStyle = `rgba(240,248,255,${f.alpha})`
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function texPattern(
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  id: string,
  href: string,
  size = 150,
) {
  const p = defs
    .append('pattern')
    .attr('id', id)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', size)
    .attr('height', size)
  p.append('image').attr('href', href).attr('width', size).attr('height', size).attr('preserveAspectRatio', 'xMidYMid slice')
}

function drawSupply() {
  const el = svgRef.value
  if (!el) return
  const svg = d3.select(el)
  svg.selectAll('*').remove()

  const defs = svg.append('defs')
  ensureAnimStyles(defs)
  texPattern(defs, 'iw-tex-grass', '/textures/landcover/aerial-grass.jpg', 170)
  texPattern(defs, 'iw-tex-rock', '/textures/landcover/aerial-rocks.jpg', 160)
  texPattern(defs, 'iw-tex-soil', '/textures/landcover/soil-color.jpg', 140)
  texPattern(defs, 'iw-tex-snow', '/textures/landcover/snow-color.jpg', 150)
  texPattern(defs, 'iw-tex-ice', '/textures/landcover/ice-color.jpg', 140)
  texPattern(defs, 'iw-tex-water', '/textures/landcover/water-color.jpg', 120)
  texPattern(defs, 'iw-tex-sand', '/textures/rocks/sand-color.jpg', 130)

  const mtnD =
    'M 18 36 C 70 8, 150 18, 228 62 C 280 96, 302 148, 268 198 C 232 248, 150 242, 86 208 C 36 176, 8 108, 18 36 Z'
  defs.append('clipPath').attr('id', 'iw-mtn').append('path').attr('d', mtnD)

  const snowPat = defs.append('pattern').attr('id', 'iw-snow-dots').attr('patternUnits', 'userSpaceOnUse').attr('width', 14).attr('height', 14)
  snowPat.append('circle').attr('cx', 3).attr('cy', 4).attr('r', 1.15).attr('fill', 'rgba(255,255,255,0.85)')
  snowPat.append('circle').attr('cx', 9).attr('cy', 10).attr('r', 0.8).attr('fill', 'rgba(236,248,255,0.7)')

  const icePat = defs.append('pattern').attr('id', 'iw-ice-crevasse').attr('patternUnits', 'userSpaceOnUse').attr('width', 18).attr('height', 10)
  icePat.append('path').attr('d', 'M 0 8 L 18 1').attr('stroke', 'rgba(210,242,255,0.55)').attr('stroke-width', 0.9)
  icePat.append('path').attr('d', 'M 0 3 L 18 -4').attr('stroke', 'rgba(40,90,120,0.28)').attr('stroke-width', 0.7)

  const aqPat = defs.append('pattern').attr('id', 'iw-aquifer-dots').attr('patternUnits', 'userSpaceOnUse').attr('width', 11).attr('height', 11)
  aqPat.append('circle').attr('cx', 3).attr('cy', 4).attr('r', 1.35).attr('fill', '#5ee0d0')
  aqPat.append('circle').attr('cx', 8).attr('cy', 9).attr('r', 0.9).attr('fill', '#9af0e4')

  const snowGlow = defs.append('filter').attr('id', 'iw-snow-glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%')
  snowGlow.append('feGaussianBlur').attr('stdDeviation', '1.4').attr('result', 'b')
  snowGlow.append('feMerge').call((m) => {
    m.append('feMergeNode').attr('in', 'b')
    m.append('feMergeNode').attr('in', 'SourceGraphic')
  })

  const waterFx = defs.append('filter').attr('id', 'iw-water-fx').attr('x', '-6%').attr('y', '-6%').attr('width', '112%').attr('height', '112%')
  waterFx.append('feTurbulence').attr('type', 'fractalNoise').attr('baseFrequency', '0.018 0.04').attr('numOctaves', '2').attr('seed', '4').attr('result', 'n')
  waterFx.append('feDisplacementMap').attr('in', 'SourceGraphic').attr('in2', 'n').attr('scale', '2.2').attr('xChannelSelector', 'R').attr('yChannelSelector', 'G')
  waterFx
    .select('feTurbulence')
    .append('animate')
    .attr('attributeName', 'baseFrequency')
    .attr('values', '0.018 0.04;0.022 0.046;0.018 0.04')
    .attr('dur', '12s')
    .attr('repeatCount', 'indefinite')

  for (const [id, color] of [
    ['arr-rain', DemoHex.cold],
    ['arr-snow', '#c2e4ff'],
    ['arr-ice', '#90e0ef'],
    ['arr-gw', '#3db8a8'],
    ['arr-lake', '#4cc9f0'],
  ] as const) {
    defs
      .append('marker')
      .attr('id', id)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 6.5)
      .attr('markerHeight', 6.5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', color)
  }

  const hi = supply.value
  const flood = season.value === 'flood'

  // —— 俯视流域 ——
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#iw-tex-grass)').attr('rx', 14)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'rgba(8,18,12,0.18)').attr('rx', 14)

  // 西北山地
  svg.append('path').attr('d', mtnD).attr('fill', 'url(#iw-tex-rock)')
  svg.append('path').attr('d', mtnD).attr('fill', 'rgba(20,28,22,0.18)')

  const mtnG = svg.append('g').attr('clip-path', 'url(#iw-mtn)')

  // 积雪：山脊连片雪盖（白），谷地留给冰舌
  const snowOn = hi === 'snow'
  const snowCap =
    'M 16 44 C 70 2, 150 4, 228 58 C 242 86, 210 72, 186 58 C 150 34, 100 28, 64 46 C 40 62, 24 92, 18 118 C 12 86, 10 58, 16 44 Z'
  const snowWest = snowOn
    ? 'M 20 96 C 52 74, 92 78, 114 104 C 86 124, 48 148, 26 142 C 16 124, 14 108, 20 96 Z'
    : 'M 22 100 C 48 82, 78 86, 96 104 C 74 118, 46 134, 28 128 C 20 116, 18 108, 22 100 Z'
  for (const d of [snowCap, snowWest]) {
    mtnG
      .append('path')
      .attr('d', d)
      .attr('fill', 'url(#iw-tex-snow)')
      .attr('opacity', snowOn ? 0.98 : 0.88)
      .attr('filter', 'url(#iw-snow-glow)')
      .attr('class', snowOn ? 'iw-shimmer' : null)
    mtnG.append('path').attr('d', d).attr('fill', 'url(#iw-snow-dots)').attr('opacity', snowOn ? 0.5 : 0.22)
  }

  // 冰川：宽冰舌嵌在雪盖中（裂隙冰 + 中碛），末端接融水，不像支流
  const iceOn = hi === 'glacier'
  const tongue =
    'M 88 40 C 128 18, 162 28, 178 58 C 190 88, 198 122, 208 150 C 216 170, 230 184, 242 192 L 214 212 C 196 196, 180 176, 168 148 C 154 116, 140 82, 122 60 C 108 46, 96 42, 88 40 Z'
  mtnG.append('path').attr('d', tongue).attr('fill', '#1a4a62')
  mtnG
    .append('path')
    .attr('d', tongue)
    .attr('fill', 'url(#iw-tex-ice)')
    .attr('opacity', 0.92)
    .attr('stroke', '#d8f4ff')
    .attr('stroke-width', iceOn ? 2.2 : 1.5)
    .attr('class', iceOn ? 'iw-shimmer' : null)
  mtnG.append('path').attr('d', tongue).attr('fill', 'rgba(140,220,245,0.28)')
  mtnG.append('path').attr('d', tongue).attr('fill', 'url(#iw-ice-crevasse)').attr('opacity', 0.85)
  const crevasses = [
    'M 112 58 L 148 50',
    'M 120 78 L 164 68',
    'M 128 100 L 174 90',
    'M 140 124 L 186 114',
    'M 154 148 L 200 138',
    'M 168 170 L 214 160',
  ]
  for (const d of crevasses) {
    mtnG.append('path').attr('d', d).attr('fill', 'none').attr('stroke', 'rgba(230,248,255,0.7)').attr('stroke-width', 1.1).attr('stroke-linecap', 'round')
  }
  mtnG
    .append('path')
    .attr('d', 'M 132 52 Q 164 110 210 186')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(52,38,28,0.5)')
    .attr('stroke-width', 4)
    .attr('stroke-linecap', 'round')
  mtnG
    .append('path')
    .attr('d', 'M 120 48 Q 156 108 204 180')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(200,240,255,0.55)')
    .attr('stroke-width', 1.4)
    .attr('class', iceOn ? 'iw-ice-flow' : null)

  // 山脚与草地衔接
  svg
    .append('path')
    .attr('d', 'M 70 196 C 120 214, 176 218, 228 198 C 250 188, 266 198, 248 218 C 210 250, 140 246, 86 220 C 62 208, 58 198, 70 196 Z')
    .attr('fill', 'url(#iw-tex-grass)')
    .attr('opacity', 0.92)

  // 河岸湿土
  svg
    .append('path')
    .attr(
      'd',
      'M 196 168 C 250 198, 300 228, 352 246 C 430 270, 520 262, 620 270 C 680 276, 730 286, 748 292 L 748 316 C 680 300, 620 292, 520 286 C 430 292, 352 270, 300 250 C 250 222, 196 192, 188 176 Z',
    )
    .attr('fill', 'url(#iw-tex-sand)')
    .attr('opacity', 0.85)
    .attr('stroke', 'none')

  // 地下水带：河谷饱水带（点状孔隙水）+ 潜水面，区别于河岸沙土
  const gwOn = hi === 'ground'
  const aqD = flood
    ? 'M 176 198 C 242 232, 310 262, 372 278 C 456 302, 548 296, 640 304 C 700 310, 742 322, 756 332 L 756 372 C 700 352, 640 342, 548 336 C 456 344, 372 316, 310 294 C 242 262, 176 232, 160 210 Z'
    : 'M 182 210 C 246 240, 312 268, 372 282 C 454 302, 546 296, 636 304 C 696 310, 738 320, 752 328 L 752 354 C 696 340, 636 332, 546 326 C 454 332, 372 312, 312 292 C 246 264, 182 236, 168 218 Z'
  const wtD = flood
    ? 'M 200 248 C 268 278, 336 302, 400 314 C 488 330, 576 326, 660 332'
    : 'M 206 256 C 272 282, 338 304, 400 316 C 484 330, 572 324, 654 330'
  svg.append('path').attr('d', aqD).attr('fill', flood ? 'rgba(18,92,88,0.42)' : 'rgba(18,92,88,0.28)')
  svg.append('path').attr('d', aqD).attr('fill', 'url(#iw-aquifer-dots)').attr('opacity', gwOn ? 0.7 : 0.38)
  svg
    .append('path')
    .attr('d', aqD)
    .attr('fill', 'none')
    .attr('stroke', gwOn ? '#5ee0d0' : 'rgba(94,224,208,0.45)')
    .attr('stroke-width', gwOn ? 1.6 : 0.9)
  svg
    .append('path')
    .attr('d', wtD)
    .attr('fill', 'none')
    .attr('stroke', '#c8fff4')
    .attr('stroke-width', 1.7)
    .attr('stroke-linecap', 'round')
    .attr('class', 'iw-wt')
    .attr('opacity', gwOn ? 1 : 0.7)
  svg
    .append('text')
    .attr('x', 318)
    .attr('y', 348)
    .attr('fill', '#c8fff4')
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .attr('opacity', gwOn ? 1 : 0.75)
    .text('潜水面')
  const wells: Array<[number, number]> = flood
    ? [
        [268, 318],
        [430, 334],
        [590, 328],
      ]
    : [
        [274, 322],
        [432, 336],
        [588, 328],
      ]
  for (const [wx, wy] of wells) {
    svg.append('circle').attr('cx', wx).attr('cy', wy).attr('r', 7).attr('fill', 'rgba(8,28,32,0.55)').attr('stroke', '#7ee8d8').attr('stroke-width', 1.2)
    svg.append('circle').attr('cx', wx).attr('cy', wy).attr('r', 3.2).attr('fill', '#3db8a8')
    svg.append('path').attr('d', `M ${wx} ${wy - 7} L ${wx} ${wy - 16}`).attr('stroke', '#9af0e4').attr('stroke-width', 1.2)
  }

  // 融水溪：雪盖西侧细流 + 冰舌末端，区别于冰川本体
  const tribW = flood ? 10 : 6
  svg
    .append('path')
    .attr('d', 'M 86 118 C 120 148, 160 166, 198 176')
    .attr('fill', 'none')
    .attr('stroke', 'url(#iw-tex-water)')
    .attr('stroke-width', tribW)
    .attr('stroke-linecap', 'round')
    .attr('opacity', snowOn ? 0.95 : 0.55)
  svg
    .append('path')
    .attr('d', 'M 228 196 C 220 206, 212 198, 204 176')
    .attr('fill', 'none')
    .attr('stroke', 'url(#iw-tex-water)')
    .attr('stroke-width', tribW + 2)
    .attr('stroke-linecap', 'round')
    .attr('opacity', iceOn ? 1 : 0.7)

  // 干流
  const riverFill = flood
    ? 'M 198 164 C 258 198, 312 232, 368 248 C 448 272, 536 258, 628 266 C 690 272, 732 282, 748 288 L 748 312 C 732 304, 690 294, 628 288 C 536 280, 448 292, 368 270 C 312 254, 258 220, 196 186 Z'
    : 'M 202 170 C 260 202, 314 234, 368 250 C 448 270, 536 260, 628 268 C 688 274, 728 282, 746 288 L 746 304 C 728 296, 688 286, 628 280 C 536 272, 448 282, 368 262 C 314 246, 260 214, 200 182 Z'
  svg.append('path').attr('d', riverFill).attr('fill', '#0a3a4e')
  svg.append('path').attr('d', riverFill).attr('fill', 'url(#iw-tex-water)').attr('opacity', flood ? 0.95 : 0.82).attr('filter', 'url(#iw-water-fx)')
  svg
    .append('path')
    .attr('d', 'M 210 176 C 270 210, 330 242, 400 254 C 500 268, 600 262, 730 284')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(230,248,255,0.35)')
    .attr('stroke-width', 1.6)
    .attr('stroke-dasharray', '10 16')
    .attr('class', 'iw-river-shine')

  // 湖泊（静止岸线，不做位移/形变）
  const lakeD = flood
    ? 'M 496 142 C 528 122, 576 120, 610 142 C 638 164, 646 198, 632 226 C 618 252, 578 262, 540 254 C 508 246, 484 222, 478 190 C 474 166, 482 150, 496 142 Z'
    : 'M 508 156 C 536 140, 574 140, 600 158 C 622 176, 628 204, 616 226 C 604 246, 572 254, 540 248 C 512 242, 492 222, 488 196 C 484 176, 492 162, 508 156 Z'
  const lakeG = svg.append('g')
  lakeG
    .append('path')
    .attr('d', lakeD)
    .attr('fill', 'url(#iw-tex-grass)')
    .attr('transform', 'translate(-2,5) scale(1.06)')
    .attr('opacity', 0.55)
  lakeG.append('path').attr('d', lakeD).attr('fill', 'url(#iw-tex-sand)').attr('transform', 'translate(0,5)').attr('opacity', 0.9)
  lakeG.append('path').attr('d', lakeD).attr('fill', '#0b3344')
  lakeG
    .append('path')
    .attr('d', lakeD)
    .attr('fill', 'url(#iw-tex-water)')
    .attr('stroke', 'rgba(186,232,244,0.65)')
    .attr('stroke-width', 1.4)
    .attr('opacity', hi === 'lake' ? 1 : 0.92)
  lakeG
    .append('ellipse')
    .attr('cx', 536)
    .attr('cy', flood ? 172 : 180)
    .attr('rx', 34)
    .attr('ry', 12)
    .attr('fill', '#fff')
    .attr('opacity', 0.1)
  lakeG
    .append('path')
    .attr('d', flood ? 'M 520 168 Q 548 184 578 170' : 'M 524 174 Q 548 188 576 176')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(255,255,255,0.28)')
    .attr('stroke-width', 1.4)
    .attr('stroke-linecap', 'round')
  // 湖—河短汊，让水体连在一起
  svg
    .append('path')
    .attr('d', flood ? 'M 520 248 C 510 256, 498 260, 486 258' : 'M 528 246 C 516 254, 504 258, 492 256')
    .attr('fill', 'none')
    .attr('stroke', 'url(#iw-tex-water)')
    .attr('stroke-width', flood ? 14 : 9)
    .attr('stroke-linecap', 'round')
  function nameplate(x: number, y: number, text: string) {
    const tw = text.length * 11 + 16
    svg.append('rect').attr('x', x - tw / 2).attr('y', y - 12).attr('width', tw).attr('height', 20).attr('rx', 6).attr('fill', 'rgba(8,16,24,0.62)')
    svg.append('text').attr('x', x).attr('y', y + 2).attr('text-anchor', 'middle').attr('fill', '#e8f6fc').attr('font-size', 10).attr('font-weight', 600).text(text)
  }
  nameplate(555, flood ? 128 : 140, '湖泊')

  nameplate(700, 276, '河流')
  nameplate(52, 68, '积雪')
  nameplate(196, 86, '冰川')
  nameplate(640, 348, '饱水带')

  const flowArrow = (d: string, color: string, marker: string, on: boolean, label: string, lx: number, ly: number) => {
    svg
      .append('path')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', on ? 3.1 : 1.5)
      .attr('stroke-linecap', 'round')
      .attr('opacity', on ? 1 : 0.22)
      .attr('marker-end', `url(#${marker})`)
      .attr('class', on ? 'iw-flow' : 'iw-flow-dim')
    if (on)
      svg
        .append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('fill', color)
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .text(label)
  }

  flowArrow('M 360 70 L 360 148', DemoHex.cold, 'arr-rain', hi === 'rain', '雨水补给', 370, 112)
  flowArrow('M 70 100 Q 120 148 190 174', '#c2e4ff', 'arr-snow', hi === 'snow', '积雪融水', 58, 138)
  flowArrow('M 200 120 Q 220 160 208 176', '#90e0ef', 'arr-ice', hi === 'glacier', '冰川融水', 246, 148)

  if (flood) {
    flowArrow('M 400 262 L 400 318', '#3db8a8', 'arr-gw', hi === 'ground' || hi === 'lake' || hi === 'rain', '河 → 地下水', 410, 296)
    flowArrow('M 470 248 Q 500 220 530 200', '#4cc9f0', 'arr-lake', true, '河 → 湖', 478, 218)
  } else {
    flowArrow('M 400 318 L 400 268', '#3db8a8', 'arr-gw', true, '地下水 → 河', 410, 300)
    flowArrow('M 530 210 Q 500 236 470 256', '#4cc9f0', 'arr-lake', hi === 'lake' || hi === 'ground', '湖 → 河', 536, 238)
  }
  flowArrow('M 280 300 L 310 258', '#3db8a8', 'arr-gw', hi === 'ground', '地下水补给', 188, 312)

  // 地下水剖面小图：潜水面 vs 河水位，丰枯对照
  const px = 16
  const py = 318
  const inset = svg.append('g').attr('transform', `translate(${px},${py})`)
  inset.append('rect').attr('width', 168).attr('height', 108).attr('rx', 8).attr('fill', 'rgba(7,14,24,0.82)').attr('stroke', gwOn ? '#5ee0d0' : 'rgba(94,224,208,0.25)').attr('stroke-width', gwOn ? 1.4 : 0.8)
  inset.append('text').attr('x', 10).attr('y', 14).attr('fill', '#c8fff4').attr('font-size', 10).attr('font-weight', 600).text('地下水剖面示意')
  const wtY = flood ? 46 : 62
  const rivY = flood ? 40 : 54
  inset.append('rect').attr('x', 10).attr('y', 22).attr('width', 148).attr('height', 74).attr('fill', 'url(#iw-tex-soil)').attr('opacity', 0.85)
  inset.append('rect').attr('x', 10).attr('y', wtY).attr('width', 148).attr('height', 96 - wtY).attr('fill', 'rgba(22,110,104,0.72)')
  inset.append('rect').attr('x', 10).attr('y', wtY).attr('width', 148).attr('height', 96 - wtY).attr('fill', 'url(#iw-aquifer-dots)').attr('opacity', 0.55)
  inset.append('path').attr('d', `M 10 ${wtY} H 158`).attr('stroke', '#c8fff4').attr('stroke-width', 1.5).attr('class', 'iw-wt')
  inset.append('path').attr('d', 'M 10 36 C 40 30, 70 34, 158 32').attr('fill', 'none').attr('stroke', '#8a9a7a').attr('stroke-width', 2)
  inset.append('path').attr('d', `M 68 ${rivY} L 78 22 L 100 22 L 110 ${rivY} L 110 96 L 68 96 Z`).attr('fill', '#0a3a4e')
  inset.append('path').attr('d', `M 68 ${rivY} L 78 22 L 100 22 L 110 ${rivY} L 110 96 L 68 96 Z`).attr('fill', 'url(#iw-tex-water)').attr('opacity', 0.9)
  inset.append('text').attr('x', 14).attr('y', 32).attr('fill', '#dce8d4').attr('font-size', 9).text('包气带')
  inset.append('text').attr('x', 118).attr('y', wtY + 14).attr('fill', '#c8fff4').attr('font-size', 9).text('潜水面')
  inset.append('text').attr('x', 14).attr('y', 88).attr('fill', '#9af0e4').attr('font-size', 9).text('饱水带')
  inset.append('text').attr('x', 84).attr('y', 18).attr('fill', '#9ed7ea').attr('font-size', 9).text('河')

  const s = SUPPLIES[hi]
  svg.append('rect').attr('x', 20).attr('y', 12).attr('width', 268).attr('height', 42).attr('rx', 8).attr('fill', 'rgba(7,14,24,0.78)')
  svg.append('text').attr('x', 32).attr('y', 28).attr('fill', '#e8f4fa').attr('font-size', 11).attr('font-weight', 600).text(`${s.name} · ${s.peak}`)
  svg.append('text').attr('x', 32).attr('y', 44).attr('fill', DemoHex.inkDim).attr('font-size', 10).text(s.note)
  svg
    .append('rect')
    .attr('x', W - 232)
    .attr('y', 12)
    .attr('width', 200)
    .attr('height', 28)
    .attr('rx', 8)
    .attr('fill', flood ? 'rgba(255,159,67,0.16)' : 'rgba(78,180,210,0.14)')
  svg
    .append('text')
    .attr('x', W - 132)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .attr('fill', flood ? '#ffb35c' : '#9ed7ea')
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text(flood ? '丰水期：河补给湖 / 地下水' : '枯水期：湖 / 地下水补给河')
  svg
    .append('text')
    .attr('x', W - 18)
    .attr('y', H - 12)
    .attr('text-anchor', 'end')
    .attr('fill', DemoHex.inkDim)
    .attr('font-size', 10)
    .text('俯视流域 · 贴图示意 · 非实测')

  startWeather()
}

function renderChart() {
  stopWeather()
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value, undefined, { renderer: 'canvas' })
  const r = RIVERS[riverId.value]
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  chart.setOption(
    {
      backgroundColor: 'transparent',
      animationDuration: 900,
      animationEasing: 'cubicOut',
      title: {
        text: r.name,
        subtext: r.mix,
        left: 16,
        top: 8,
        textStyle: { color: DemoHex.cloud, fontSize: 12, fontWeight: 600 },
        subtextStyle: { color: DemoHex.inkDim, fontSize: 10 },
      },
      legend: { right: 20, top: 12, textStyle: { color: DemoHex.inkDim, fontSize: 11 } },
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 28, top: 68, bottom: 40 },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: DemoHex.inkFaint } },
        axisLabel: { color: DemoHex.inkDim },
      },
      yAxis: {
        type: 'value',
        name: '相对流量',
        nameTextStyle: { color: DemoHex.inkDim },
        splitLine: { lineStyle: { color: DemoHex.panelSoft } },
        axisLabel: { color: DemoHex.inkDim },
      },
      series: r.series.map((s) => ({
        name: SUPPLIES[s.id].name,
        type: 'line',
        stack: 'q',
        areaStyle: { opacity: 0.32 },
        smooth: true,
        data: s.data,
        itemStyle: { color: SUPPLIES[s.id].color },
        lineStyle: { width: 2.6 },
        symbol: 'circle',
        symbolSize: 5,
      })),
    },
    true,
  )
}

watch(
  () => props.stepId,
  (id) => {
    if (id === 'supply') requestAnimationFrame(drawSupply)
    else requestAnimationFrame(renderChart)
  },
)
watch([supply, season], () => {
  if (props.stepId === 'supply') drawSupply()
})
watch(riverId, () => {
  if (props.stepId === 'hydrograph') renderChart()
})

function onResize() {
  chart?.resize()
  if (showWeather.value) resizeWeatherCanvas()
}

onMounted(() => {
  if (props.stepId === 'supply') drawSupply()
  else renderChart()
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  stopWeather()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <template v-if="stepId === 'supply'">
        <button
          v-for="(s, id) in SUPPLIES"
          :key="id"
          type="button"
          class="chip"
          :class="{ on: supply === id }"
          :style="supply === id ? { borderColor: s.color, color: s.color } : undefined"
          @click="supply = id"
        >
          {{ s.name }}
        </button>
        <div class="season">
          <button type="button" class="chip" :class="{ on: season === 'flood' }" @click="season = 'flood'">丰水期</button>
          <button type="button" class="chip" :class="{ on: season === 'dry' }" @click="season = 'dry'">枯水期</button>
        </div>
      </template>
      <template v-else>
        <button
          v-for="(r, id) in RIVERS"
          :key="id"
          type="button"
          class="chip"
          :class="{ on: riverId === id }"
          @click="riverId = id"
        >
          {{ r.name }}
        </button>
        <span class="note">堆叠面积 = 各补给相对贡献</span>
      </template>
    </div>
    <div v-show="stepId === 'supply'" ref="stageRef" class="stage">
      <svg ref="svgRef" class="canvas" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" />
      <canvas ref="weatherRef" class="weather" :class="{ on: showWeather }" />
    </div>
    <div v-show="stepId === 'hydrograph'" ref="chartRef" class="chart" />
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
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.season {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  transition:
    border-color 0.2s,
    color 0.2s,
    background 0.2s;
}
.chip:hover {
  color: var(--text-700);
}
.chip.on {
  border-color: var(--primary);
  color: var(--primary-mid);
  background: var(--primary-light);
  font-weight: 600;
}
.note {
  font-size: 12px;
  color: var(--text-400);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 300px;
  overflow: hidden;
}
.canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.weather {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
}
.weather.on {
  opacity: 1;
}
.chart {
  flex: 1;
  width: 100%;
  min-height: 300px;
}
</style>
