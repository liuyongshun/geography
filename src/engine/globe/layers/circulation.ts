import * as THREE from 'three'
import { subsolarLatitude } from '@/engine/atmosphere'
import { GLOBE_R, type GlobeContext, type GlobeFrameState, type GlobeLayer, type LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

interface Particle {
  cell: 'hadley' | 'ferrel' | 'polar'
  hemi: 1 | -1
  t: number
  lon: number
}

const PARTICLE_COUNT = 140
const TRAIL_LEN = 10

/** 三圈环流粒子轨迹 */
export class CirculationLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('circulation')!
  private group = new THREE.Group()
  private trailGeo: THREE.BufferGeometry
  private trailPos: Float32Array
  private trailColor: Float32Array
  private trailHist: Float32Array
  private particles: Particle[] = []
  private trails: THREE.LineSegments
  private continent: THREE.Mesh
  private enabled = true

  constructor() {
    const segCount = PARTICLE_COUNT * (TRAIL_LEN - 1)
    this.trailPos = new Float32Array(segCount * 2 * 3)
    this.trailColor = new Float32Array(segCount * 2 * 3)
    this.trailHist = new Float32Array(PARTICLE_COUNT * TRAIL_LEN * 3)
    this.trailGeo = new THREE.BufferGeometry()
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3))
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailColor, 3))
    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.trails = new THREE.LineSegments(this.trailGeo, trailMat)

    this.continent = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R * 1.012, 32, 16, 0, Math.PI * 0.55, 0.55, 0.7),
      new THREE.MeshPhongMaterial({ color: 0x3a506b }),
    )
    this.continent.visible = false
  }

  mount(ctx: GlobeContext) {
    this.group.add(this.trails)
    this.group.add(this.continent)
    ctx.overlayRoot.add(this.group)
    this.seedParticles(PARTICLE_COUNT)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.circulation
    const summer = state.landSea && state.month >= 5 && state.month <= 8
    ;(this.continent.material as THREE.MeshPhongMaterial).color.set(summer ? 0xf0a202 : 0x3a506b)
    this.continent.visible = state.layers.circulation && state.landSea
  }

  tick(_dt: number, state: GlobeFrameState) {
    if (!state.layers.circulation) return
    const speed = 0.0022
    const trailStep = 0.018

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      p.t = (p.t + speed) % 1
      const sign = this.verticalSign(p, state)

      for (let s = 0; s < TRAIL_LEN; s++) {
        const sample = { ...p, t: (p.t - s * trailStep + 1) % 1 }
        const { lat, alt, lon } = this.particleLatAlt(sample, state)
        const pos = geoPosition(lat, lon, alt)
        const o = i * TRAIL_LEN * 3 + s * 3
        this.trailHist[o] = pos.x
        this.trailHist[o + 1] = pos.y
        this.trailHist[o + 2] = pos.z
      }

      const histBase = i * TRAIL_LEN * 3
      for (let s = 0; s < TRAIL_LEN - 1; s++) {
        const seg = i * (TRAIL_LEN - 1) + s
        const a = histBase + s * 3
        const b = histBase + (s + 1) * 3
        const vi = seg * 6
        this.trailPos[vi] = this.trailHist[a]
        this.trailPos[vi + 1] = this.trailHist[a + 1]
        this.trailPos[vi + 2] = this.trailHist[a + 2]
        this.trailPos[vi + 3] = this.trailHist[b]
        this.trailPos[vi + 4] = this.trailHist[b + 1]
        this.trailPos[vi + 5] = this.trailHist[b + 2]
        this.writeTint(this.trailColor, vi, sign, 1 - s / (TRAIL_LEN - 1))
        this.writeTint(this.trailColor, vi + 3, sign, 1 - (s + 1) / (TRAIL_LEN - 1))
      }
    }

    this.trailGeo.attributes.position.needsUpdate = true
    this.trailGeo.attributes.color.needsUpdate = true
  }

  dispose() {
    this.trailGeo.dispose()
    ;(this.trails.material as THREE.Material).dispose()
    this.continent.geometry.dispose()
    ;(this.continent.material as THREE.Material).dispose()
    this.group.removeFromParent()
    this.particles = []
  }

  private seedParticles(n: number) {
    const cells: Particle['cell'][] = ['hadley', 'hadley', 'ferrel', 'polar']
    for (let i = 0; i < n; i++) {
      this.particles.push({
        cell: cells[i % cells.length],
        hemi: i % 2 === 0 ? 1 : -1,
        t: Math.random(),
        lon: Math.random() * 360 - 180,
      })
    }
  }

  private particleLatAlt(
    p: Particle,
    state: GlobeFrameState,
  ): { lat: number; alt: number; lon: number } {
    const shift = subsolarLatitude(state.month, state.axialTilt) * 0.65
    const t = p.t
    let lat = 0
    let alt = 0.02
    if (p.cell === 'hadley') {
      const inner = 0 + shift * p.hemi
      const outer = 30 * p.hemi + shift
      if (t < 0.25) {
        lat = inner
        alt = 0.02 + (t / 0.25) * 0.22
      } else if (t < 0.5) {
        const u = (t - 0.25) / 0.25
        lat = inner + (outer - inner) * u
        alt = 0.24
      } else if (t < 0.75) {
        lat = outer
        alt = 0.24 - ((t - 0.5) / 0.25) * 0.22
      } else {
        const u = (t - 0.75) / 0.25
        lat = outer + (inner - outer) * u
        alt = 0.02
      }
    } else if (p.cell === 'ferrel') {
      const a = 30 * p.hemi + shift
      const b = 60 * p.hemi + shift
      if (t < 0.5) {
        lat = a + (b - a) * (t / 0.5)
        alt = 0.04 + Math.sin(t * Math.PI) * 0.08
      } else {
        lat = b + (a - b) * ((t - 0.5) / 0.5)
        alt = 0.12
      }
    } else {
      const a = 60 * p.hemi + shift
      const b = 88 * p.hemi
      if (t < 0.5) {
        lat = a + (b - a) * (t / 0.5)
        alt = 0.16 - (t / 0.5) * 0.12
      } else {
        lat = b + (a - b) * ((t - 0.5) / 0.5)
        alt = 0.04 + ((t - 0.5) / 0.5) * 0.12
      }
    }
    let lon = p.lon
    if (state.coriolis && p.cell === 'hadley' && t > 0.75) lon += p.hemi * 18
    else if (state.coriolis && p.cell === 'ferrel') lon -= p.hemi * 12
    else if (state.coriolis && p.cell === 'polar') lon += p.hemi * 10
    return { lat, alt, lon }
  }

  private verticalSign(p: Particle, state: GlobeFrameState): number {
    const a0 = this.particleLatAlt(p, state).alt
    const a1 = this.particleLatAlt({ ...p, t: (p.t + 0.01) % 1 }, state).alt
    const d = a1 - a0
    if (Math.abs(d) < 0.0008) return 0
    return d > 0 ? 1 : -1
  }

  private writeTint(out: Float32Array, offset: number, sign: number, fade: number) {
    const k = 0.45 + fade * 0.7
    if (sign > 0) {
      out[offset] = Math.min(1, 0.941 * k)
      out[offset + 1] = Math.min(1, 0.635 * k)
      out[offset + 2] = Math.min(1, 0.008 * k)
    } else if (sign < 0) {
      out[offset] = Math.min(1, 0.357 * k)
      out[offset + 1] = Math.min(1, 0.753 * k)
      out[offset + 2] = Math.min(1, 0.745 * k)
    } else {
      out[offset] = Math.min(1, 0.435 * k)
      out[offset + 1] = Math.min(1, 1.0 * k)
      out[offset + 2] = Math.min(1, 0.914 * k)
    }
  }
}
