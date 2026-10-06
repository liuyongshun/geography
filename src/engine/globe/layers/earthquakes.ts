import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

interface Quake {
  id: string
  lat: number
  lng: number
  mag: number
  place: string
  mesh: THREE.Mesh
}

/**
 * 近期地震（USGS 4.5+ 一周）。需联网；点大小随震级。
 */
export class EarthquakesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('earthquakes')!
  private group = new THREE.Group()
  private enabled = false
  private loaded = false
  private loading = false
  private quakes: Quake[] = []
  private pulse = 0

  mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
    if (on && !this.loaded && !this.loading) void this.load()
  }

  update(state: GlobeFrameState) {
    const on = Boolean(state.layers.earthquakes)
    this.setEnabled(on)
  }

  tick(dt: number, state: GlobeFrameState) {
    if (!state.layers.earthquakes) return
    this.pulse = (this.pulse + dt) % 2
    const k = 0.85 + 0.15 * Math.sin(this.pulse * Math.PI)
    for (const q of this.quakes) {
      const base = 0.6 + Math.max(0, q.mag - 4.5) * 0.45
      q.mesh.scale.setScalar(base * k)
    }
  }

  dispose() {
    for (const q of this.quakes) {
      q.mesh.geometry.dispose()
      ;(q.mesh.material as THREE.Material).dispose()
    }
    this.quakes = []
    this.group.clear()
    this.group.removeFromParent()
  }

  private async load() {
    this.loading = true
    try {
      const res = await fetch(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
        { mode: 'cors' },
      )
      if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
      const data = (await res.json()) as {
        features?: Array<{
          id?: string
          properties?: { mag?: number; place?: string }
          geometry?: { coordinates?: number[] }
        }>
      }
      for (const f of data.features ?? []) {
        const c = f.geometry?.coordinates
        if (!c || c.length < 2) continue
        const lng = c[0]!
        const lat = c[1]!
        const mag = f.properties?.mag ?? 4.5
        const place = f.properties?.place ?? ''
        const r = 0.55 + Math.max(0, mag - 4.5) * 0.4
        const color = mag >= 6 ? 0xff5533 : mag >= 5.5 ? 0xff9944 : 0xffcc66
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 10),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        )
        mesh.scale.setScalar(r)
        const p = geoPosition(lat, lng, 0.025)
        mesh.position.set(p.x, p.y, p.z)
        mesh.userData = { mag, place }
        this.group.add(mesh)
        this.quakes.push({
          id: String(f.id ?? `${lat},${lng}`),
          lat,
          lng,
          mag,
          place,
          mesh,
        })
      }
      this.loaded = true
      this.group.visible = this.enabled
      console.info(`[earthquakes] 载入 ${this.quakes.length} 个事件（一周 M4.5+）`)
    } catch (err) {
      console.warn('[earthquakes] 加载失败', err)
    } finally {
      this.loading = false
    }
  }
}
