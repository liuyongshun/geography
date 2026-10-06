import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerId, LayerMeta } from '../types'
import { layerMeta } from '../catalog'

/** 仅同步开关语义；实际贴图由 EarthLayer 切换。 */
export function makeSurfaceSemanticLayer(id: LayerId): GlobeLayer {
  return {
    meta: layerMeta(id)!,
    mount(_ctx: GlobeContext) {},
    setEnabled(_on: boolean) {},
    update(_state: GlobeFrameState) {},
    dispose() {},
  }
}

export class NightLightsLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('nightlights')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class SstLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('sst')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class ChlorophyllLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('chlorophyll')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class SnowIceLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('snowice')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class PrecipLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('precip')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class PopDensityLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('popdensity')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}

export class InsolationLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('insolation')!
  mount(_ctx: GlobeContext) {}
  setEnabled(_on: boolean) {}
  update(_state: GlobeFrameState) {}
  dispose() {}
}
