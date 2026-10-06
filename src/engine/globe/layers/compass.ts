import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeLabelSprite, makeGeoLabelSprite } from '../labels'

/**
 * 东南西北：按地理方位固定标注（不随相机改字）。
 * 北/南偏两极；东/西放在赤道 90°E / 90°W。
 */
export class CompassLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('compass')!
  private group = new THREE.Group()
  private enabled = false

  mount(ctx: GlobeContext) {
    const marks: Array<{ text: string; lat: number; lng: number }> = [
      { text: '北', lat: 72, lng: 0 },
      { text: '南', lat: -72, lng: 0 },
      { text: '东', lat: 0, lng: 90 },
      { text: '西', lat: 0, lng: -90 },
    ]
    for (const m of marks) {
      const s = makeGeoLabelSprite(m.text, 'compass')
      const p = geoPosition(m.lat, m.lng, 0.04)
      s.position.set(p.x, p.y, p.z)
      this.group.add(s)
    }
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = Boolean(state.layers.compass)
  }

  dispose() {
    for (const c of this.group.children) {
      if (c instanceof THREE.Sprite) disposeLabelSprite(c)
    }
    this.group.clear()
    this.group.removeFromParent()
  }
}
