import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

type Boundary = {
  id: string
  nameZh: string
  kind: 'convergent' | 'divergent' | 'transform'
  coords: number[][]
}

const KIND_COLOR: Record<Boundary['kind'], number> = {
  convergent: 0xff6b4a,
  divergent: 0x6bcb77,
  transform: 0xf0c040,
}

/** 板块边界示意折线 */
export class PlatesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('plates')!
  private group = new THREE.Group()
  private enabled = false

  async mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    const res = await fetch('/geo/plates-teach.json')
    if (!res.ok) throw new Error(`plates pack HTTP ${res.status}`)
    const pack = (await res.json()) as { boundaries: Boundary[] }

    const buckets: Record<Boundary['kind'], number[]> = {
      convergent: [],
      divergent: [],
      transform: [],
    }

    for (const b of pack.boundaries) {
      const out = buckets[b.kind] ?? buckets.convergent
      for (let i = 0; i < b.coords.length - 1; i++) {
        const [lng0, lat0] = b.coords[i]
        const [lng1, lat1] = b.coords[i + 1]
        if (Math.abs(lng0 - lng1) > 50) continue
        const a = geoPosition(lat0, lng0, 0.01)
        const bpos = geoPosition(lat1, lng1, 0.01)
        out.push(a.x, a.y, a.z, bpos.x, bpos.y, bpos.z)
      }
    }

    for (const kind of Object.keys(buckets) as Boundary['kind'][]) {
      const pos = buckets[kind]
      if (!pos.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      this.group.add(
        new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({
            color: KIND_COLOR[kind],
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        ),
      )
    }
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.plates
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
