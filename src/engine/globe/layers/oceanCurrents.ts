import * as THREE from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeLabelSprite, makeGeoLabelSprite } from '../labels'
import { makeGlobeTube } from '../gridLines'

type CurrentKind = 'warm' | 'cold'

interface CurrentDef {
  id: string
  nameZh: string
  kind: CurrentKind
  coords: number[][]
}

interface FlowArrow {
  mesh: THREE.Mesh
  currentIdx: number
  /** 路径参数 0～1 */
  t: number
  speed: number
}

const ARROWS_PER = 5
const ALT = 0.028
const COLOR_WARM = 0xff9a4a
const COLOR_COLD = 0x5ed4ff

/** 课上优先识记的洋流，其余只画路径 */
const LABEL_IDS = new Set([
  'kuroshio',
  'gulf-stream',
  'peru',
  'california',
  'canary',
  'benguela',
  'e-australia',
  'w-australia',
  'antarctic-circ',
  'brazil',
  'agulhas',
  'n-eq-pac',
])

function unwrapLng(coords: number[][]): number[][] {
  if (coords.length < 2) return coords
  const out: number[][] = [[coords[0][0], coords[0][1]]]
  for (let i = 1; i < coords.length; i++) {
    let lng = coords[i][0]
    const prev = out[i - 1][0]
    while (lng - prev > 180) lng -= 360
    while (lng - prev < -180) lng += 360
    out.push([lng, coords[i][1]])
  }
  return out
}

function samplePath(coords: number[][], t: number): { lat: number; lng: number } {
  const n = coords.length
  if (n === 1) return { lng: coords[0][0], lat: coords[0][1] }
  const u = ((t % 1) + 1) % 1
  const f = u * (n - 1)
  const i = Math.min(n - 2, Math.floor(f))
  const a = f - i
  const [lng0, lat0] = coords[i]
  const [lng1, lat1] = coords[i + 1]
  return { lng: lng0 + (lng1 - lng0) * a, lat: lat0 + (lat1 - lat0) * a }
}

function pathVectors(coords: number[][], relAlt: number): THREE.Vector3[] {
  return coords.map(([lng, lat]) => {
    const p = geoPosition(lat, lng, relAlt)
    return new THREE.Vector3(p.x, p.y, p.z)
  })
}

const _from = new THREE.Vector3()
const _to = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function placeArrow(mesh: THREE.Mesh, path: number[][], t: number) {
  const a = samplePath(path, t)
  const b = samplePath(path, Math.min(0.999, t + 0.018))
  const pa = geoPosition(a.lat, a.lng, ALT)
  const pb = geoPosition(b.lat, b.lng, ALT)
  _from.set(pa.x, pa.y, pa.z)
  _to.set(pb.x, pb.y, pb.z)
  _dir.copy(_to).sub(_from)
  if (_dir.lengthSq() < 1e-10) return
  _dir.normalize()
  mesh.quaternion.setFromUnitVectors(_up, _dir)
  mesh.position.copy(_to)
}

/** 世界洋流示意：细路径导轨 + 沿流向行进的箭头 */
export class OceanCurrentsLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('oceanCurrents')!
  private group = new THREE.Group()
  private pathGroup = new THREE.Group()
  private arrowGroup = new THREE.Group()
  private labelGroup = new THREE.Group()
  private currents: CurrentDef[] = []
  private unwrapped: number[][][] = []
  private arrows: FlowArrow[] = []
  private coneGeo: THREE.ConeGeometry | null = null
  private matWarm: THREE.MeshBasicMaterial | null = null
  private matCold: THREE.MeshBasicMaterial | null = null
  private enabled = false
  private ready = false
  private clip: THREE.Plane[] = []

  async mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    this.group.add(this.pathGroup)
    this.group.add(this.arrowGroup)
    this.group.add(this.labelGroup)
    this.clip = ctx.clipPlane ? [ctx.clipPlane] : []

    const res = await fetch('/geo/ocean-currents-teach.json')
    if (!res.ok) throw new Error(`ocean currents pack HTTP ${res.status}`)
    const pack = (await res.json()) as { currents: CurrentDef[]; disclaimer?: string }

    this.currents = pack.currents
    this.unwrapped = this.currents.map((c) => unwrapLng(c.coords))

    this.coneGeo = new THREE.ConeGeometry(1.15, 3.4, 8)
    this.matWarm = new THREE.MeshBasicMaterial({
      color: COLOR_WARM,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      clippingPlanes: this.clip,
    })
    this.matCold = new THREE.MeshBasicMaterial({
      color: COLOR_COLD,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      clippingPlanes: this.clip,
    })

    for (let ci = 0; ci < this.currents.length; ci++) {
      const c = this.currents[ci]
      const path = this.unwrapped[ci]
      if (path.length < 2) continue

      const warm = c.kind === 'warm'
      const pts = pathVectors(path, ALT * 0.75)
      // 细导轨，避免盖住箭头
      this.pathGroup.add(
        makeGlobeTube(pts, 0.18, warm ? COLOR_WARM : COLOR_COLD, 0.42, this.clip),
      )

      if (LABEL_IDS.has(c.id)) {
        const mid = samplePath(path, 0.45)
        const spr = makeGeoLabelSprite(c.nameZh, 'anno')
        const p = geoPosition(mid.lat, mid.lng, 0.06)
        spr.position.set(p.x, p.y, p.z)
        spr.scale.multiplyScalar(0.9)
        this.labelGroup.add(spr)
      }

      const mat = warm ? this.matWarm! : this.matCold!
      for (let k = 0; k < ARROWS_PER; k++) {
        const mesh = new THREE.Mesh(this.coneGeo, mat)
        mesh.renderOrder = 4
        this.arrowGroup.add(mesh)
        const t = (k + 0.15) / ARROWS_PER
        const arrow: FlowArrow = {
          mesh,
          currentIdx: ci,
          t,
          speed: 0.085 + (k % 3) * 0.012,
        }
        placeArrow(mesh, path, t)
        this.arrows.push(arrow)
      }
    }

    this.ready = true
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on && this.ready
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.oceanCurrents && this.ready
  }

  tick(dt: number, state: GlobeFrameState) {
    if (!state.layers.oceanCurrents || !this.ready) return
    const step = Math.min(dt, 0.05)

    for (const arrow of this.arrows) {
      const path = this.unwrapped[arrow.currentIdx]
      arrow.t = (arrow.t + arrow.speed * step) % 1
      placeArrow(arrow.mesh, path, arrow.t)
      // 轻微呼吸，强化“流动”
      const pulse = 0.82 + 0.18 * Math.sin(arrow.t * Math.PI * 2)
      arrow.mesh.scale.setScalar(pulse)
    }
  }

  dispose() {
    for (const c of this.pathGroup.children) {
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.pathGroup.clear()
    this.arrowGroup.clear()
    this.arrows = []
    this.coneGeo?.dispose()
    this.coneGeo = null
    this.matWarm?.dispose()
    this.matCold?.dispose()
    this.matWarm = null
    this.matCold = null
    for (const spr of this.labelGroup.children) {
      disposeLabelSprite(spr as THREE.Sprite)
    }
    this.labelGroup.clear()
    this.group.clear()
    this.group.removeFromParent()
    this.currents = []
    this.ready = false
  }
}
