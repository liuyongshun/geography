export type HotspotId =
  | 'itcz'
  | 'sthp_n'
  | 'sthp_s'
  | 'subpolar_n'
  | 'subpolar_s'
  | 'polar_n'
  | 'polar_s'
  | 'trade_n'
  | 'trade_s'
  | 'westerly_n'
  | 'westerly_s'
  | 'polar_easterly_n'
  | 'polar_easterly_s'
  | 'hadley_n'
  | 'hadley_s'
  | 'ferrel_n'
  | 'ferrel_s'
  | 'polar_cell_n'
  | 'polar_cell_s'

export type Interaction =
  | 'month'
  | 'axialTilt'
  | 'coriolis'
  | 'landSea'
  | 'sectioned'
  | 'hotspot'

export interface QuizOption {
  id: string
  text: string
  correct: boolean
}

export interface Quiz {
  id: string
  prompt: string
  options: QuizOption[]
  explain: string
}

export interface LessonStep {
  id: string
  title: string
  durationSec: number
  subtitle: string
  see3d: string
  see2d: string
  allowedInteractions: Interaction[]
  state: Partial<ScenePatch>
  quiz: Quiz | null
}

export interface ScenePatch {
  month: number
  axialTilt: boolean
  coriolis: boolean
  landSea: boolean
  sectioned: boolean
  highlightId: HotspotId | null
}

export interface LessonPack {
  id: string
  title: string
  subject: string
  disclaimer: string
  references: string[]
  defaultState: ScenePatch
  steps: LessonStep[]
}

export interface PressureBelt {
  id: HotspotId
  kind: 'pressure' | 'wind' | 'cell'
  label: string
  /** Center latitude at equinox, degrees. */
  baseLat: number
  halfWidth: number
  pressure: 'low' | 'high' | 'wind' | 'cell'
}

export const PRESSURE_BELTS: PressureBelt[] = [
  { id: 'polar_n', kind: 'pressure', label: '极地高压', baseLat: 88, halfWidth: 8, pressure: 'high' },
  { id: 'subpolar_n', kind: 'pressure', label: '副极地低压', baseLat: 60, halfWidth: 7, pressure: 'low' },
  { id: 'sthp_n', kind: 'pressure', label: '副热带高压', baseLat: 30, halfWidth: 8, pressure: 'high' },
  { id: 'itcz', kind: 'pressure', label: '赤道低压', baseLat: 0, halfWidth: 8, pressure: 'low' },
  { id: 'sthp_s', kind: 'pressure', label: '副热带高压', baseLat: -30, halfWidth: 8, pressure: 'high' },
  { id: 'subpolar_s', kind: 'pressure', label: '副极地低压', baseLat: -60, halfWidth: 7, pressure: 'low' },
  { id: 'polar_s', kind: 'pressure', label: '极地高压', baseLat: -88, halfWidth: 8, pressure: 'high' },
]

export const WIND_BELTS: PressureBelt[] = [
  { id: 'polar_easterly_n', kind: 'wind', label: '极地东风', baseLat: 75, halfWidth: 6, pressure: 'wind' },
  { id: 'westerly_n', kind: 'wind', label: '中纬西风', baseLat: 45, halfWidth: 7, pressure: 'wind' },
  { id: 'trade_n', kind: 'wind', label: '东北信风', baseLat: 15, halfWidth: 7, pressure: 'wind' },
  { id: 'trade_s', kind: 'wind', label: '东南信风', baseLat: -15, halfWidth: 7, pressure: 'wind' },
  { id: 'westerly_s', kind: 'wind', label: '中纬西风', baseLat: -45, halfWidth: 7, pressure: 'wind' },
  { id: 'polar_easterly_s', kind: 'wind', label: '极地东风', baseLat: -75, halfWidth: 6, pressure: 'wind' },
]

export const CELL_BELTS: PressureBelt[] = [
  { id: 'polar_cell_n', kind: 'cell', label: '极地环流', baseLat: 75, halfWidth: 12, pressure: 'cell' },
  { id: 'ferrel_n', kind: 'cell', label: '中纬环流', baseLat: 45, halfWidth: 12, pressure: 'cell' },
  { id: 'hadley_n', kind: 'cell', label: '信风环流', baseLat: 15, halfWidth: 12, pressure: 'cell' },
  { id: 'hadley_s', kind: 'cell', label: '信风环流', baseLat: -15, halfWidth: 12, pressure: 'cell' },
  { id: 'ferrel_s', kind: 'cell', label: '中纬环流', baseLat: -45, halfWidth: 12, pressure: 'cell' },
  { id: 'polar_cell_s', kind: 'cell', label: '极地环流', baseLat: -75, halfWidth: 12, pressure: 'cell' },
]

const ALL = [...PRESSURE_BELTS, ...WIND_BELTS, ...CELL_BELTS]

export function findBelt(id: HotspotId): PressureBelt | undefined {
  return ALL.find((b) => b.id === id)
}

/** Approximate subsolar latitude from month (1–12). */
export function subsolarLatitude(month: number, axialTilt: boolean): number {
  if (!axialTilt) return 0
  const t = ((month - 3.25) / 12) * Math.PI * 2
  return 23.5 * Math.sin(t)
}

export function shiftedLat(baseLat: number, month: number, axialTilt: boolean): number {
  const shift = subsolarLatitude(month, axialTilt)
  return Math.max(-90, Math.min(90, baseLat + shift * 0.65))
}

export function monthLabel(month: number): string {
  const names = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  return names[Math.min(11, Math.max(0, Math.round(month) - 1))] ?? `${month}月`
}

export function isNhSummer(month: number): boolean {
  return month >= 5 && month <= 8
}

/** Map latitude (-90..90) to SVG y in a 0..height view. */
export function latToY(lat: number, height: number, pad = 28): number {
  const t = (90 - lat) / 180
  return pad + t * (height - pad * 2)
}

/**
 * Geographic → Three.js. Longitude is negated so that with north-up and camera
 * on +Z, east is to the right (Japan east of China), matching wall-map reading.
 */
export function latLonToVec(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180
  const th = (-lon * Math.PI) / 180
  return [
    radius * Math.sin(phi) * Math.cos(th),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(th),
  ]
}

/** 墨蓝观测台：低压天空蓝 / 高压琥珀 / 风带淡青 */
export const LOW_COLOR = '#4aa3d9'
export const HIGH_COLOR = '#e8a317'
export const WIND_COLOR = '#7ec4eb'
export const CELL_COLOR = '#3d9e9a'

export function beltColor(b: PressureBelt, highlighted: boolean): string {
  const alpha = highlighted ? 0.92 : 0.45
  if (b.pressure === 'low') return highlighted ? LOW_COLOR : `rgba(74,163,217,${alpha})`
  if (b.pressure === 'high') return highlighted ? HIGH_COLOR : `rgba(232,163,23,${alpha})`
  if (b.pressure === 'wind') return highlighted ? WIND_COLOR : `rgba(126,196,235,${alpha})`
  return highlighted ? CELL_COLOR : `rgba(61,158,154,${alpha})`
}
