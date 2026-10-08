/**
 * DemoLab 教学示意主题（单一数据源）
 * - CSS：`src/styles/global.css` 中 `--demo-*` 与此保持同值
 * - Three：用 `Demo3.xxx`（number）
 * - D3 / Canvas / Sprite：用 `DemoHex.xxx`（string）
 * 壳层主色为「墨蓝观测台」：天空蓝 + 沙金，见 global.css
 */

export const DemoHex = {
  /** 画布深底 */
  canvas: '#080c12',
  canvasFog: '#0a1018',
  panel: '#101820',
  panelSoft: '#141c28',
  ground: '#24382c',
  groundDark: '#1a2830',
  groundPlate: '#1a2834',

  /** 文字层级 */
  ink: '#eef3f7',
  inkMuted: '#c5d4e4',
  inkDim: '#8aa0b4',
  inkFaint: '#5c6e82',

  /** 冷 / 暖气团与锋面 */
  cold: '#5eb4e8',
  coldSoft: '#7ec4eb',
  coldDeep: '#2a6aa0',
  coldGlow: '#123050',
  coldFront: '#0a3048',
  warm: '#e07a5f',
  warmSoft: '#e07a5f',
  warmDeep: '#b45a3a',
  warmGlow: '#4a2010',
  warmFront: '#3a1810',

  /** 过程高亮：抬升 / 箭头强调 */
  lift: '#f0d078',
  /** 下沉 / 干暖强调 */
  sink: '#c9a227',

  /** 降水与云 */
  rain: '#9ec9e8',
  rainDrop: '#b8dce8',
  cloud: '#d8e4f0',

  /** 气压系统（与 --geo-low / --geo-high 对齐） */
  low: '#4aa3d9',
  lowBright: '#5eb4e8',
  high: '#e8a317',
  highSoft: '#f0c14a',

  /** 壳层控件强调 */
  accent: '#4aa3d9',
  accentSoft: '#c5e4f6',
  accentOnBg: 'rgba(74, 163, 217, 0.14)',

  /** 灯光 */
  lightKey: '#fff4e0',
  lightFill: '#4a7aaa',
  lightHemiSky: '#9ec8f0',
  lightHemiGround: '#1a2830',

  /**
   * 地球示意线（参考 NASA / earth-clock）
   * Three 线宽用 tube 半径，勿依赖 LineBasicMaterial.linewidth（多数平台无效）
   */
  earthAxis: '#6ec8f0',
  /** 经纬网次要线（淡） */
  earthGrid: '#3d6a88',
  /** 经纬网主线：赤道 / 本初子午线 */
  earthGridMajor: '#b8f0ff',
  earthEquator: '#7dd3a0',
  earthPrime: '#c5f4ff',
  /** 南北回归线 ±23.5° */
  earthTropic: '#e8b84a',
  /** 南北极圈 ±66.5° */
  earthPolar: '#a8c0d8',
  earthTerminator: '#ffe08a',
  earthTerminatorSoft: '#fff0c0',
  earthDawn: '#3ec4ff',
  earthDusk: '#ff8a3d',
  earthSpin: '#8fd6f5',
  earthMarker: '#f0d078',
  earthDayLabel: '#ffe6a0',
  earthNightLabel: '#9eb4cc',
} as const

export type DemoHexKey = keyof typeof DemoHex

/** hex 字符串 → Three.js 用的整数色 */
export function hexToInt(hex: string): number {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) {
    return parseInt(h[0]! + h[0] + h[1] + h[1] + h[2] + h[2], 16)
  }
  return parseInt(h.slice(0, 6), 16)
}

/**
 * 地球示意线管径（相对地球半径 R≈72 的世界单位）
 * hair < thin < mid < bold；辉光带另用 soft
 */
export const EarthLineWidth = {
  hair: 0.22,
  thin: 0.4,
  mid: 0.55,
  bold: 0.85,
  soft: 2.4,
  axis: 0.55,
  poleCone: 2.6,
  /** 经纬网次要 */
  grid: 0.2,
  /** 赤道 / 本初子午线 */
  gridMajor: 0.42,
  /** 回归线 / 极圈 */
  special: 0.32,
} as const

/** Globe 图层（地球半径≈100）管径：与 Demo 示意 R≈72 的 EarthLineWidth 成比例 */
export const GlobeGridWidth = {
  minor: 0.32,
  major: 0.55,
} as const

/**
 * 实线 / 虚线约定（中学地图常见画法）
 * - 实线：主框架与过程线（轴、网、赤道、本初子午、晨昏）
 * - 虚线：特殊纬线（回归线、极圈），与赤道区分
 */
export const EarthLineStroke = {
  axis: 'solid',
  grid: 'solid',
  equator: 'solid',
  prime: 'solid',
  /** ±23.5° */
  tropic: 'dashed',
  /** ±66.5° */
  polar: 'dashed',
  terminator: 'solid',
  dawn: 'solid',
  dusk: 'solid',
  spin: 'solid',
} as const

/** 虚线参数：段长 / 间隔（度，沿纬圈） */
export const EarthDashDeg = {
  /** 回归线、极圈 */
  special: { dash: 8, gap: 5 },
} as const

/** Three.js number 色板（与 DemoHex 同源） */
export const Demo3 = {
  canvas: hexToInt(DemoHex.canvas),
  canvasFog: hexToInt(DemoHex.canvasFog),
  panel: hexToInt(DemoHex.panel),
  ground: hexToInt(DemoHex.ground),
  groundDark: hexToInt(DemoHex.groundDark),
  groundPlate: hexToInt(DemoHex.groundPlate),

  cold: hexToInt(DemoHex.cold),
  coldSoft: hexToInt(DemoHex.coldSoft),
  coldDeep: hexToInt(DemoHex.coldDeep),
  coldGlow: hexToInt(DemoHex.coldGlow),
  coldFront: hexToInt(DemoHex.coldFront),
  warm: hexToInt(DemoHex.warm),
  warmDeep: hexToInt(DemoHex.warmDeep),
  warmGlow: hexToInt(DemoHex.warmGlow),
  warmFront: hexToInt(DemoHex.warmFront),

  lift: hexToInt(DemoHex.lift),
  sink: hexToInt(DemoHex.sink),
  rain: hexToInt(DemoHex.rain),
  rainDrop: hexToInt(DemoHex.rainDrop),
  cloud: hexToInt(DemoHex.cloud),

  low: hexToInt(DemoHex.low),
  lowBright: hexToInt(DemoHex.lowBright),
  high: hexToInt(DemoHex.high),
  highSoft: hexToInt(DemoHex.highSoft),

  lightKey: hexToInt(DemoHex.lightKey),
  lightFill: hexToInt(DemoHex.lightFill),
  lightHemiSky: hexToInt(DemoHex.lightHemiSky),
  lightHemiGround: hexToInt(DemoHex.lightHemiGround),

  earthAxis: hexToInt(DemoHex.earthAxis),
  earthGrid: hexToInt(DemoHex.earthGrid),
  earthGridMajor: hexToInt(DemoHex.earthGridMajor),
  earthEquator: hexToInt(DemoHex.earthEquator),
  earthPrime: hexToInt(DemoHex.earthPrime),
  earthTropic: hexToInt(DemoHex.earthTropic),
  earthPolar: hexToInt(DemoHex.earthPolar),
  earthTerminator: hexToInt(DemoHex.earthTerminator),
  earthTerminatorSoft: hexToInt(DemoHex.earthTerminatorSoft),
  earthDawn: hexToInt(DemoHex.earthDawn),
  earthDusk: hexToInt(DemoHex.earthDusk),
  earthSpin: hexToInt(DemoHex.earthSpin),
  earthMarker: hexToInt(DemoHex.earthMarker),
  earthDayLabel: hexToInt(DemoHex.earthDayLabel),
  earthNightLabel: hexToInt(DemoHex.earthNightLabel),
} as const
