import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import {
  disposeObject3D,
  makeGlobeTube,
  meridianPoints,
  parallelPoints,
} from '../gridLines'

/** 经纬网配色：青蓝，与时区橙黄区分 */
const COLOR_GRID = 0x5ec8f0
const COLOR_MAJOR = 0xb8f0ff // 赤道 / 本初子午线更亮

/**
 * 经纬网：自绘加粗管线（不用 three-globe 自带细灰线）。
 */
export class LatLonLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('latlon')!
  private group = new THREE.Group()
  private enabled = false

  mount(ctx: GlobeContext) {
    // 关掉内置几乎看不见的 graticules
    ctx.globe?.showGraticules(false)

    const clip = ctx.clipPlane ? [ctx.clipPlane] : []

    // 经线：每 30°；0°/180° 加粗
    for (let lng = -180; lng < 180; lng += 30) {
      const major = lng === 0 || Math.abs(lng) === 180
      this.group.add(
        makeGlobeTube(
          meridianPoints(lng),
          major ? 0.55 : 0.32,
          major ? COLOR_MAJOR : COLOR_GRID,
          major ? 0.92 : 0.72,
          clip,
        ),
      )
    }

    // 纬线：每 30°；赤道加粗
    for (const lat of [-60, -30, 0, 30, 60]) {
      const major = lat === 0
      this.group.add(
        makeGlobeTube(
          parallelPoints(lat),
          major ? 0.55 : 0.32,
          major ? COLOR_MAJOR : COLOR_GRID,
          major ? 0.92 : 0.72,
          clip,
        ),
      )
    }

    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = Boolean(state.layers.latlon)
    // 确保不用内置细线
    // globe 可能尚未就绪时由 earth 误开，这里每次关掉
  }

  dispose() {
    disposeObject3D(this.group)
    this.group.clear()
    this.group.removeFromParent()
  }
}
