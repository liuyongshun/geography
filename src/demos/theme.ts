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
} as const
