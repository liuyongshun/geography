import type { LayerId } from './types'
import { layerMeta } from './catalog'

/**
 * 互斥组：同组图层不宜同时绘制。
 * `layers` 顺序即绑课时的保留优先级（靠前优先）。
 */
export interface LayerMutexGroup {
  id: string
  layers: LayerId[]
  reason: string
}

export const LAYER_MUTEX_GROUPS: LayerMutexGroup[] = [
  {
    id: 'night-presentation',
    layers: ['nightlights', 'terminator'],
    reason: '「夜间灯光」已是全球夜景底图，「晨昏线」会再罩夜半球，叠在一起难以辨认',
  },
  {
    id: 'surface-overlay',
    layers: ['nightlights', 'insolation', 'sst', 'chlorophyll', 'snowice', 'precip', 'popdensity'],
    reason: '这些图层都会替换地球表面贴图，同时只能开一种',
  },
  {
    id: 'wind-vs-circulation',
    layers: ['circulation', 'windfield'],
    reason: '「大气环流」是教材示意粒子，「实况风场」是气象格点，叠在一起容易混淆',
  },
]

export function mutexGroupOf(id: LayerId): LayerMutexGroup | undefined {
  return LAYER_MUTEX_GROUPS.find((g) => g.layers.includes(id))
}

/** 与 id 互斥的其它图层 */
export function conflictingLayerIds(id: LayerId): LayerId[] {
  const g = mutexGroupOf(id)
  if (!g) return []
  return g.layers.filter((x) => x !== id)
}

export function layerLabel(id: LayerId): string {
  return layerMeta(id)?.label ?? id
}

/**
 * 打开某层时关掉同组已开启层。
 * 返回被关闭的 id 与提示文案（无冲突则为空）。
 */
export function resolveToggleOn(
  layers: Record<LayerId, boolean>,
  enabling: LayerId,
): { turnedOff: LayerId[]; notice: string | null } {
  // 一个 Tag 可能落在多组互斥里，全部处理
  const turnedOff: LayerId[] = []
  const notices: string[] = []

  for (const group of LAYER_MUTEX_GROUPS) {
    if (!group.layers.includes(enabling)) continue
    const offHere: LayerId[] = []
    for (const other of group.layers) {
      if (other === enabling) continue
      if (layers[other]) {
        layers[other] = false
        offHere.push(other)
        if (!turnedOff.includes(other)) turnedOff.push(other)
      }
    }
    if (offHere.length) {
      notices.push(`${group.reason}。已自动关闭「${offHere.map(layerLabel).join('、')}」`)
    }
  }

  return {
    turnedOff,
    notice: notices.length ? notices.join('；') : null,
  }
}

/**
 * 批量套用（课程绑定）时：每组只保留优先级最高且被请求打开的一层。
 */
export function resolveLayerMapConflicts(
  map: Record<LayerId, boolean>,
): { turnedOff: LayerId[]; notice: string | null } {
  const turnedOff: LayerId[] = []
  const reasons: string[] = []

  for (const group of LAYER_MUTEX_GROUPS) {
    const onInGroup = group.layers.filter((id) => map[id])
    if (onInGroup.length <= 1) continue
    const keep = onInGroup[0]!
    for (const id of onInGroup) {
      if (id === keep) continue
      map[id] = false
      turnedOff.push(id)
    }
    const names = onInGroup
      .filter((id) => id !== keep)
      .map(layerLabel)
      .join('、')
    reasons.push(`${group.reason}（已保留「${layerLabel(keep)}」，关闭「${names}」）`)
  }

  return {
    turnedOff,
    notice: reasons.length ? reasons.join('；') : null,
  }
}

/** 用于 Tag 悬停：说明与谁互斥 */
export function conflictHintFor(id: LayerId): string | null {
  const groups = LAYER_MUTEX_GROUPS.filter((g) => g.layers.includes(id) && g.layers.length >= 2)
  if (!groups.length) return null
  const others = new Set<string>()
  for (const g of groups) {
    for (const x of g.layers) {
      if (x !== id) others.add(layerLabel(x))
    }
  }
  return `与「${[...others].join('、')}」不能同时开启`
}
