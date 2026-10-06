import type * as THREE from 'three'
import type ThreeGlobe from 'three-globe'
import type { HotspotId } from '@/engine/atmosphere'

/** three-globe 默认地球半径 */
export const GLOBE_R = 100

export type LayerId =
  | 'earth'
  | 'countries'
  | 'cities'
  | 'latlon'
  | 'compass'
  | 'degrees'
  | 'timezones'
  | 'rivers'
  | 'plates'
  | 'pressure'
  | 'circulation'
  | 'sun'
  | 'insolation'
  | 'terminator'
  | 'nightlights'
  | 'sst'
  | 'chlorophyll'
  | 'snowice'
  | 'precip'
  | 'popdensity'
  | 'earthquakes'
  | 'windfield'
  | 'oceanCurrents'

export type LayerCategory = 'base' | 'geo' | 'atmosphere' | 'climate'

export interface LayerMeta {
  id: LayerId
  label: string
  description: string
  category: LayerCategory
  /** 不可关闭（地球本体） */
  sticky?: boolean
  /** 默认开启 */
  defaultOn?: boolean
  /** 占位：UI 可点但暂无内容 */
  stub?: boolean
}

/** 每帧 / 更新时传入的场景状态（课程控件 + 图层开关） */
export interface GlobeFrameState {
  month: number
  axialTilt: boolean
  coriolis: boolean
  landSea: boolean
  sectioned: boolean
  highlightId: HotspotId | null
  layers: Record<LayerId, boolean>
}

export interface GlobeContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  /** 所有可插拔图层挂到此组，便于统一清理 */
  overlayRoot: THREE.Group
  clipPlane: THREE.Plane
  /** 基准 three-globe 实例（earth 层挂载后可用） */
  globe: ThreeGlobe | null
  getState: () => GlobeFrameState
}

export interface GlobePickBelt {
  kind: 'belt'
  id: HotspotId
}

export interface GlobePickCity {
  kind: 'city'
  id: string
  nameZh: string
  lat: number
  lng: number
}

export type GlobePick = GlobePickBelt | GlobePickCity

/**
 * 可插拔图层契约。
 * 新课程能力：实现此接口 → 注册到 catalog → UI tag 自动出现。
 */
export interface GlobeLayer {
  readonly meta: LayerMeta
  mount(ctx: GlobeContext): void | Promise<void>
  /** 开关（不必销毁，可只 set visible） */
  setEnabled(on: boolean): void
  update?(state: GlobeFrameState): void
  tick?(dt: number, state: GlobeFrameState): void
  pick?(raycaster: THREE.Raycaster): GlobePick | null
  dispose(): void
}

export type LayerFactory = () => GlobeLayer
