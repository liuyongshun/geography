import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

type River = { id: string; nameZh: string; coords: number[][] }

/** 主要河流：折线贴球面 */
export class RiversLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('rivers')!
  private group = new THREE.Group()
  private enabled = false

  async mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    const res = await fetch('/geo/rivers-teach.json')
    if (!res.ok) throw new Error(`rivers pack HTTP ${res.status}`)
    const pack = (await res.json()) as { rivers: River[] }

    const pos: number[] = []
    for (const r of pack.rivers) {
      for (let i = 0; i < r.coords.length - 1; i++) {
        const [lng0, lat0] = r.coords[i]
        const [lng1, lat1] = r.coords[i + 1]
        if (Math.abs(lng0 - lng1) > 40) continue
        const a = geoPosition(lat0, lng0, 0.008)
        const b = geoPosition(lat1, lng1, 0.008)
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    )
    this.group.add(lines)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.rivers
  }

  dispose() {
    for (const c of this.group.children) {
      const m = c as THREE.LineSegments
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.group.clear()
    this.group.removeFromParent()
  }
}
