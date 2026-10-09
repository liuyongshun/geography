import type { LayerId } from '@/engine/globe'
import { defaultLayerMap } from '@/engine/globe'

/**
 * 教材教程 id → 地球图层绑定。
 * 进入 /lab/:tutorialId 时套用；未登记的课用章节启发式兜底。
 */
export const TUTORIAL_LAYER_BINDINGS: Record<string, LayerId[]> = {
  // 已上线：气压带风带
  'atmosphere-belts-winds': ['pressure', 'circulation', 'sun'],

  // 选必1 · 地球运动
  'earth-rotation': ['sun', 'terminator', 'timezones', 'latlon', 'degrees'],

  // 宇宙中的地球
  'universe-earth': ['latlon', 'degrees', 'compass', 'sun'],
  'solar-influence': ['insolation', 'sun', 'terminator', 'degrees'],
  'earth-spheres': ['countries', 'latlon', 'degrees', 'compass'],
  'earth-history': ['plates', 'countries', 'earthquakes'],

  // 地表形态
  'fluvial-landforms': ['rivers', 'countries', 'cities'],
  'aeolian-landforms': ['countries', 'cities'],
  'karst-coast-glacier': ['countries', 'rivers', 'snowice'],

  // 大气
  'atmosphere-layers': ['sun', 'latlon', 'degrees'],
  'atmosphere-heating': ['insolation', 'sun', 'terminator'],
  'thermal-circulation': ['sun', 'circulation', 'cities'],

  // 水
  'water-cycle': ['rivers', 'cities', 'precip'],
  'seawater-motion': ['latlon', 'degrees', 'sst', 'cities'],
  'ocean-human': ['cities', 'countries', 'sst', 'chlorophyll'],
  'ocean-currents': ['oceanCurrents', 'sst'],
  'air-sea': ['enso', 'countries', 'sun'],
  'inland-water': ['rivers', 'cities', 'precip'],

  // 植被土壤
  'vegetation-env': ['countries', 'cities', 'chlorophyll'],
  'soil-formation': ['countries'],

  // 整体性与差异性
  'env-integrity': ['chlorophyll', 'rivers', 'countries'],
  'env-differentiation': ['chlorophyll', 'countries', 'sun'],

  // 人文
  'population-distribution': ['countries', 'cities', 'popdensity'],
}

/** 章节 id 前缀兜底（教程未单独登记时） */
const CHAPTER_FALLBACK: Array<{ match: RegExp; layers: LayerId[] }> = [
  { match: /^bx1-c1/, layers: ['sun', 'latlon', 'degrees', 'compass'] },
  { match: /^bx1-c2/, layers: ['plates', 'rivers', 'countries', 'earthquakes'] },
  { match: /^bx1-c3/, layers: ['pressure', 'circulation', 'sun'] },
  { match: /^bx1-c4/, layers: ['rivers', 'cities', 'precip', 'sst'] },
  { match: /^bx1-c5/, layers: ['countries', 'cities', 'chlorophyll'] },
  { match: /^bx2-c1/, layers: ['countries', 'cities', 'popdensity'] },
]

export function resolveTutorialLayers(
  tutorialId: string,
  chapterId?: string,
): Record<LayerId, boolean> {
  const next = defaultLayerMap()
  for (const id of Object.keys(next) as LayerId[]) {
    if (id !== 'earth') next[id] = false
  }

  let active: LayerId[] | undefined = TUTORIAL_LAYER_BINDINGS[tutorialId]
  if (!active && chapterId) {
    const hit = CHAPTER_FALLBACK.find((r) => r.match.test(chapterId))
    active = hit?.layers
  }
  if (!active) {
    active = ['countries', 'latlon']
  }
  for (const id of active) next[id] = true
  return next
}
