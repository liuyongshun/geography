import * as THREE from 'three'
import { Demo3, EarthDashDeg, GlobeGridWidth } from '@/demos/theme'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import {
  disposeObject3D,
  makeGlobeDashedParallel,
  makeGlobeTube,
  meridianPoints,
  parallelPoints,
} from '../gridLines'

/**
 * 经纬网：自绘加粗管线（不用 three-globe 自带细灰线）。
 * 色/径与 `theme.ts` Earth 线型规范一致。
 */
export class LatLonLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('latlon')!
  private group = new THREE.Group()
  private enabled = false

  mount(ctx: GlobeContext) {
    ctx.globe?.showGraticules(false)

    const clip = ctx.clipPlane ? [ctx.clipPlane] : []

    // 经线：每 30°；0°/180° 加粗（本初 / 日界示意）
    for (let lng = -180; lng < 180; lng += 30) {
      const major = lng === 0 || Math.abs(lng) === 180
      this.group.add(
        makeGlobeTube(
          meridianPoints(lng),
          major ? GlobeGridWidth.major : GlobeGridWidth.minor,
          major ? Demo3.earthGridMajor : Demo3.earthGrid,
          major ? 0.92 : 0.55,
          clip,
        ),
      )
    }

    // 纬线：次要 30°/60°；赤道用规范绿青色加粗
    for (const lat of [-60, -30, 0, 30, 60]) {
      const isEq = lat === 0
      this.group.add(
        makeGlobeTube(
          parallelPoints(lat),
          isEq ? GlobeGridWidth.major : GlobeGridWidth.minor,
          isEq ? Demo3.earthEquator : Demo3.earthGrid,
          isEq ? 0.92 : 0.55,
          clip,
        ),
      )
    }

    // 回归线 / 极圈：虚线（与赤道实线区分）
    const { dash, gap } = EarthDashDeg.special
    for (const lat of [23.5, -23.5]) {
      this.group.add(
        makeGlobeDashedParallel(lat, GlobeGridWidth.minor * 1.05, Demo3.earthTropic, 0.78, dash, gap, clip),
      )
    }
    for (const lat of [66.5, -66.5]) {
      this.group.add(
        makeGlobeDashedParallel(lat, GlobeGridWidth.minor * 1.05, Demo3.earthPolar, 0.72, dash, gap, clip),
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
  }

  dispose() {
    disposeObject3D(this.group)
    this.group.clear()
    this.group.removeFromParent()
  }
}
