import * as THREE from 'three'
import { PRESSURE_BELTS, WIND_BELTS, shiftedLat, subsolarLatitude } from '@/engine/atmosphere'
import { type GlobeContext, type GlobeFrameState, type GlobeLayer, type LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { disposeObject3D, makeGlobeTube } from '../gridLines'

type CellKind = 'hadley' | 'ferrel' | 'polar'

interface Particle {
  cell: CellKind
  hemi: 1 | -1
  t: number
  lon: number
}

const PARTICLE_COUNT = 72
// 只保留镜头正面的一组主环流，形成单一、清晰的教学视角。
const GUIDE_LONGITUDES = [0]
const CELL_COLOR: Record<CellKind, THREE.Color> = {
  hadley: new THREE.Color('#ffad48'),
  ferrel: new THREE.Color('#a977ff'),
  polar: new THREE.Color('#54cfff'),
}
const WIND_COLOR = ['#55c9ff', '#b67cff', '#ffd43b', '#72ee77', '#b67cff', '#55c9ff']

/**
 * 大气三圈环流教学层：
 * 单一全球视角：正面三圈环流弧 + 六条近地面风带箭头 + 气压带/风带标签。
 */
export class CirculationLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('circulation')!
  private group = new THREE.Group()
  private globeGuides = new THREE.Group()
  private particles: Particle[] = []
  private particleGeo = new THREE.BufferGeometry()
  private particlePos = new Float32Array(PARTICLE_COUNT * 3)
  private particleColor = new Float32Array(PARTICLE_COUNT * 3)
  private particleTexture = makeSoftDotTexture()
  private points: THREE.Points
  private continent: THREE.Mesh
  private clip: THREE.Plane[] = []
  private guideKey = ''
  private enabled = true

  constructor() {
    this.seedParticles()
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3))
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColor, 3))
    const pointMat = new THREE.PointsMaterial({
      map: this.particleTexture,
      vertexColors: true,
      size: 2.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      alphaTest: 0.02,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(this.particleGeo, pointMat)
    this.points.renderOrder = 9

    this.continent = new THREE.Mesh(
      new THREE.SphereGeometry(101.2, 32, 16, 0, Math.PI * 0.55, 0.55, 0.7),
      new THREE.MeshBasicMaterial({
        color: 0xd89635,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    )
    this.continent.visible = false
  }

  mount(ctx: GlobeContext) {
    this.clip = ctx.clipPlane ? [ctx.clipPlane] : []
    this.group.add(this.globeGuides, this.points, this.continent)
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
    this.rebuildGuides(ctx.getState())
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.circulation
    const summer = state.landSea && state.month >= 5 && state.month <= 8
    const mat = this.continent.material as THREE.MeshBasicMaterial
    mat.color.set(summer ? 0xe6a13a : 0x5d7893)
    this.continent.visible = state.layers.circulation && state.landSea

    const key = `${state.month}|${state.axialTilt ? 1 : 0}|${state.coriolis ? 1 : 0}`
    if (key !== this.guideKey) this.rebuildGuides(state)
  }

  tick(dt: number, state: GlobeFrameState) {
    if (!state.layers.circulation) return
    const step = Math.min(dt, 0.05)

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!
      p.t = (p.t + step * 0.075) % 1
      if (state.coriolis) {
        p.lon = wrapLng(p.lon + this.zonalSpeed(p) * step)
      }

      const { lat, alt } = this.cellLatAlt(p.cell, p.hemi, p.t, state)
      const pos = geoPosition(lat, p.lon, alt)
      const o = i * 3
      this.particlePos[o] = pos.x
      this.particlePos[o + 1] = pos.y
      this.particlePos[o + 2] = pos.z
    }
    this.particleGeo.attributes.position!.needsUpdate = true
  }

  dispose() {
    disposeVisualGroup(this.globeGuides)
    this.particleGeo.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.particleTexture.dispose()
    this.continent.geometry.dispose()
    ;(this.continent.material as THREE.Material).dispose()
    this.group.removeFromParent()
    this.particles = []
  }

  private seedParticles() {
    const cells: CellKind[] = ['hadley', 'hadley', 'ferrel', 'polar']
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const cell = cells[i % cells.length]!
      const color = CELL_COLOR[cell]
      this.particles.push({
        cell,
        hemi: i % 2 === 0 ? 1 : -1,
        t: (i * 0.61803398875) % 1,
        lon: wrapLng(i * 137.508 - 180),
      })
      const o = i * 3
      this.particleColor[o] = color.r
      this.particleColor[o + 1] = color.g
      this.particleColor[o + 2] = color.b
    }
  }

  private rebuildGuides(state: GlobeFrameState) {
    disposeVisualGroup(this.globeGuides)
    this.guideKey = `${state.month}|${state.axialTilt ? 1 : 0}|${state.coriolis ? 1 : 0}`
    this.buildGlobeView(state)
  }

  private buildGlobeView(state: GlobeFrameState) {
    for (const baseLon of GUIDE_LONGITUDES) {
      for (const hemi of [1, -1] as const) {
        for (const cell of ['hadley', 'ferrel', 'polar'] as const) {
          const pts: THREE.Vector3[] = []
          for (let i = 0; i <= 52; i++) {
            const t = i / 52
            const { lat, alt } = this.cellLatAlt(cell, hemi, t, state)
            const lng = baseLon + (state.coriolis ? this.guideLngOffset(cell, t) : 0)
            const p = geoPosition(lat, lng, alt)
            pts.push(new THREE.Vector3(p.x, p.y, p.z))
          }
          addLuminousArrowPath(this.globeGuides, pts, CELL_COLOR[cell], cell === 'hadley' ? 0.28 : 0.24, 0.62, this.clip, 1)
        }
      }
    }

    WIND_BELTS.forEach((belt, index) => {
      const lat = shiftedLat(belt.baseLat, state.month, state.axialTilt)
      const westward = belt.id.includes('trade') || belt.id.includes('polar_easterly')
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 34; i++) {
        const t = i / 34
        const lng = westward ? 68 - t * 136 : -68 + t * 136
        const curvedLat = lat + Math.sin(t * Math.PI) * (lat >= 0 ? -2.5 : 2.5)
        const p = geoPosition(curvedLat, lng, 0.045)
        pts.push(new THREE.Vector3(p.x, p.y, p.z))
      }
      addLuminousArrowPath(this.globeGuides, pts, new THREE.Color(WIND_COLOR[index]!), 0.24, 0.88, this.clip, 1)
      const labelPos = geoPosition(lat, -18, 0.075)
      this.globeGuides.add(makeTeachingLabel(belt.label, WIND_COLOR[index]!, labelPos, 3.4))
    })

    PRESSURE_BELTS.forEach((belt) => {
      const lat = shiftedLat(belt.baseLat, state.month, state.axialTilt)
      const low = belt.pressure === 'low'
      const pos = geoPosition(lat, 9, 0.085)
      this.globeGuides.add(makeTeachingLabel(belt.label, low ? '#63d8ff' : '#ffd253', pos, 3.6))
    })

  }

  private cellLatAlt(cell: CellKind, hemi: 1 | -1, t: number, state: GlobeFrameState) {
    const shift = subsolarLatitude(state.month, state.axialTilt) * 0.65
    const angle = t * Math.PI * 2
    let inner = shift
    let outer = 30 * hemi + shift
    let lowAlt = 0.025
    let highAlt = 0.3
    let reverse = false

    if (cell === 'ferrel') {
      inner = 30 * hemi + shift
      outer = 60 * hemi + shift * 0.55
      lowAlt = 0.035
      highAlt = 0.235
      reverse = true
    } else if (cell === 'polar') {
      inner = 60 * hemi + shift * 0.55
      outer = 88 * hemi
      lowAlt = 0.035
      highAlt = 0.19
    }

    const centerLat = (inner + outer) * 0.5
    const halfLat = Math.abs(outer - inner) * 0.5
    const latDirection = (reverse ? 1 : -1) * hemi
    const lat = centerLat + latDirection * halfLat * Math.cos(angle)
    const midAlt = (lowAlt + highAlt) * 0.5
    const alt = midAlt + ((highAlt - lowAlt) * 0.5) * Math.sin(angle)
    return { lat, alt }
  }

  private guideLngOffset(cell: CellKind, t: number) {
    const s = Math.sin(t * Math.PI * 2)
    if (cell === 'hadley') return s >= 0 ? s * 8 : s * 18
    if (cell === 'ferrel') return s >= 0 ? s * -10 : s * -18
    return s >= 0 ? s * 6 : s * 12
  }

  private zonalSpeed(p: Particle) {
    const upper = Math.sin(p.t * Math.PI * 2) >= 0
    if (p.cell === 'hadley') return upper ? 1.6 : -4.2
    if (p.cell === 'ferrel') return upper ? -2.1 : 4.4
    return upper ? 1.4 : -3.2
  }
}

function addLuminousArrowPath(
  target: THREE.Group,
  points: THREE.Vector3[],
  color: THREE.Color,
  radius: number,
  opacity: number,
  clippingPlanes: THREE.Plane[],
  arrowCount: number,
) {
  if (points.length < 2) return
  const glow = makeGlobeTube(points, radius * 3.4, color.getHex(), opacity * 0.18, clippingPlanes)
  const glowMat = glow.material as THREE.MeshBasicMaterial
  glowMat.blending = THREE.AdditiveBlending
  glow.renderOrder = 6
  target.add(glow)

  const core = makeGlobeTube(points, radius * 0.72, color.getHex(), opacity * 0.9, clippingPlanes)
  const coreMat = core.material as THREE.MeshBasicMaterial
  coreMat.blending = THREE.AdditiveBlending
  core.renderOrder = 7
  target.add(core)

  if (!arrowCount) return
  const curve = new THREE.CatmullRomCurve3(points)
  for (let i = 0; i < arrowCount; i++) {
    const span = Math.min(0.25, 0.72 / arrowCount)
    const center = (i + 1) / (arrowCount + 1)
    const start = Math.max(0, center - span * 0.52)
    const end = Math.min(1, center + span * 0.48)
    target.add(makeRibbonArrow(curve, start, end, radius * 6.2, color, opacity, clippingPlanes))
  }
}

/** 宽幅箭带：箭身先保持宽度，末段扩肩后收尖，外形接近教材插图而非 3D 小锥体。 */
function makeRibbonArrow(
  curve: THREE.CatmullRomCurve3,
  start: number,
  end: number,
  halfWidth: number,
  color: THREE.Color,
  opacity: number,
  clippingPlanes: THREE.Plane[],
) {
  const steps = 26
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const t = THREE.MathUtils.lerp(start, end, u)
    const point = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    // 教材示意优先：箭带始终在正面投影视图展开，避免贴球切面后变成细线。
    const side = new THREE.Vector3(-tangent.y, tangent.x, 0)
    if (side.lengthSq() < 0.001) side.set(1, 0, 0)
    side.normalize()

    let widthFactor = 1
    if (u < 0.1) widthFactor = 0.62 + u * 3.8
    else if (u > 0.7) widthFactor = Math.max(0, 1.7 * (1 - u) / 0.3)
    const width = halfWidth * widthFactor
    const left = point.clone().addScaledVector(side, width)
    const right = point.clone().addScaledVector(side, -width)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    if (i < steps) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, b, c, b, d, c)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(1, opacity + 0.08),
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clippingPlanes,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 9
  return mesh
}

function makeTeachingLabel(text: string, color: string, position: { x: number; y: number; z: number }, height: number) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontPx = 28
  const font = `700 ${fontPx}px "PingFang SC","Microsoft YaHei",sans-serif`
  ctx.font = font
  const width = Math.ceil(ctx.measureText(text).width) + 30
  canvas.width = width
  canvas.height = 48
  ctx.font = font
  roundRect(ctx, 1, 1, width - 2, 46, 12)
  ctx.fillStyle = 'rgba(5, 12, 27, 0.78)'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.82
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 9
  ctx.fillStyle = color
  ctx.fillText(text, width / 2, 25)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.position.set(position.x, position.y, position.z)
  sprite.scale.set((width / 48) * height, height, 1)
  sprite.renderOrder = 12
  return sprite
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function disposeVisualGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) {
      const mat = obj.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
  })
  disposeObject3D(group)
  group.clear()
}

function makeSoftDotTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.92)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function wrapLng(lng: number) {
  return ((lng + 540) % 360) - 180
}
