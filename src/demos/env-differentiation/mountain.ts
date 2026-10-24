/**
 * 山地垂直自然带：程序高程（课堂示意，不是某座实山的测绘）。
 * 水平约数十公里、主峰 5412 m，供 Three 网格与等高线共用。
 */

export const WORLD = 520
export const HALF = WORLD / 2
/** 主峰世界高度。水平 520、垂直 118，接近高差很大的山地，略有夸张以便看清雪线。 */
export const PEAK_Y = 118
export const PEAK_M = 5412

export const LAKE_NX = 0.64
export const LAKE_NZ = 0.48
const LAKE_FLOOR = 280

let metersScale = 1

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-6)))
  return t * t * (3 - 2 * t)
}

function hash(ix: number, iz: number) {
  let n = ix * 374761393 + iz * 668265263
  n = (n ^ (n >> 13)) * 1274126177
  return ((n ^ (n >> 16)) >>> 0) / 4294967295
}

function noise(x: number, z: number) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash(x0, z0)
  const b = hash(x0 + 1, z0)
  const c = hash(x0, z0 + 1)
  const d = hash(x0 + 1, z0 + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbm(x: number, z: number) {
  let v = 0
  let a = 0.5
  let f = 1
  for (let i = 0; i < 5; i++) {
    v += a * noise(x * f, z * f)
    f *= 2.03
    a *= 0.5
  }
  return v
}

function gauss(nx: number, nz: number, cx: number, cz: number, ax: number, az: number, amp: number) {
  const dx = (nx - cx) / ax
  const dz = (nz - cz) / az
  return Math.exp(-(dx * dx + dz * dz)) * amp
}

/** 河谷中心线（归一化坐标），从湖口流向近处 */
export const RIVER_N: Array<[number, number]> = [
  [0.52, 0.52],
  [0.36, 0.58],
  [0.2, 0.66],
  [0.06, 0.76],
  [-0.06, 0.88],
]

function distToPolyline(nx: number, nz: number, line: Array<[number, number]>) {
  let best = 1e9
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i]![0]
    const az = line[i]![1]
    const bx = line[i + 1]![0]
    const bz = line[i + 1]![1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1e-6
    const t = Math.min(1, Math.max(0, ((nx - ax) * dx + (nz - az) * dz) / l2))
    const px = ax + dx * t - nx
    const pz = az + dz * t - nz
    best = Math.min(best, Math.hypot(px, pz))
  }
  return best
}

function lakeWeight(nx: number, nz: number) {
  const dx = (nx - LAKE_NX) / 0.26
  const dz = (nz - LAKE_NZ) / 0.16
  return smoothstep(1.05, 0.2, Math.hypot(dx, dz))
}

/** 校准前的海拔（米）。主峰会被 calibrate() 拉到 5412 m。 */
function rawMeters(x: number, z: number) {
  const nx = x / HALF
  const nz = z / HALF
  let h = 0
  h += gauss(nx, nz, 0.0, -0.32, 0.34, 0.26, 0.72)
  h += gauss(nx, nz, -0.02, -0.36, 0.11, 0.09, 0.48)
  h += gauss(nx, nz, -0.4, -0.08, 0.32, 0.28, 0.46)
  h += gauss(nx, nz, 0.28, -0.12, 0.26, 0.24, 0.34)
  h += gauss(nx, nz, -0.22, 0.42, 0.42, 0.24, 0.38)
  h += gauss(nx, nz, 0.02, 0.58, 0.3, 0.18, 0.24)
  h += gauss(nx, nz, -0.55, 0.36, 0.28, 0.26, 0.2)
  h += gauss(nx, nz, 0.46, -0.42, 0.3, 0.22, 0.26)
  h += gauss(nx, nz, 0.62, 0.08, 0.22, 0.2, 0.16)

  const mass = Math.exp(-((nx * nx) / 0.62 + ((nz + 0.08) * (nz + 0.08)) / 0.78))
  const ridge = 1 - Math.abs(fbm(nx * 2.4 + 3.2, nz * 2.4 - 1.4) * 2 - 1)
  h += ridge * 0.22 * mass
  const warp = fbm(nx * 1.6 + 2.0, nz * 1.6 - 0.7)
  const gully = Math.abs(Math.sin((nx * 9.5 + warp * 3.2) * Math.PI))
  const spur = Math.pow(gully, 0.55)
  h *= 1 - mass * (1 - (0.78 + 0.22 * spur)) * 0.55
  h += (fbm(nx * 7.5 + 1.7, nz * 7.5 - 0.6) - 0.5) * 0.07 * mass
  // 刃脊和冲沟：侧光下才能看出山脊，而不是一块光滑锥体
  const crestNoise = fbm(nx * 4.8 + 6.1, nz * 4.8 - 1.8)
  const crest = Math.pow(1 - Math.abs(crestNoise * 2 - 1), 2.2)
  h += crest * 0.18 * mass
  const chute = Math.pow(Math.abs(Math.sin((nx * 13 + warp * 5) * Math.PI + nz * 4)), 1.8)
  h -= (1 - chute) * 0.045 * mass
  h += gauss(nx, nz, 0.16, -0.22, 0.08, 0.07, 0.16)
  h += gauss(nx, nz, -0.18, -0.2, 0.07, 0.08, 0.14)

  // 山前谷地，给云和河流留位置
  const saddle = Math.exp(-((nx + 0.02) ** 2) / 0.12 - ((nz - 0.08) ** 2) / 0.05)
  h *= 1 - saddle * 0.42

  let meters = h * 6400
  const lake = lakeWeight(nx, nz)
  const keep = (1 - lake) * (1 - lake)
  meters = meters * keep + LAKE_FLOOR * (1 - keep)
  const river = smoothstep(0.07, 0.0, distToPolyline(nx, nz, RIVER_N))
  meters -= river * (90 + 40 * (1 - lake))

  const rim = Math.hypot(nx * 0.92, nz * 0.92)
  const edge = smoothstep(1.08, 0.78, rim)
  meters *= edge
  return Math.max(40 * edge, meters)
}

export function calibrate() {
  let best = { x: 0, z: 0, m: 1 }
  let step = WORLD / 120
  for (let x = -HALF; x <= HALF; x += step) {
    for (let z = -HALF; z <= HALF; z += step) {
      const m = rawMeters(x, z)
      if (m > best.m) best = { x, z, m }
    }
  }
  for (let iter = 0; iter < 4; iter++) {
    step *= 0.32
    const span = step * 6
    for (let x = best.x - span; x <= best.x + span; x += step) {
      for (let z = best.z - span; z <= best.z + span; z += step) {
        const m = rawMeters(x, z)
        if (m > best.m) best = { x, z, m }
      }
    }
  }
  metersScale = PEAK_M / best.m
}

calibrate()

export function elevation(x: number, z: number) {
  return rawMeters(x, z) * metersScale
}

export function metersToY(meters: number) {
  return (meters / PEAK_M) * PEAK_Y
}

export function yToMeters(y: number) {
  return (y / PEAK_Y) * PEAK_M
}

export interface Zone {
  id: string
  name: string
  lo: number
  hi: number
  /** 左侧海拔轴文案 */
  axis: string
  rangeLabel: string
  temp: string
  precip: string
  climate: string
  blurb: string
  veg: string
  animals: string
  feature: string
  /** 标注所在坡向：0° 朝镜头（+Z），正角偏向画面右侧 */
  azimuth: number
}

/** 自高向低，对应低纬高山的常见垂直带谱（数值为课堂示意） */
export const ZONES: Zone[] = [
  {
    id: 'ice',
    name: '冰雪带',
    lo: 5000,
    hi: 6000,
    axis: '≥ 5000',
    rangeLabel: '海拔 ≥ 5000 米',
    temp: '低于 −10 °C',
    precip: '100 – 300 mm',
    climate: '终年严寒，峰顶仍保留冰川和季节性积雪。',
    blurb: '乌呼鲁峰附近气温终年很低，以冰川、积雪和裸岩为主，几乎没有高等植物。',
    veg: '几乎无高等植物，仅有冰雪与裸岩',
    animals: '偶见雪雀等在雪线附近活动（示意）',
    feature: '永久积雪，冰川发育',
    azimuth: -6,
  },
  {
    id: 'desert',
    name: '高山荒漠带',
    lo: 4000,
    hi: 5000,
    axis: '4000–5000',
    rangeLabel: '海拔 4000 – 5000 米',
    temp: '−8 ~ 0 °C',
    precip: '200 – 400 mm',
    climate: '寒冷、干燥、昼夜温差大，太阳辐射强。',
    blurb: '空气稀薄且极度干燥，火山碎屑广布，植被极少，呈现近似荒漠景观。',
    veg: '垫状植物、地衣、苔藓',
    animals: '岩羊、雪豹等多在带缘活动（示意）',
    feature: '碎石坡、寒冻风化强烈',
    azimuth: 16,
  },
  {
    id: 'meadow',
    name: '高山荒原带',
    lo: 3200,
    hi: 4000,
    axis: '3200–4000',
    rangeLabel: '海拔 3200 – 4000 米',
    temp: '−5 ~ 5 °C',
    precip: '300 – 800 mm',
    climate: '气温低、昼夜温差大、风力强、紫外线强。',
    blurb: '越过林线后，草本与垫状植物逐渐稀疏，向裸露的火山砾石荒原过渡。',
    veg: '丛生草本、蜡菊与垫状植物',
    animals: '鼠兔、牦牛、雪雀（示意）',
    feature: '草甸连片，夏季有花，冬季枯黄',
    azimuth: -18,
  },
  {
    id: 'conifer',
    name: '石楠灌丛带',
    lo: 2800,
    hi: 3200,
    axis: '2800–3200',
    rangeLabel: '海拔 2800 – 3200 米',
    temp: '0 ~ 8 °C',
    precip: '600 – 1000 mm',
    climate: '温凉湿润，冬季寒冷漫长，云雾较多。',
    blurb: '山地森林上缘逐渐转为耐寒石楠灌丛，是乔木林与高山荒原之间的过渡带。',
    veg: '巨型石楠、千里光与高山灌丛',
    animals: '马鹿、松鸡、松鼠（示意）',
    feature: '阴坡森林密，阳坡可出现灌丛',
    azimuth: 24,
  },
  {
    id: 'broad',
    name: '山地雨林带',
    lo: 2200,
    hi: 2800,
    axis: '2200–2800',
    rangeLabel: '海拔 2200 – 2800 米',
    temp: '10 ~ 16 °C',
    precip: '900 – 1400 mm',
    climate: '冬暖夏凉，降水丰沛，湿度大。',
    blurb: '迎风坡云雾和降水充足，形成浓密山地雨林，是整座山树木最繁茂的高度带。',
    veg: '罗汉松、樟科乔木、树蕨与附生植物',
    animals: '小熊猫、雉类（示意，低纬山地）',
    feature: '林冠深绿、层次多',
    azimuth: -4,
  },
  {
    id: 'decid',
    name: '山地森林下缘',
    lo: 1800,
    hi: 2200,
    axis: '1800–2200',
    rangeLabel: '海拔 1800 – 2200 米',
    temp: '12 ~ 18 °C',
    precip: '800 – 1200 mm',
    climate: '四季较分明，冬季落叶，夏季葱郁。',
    blurb: '农耕地向天然山地森林过渡，乔木覆盖迅速增加，湿度随海拔升高。',
    veg: '常绿阔叶乔木、灌木与人工林',
    animals: '鹿、野猪（示意）',
    feature: '季相变化明显',
    azimuth: 20,
  },
  {
    id: 'valley',
    name: '稀树草原与农耕带',
    lo: 1500,
    hi: 1800,
    axis: '1500–1800',
    rangeLabel: '海拔 1500 – 1800 米',
    temp: '16 ~ 22 °C',
    precip: '1000 – 1600 mm',
    climate: '热量充足，干湿季分明，是山麓基带。',
    blurb: '山麓以热带稀树草原、农田和聚落为主，向上逐渐过渡到连续山地森林。',
    veg: '稀树草原、灌丛与农作物',
    animals: '斑马、羚羊与林缘鸟类（示意）',
    feature: '草原、农田与聚落相间',
    azimuth: 8,
  },
]

export function zoneAt(meters: number) {
  return ZONES.find((z) => meters >= z.lo && meters < z.hi) ?? ZONES[ZONES.length - 1]!
}

export interface V3 {
  x: number
  y: number
  z: number
}

export function findPeak() {
  let best = { x: 0, z: -40, m: 0 }
  const step = WORLD / 100
  for (let x = -HALF; x <= HALF; x += step) {
    for (let z = -HALF; z <= HALF; z += step) {
      const m = elevation(x, z)
      if (m > best.m) best = { x, z, m }
    }
  }
  return best
}

/** 从主峰沿方位角往下走，找到指定海拔的坡面点 */
export function pointAtElevation(peak: { x: number; z: number }, meters: number, azimuthDeg: number): V3 | null {
  const rad = (azimuthDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dz = Math.cos(rad)
  let prev = { x: peak.x, z: peak.z, m: elevation(peak.x, peak.z) }
  for (let s = 3; s < HALF * 1.4; s += 3) {
    const x = peak.x + dx * s
    const z = peak.z + dz * s
    if (Math.abs(x) > HALF * 0.96 || Math.abs(z) > HALF * 0.96) break
    const m = elevation(x, z)
    if (m <= meters && prev.m > meters) {
      const t = (prev.m - meters) / (prev.m - m || 1)
      const px = prev.x + (x - prev.x) * t
      const pz = prev.z + (z - prev.z) * t
      return { x: px, y: metersToY(meters), z: pz }
    }
    prev = { x, z, m }
  }
  return null
}

function cellPoint(i: number, j: number, n: number, level: number): V3 {
  const x = -HALF + (i / n) * WORLD
  const z = -HALF + (j / n) * WORLD
  return { x, y: metersToY(level) + 1.15, z }
}

function edgePoint(
  edge: number,
  i: number,
  j: number,
  n: number,
  level: number,
  grid: Float32Array,
): V3 {
  const at = (ii: number, jj: number) => grid[jj * (n + 1) + ii]!
  const mix = (a: V3, b: V3, va: number, vb: number): V3 => {
    const t = (level - va) / (vb - va || 1e-6)
    return { x: a.x + (b.x - a.x) * t, y: metersToY(level) + 1.15, z: a.z + (b.z - a.z) * t }
  }
  const p00 = cellPoint(i, j, n, level)
  const p10 = cellPoint(i + 1, j, n, level)
  const p11 = cellPoint(i + 1, j + 1, n, level)
  const p01 = cellPoint(i, j + 1, n, level)
  const v00 = at(i, j)
  const v10 = at(i + 1, j)
  const v11 = at(i + 1, j + 1)
  const v01 = at(i, j + 1)
  if (edge === 0) return mix(p00, p10, v00, v10)
  if (edge === 1) return mix(p10, p11, v10, v11)
  if (edge === 2) return mix(p01, p11, v01, v11)
  return mix(p00, p01, v00, v01)
}

const SEGMENT_TABLE: number[][] = [
  [],
  [3, 0],
  [0, 1],
  [3, 1],
  [1, 2],
  [3, 0, 1, 2],
  [0, 2],
  [3, 2],
  [2, 3],
  [0, 2],
  [0, 3, 1, 2],
  [1, 2],
  [3, 1],
  [0, 1],
  [3, 0],
  [],
]

/** 某一海拔的等高线，返回若干折线 */
export function contourLines(level: number, n = 168): V3[][] {
  const grid = new Float32Array((n + 1) * (n + 1))
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -HALF + (i / n) * WORLD
      const z = -HALF + (j / n) * WORLD
      grid[j * (n + 1) + i] = elevation(x, z)
    }
  }
  const segs: Array<[V3, V3]> = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v00 = grid[j * (n + 1) + i]!
      const v10 = grid[j * (n + 1) + i + 1]!
      const v11 = grid[(j + 1) * (n + 1) + i + 1]!
      const v01 = grid[(j + 1) * (n + 1) + i]!
      let mask = 0
      if (v00 >= level) mask |= 1
      if (v10 >= level) mask |= 2
      if (v11 >= level) mask |= 4
      if (v01 >= level) mask |= 8
      const edges = SEGMENT_TABLE[mask]!
      for (let k = 0; k < edges.length; k += 2) {
        segs.push([
          edgePoint(edges[k]!, i, j, n, level, grid),
          edgePoint(edges[k + 1]!, i, j, n, level, grid),
        ])
      }
    }
  }
  return stitch(segs)
}

function keyOf(p: V3) {
  return `${Math.round(p.x * 2)},${Math.round(p.z * 2)}`
}

function stitch(segs: Array<[V3, V3]>): V3[][] {
  const from = new Map<string, number[]>()
  const to = new Map<string, number[]>()
  const push = (map: Map<string, number[]>, k: string, i: number) => {
    const arr = map.get(k)
    if (arr) arr.push(i)
    else map.set(k, [i])
  }
  segs.forEach((s, i) => {
    push(from, keyOf(s[0]), i)
    push(to, keyOf(s[1]), i)
  })
  const used = new Uint8Array(segs.length)
  const lines: V3[][] = []
  const take = (map: Map<string, number[]>, k: string) => {
    const arr = map.get(k)
    if (!arr) return -1
    for (const j of arr) if (!used[j]) return j
    return -1
  }
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const line = [segs[i]![0], segs[i]![1]]
    for (let guard = 0; guard < segs.length; guard++) {
      const k = keyOf(line[line.length - 1]!)
      let j = take(from, k)
      if (j >= 0) {
        used[j] = 1
        line.push(segs[j]![1])
        continue
      }
      j = take(to, k)
      if (j >= 0) {
        used[j] = 1
        line.push(segs[j]![0])
        continue
      }
      break
    }
    for (let guard = 0; guard < segs.length; guard++) {
      const k = keyOf(line[0]!)
      let j = take(to, k)
      if (j >= 0) {
        used[j] = 1
        line.unshift(segs[j]![0])
        continue
      }
      j = take(from, k)
      if (j >= 0) {
        used[j] = 1
        line.unshift(segs[j]![1])
        continue
      }
      break
    }
    if (line.length >= 8) lines.push(line)
  }
  return lines
}

export function lakeCenter() {
  return { x: LAKE_NX * HALF, z: LAKE_NZ * HALF }
}

/** 湖面半径：取四周刚被湖岸挡住的距离里较小的一个 */
export function lakeRadius(surfaceMeters: number) {
  const c = lakeCenter()
  let r = 80
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2
    let lo = 4
    let hi = 90
    for (let k = 0; k < 10; k++) {
      const mid = (lo + hi) / 2
      const m = elevation(c.x + Math.cos(ang) * mid, c.z + Math.sin(ang) * mid)
      if (m < surfaceMeters) lo = mid
      else hi = mid
    }
    r = Math.min(r, lo)
  }
  return Math.max(12, r * 0.94)
}

export function lakeSurfaceMeters() {
  const c = lakeCenter()
  return elevation(c.x, c.z) + 18
}

export function riverPoints(surfaceLift = 0.35): V3[] {
  return RIVER_N.map(([nx, nz]) => {
    const x = nx * HALF
    const z = nz * HALF
    const m = elevation(x, z)
    return { x, y: metersToY(m) + surfaceLift, z }
  })
}
