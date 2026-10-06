import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

interface WindSample {
  lat: number
  lng: number
  speed: number
  dir: number
  arrow: THREE.Mesh
}

/**
 * 全球风场示意：Open-Meteo 稀疏格点风速风向（需联网）。
 * 与「大气环流」示意粒子互斥，避免两套风叠在一起。
 */
export class WindFieldLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('windfield')!
  private group = new THREE.Group()
  private enabled = false
  private loaded = false
  private loading = false
  private samples: WindSample[] = []

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
    this.setEnabled(Boolean(state.layers.windfield))
  }

  dispose() {
    for (const s of this.samples) {
      s.arrow.geometry.dispose()
      ;(s.arrow.material as THREE.Material).dispose()
    }
    this.samples = []
    this.group.clear()
    this.group.removeFromParent()
  }

  private async load() {
    this.loading = true
    try {
      const pts: Array<{ lat: number; lng: number }> = []
      for (let lat = -60; lat <= 60; lat += 20) {
        for (let lng = -180; lng < 180; lng += 20) {
          pts.push({ lat, lng })
        }
      }

      // Open-Meteo 多点：分批，避免 URL 过长
      const batchSize = 40
      const all: WindSample[] = []
      for (let i = 0; i < pts.length; i += batchSize) {
        const batch = pts.slice(i, i + batchSize)
        const lats = batch.map((p) => p.lat).join(',')
        const lngs = batch.map((p) => p.lng).join(',')
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
          `&current=wind_speed_10m,wind_direction_10m`
        const res = await fetch(url, { mode: 'cors' })
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
        const raw = await res.json()
        const rows = Array.isArray(raw) ? raw : [raw]
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j] as {
            latitude?: number
            longitude?: number
            current?: { wind_speed_10m?: number; wind_direction_10m?: number }
          }
          const lat = row.latitude ?? batch[j]?.lat
          const lng = row.longitude ?? batch[j]?.lng
          const speed = row.current?.wind_speed_10m ?? 0
          const dir = row.current?.wind_direction_10m ?? 0
          if (lat == null || lng == null || speed < 3) continue
          const arrow = this.makeArrow(lat, lng, speed, dir)
          this.group.add(arrow)
          all.push({ lat, lng, speed, dir, arrow })
        }
      }
      this.samples = all
      this.loaded = true
      this.group.visible = this.enabled
      console.info(`[windfield] 载入 ${all.length} 个风向点`)
    } catch (err) {
      console.warn('[windfield] 加载失败', err)
    } finally {
      this.loading = false
    }
  }

  private makeArrow(lat: number, lng: number, speed: number, metDir: number): THREE.Mesh {
    // 气象风向：风的来向；箭头指向去向 = metDir + 180
    const toDeg = (metDir + 180) % 360
    const len = 2.2 + Math.min(8, speed) * 0.18
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, len, 6),
      new THREE.MeshBasicMaterial({
        color: speed > 40 ? 0xff7755 : speed > 20 ? 0x66d9ef : 0x7ad4ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    )
    const p = geoPosition(lat, lng, 0.03)
    mesh.position.set(p.x, p.y, p.z)

    // 锥体默认沿 +Y；先贴向向外法线，再绕法线转到风向
    const outward = new THREE.Vector3(p.x, p.y, p.z).normalize()
    const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward)
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
    east.normalize()
    const north = new THREE.Vector3().crossVectors(outward, east).normalize()
    const rad = (toDeg * Math.PI) / 180
    const tangent = north.clone().multiplyScalar(Math.cos(rad)).add(east.clone().multiplyScalar(Math.sin(rad)))
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize())
    return mesh
  }
}
