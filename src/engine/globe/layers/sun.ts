import * as THREE from 'three'
import { subsolarLatitude } from '@/engine/atmosphere'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { makeGeoLabelSprite } from '../labels'
import { makeSunBillboard } from '@/engine/sunVisual'

const SUBSOLAR_LNG = 0

/**
 * 太阳直射：SDO/HMI 日面（去黑底、朝向相机）+ 地表直射点。
 */
export class SunLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('sun')!
  private group = new THREE.Group()
  private sun: ReturnType<typeof makeSunBillboard>
  private spot: THREE.Mesh
  private ring: THREE.Mesh
  private label: THREE.Sprite
  private enabled = true
  private camera: THREE.Camera | null = null

  constructor() {
    this.sun = makeSunBillboard(7.2)

    this.spot = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfff6c8,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    )

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )

    this.label = makeGeoLabelSprite('直射点', 'city')
    this.group.add(this.sun.group, this.spot, this.ring, this.label)
  }

  mount(ctx: GlobeContext) {
    this.camera = ctx.camera
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.sun
    if (!state.layers.sun) return

    const lat = subsolarLatitude(state.month, state.axialTilt)
    const onSurf = geoPosition(lat, SUBSOLAR_LNG, 0.018)
    const inSpace = geoPosition(lat, SUBSOLAR_LNG, 0.85)
    const dir = new THREE.Vector3(onSurf.x, onSurf.y, onSurf.z).normalize()

    this.spot.position.set(onSurf.x, onSurf.y, onSurf.z)
    this.ring.position.copy(this.spot.position)
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
    this.sun.group.position.set(inSpace.x, inSpace.y, inSpace.z)
    if (this.camera) this.sun.lookAt(this.camera)

    const lab = geoPosition(lat, SUBSOLAR_LNG, 0.06)
    this.label.position.set(lab.x, lab.y, lab.z)
  }

  tick(_dt: number, state: GlobeFrameState) {
    if (state.layers.sun) this.update(state)
  }

  dispose() {
    this.sun.dispose()
    for (const m of [this.spot, this.ring]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    const lm = this.label.material as THREE.SpriteMaterial
    lm.map?.dispose()
    lm.dispose()
    this.group.removeFromParent()
    this.camera = null
  }
}
