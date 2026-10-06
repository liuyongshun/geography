import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeLabelSprite, makeGeoLabelSprite } from '../labels'

function fmtLat(lat: number): string {
  if (lat === 0) return '0°'
  return lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`
}

function fmtLng(lng: number): string {
  if (lng === 0) return '0°'
  if (Math.abs(lng) === 180) return '180°'
  return lng > 0 ? `${lng}°E` : `${Math.abs(lng)}°W`
}

/**
 * 经纬度读数：主要纬线标在本初子午线附近，主要经线标在赤道上。
 */
export class DegreesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('degrees')!
  private group = new THREE.Group()
  private enabled = false

  mount(ctx: GlobeContext) {
    const lats = [90, 60, 30, 0, -30, -60, -90]
    for (const lat of lats) {
      // 本初子午线与 180° 各一份，旋转时总有一侧可见
      for (const lng of [0, 180]) {
        if (Math.abs(lat) === 90 && lng === 180) continue
        const s = makeGeoLabelSprite(fmtLat(lat), 'anno')
        const p = geoPosition(lat === 90 ? 82 : lat === -90 ? -82 : lat, lng, 0.035)
        s.position.set(p.x, p.y, p.z)
        this.group.add(s)
      }
    }

    const lngs = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]
    for (const lng of lngs) {
      const s = makeGeoLabelSprite(fmtLng(lng), 'anno')
      const p = geoPosition(8, lng, 0.035)
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
    this.group.visible = Boolean(state.layers.degrees)
  }

  dispose() {
    for (const c of this.group.children) {
      if (c instanceof THREE.Sprite) disposeLabelSprite(c)
    }
    this.group.clear()
    this.group.removeFromParent()
  }
}
