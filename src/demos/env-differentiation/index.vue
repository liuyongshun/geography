<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import CinematicTerrain from './CinematicTerrain.vue'
import LocalTerrain from './LocalTerrain.vue'

const props = defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const W = 780
const H = 440

/** 纬度地带：北半球理想化样带，仅用于说明热量梯度，不代表任一条经线的完整实况。 */
const LAT_BELTS = [
  { name: '热带雨林带', climate: '全年高温多雨', color: DemoHex.biomeForest, trees: 'dense' as const, lat0: 0, lat1: 10, tip: '赤道低压控制 · 对流雨', location: '菲律宾巴拉望', image: '/images/biomes/tropical-rainforest.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Palawan,_Philippines,_Tropical_rainforest.jpg', credit: 'Vyacheslav Argenberg · CC BY 4.0', plantName: '垂花赫蕉', plantImage: '/images/biomes/plants/plant-heliconia.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Heliconia_rostrata_close_up.jpg', plantCredit: 'Rudra P. Dhua · CC BY-SA 4.0' },
  { name: '热带草原带', climate: '干湿季分明', color: DemoHex.biomeGrass, trees: 'savanna' as const, lat0: 10, lat1: 20, tip: '赤道低压与信风交替', location: '南非萨比沙', image: '/images/biomes/tropical-savanna.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Savanna_landscape_at_Sabi_Sand.jpg', credit: 'Cosal · CC BY-SA 4.0', plantName: '伞形金合欢', plantImage: '/images/biomes/plants/plant-acacia.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Vachellia_tortilis_kz04.jpg', plantCredit: 'Krzysztof Ziarnek · Wikimedia Commons' },
  { name: '亚热带常绿阔叶林带', climate: '冬温夏热', color: DemoHex.vegetation, trees: 'mixed' as const, lat0: 20, lat1: 35, tip: '季风与海陆位置共同影响', location: '日本冲绳山原', image: '/images/biomes/subtropical-evergreen.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Subtropical_Forest_of_Yanbaru_National_Park_Okinawa_2018.jpg', credit: 'kohei sasabuchi · CC BY 2.0', plantName: '山茶', plantImage: '/images/biomes/plants/plant-camellia.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Camellia-japonica.jpg', plantCredit: 'Nagahitoyuki · Wikimedia Commons' },
  { name: '温带落叶阔叶林带', climate: '四季分明', color: DemoHex.biomeGrass, trees: 'broad' as const, lat0: 35, lat1: 50, tip: '西风或温带季风影响', location: '美国北卡罗来纳', image: '/images/biomes/temperate-deciduous.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Central_North_Carolina_forest.jpg', credit: 'Sfoske70 · CC BY-SA 4.0', plantName: '欧洲栎', plantImage: '/images/biomes/plants/plant-oak.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Quercus_robur_acorns_and_leaves.jpg', plantCredit: 'Mannivu · Wikimedia Commons' },
  { name: '亚寒带针叶林带', climate: '冬长严寒', color: DemoHex.biomeForest, trees: 'conifer' as const, lat0: 50, lat1: 65, tip: '热量减少 · 冷湿环境', location: '加拿大魁北克', image: '/images/biomes/boreal-taiga.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Taiga_Landscape_in_Canada.jpg', credit: 'peupleloup · CC BY-SA 2.0', plantName: '黑云杉', plantImage: '/images/biomes/plants/plant-black-spruce.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Picea_mariana_cone.JPG', plantCredit: 'Tilo Podner · CC BY-SA 3.0' },
  { name: '苔原带', climate: '寒冷、暖季短促', color: DemoHex.biomeTundra, trees: 'tundra' as const, lat0: 65, lat1: 75, tip: '热量不足 · 永久冻土广布', location: '加拿大伊瓦维克', image: '/images/biomes/tundra.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tundra_landscape_looking_south_toward_British_Mountains_near_Engigstciak,_Ivvavik_National_Park,_YT.jpg', credit: 'Daniel Case · CC BY-SA 3.0', plantName: '北极柳', plantImage: '/images/biomes/plants/plant-arctic-willow.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Salix_arctica_-_Arctic_willow.jpg', plantCredit: 'Wikimedia Commons · CC BY-SA 2.0' },
  { name: '冰原带', climate: '终年严寒，高等植物极少', color: DemoHex.biomeIce, trees: 'ice' as const, lat0: 75, lat1: 90, tip: '极地高压 · 冰雪覆盖', location: '极地冰原景观', image: '/images/biomes/polar-ice.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ice_landscape.jpg', credit: 'Gürkan Sengün · Public Domain', plantName: '冰原（高等植物极少）', plantImage: '/images/biomes/polar-ice.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Ice_landscape.jpg', plantCredit: 'Gürkan Sengün · Public Domain' },
]

const LON_BELTS = [
  { name: '森林带', note: '降水较多', color: DemoHex.biomeForest, tip: '距海近 · 水汽充足', location: '美国北卡罗来纳', image: '/images/biomes/temperate-deciduous.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Central_North_Carolina_forest.jpg', credit: 'Sfoske70 · CC BY-SA 4.0', plantName: '欧洲栎', plantImage: '/images/biomes/plants/plant-oak.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Quercus_robur_acorns_and_leaves.jpg', plantCredit: 'Mannivu · Wikimedia Commons' },
  { name: '森林草原带', note: '半湿润过渡', color: DemoHex.vegetation, tip: '林地与草地镶嵌分布', location: '俄罗斯阿尔泰边疆区', image: '/images/biomes/forest-steppe.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Forest_patches_in_steppe.jpg', credit: 'Kraulinn · CC BY-SA 3.0', plantName: '欧洲白桦', plantImage: '/images/biomes/plants/plant-birch.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Betula_pendula_leaves.jpg', plantCredit: 'Nefronus · CC0' },
  { name: '草原带', note: '半干旱', color: DemoHex.biomeGrass, tip: '降水减少 · 草本为主', location: '俄罗斯顿河流域', image: '/images/biomes/temperate-grassland.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Steppe,_Grassland_plain,_Rostov-on-Don,_Russia.jpg', credit: 'Vyacheslav Argenberg · CC BY 4.0', plantName: '针茅', plantImage: '/images/biomes/plants/plant-feather-grass.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Stipa_capillata_kz07.jpg', plantCredit: 'Krzysztof Ziarnek · Wikimedia Commons' },
  { name: '荒漠带', note: '干旱', color: DemoHex.biomeDesert, tip: '深内陆 · 蒸发远大于降水', location: '阿联酋沙迦沙漠', image: '/images/biomes/desert-dunes.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Desert_Dunes.jpg', credit: 'JSPhotography2016 · CC BY-SA 4.0', plantName: '梭梭', plantImage: '/images/biomes/plants/plant-saxaul.jpg', plantSourceUrl: 'https://commons.wikimedia.org/wiki/File:Plante_Haloxylon_ammodendron.jpg', plantCredit: 'Zee AM · CC BY-SA 4.0' },
]

const latHi = ref(0)
const lonHi = ref(0)
const hoverLat = ref<number | null>(null)
const hoverLon = ref<number | null>(null)
type LandscapePreview = {
  name: string
  detail: string
  range: string
  location: string
  image: string
  sourceUrl: string
  credit: string
  plantName: string
  plantImage: string
  plantSourceUrl: string
  plantCredit: string
}

const openedBiome = ref<LandscapePreview | null>(null)

function openBiome(index: number) {
  latHi.value = index
  const b = LAT_BELTS[index]
  openedBiome.value = b
    ? { name: b.name, detail: b.climate, range: `约 ${b.lat0}°–${b.lat1}°N`, location: b.location, image: b.image, sourceUrl: b.sourceUrl, credit: b.credit, plantName: b.plantName, plantImage: b.plantImage, plantSourceUrl: b.plantSourceUrl, plantCredit: b.plantCredit }
    : null
}

function openLonBiome(index: number) {
  lonHi.value = index
  const b = LON_BELTS[index]
  openedBiome.value = b
    ? { name: b.name, detail: `${b.note} · ${b.tip}`, range: '中纬度沿海—内陆水分梯度', location: b.location, image: b.image, sourceUrl: b.sourceUrl, credit: b.credit, plantName: b.plantName, plantImage: b.plantImage, plantSourceUrl: b.plantSourceUrl, plantCredit: b.plantCredit }
    : null
}

function closeBiome() {
  openedBiome.value = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && openedBiome.value) closeBiome()
}

const mode = computed(() => {
  if (props.stepId === 'longitudinal') return 'longitudinal'
  if (props.stepId === 'vertical') return 'vertical'
  if (props.stepId === 'local') return 'local'
  return 'latitudinal'
})

const hint = computed(() => {
  if (mode.value === 'latitudinal') {
    const b = LAT_BELTS[latHi.value]!
    return `${b.name}（约 ${b.lat0}°–${b.lat1}°N）· ${b.tip}`
  }
  if (mode.value === 'longitudinal') {
    const b = LON_BELTS[lonHi.value]!
    return `${b.name} · ${b.tip}`
  }
  if (mode.value === 'vertical') {
    return '山麓基带受当地水平自然带制约，带谱随海拔、水热和坡向变化'
  }
  return '同一气候背景下，局地地形、坡向、水分和地面物质造成小尺度镶嵌差异'
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
        .attr('stroke-dasharray', Math.abs(Math.abs(lat) - 23.5) < 0.1 || Math.abs(Math.abs(lat) - 66.5) < 0.1 ? '5 4' : null)
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
  g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', DemoHex.canvas).attr('opacity', 0.22)
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
    .attr('stroke', DemoHex.earthEquator)
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', null)
    .attr('opacity', 0.85)
  if (opts?.equatorLabel !== false) {
    svg
      .append('text')
      .attr('x', cx + r - 7)
      .attr('y', ey + 3)
      .attr('text-anchor', 'end')
      .attr('fill', DemoHex.lift)
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .attr('paint-order', 'stroke')
      .attr('stroke', DemoHex.canvas)
      .attr('stroke-width', 2.5)
      .text('赤道')
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
  sky.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.panelSoft)
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ed-sky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 26).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('纬度地带性分异（北半球理想化样带）')
  const latFactor = svg.append('text').attr('x', 24).attr('y', 42).attr('font-size', 10)
  latFactor.append('tspan').attr('fill', DemoHex.inkDim).text('主导因素：')
  latFactor.append('tspan').attr('fill', 'var(--knowledge-warm)').attr('font-weight', 700).text('热量')

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

  // 右侧色带列表 + 真实植被照片
  const x0 = 268
  const y0 = 58
  const bw = 360
  const bh = 42
  const gap = 5

  const photoShade = defs.append('linearGradient').attr('id', 'ed-photo-shade').attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '0')
  photoShade.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.96)
  photoShade.append('stop').attr('offset', '58%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.72)
  photoShade.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.12)

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

    defs
      .append('clipPath')
      .attr('id', `ed-biome-card-${i}`)
      .append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)

    g.append('image')
      .attr('href', b.image)
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('clip-path', `url(#ed-biome-card-${i})`)

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', 'url(#ed-photo-shade)')

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', b.color)
      .attr('fill-opacity', on ? 0.24 : hov ? 0.16 : 0.08)
      .attr('stroke', on ? DemoHex.ink : hov ? DemoHex.inkMuted : 'transparent')
      .attr('stroke-width', on ? 2 : 1.2)
      .attr('class', on ? 'ed-pulse' : null)

    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 18)
      .attr('fill', DemoHex.ink)
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('style', 'pointer-events:none')
      .text(b.name)
    g.append('text')
      .attr('x', x0 + 14)
      .attr('y', y + 34)
      .attr('fill', DemoHex.inkMuted)
      .attr('font-size', 10)
      .attr('style', 'pointer-events:none')
      .text(`${b.climate} · ${b.lat0}°–${b.lat1}°N`)

    g.append('title').text(`${b.name} · ${b.location}`)

    const preview = g
      .append('g')
      .attr('transform', `translate(${x0 + bw - 23}, ${y + bh / 2})`)
      .attr('role', 'button')
      .attr('aria-label', `预览${b.name}大图`)
      .style('cursor', 'zoom-in')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        openBiome(i)
      })
    preview.append('circle').attr('r', 11).attr('fill', 'rgba(4, 15, 24, 0.76)').attr('stroke', 'rgba(255, 255, 255, 0.72)').attr('stroke-width', 1)
    preview.append('circle').attr('cx', -1.5).attr('cy', -1.5).attr('r', 3.5).attr('fill', 'none').attr('stroke', DemoHex.ink).attr('stroke-width', 1.4)
    preview.append('line').attr('x1', 1.2).attr('y1', 1.2).attr('x2', 5.5).attr('y2', 5.5).attr('stroke', DemoHex.ink).attr('stroke-width', 1.6).attr('stroke-linecap', 'round')
    preview.append('title').text(`预览${b.name}实景大图`)

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

  // 热量：赤道高、向极地递减；渐变条顶部直接收成箭头。
  const listBottom = y0 + nLat * (bh + gap) - 8
  const heatX = 652
  const heatGrad = defs.append('linearGradient').attr('id', 'ed-heat-bar').attr('x1', '0').attr('y1', '1').attr('x2', '0').attr('y2', '0')
  heatGrad.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.warm)
  heatGrad.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.coldSoft)
  svg
    .append('path')
    .attr(
      'd',
      `M ${heatX} ${y0 + 8} L ${heatX + 10} ${y0 + 19} L ${heatX + 4} ${y0 + 19} L ${heatX + 4} ${listBottom} L ${heatX - 4} ${listBottom} L ${heatX - 4} ${y0 + 19} L ${heatX - 10} ${y0 + 19} Z`,
    )
    .attr('fill', 'url(#ed-heat-bar)')
    .attr('opacity', 0.9)
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
    .text(`当前：${cur.name}  ·  ${cur.tip}  ·  沿纬线延伸、随纬度更替`)
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
  sky.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.panelSoft)
  sky.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas)
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#ed-lsky)').attr('rx', 12)

  svg.append('text').attr('x', 24).attr('y', 26).attr('fill', DemoHex.inkMuted).attr('font-size', 12).attr('font-weight', 600).text('干湿度地带性分异（又称经度地带性）')
  const lonFactor = svg.append('text').attr('x', 24).attr('y', 42).attr('font-size', 10)
  lonFactor.append('tspan').attr('fill', DemoHex.inkDim).text('主导因素：')
  lonFactor.append('tspan').attr('fill', 'var(--knowledge-active)').attr('font-weight', 700).text('水分')

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

  const lonPhotoShade = defs.append('linearGradient').attr('id', 'ed-lon-photo-shade').attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '0')
  lonPhotoShade.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.96)
  lonPhotoShade.append('stop').attr('offset', '58%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.72)
  lonPhotoShade.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.canvas).attr('stop-opacity', 0.12)

  LON_BELTS.forEach((b, i) => {
    // 沿海在下、内陆在上，与右侧降水递减箭头保持同一阅读方向。
    const y = y0 + (nLon - 1 - i) * (bh + gap)
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

    defs
      .append('clipPath')
      .attr('id', `ed-lon-card-${i}`)
      .append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)

    g.append('image')
      .attr('href', b.image)
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('clip-path', `url(#ed-lon-card-${i})`)

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', 'url(#ed-lon-photo-shade)')

    g.append('rect')
      .attr('x', x0)
      .attr('y', y)
      .attr('width', bw)
      .attr('height', bh)
      .attr('rx', 8)
      .attr('fill', b.color)
      .attr('fill-opacity', on ? 0.24 : hov ? 0.16 : 0.08)
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
      .attr('fill', DemoHex.inkMuted)
      .attr('font-size', 10)
      .attr('style', 'pointer-events:none')
      .text(`${b.note} · ${b.tip}`)

    g.append('title').text(`${b.name} · ${b.location}`)

    const preview = g
      .append('g')
      .attr('transform', `translate(${x0 + bw - 23}, ${y + bh / 2})`)
      .attr('role', 'button')
      .attr('aria-label', `预览${b.name}大图`)
      .style('cursor', 'zoom-in')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        openLonBiome(i)
      })
    preview.append('circle').attr('r', 11).attr('fill', 'rgba(4, 15, 24, 0.76)').attr('stroke', 'rgba(255, 255, 255, 0.72)').attr('stroke-width', 1)
    preview.append('circle').attr('cx', -1.5).attr('cy', -1.5).attr('r', 3.5).attr('fill', 'none').attr('stroke', DemoHex.ink).attr('stroke-width', 1.4)
    preview.append('line').attr('x1', 1.2).attr('y1', 1.2).attr('x2', 5.5).attr('y2', 5.5).attr('stroke', DemoHex.ink).attr('stroke-width', 1.6).attr('stroke-linecap', 'round')
    preview.append('title').text(`预览${b.name}实景大图`)

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

  // 水分：从下方沿海向上方内陆递减，渐变条顶部收成箭头。
  const listBottom = y0 + nLon * (bh + gap) - 8
  const moistX = 652
  const moistGrad = defs.append('linearGradient').attr('id', 'ed-moist-bar').attr('x1', '0').attr('y1', '1').attr('x2', '0').attr('y2', '0')
  moistGrad.append('stop').attr('offset', '0%').attr('stop-color', DemoHex.cold)
  moistGrad.append('stop').attr('offset', '100%').attr('stop-color', DemoHex.biomeDesert)
  svg
    .append('path')
    .attr(
      'd',
      `M ${moistX} ${y0 + 8} L ${moistX + 10} ${y0 + 19} L ${moistX + 4} ${y0 + 19} L ${moistX + 4} ${listBottom} L ${moistX - 4} ${listBottom} L ${moistX - 4} ${y0 + 19} L ${moistX - 10} ${y0 + 19} Z`,
    )
    .attr('fill', 'url(#ed-moist-bar)')
    .attr('opacity', 0.9)
  svg.append('text').attr('x', moistX + 12).attr('y', y0 + 18).attr('fill', DemoHex.biomeDesert).attr('font-size', 10).text('内陆')
  svg
    .append('text')
    .attr('x', moistX + 12)
    .attr('y', (y0 + 8 + listBottom) / 2)
    .attr('fill', DemoHex.coldSoft)
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text('降水递减')
  svg.append('text').attr('x', moistX + 12).attr('y', listBottom).attr('fill', DemoHex.coldSoft).attr('font-size', 10).text('沿海')

  const cur = LON_BELTS[hi]!
  svg.append('rect').attr('x', 24).attr('y', 388).attr('width', W - 48).attr('height', 40).attr('rx', 8).attr('fill', DemoHex.panel).attr('stroke', DemoHex.inkFaint)
  svg
    .append('text')
    .attr('x', 40)
    .attr('y', 412)
    .attr('fill', DemoHex.inkMuted)
    .attr('font-size', 11)
    .text(`当前：${cur.name}  ·  ${cur.tip}  ·  大体沿经线延伸、由沿海向内陆更替`)
}


function redraw() {
  if (disposed) return
  if (mode.value === 'vertical' || mode.value === 'local') return
  if (mode.value === 'longitudinal') drawLon()
  else drawLat()
}

watch([() => props.stepId], () => {
  closeBiome()
  requestAnimationFrame(redraw)
})

watch([latHi, lonHi, hoverLat, hoverLon], () => {
  requestAnimationFrame(redraw)
})

onMounted(() => {
  disposed = false
  window.addEventListener('keydown', handleKeydown)
  redraw()
})
onUnmounted(() => {
  disposed = true
  window.removeEventListener('keydown', handleKeydown)
  if (svgRef.value) d3.select(svgRef.value).selectAll('*').remove()
})
</script>

<template>
  <div v-if="mode === 'vertical'" class="vertical-stage">
    <CinematicTerrain />
  </div>
  <div v-else-if="mode === 'local'" class="local-stage">
    <LocalTerrain />
  </div>
  <div v-else class="wrap">
    <div class="toolbar">
      <span class="hint">{{ hint }}</span>
      <template v-if="mode === 'latitudinal'">
        <button type="button" class="chip" @click="latHi = (latHi + 1) % LAT_BELTS.length">上一带（向极）</button>
        <button type="button" class="chip" @click="latHi = (latHi + LAT_BELTS.length - 1) % LAT_BELTS.length">下一带（向赤）</button>
      </template>
      <template v-else>
        <button type="button" class="chip" @click="lonHi = (lonHi + LON_BELTS.length - 1) % LON_BELTS.length">上一带</button>
        <button type="button" class="chip" @click="lonHi = (lonHi + 1) % LON_BELTS.length">下一带</button>
      </template>
    </div>
    <svg ref="svgRef" class="canvas" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet" />
    <div class="schematic-note">自然带是气候、植被、土壤等要素的综合表现 · 本图为理想化样带，实际分布还受海陆位置、环流和地形影响</div>
  </div>
  <Teleport to="body">
    <Transition name="biome-lightbox">
      <div
        v-if="openedBiome"
        class="biome-lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="`${openedBiome.name}典型植被实景大图`"
        @click.self="closeBiome"
      >
        <figure class="biome-lightbox__figure">
          <button class="biome-lightbox__close" type="button" aria-label="关闭大图" @click="closeBiome">×</button>
          <div class="biome-lightbox__gallery">
            <div class="biome-lightbox__media">
              <img :src="openedBiome.image" :alt="`${openedBiome.name}典型景观，拍摄地：${openedBiome.location}`" />
              <span>自然带景观</span>
            </div>
            <div class="biome-lightbox__media">
              <img :src="openedBiome.plantImage" :alt="`${openedBiome.name}典型植物：${openedBiome.plantName}`" />
              <span>典型植物 · {{ openedBiome.plantName }}</span>
            </div>
          </div>
          <figcaption>
            <div>
              <strong>{{ openedBiome.name }}</strong>
              <span>{{ openedBiome.detail }} · {{ openedBiome.range }}</span>
            </div>
            <div class="biome-lightbox__meta">
              <span>实景地点：{{ openedBiome.location }}</span>
              <a :href="openedBiome.sourceUrl" target="_blank" rel="noreferrer">景观图：{{ openedBiome.credit }}</a>
              <a :href="openedBiome.plantSourceUrl" target="_blank" rel="noreferrer">植物图：{{ openedBiome.plantCredit }}</a>
            </div>
          </figcaption>
        </figure>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.vertical-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  overflow: hidden;
  background: var(--demo-canvas);
}
.vertical-tabs {
  position: absolute;
  z-index: 40;
  top: 16px;
  left: 50%;
  display: flex;
  gap: 4px;
  padding: 4px;
  transform: translateX(-50%);
  border: 1px solid rgb(169 209 235 / 22%);
  border-radius: 13px;
  background: rgb(7 22 37 / 84%);
  box-shadow: 0 10px 28px rgb(0 0 0 / 24%);
  backdrop-filter: blur(14px);
}
.vertical-tabs button {
  display: grid;
  min-width: 134px;
  gap: 2px;
  padding: 8px 14px;
  border: 0;
  border-radius: 9px;
  color: var(--demo-ink-dim);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.vertical-tabs button.active {
  color: var(--demo-ink);
  background: linear-gradient(180deg, var(--demo-cold-soft), var(--demo-accent));
  box-shadow: 0 4px 14px rgb(25 130 207 / 32%);
}
.vertical-tabs span { font-size: 12px; font-weight: 700; }
.vertical-tabs small { font-size: 9px; opacity: .78; }
@media (max-width: 760px) {
  .vertical-tabs { top: 10px; }
  .vertical-tabs button { min-width: 112px; padding: 7px 9px; }
}
.wrap {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
}
.schematic-note {
  position: absolute;
  right: 12px;
  bottom: 7px;
  color: var(--demo-ink-dim);
  font-size: 9px;
}
.local-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
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
.biome-lightbox {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: clamp(18px, 4vw, 56px);
  background: rgb(1 8 14 / 88%);
  backdrop-filter: blur(12px);
}
.biome-lightbox__figure {
  position: relative;
  width: min(1080px, 100%);
  max-height: 92vh;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgb(198 226 240 / 26%);
  border-radius: 18px;
  background: var(--demo-panel);
  box-shadow: 0 28px 90px rgb(0 0 0 / 55%);
}
.biome-lightbox__gallery {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  height: min(64vh, 650px);
  background: var(--demo-canvas);
}
.biome-lightbox__media {
  position: relative;
  min-width: 0;
  overflow: hidden;
}
.biome-lightbox__media + .biome-lightbox__media {
  border-left: 1px solid rgb(198 226 240 / 18%);
}
.biome-lightbox__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--demo-canvas);
}
.biome-lightbox__media > span {
  position: absolute;
  left: 14px;
  bottom: 12px;
  padding: 5px 9px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  color: var(--demo-ink);
  background: rgb(3 12 19 / 76%);
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(8px);
}
.biome-lightbox__figure figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 20px 18px;
  color: var(--demo-ink);
}
.biome-lightbox__figure figcaption > div {
  display: grid;
  gap: 4px;
}
.biome-lightbox__figure strong {
  font-size: 18px;
}
.biome-lightbox__figure span,
.biome-lightbox__figure a {
  color: var(--demo-ink-dim);
  font-size: 12px;
}
.biome-lightbox__figure a:hover {
  color: var(--demo-accent-soft);
}
.biome-lightbox__meta {
  text-align: right;
}
.biome-lightbox__close {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  width: 38px;
  height: 38px;
  border: 1px solid rgb(255 255 255 / 32%);
  border-radius: 50%;
  color: var(--demo-ink);
  background: rgb(3 12 19 / 72%);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.biome-lightbox-enter-active,
.biome-lightbox-leave-active {
  transition: opacity 180ms ease;
}
.biome-lightbox-enter-active .biome-lightbox__figure,
.biome-lightbox-leave-active .biome-lightbox__figure {
  transition: transform 180ms ease;
}
.biome-lightbox-enter-from,
.biome-lightbox-leave-to {
  opacity: 0;
}
.biome-lightbox-enter-from .biome-lightbox__figure,
.biome-lightbox-leave-to .biome-lightbox__figure {
  transform: translateY(10px) scale(.98);
}
@media (max-width: 680px) {
  .biome-lightbox { padding: 12px; }
  .biome-lightbox__gallery { grid-template-columns: 1fr; height: 68vh; }
  .biome-lightbox__media + .biome-lightbox__media { border-top: 1px solid rgb(198 226 240 / 18%); border-left: 0; }
  .biome-lightbox__figure figcaption { align-items: start; flex-direction: column; gap: 10px; }
  .biome-lightbox__meta { text-align: left; }
}
</style>
