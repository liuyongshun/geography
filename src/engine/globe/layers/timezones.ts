import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeLabelSprite, makeGeoLabelSprite } from '../labels'
import { disposeObject3D, makeGlobeTube, meridianPoints } from '../gridLines'

/** 时区配色：暖橙，与经纬网青蓝区分 */
const COLOR_ZONE = 0xf0a020
const COLOR_ZONE_CN = 0xffd060 // UTC+8 两侧界略亮

/**
 * 理论时区（每 15°，教学示意）。
 * 边界为加粗橙色经线；标签偏赤道以南，减少和经纬度注记叠在一起。
 */
export class TimezonesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('timezones')!
  private group = new THREE.Group()
  private enabled = false

  mount(ctx: GlobeContext) {
    const clip = ctx.clipPlane ? [ctx.clipPlane] : []

    for (let offset = -11; offset <= 12; offset++) {
      const centerLng = offset * 15
      const label =
        offset === 0 ? 'UTC±0' : offset > 0 ? `UTC+${offset}` : `UTC${offset}`
      const s = makeGeoLabelSprite(label, 'zone')
      // 标签放赤道以南，颜色偏暖：用稍大字感
      const p = geoPosition(-18, centerLng, 0.05)
      s.position.set(p.x, p.y, p.z)
      if (offset === 8) s.scale.multiplyScalar(1.35)
      this.group.add(s)

      const westLng = centerLng - 7.5
      const isCnEdge = offset === 8 || offset === 9 // UTC+8 西界 / 东界
      this.group.add(
        makeGlobeTube(
          meridianPoints(westLng, 0.022, 3),
          isCnEdge ? 0.7 : 0.5,
          isCnEdge ? COLOR_ZONE_CN : COLOR_ZONE,
          isCnEdge ? 0.95 : 0.85,
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
    this.group.visible = Boolean(state.layers.timezones)
  }

  dispose() {
    for (const c of [...this.group.children]) {
      if (c instanceof THREE.Sprite) disposeLabelSprite(c)
    }
    disposeObject3D(this.group)
    this.group.clear()
    this.group.removeFromParent()
  }
}
