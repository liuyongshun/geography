import * as THREE from 'three'
import type { EnsoMode, GlobeContext, GlobeFrameState, GlobeLayer, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeLabelSprite, makeGeoLabelSprite } from '../labels'
import { makeGlobeTube } from '../gridLines'

interface ModeVisual {
  /** 暖池中心经度 */
  warmLng: number
  /** 暖池东西半宽（度） */
  warmHalf: number
  /** >0 信风自东向西；<0 西风异常 */
  trade: number
  westRain: number
  eastRain: number
  upwelling: number
  fish: number
  westLabel: string
  eastLabel: string
  warmLabel: string
}

const MODE: Record<EnsoMode, ModeVisual> = {
  normal: {
    warmLng: 155,
    warmHalf: 28,
    trade: 1,
    westRain: 1,
    eastRain: 0.08,
    upwelling: 0.9,
    fish: 1,
    westLabel: '印尼多雨',
    eastLabel: '秘鲁少雨·渔场旺',
    warmLabel: '西太平洋暖池',
  },
  elnino: {
    warmLng: -150,
    warmHalf: 38,
    trade: -0.45,
    westRain: 0.12,
    eastRain: 1,
    upwelling: 0.12,
    fish: 0.12,
    westLabel: '印尼干旱',
    eastLabel: '南美暴雨·渔场衰',
    warmLabel: '暖水东移',
  },
  lanina: {
    warmLng: 145,
    warmHalf: 24,
    trade: 1.4,
    westRain: 1,
    eastRain: 0,
    upwelling: 1,
    fish: 1.2,
    westLabel: '印尼更涝',
    eastLabel: '冷舌更强·渔场更旺',
    warmLabel: '暖池更西',
  },
}

interface TradeArrow {
  mesh: THREE.Mesh
  t: number
  speed: number
}

interface WalkerParticle {
  t: number
  lane: number
}

const _from = new THREE.Vector3()
const _to = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** 经度最短路径插值（跨日界线） */
function lerpLng(a: number, b: number, t: number) {
  let d = b - a
  while (d > 180) d -= 360
  while (d < -180) d += 360
  let out = a + d * t
  while (out > 180) out -= 360
  while (out < -180) out += 360
  return out
}

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * 赤道太平洋 ENSO / 沃克环流教学示意：
 * 暖池、信风箭头、沃克环流粒子、西雨东旱、秘鲁上升流与渔场。
 */
export class EnsoLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('enso')!
  private group = new THREE.Group()
  private warmGroup = new THREE.Group()
  private coldGroup = new THREE.Group()
  private tradeGroup = new THREE.Group()
  private walkerGroup = new THREE.Group()
  private arcGroup = new THREE.Group()
  private weatherGroup = new THREE.Group()
  private upGroup = new THREE.Group()
  private labelGroup = new THREE.Group()
  private enabled = false

  private warmMats: THREE.MeshBasicMaterial[] = []
  private warmMeshes: THREE.Mesh[] = []
  private coldMesh: THREE.Mesh | null = null
  private coldMat: THREE.MeshBasicMaterial | null = null

  private coneGeo: THREE.ConeGeometry | null = null
  private matTrade: THREE.MeshBasicMaterial | null = null
  private matTradeRev: THREE.MeshBasicMaterial | null = null
  private arrows: TradeArrow[] = []

  private walkerGeo: THREE.BufferGeometry | null = null
  private walkerPos: Float32Array | null = null
  private walkerColor: Float32Array | null = null
  private walkerLines: THREE.LineSegments | null = null
  private particles: WalkerParticle[] = []

  private upArrows: THREE.Mesh[] = []
  private matUp: THREE.MeshBasicMaterial | null = null
  private fishMeshes: THREE.Mesh[] = []
  private matFish: THREE.MeshBasicMaterial | null = null

  private labels: THREE.Sprite[] = []
  private rainSprites: THREE.Sprite[] = []

  private fromVis: ModeVisual = { ...MODE.normal }
  private toVis: ModeVisual = { ...MODE.normal }
  private morphT = 1
  private lastMode: EnsoMode = 'normal'
  private vis: ModeVisual = { ...MODE.normal }
  private clip: THREE.Plane[] = []

  mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    this.clip = ctx.clipPlane ? [ctx.clipPlane] : []
    this.group.add(this.warmGroup)
    this.group.add(this.coldGroup)
    this.group.add(this.tradeGroup)
    this.group.add(this.walkerGroup)
    this.group.add(this.arcGroup)
    this.group.add(this.weatherGroup)
    this.group.add(this.upGroup)
    this.group.add(this.labelGroup)

    this.buildWarmPool()
    this.buildColdTongue()
    this.buildTradeArrows()
    this.buildWalker()
    this.buildUpwelling()
    this.buildFish()
    this.rebuildLabels()
    this.rebuildWeather()

    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.enso && this.enabled
    const mode = state.ensoMode ?? 'normal'
    if (mode !== this.lastMode) {
      this.fromVis = { ...this.vis }
      this.toVis = { ...MODE[mode] }
      this.morphT = 0
      this.lastMode = mode
    }
  }

  tick(dt: number, state: GlobeFrameState) {
    if (!state.layers.enso) return

    if (this.morphT < 1) {
      this.morphT = Math.min(1, this.morphT + dt / 1.25)
      this.vis = blendVis(this.fromVis, this.toVis, ease(this.morphT))
      if (this.morphT >= 1) {
        this.vis = { ...this.toVis }
        this.rebuildLabels()
        this.rebuildWeather()
      }
    }

    this.placeWarmPool()
    this.placeColdTongue()
    this.tickTrade(dt)
    this.tickWalker()
    this.placeUpwelling()
    this.placeFish()
  }

  dispose() {
    this.clearLabels()
    this.clearWeather()
    this.clearArcs()
    for (const m of this.warmMats) m.dispose()
    this.warmMats = []
    // 暖池共用同一 geometry
    this.warmMeshes[0]?.geometry.dispose()
    this.warmMeshes = []
    this.coldMat?.dispose()
    this.coldMesh?.geometry.dispose()
    this.coneGeo?.dispose()
    this.matTrade?.dispose()
    this.matTradeRev?.dispose()
    this.matUp?.dispose()
    this.matFish?.dispose()
    this.fishMeshes[0]?.geometry.dispose()
    this.walkerGeo?.dispose()
    if (this.walkerLines) (this.walkerLines.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }

  private buildWarmPool() {
    const geo = new THREE.SphereGeometry(7.5, 16, 12)
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe07a5f,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        clippingPlanes: this.clip,
      })
      this.warmMats.push(mat)
      const mesh = new THREE.Mesh(geo, mat)
      this.warmMeshes.push(mesh)
      this.warmGroup.add(mesh)
    }
  }

  private buildColdTongue() {
    const geo = new THREE.SphereGeometry(6.2, 14, 10)
    this.coldMat = new THREE.MeshBasicMaterial({
      color: 0x3a8ec0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clippingPlanes: this.clip,
    })
    this.coldMesh = new THREE.Mesh(geo, this.coldMat)
    this.coldGroup.add(this.coldMesh)
  }

  private buildTradeArrows() {
    this.coneGeo = new THREE.ConeGeometry(1.1, 3.2, 7)
    this.coneGeo.translate(0, 1.6, 0)
    this.matTrade = new THREE.MeshBasicMaterial({
      color: 0xc5d4e4,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      clippingPlanes: this.clip,
    })
    this.matTradeRev = new THREE.MeshBasicMaterial({
      color: 0xe07a5f,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      clippingPlanes: this.clip,
    })
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.coneGeo, this.matTrade)
      this.tradeGroup.add(mesh)
      this.arrows.push({ mesh, t: i / 10, speed: 0.08 + (i % 3) * 0.012 })
    }
  }

  private buildWalker() {
    const n = 36
    const trail = 8
    const seg = n * (trail - 1)
    this.walkerPos = new Float32Array(seg * 2 * 3)
    this.walkerColor = new Float32Array(seg * 2 * 3)
    this.walkerGeo = new THREE.BufferGeometry()
    this.walkerGeo.setAttribute('position', new THREE.BufferAttribute(this.walkerPos, 3))
    this.walkerGeo.setAttribute('color', new THREE.BufferAttribute(this.walkerColor, 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.walkerLines = new THREE.LineSegments(this.walkerGeo, mat)
    this.walkerGroup.add(this.walkerLines)
    this.particles = []
    for (let i = 0; i < n; i++) {
      this.particles.push({ t: i / n, lane: (i % 5) - 2 })
    }
  }

  private buildUpwelling() {
    this.matUp = new THREE.MeshBasicMaterial({
      color: 0x6ed0a0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      clippingPlanes: this.clip,
    })
    const geo = this.coneGeo ?? new THREE.ConeGeometry(1.0, 2.8, 7)
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(geo, this.matUp)
      this.upGroup.add(mesh)
      this.upArrows.push(mesh)
    }
  }

  private buildFish() {
    this.matFish = new THREE.MeshBasicMaterial({
      color: 0x7fd4a0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      clippingPlanes: this.clip,
    })
    const geo = new THREE.SphereGeometry(1.35, 8, 6)
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(geo, this.matFish)
      this.upGroup.add(mesh)
      this.fishMeshes.push(mesh)
    }
  }

  private placeWarmPool() {
    const { warmLng, warmHalf } = this.vis
    const n = this.warmMeshes.length
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1)
      const lng = lerpLng(warmLng - warmHalf, warmLng + warmHalf, u)
      const lat = Math.sin(u * Math.PI * 2 + warmLng * 0.01) * 4
      const p = geoPosition(lat, lng, 0.035)
      const mesh = this.warmMeshes[i]!
      mesh.position.set(p.x, p.y, p.z)
      const scale = 0.75 + Math.sin(u * Math.PI) * 0.55
      mesh.scale.setScalar(scale)
      const mat = this.warmMats[i]!
      mat.opacity = 0.14 + Math.sin(u * Math.PI) * 0.18
    }
  }

  private placeColdTongue() {
    if (!this.coldMesh || !this.coldMat) return
    // 东太平洋冷舌：厄尔尼诺时减弱
    const strength = Math.max(0, Math.min(1, (this.vis.upwelling - 0.1) / 0.9))
    this.coldMesh.visible = strength > 0.15
    this.coldMat.opacity = 0.12 + strength * 0.28
    const p = geoPosition(-6, -95, 0.03)
    this.coldMesh.position.set(p.x, p.y, p.z)
    this.coldMesh.scale.setScalar(0.9 + strength * 0.7)
  }

  private tickTrade(dt: number) {
    const trade = this.vis.trade
    const westbound = trade >= 0
    const speedMul = 0.55 + Math.abs(trade) * 0.7
    // 信风路径：东太平洋 → 西太平洋（经度从 -90 到 160，向西递减）
    const lngEast = -85
    const lngWest = 160

    for (const a of this.arrows) {
      a.t = (a.t + dt * a.speed * speedMul) % 1
      // 信风：东→西（u 增大）；西风异常：西→东（u 减小）
      const u = westbound ? a.t : 1 - a.t
      const u2 = westbound ? Math.min(1, u + 0.035) : Math.max(0, u - 0.035)
      const lng = lerpLng(lngEast, lngWest, u)
      const lng2 = lerpLng(lngEast, lngWest, u2)
      const lat = 6 + Math.sin(a.t * Math.PI * 2) * 2.5
      const p0 = geoPosition(lat, lng, 0.055)
      const p1 = geoPosition(lat, lng2, 0.055)
      _from.set(p0.x, p0.y, p0.z)
      _to.set(p1.x, p1.y, p1.z)
      _dir.copy(_to).sub(_from)
      if (_dir.lengthSq() < 1e-10) continue
      _dir.normalize()
      a.mesh.quaternion.setFromUnitVectors(_up, _dir)
      a.mesh.position.copy(_from)
      a.mesh.material = westbound ? this.matTrade! : this.matTradeRev!
      a.mesh.visible = Math.abs(trade) > 0.08
      a.mesh.scale.setScalar(0.85 + Math.min(1.3, Math.abs(trade)) * 0.35)
    }
  }

  private walkerSample(t: number, lane: number): { lat: number; lng: number; alt: number } {
    const riseLng = this.vis.warmLng
    // 下沉支：正常年在东；厄尔尼诺时靠近西（环流减弱/位移）
    const sinkLng = this.vis.trade < 0 ? lerpLng(riseLng, -90, 0.35) : -85
    const lat = lane * 1.8
    const u = ((t % 1) + 1) % 1
    if (u < 0.22) {
      // 上升
      const k = u / 0.22
      return { lat, lng: riseLng, alt: lerp(0.04, 0.22, k) }
    }
    if (u < 0.5) {
      // 高空到下沉支
      const k = (u - 0.22) / 0.28
      return { lat, lng: lerpLng(riseLng, sinkLng, k), alt: 0.22 }
    }
    if (u < 0.72) {
      // 下沉
      const k = (u - 0.5) / 0.22
      return { lat, lng: sinkLng, alt: lerp(0.22, 0.04, k) }
    }
    // 海表回流
    const k = (u - 0.72) / 0.28
    return { lat, lng: lerpLng(sinkLng, riseLng, k), alt: 0.04 }
  }

  private tickWalker() {
    if (!this.walkerPos || !this.walkerColor || !this.walkerGeo) return
    const trail = 8
    const trailStep = 0.02
    const hist = new Float32Array(this.particles.length * trail * 3)

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!
      p.t = (p.t + 0.0032 * (0.7 + Math.abs(this.vis.trade) * 0.4)) % 1
      for (let s = 0; s < trail; s++) {
        const sample = this.walkerSample((p.t - s * trailStep + 1) % 1, p.lane)
        const pos = geoPosition(sample.lat, sample.lng, sample.alt)
        const o = i * trail * 3 + s * 3
        hist[o] = pos.x
        hist[o + 1] = pos.y
        hist[o + 2] = pos.z
      }
      for (let s = 0; s < trail - 1; s++) {
        const seg = i * (trail - 1) + s
        const a = i * trail * 3 + s * 3
        const b = a + 3
        const vi = seg * 6
        this.walkerPos[vi] = hist[a]!
        this.walkerPos[vi + 1] = hist[a + 1]!
        this.walkerPos[vi + 2] = hist[a + 2]!
        this.walkerPos[vi + 3] = hist[b]!
        this.walkerPos[vi + 4] = hist[b + 1]!
        this.walkerPos[vi + 5] = hist[b + 2]!
        const fade = 1 - s / (trail - 1)
        // 上升偏金，高空偏蓝，下沉偏灰
        const phase = ((p.t - s * trailStep + 1) % 1)
        const rising = phase < 0.22
        const sinking = phase >= 0.5 && phase < 0.72
        const r = rising ? 0.94 : sinking ? 0.55 : 0.55
        const g = rising ? 0.82 : sinking ? 0.62 : 0.78
        const bcol = rising ? 0.47 : sinking ? 0.7 : 0.92
        this.walkerColor[vi] = r * fade
        this.walkerColor[vi + 1] = g * fade
        this.walkerColor[vi + 2] = bcol * fade
        this.walkerColor[vi + 3] = r * fade * 0.85
        this.walkerColor[vi + 4] = g * fade * 0.85
        this.walkerColor[vi + 5] = bcol * fade * 0.85
      }
    }
    this.walkerGeo.attributes.position.needsUpdate = true
    this.walkerGeo.attributes.color.needsUpdate = true
  }

  private placeUpwelling() {
    const s = this.vis.upwelling
    const baseLng = -80
    const baseLat = -12
    for (let i = 0; i < this.upArrows.length; i++) {
      const mesh = this.upArrows[i]!
      const lng = baseLng - 4 + i * 2.2
      const lat = baseLat + (i % 2) * 2
      const alt0 = 0.02
      const alt1 = 0.02 + 0.06 * s
      const p0 = geoPosition(lat, lng, alt0)
      const p1 = geoPosition(lat, lng, alt1)
      _from.set(p0.x, p0.y, p0.z)
      _to.set(p1.x, p1.y, p1.z)
      _dir.copy(_to).sub(_from)
      if (_dir.lengthSq() < 1e-10) {
        mesh.visible = false
        continue
      }
      _dir.normalize()
      mesh.quaternion.setFromUnitVectors(_up, _dir)
      mesh.position.copy(_to)
      mesh.visible = s > 0.18
      mesh.scale.setScalar(0.7 + s * 0.6)
      if (this.matUp) this.matUp.opacity = 0.25 + s * 0.65
    }
  }

  private placeFish() {
    const s = this.vis.fish
    const nShow = s > 0.85 ? 8 : s > 0.4 ? 5 : s > 0.15 ? 2 : 0
    for (let i = 0; i < this.fishMeshes.length; i++) {
      const mesh = this.fishMeshes[i]!
      if (i >= nShow) {
        mesh.visible = false
        continue
      }
      const lng = -82 - (i % 4) * 2.5
      const lat = -10 - Math.floor(i / 4) * 3 + Math.sin(i) * 1.2
      const p = geoPosition(lat, lng, 0.028)
      mesh.position.set(p.x, p.y, p.z)
      mesh.visible = true
      mesh.scale.setScalar(0.8 + s * 0.35)
    }
    if (this.matFish) this.matFish.opacity = 0.35 + Math.min(1, s) * 0.55
  }

  private clearLabels() {
    for (const s of this.labels) {
      this.labelGroup.remove(s)
      disposeLabelSprite(s)
    }
    this.labels = []
  }

  private clearWeather() {
    for (const s of this.rainSprites) {
      this.weatherGroup.remove(s)
      disposeLabelSprite(s)
    }
    this.rainSprites = []
  }

  private rebuildLabels() {
    this.clearLabels()
    const v = this.vis
    const specs: { text: string; lat: number; lng: number; kind: 'anno' | 'zone' }[] = [
      { text: v.warmLabel, lat: 8, lng: v.warmLng, kind: 'zone' },
      { text: v.trade < 0 ? '西风异常→' : '信风←', lat: 14, lng: -140, kind: 'anno' },
      { text: '沃克环流', lat: 22, lng: lerpLng(v.warmLng, -90, 0.45), kind: 'anno' },
      { text: v.westLabel, lat: -2, lng: 125, kind: 'zone' },
      { text: v.eastLabel, lat: -8, lng: -78, kind: 'zone' },
      { text: v.upwelling < 0.3 ? '上升流弱' : '冷水上升流', lat: -16, lng: -82, kind: 'anno' },
    ]
    for (const sp of specs) {
      const sprite = makeGeoLabelSprite(sp.text, sp.kind)
      const p = geoPosition(sp.lat, sp.lng, 0.08)
      sprite.position.set(p.x, p.y, p.z)
      this.labelGroup.add(sprite)
      this.labels.push(sprite)
    }

    this.clearArcs()
    const risePts: THREE.Vector3[] = []
    for (let i = 0; i <= 8; i++) {
      const k = i / 8
      const p = geoPosition(2, v.warmLng, lerp(0.04, 0.2, k))
      risePts.push(new THREE.Vector3(p.x, p.y, p.z))
    }
    this.arcGroup.add(makeGlobeTube(risePts, 0.35, 0xf0d078, 0.75, this.clip))
  }

  private clearArcs() {
    while (this.arcGroup.children.length) {
      const c = this.arcGroup.children[0]!
      this.arcGroup.remove(c)
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose()
        ;(c.material as THREE.Material).dispose()
      }
    }
  }

  private rebuildWeather() {
    this.clearWeather()
    const v = this.vis
    if (v.westRain > 0.35) {
      const rain = makeGeoLabelSprite('多雨湿热', 'anno')
      const p = geoPosition(4, 130, 0.12)
      rain.position.set(p.x, p.y, p.z)
      this.weatherGroup.add(rain)
      this.rainSprites.push(rain)
    } else if (v.westRain < 0.28) {
      const dry = makeGeoLabelSprite('干旱少雨', 'zone')
      const p = geoPosition(4, 130, 0.12)
      dry.position.set(p.x, p.y, p.z)
      this.weatherGroup.add(dry)
      this.rainSprites.push(dry)
    }
    if (v.eastRain > 0.35) {
      const wet = makeGeoLabelSprite('暴雨洪涝', 'zone')
      const p = geoPosition(0, -85, 0.12)
      wet.position.set(p.x, p.y, p.z)
      this.weatherGroup.add(wet)
      this.rainSprites.push(wet)
    }
  }
}

function blendVis(a: ModeVisual, b: ModeVisual, t: number): ModeVisual {
  const meta = t < 0.45 ? a : b
  return {
    warmLng: lerpLng(a.warmLng, b.warmLng, t),
    warmHalf: lerp(a.warmHalf, b.warmHalf, t),
    trade: lerp(a.trade, b.trade, t),
    westRain: lerp(a.westRain, b.westRain, t),
    eastRain: lerp(a.eastRain, b.eastRain, t),
    upwelling: lerp(a.upwelling, b.upwelling, t),
    fish: lerp(a.fish, b.fish, t),
    westLabel: meta.westLabel,
    eastLabel: meta.eastLabel,
    warmLabel: meta.warmLabel,
  }
}
