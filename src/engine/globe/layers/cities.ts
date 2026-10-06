import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, GlobePick, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { makeGeoLabelSprite } from '../labels'
import { GLOBE_R } from '../types'

interface TeachCity {
  id: string
  nameZh: string
  lat: number
  lng: number
  tier: 1 | 2 | 3
  country: string
}

/**
 * 主要城市注记：可独立插拔；可点击查询 Open-Meteo 天气。
 */
export class CitiesLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('cities')!
  private ctx: GlobeContext | null = null
  private root = new THREE.Group()
  private hitRoot = new THREE.Group()
  private items: {
    sprite: THREE.Sprite
    hit: THREE.Mesh
    tier: 1 | 2 | 3
    pos: THREE.Vector3
    city: TeachCity
  }[] = []
  private enabled = false

  async mount(ctx: GlobeContext) {
    this.ctx = ctx
    ctx.overlayRoot.add(this.root)
    ctx.overlayRoot.add(this.hitRoot)
    const res = await fetch('/geo/cities-teach.json')
    if (!res.ok) throw new Error(`cities pack HTTP ${res.status}`)
    const pack = (await res.json()) as { cities: TeachCity[] }

    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })

    for (const c of pack.cities) {
      const p = geoPosition(c.lat, c.lng, 0.015)
      const sprite = makeGeoLabelSprite(c.nameZh, 'city')
      sprite.position.set(p.x, p.y, p.z)
      this.root.add(sprite)

      const hit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), hitMat.clone())
      hit.position.set(p.x, p.y, p.z)
      hit.userData.city = c
      this.hitRoot.add(hit)

      this.items.push({
        sprite,
        hit,
        tier: c.tier,
        pos: new THREE.Vector3(p.x, p.y, p.z),
        city: c,
      })
    }
    this.root.visible = this.enabled
    this.hitRoot.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.root.visible = on
    this.hitRoot.visible = on
  }

  update(state: GlobeFrameState) {
    this.enabled = state.layers.cities
    this.root.visible = this.enabled
    this.hitRoot.visible = this.enabled
  }

  tick(_dt: number, _state: GlobeFrameState) {
    if (!this.enabled || !this.ctx) return
    const cam = this.ctx.camera.position
    const dist = cam.length()
    const showTier2 = dist < GLOBE_R * 3.1
    const showTier3 = dist < GLOBE_R * 2.45
    const camDir = cam.clone().normalize()

    for (const item of this.items) {
      const facing = item.pos.clone().normalize().dot(camDir) > 0.18
      const tierOk =
        item.tier === 1 || (item.tier === 2 && showTier2) || (item.tier === 3 && showTier3)
      const vis = facing && tierOk
      item.sprite.visible = vis
      item.hit.visible = vis
    }
  }

  pick(raycaster: THREE.Raycaster): GlobePick | null {
    if (!this.enabled) return null
    const hits = raycaster.intersectObjects(this.hitRoot.children, false)
    const c = hits[0]?.object.userData.city as TeachCity | undefined
    if (!c) return null
    return { kind: 'city', id: c.id, nameZh: c.nameZh, lat: c.lat, lng: c.lng }
  }

  dispose() {
    for (const item of this.items) {
      const m = item.sprite.material as THREE.SpriteMaterial
      m.map?.dispose()
      m.dispose()
      item.hit.geometry.dispose()
      ;(item.hit.material as THREE.Material).dispose()
    }
    this.items = []
    this.root.clear()
    this.hitRoot.clear()
    this.root.removeFromParent()
    this.hitRoot.removeFromParent()
    this.ctx = null
  }
}
