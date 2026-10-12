/**
 * 银河系旋臂教学迹线 → milky-way-arms-teach.json
 *
 * 对数螺线参数据 Reid et al. 2019（ApJ）及教材常用四臂+本臂结构简化，
 * 仅作课堂示意，非精密银道测量。
 *
 * 用法：npm run build:galaxy
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'public/astro/milky-way-arms-teach.json')

/** 太阳到银心距离（kpc） */
const R0 = 8.15

/**
 * 对数螺线：R(θ) = rRef * exp(-(θ - θRef) * tan(pitch))
 * θ、θRef 为银心坐标系方位角（弧度，从 X 轴逆时针）；pitch 为俯角（弧度）。
 */
const ARM_DEFS = [
  {
    id: 'norma',
    name: '矩尺臂',
    nameEn: 'Norma–Outer',
    pitchDeg: 13.8,
    rRef: 4.5,
    thetaRefDeg: 18,
    thetaStartDeg: -20,
    thetaEndDeg: 320,
    widthKpc: 0.55,
    brightness: 0.72,
  },
  {
    id: 'scutum',
    name: '盾牌臂',
    nameEn: 'Scutum–Centaurus',
    pitchDeg: 13.5,
    rRef: 5.0,
    thetaRefDeg: 27,
    thetaStartDeg: -10,
    thetaEndDeg: 310,
    widthKpc: 0.65,
    brightness: 0.88,
  },
  {
    id: 'sagittarius',
    name: '人马臂',
    nameEn: 'Sagittarius–Carina',
    pitchDeg: 14.0,
    rRef: 6.6,
    thetaRefDeg: 34,
    thetaStartDeg: -15,
    thetaEndDeg: 290,
    widthKpc: 0.6,
    brightness: 0.95,
  },
  {
    id: 'perseus',
    name: '英仙臂',
    nameEn: 'Perseus',
    pitchDeg: 9.5,
    rRef: 9.9,
    thetaRefDeg: 40,
    thetaStartDeg: -40,
    thetaEndDeg: 260,
    widthKpc: 0.7,
    brightness: 0.9,
  },
  {
    id: 'local',
    name: '猎户臂',
    nameEn: 'Local / Orion Spur',
    pitchDeg: 11.0,
    rRef: 8.3,
    thetaRefDeg: 50,
    thetaStartDeg: 20,
    thetaEndDeg: 140,
    widthKpc: 0.45,
    brightness: 0.78,
  },
]

function deg(d) {
  return (d * Math.PI) / 180
}

function sampleArm(def, stepDeg = 1.2) {
  const pitch = deg(def.pitchDeg)
  const thetaRef = deg(def.thetaRefDeg)
  const pts = []
  for (let t = def.thetaStartDeg; t <= def.thetaEndDeg; t += stepDeg) {
    const theta = deg(t)
    const r = def.rRef * Math.exp(-(theta - thetaRef) * Math.tan(pitch))
    if (r < 1.8 || r > 16.5) continue
    // 银心坐标系：X 指向太阳方向，Y 上，Z 右手法则
    const x = r * Math.cos(theta)
    const z = r * Math.sin(theta)
    pts.push([round3(x), round3(z), round3(r), round3(t)])
  }
  return pts
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

const arms = ARM_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  nameEn: def.nameEn,
  pitchDeg: def.pitchDeg,
  widthKpc: def.widthKpc,
  brightness: def.brightness,
  /** [x_kpc, z_kpc, r_kpc, theta_deg][] */
  points: sampleArm(def),
}))

const payload = {
  disclaimer:
    '课堂示意：旋臂迹线据 Reid et al. 2019 等银道结构研究简化，非精密银道测量或导航依据。',
  source: 'Reid et al. 2019, ApJ (spiral arm model, simplified for teaching)',
  sourcePage: 'https://ui.adsabs.harvard.edu/abs/2019ApJ...885..131R/abstract',
  license: 'Teaching derivative of published astronomical model parameters',
  units: 'kpc',
  R0,
  sun: { x: R0, z: 0, label: '太阳系' },
  galacticCenter: { x: 0, z: 0, label: '银心' },
  diskRadiusKpc: 16.5,
  arms,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8')
const nPts = arms.reduce((s, a) => s + a.points.length, 0)
console.log(`wrote ${outPath} (${arms.length} arms, ${nPts} samples)`)
