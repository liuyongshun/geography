import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { makeGeoLabelSprite } from '../labels'

interface TeachCountry {
  id: string
  nameZh: string
  label: boolean
  polygons?: number[][][][]
  rings?: number[][][]
}

interface CountriesPack {
  disclaimer: string
  countries: TeachCountry[]
}

type PolyFeat = {
  id: string
  nameZh: string
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

/**
 * 国家政区：three-globe 多边形 + 中文 Sprite 标签（three-globe 字体不含汉字）。
 */
export class CountriesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('countries')!
  private ctx: GlobeContext | null = null
  private feats: PolyFeat[] = []
  private labelRoot = new THREE.Group()
  private labels: THREE.Sprite[] = []
  private enabled = false
  disclaimer = ''

  async mount(ctx: GlobeContext) {
    this.ctx = ctx
    ctx.overlayRoot.add(this.labelRoot)
    const res = await fetch('/geo/countries-teach.json')
    if (!res.ok) throw new Error(`countries pack HTTP ${res.status}`)
    const pack = (await res.json()) as CountriesPack
    this.disclaimer = pack.disclaimer

    this.feats = []
    for (const c of pack.countries) {
      const polys = c.polygons?.length
        ? c.polygons
        : (c.rings ?? []).map((r) => [r])
      if (!polys.length) continue
      this.feats.push({
        id: c.id,
        nameZh: c.nameZh,
        geometry: { type: 'MultiPolygon', coordinates: polys },
      })
      if (c.label) {
        const [lng, lat] =
          c.id === 'CN' ? ([105, 35] as [number, number]) : centroidOf(polys)
        const p = geoPosition(lat, lng, 0.018)
        const sprite = makeGeoLabelSprite(c.nameZh, 'country')
        sprite.position.set(p.x, p.y, p.z)
        this.labelRoot.add(sprite)
        this.labels.push(sprite)
      }
    }

    this.apply(this.enabled)
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.apply(on)
  }

  update(state: GlobeFrameState) {
    this.apply(state.layers.countries)
  }

  tick(_dt: number, _state: GlobeFrameState) {
    if (!this.enabled || !this.ctx) return
    const camDir = this.ctx.camera.position.clone().normalize()
    for (const s of this.labels) {
      const n = s.position.clone().normalize()
      s.visible = n.dot(camDir) > 0.12
    }
  }

  dispose() {
    this.apply(false)
    for (const s of this.labels) {
      const m = s.material as THREE.SpriteMaterial
      m.map?.dispose()
      m.dispose()
    }
    this.labels = []
    this.labelRoot.clear()
    this.labelRoot.removeFromParent()
    this.ctx = null
  }

  private apply(on: boolean) {
    this.enabled = on
    this.labelRoot.visible = on
    const g = this.ctx?.globe
    if (!g) return
    if (on) {
      g.polygonsData(this.feats)
        .polygonGeoJsonGeometry('geometry')
        .polygonCapColor(() => 'rgba(212, 196, 154, 0.32)')
        .polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonStrokeColor(() => '#2c2416')
        .polygonAltitude(0.004)
        .polygonsTransitionDuration(0)
    } else {
      g.polygonsData([])
    }
  }
}

function centroidOf(polys: number[][][][]): [number, number] {
  let best: number[][] | null = null
  let bestA = 0
  for (const rings of polys) {
    const ring = rings[0]
    if (!ring) continue
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    }
    a = Math.abs(a) * 0.5
    if (a > bestA) {
      bestA = a
      best = ring
    }
  }
  if (!best) return [0, 0]
  let lon = 0
  let lat = 0
  const n = Math.max(1, best.length - 1)
  for (let i = 0; i < n; i++) {
    lon += best[i][0]
    lat += best[i][1]
  }
  return [lon / n, lat / n]
}
