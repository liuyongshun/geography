import * as THREE from 'three'
import { latLonToVec } from './atmosphere'

export interface TeachCountry {
  id: string
  nameZh: string
  label: boolean
  /** MultiPolygon: polygons → rings (outer first) → [lon, lat] */
  polygons: number[][][][]
  /** @deprecated v1 flat rings — still accepted if present */
  rings?: number[][][]
}

export interface CountriesPack {
  disclaimer: string
  countries: TeachCountry[]
  version?: number
}

const R_LABEL = 1.05

/** Atlas land / ocean / border — distinct from pressure-belt teal/amber */
export const MAP_LAND = '#d4c49a'
export const MAP_OCEAN = '#1a6fa8'
export const MAP_BORDER = '#3d3226'

const TEX_W = 2048
const TEX_H = 1024

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = '600 32px "PingFang SC","Microsoft YaHei",sans-serif'
  ctx.font = font
  const tw = Math.ceil(ctx.measureText(text).width)
  const pad = 8
  canvas.width = tw + pad * 2
  canvas.height = 40
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  // outline only — no fill background
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(20, 30, 48, 0.85)'
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = '#f4f0e6'
  ctx.fillText(text, cx, cy)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  const scale = 0.078
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1)
  return sprite
}

function polygonsOf(c: TeachCountry): number[][][][] {
  if (c.polygons?.length) return c.polygons
  // v1 fallback: each ring as its own outer polygon
  if (c.rings?.length) return c.rings.map((r) => [r])
  return []
}

function ringCentroid(ring: number[][]): [number, number] {
  let lon = 0
  let lat = 0
  const n = Math.max(1, ring.length - 1)
  for (let i = 0; i < n; i++) {
    lon += ring[i][0]
    lat += ring[i][1]
  }
  return [lon / n, lat / n]
}

function ringArea(ring: number[][]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(a) * 0.5
}

function lonToX(lon: number, w: number) {
  return ((lon + 180) / 360) * w
}

function latToY(lat: number, h: number) {
  return ((90 - lat) / 180) * h
}

function ringCrossesAntimeridian(ring: number[][]): boolean {
  for (let i = 0; i < ring.length - 1; i++) {
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) return true
  }
  return false
}

/** Unwrap so consecutive edges take the short path (lons may leave [-180,180]). */
function unwrapRing(ring: number[][]): number[][] {
  if (!ring.length) return []
  const out: number[][] = [[ring[0][0], ring[0][1]]]
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0]
    const prev = out[i - 1][0]
    while (lon - prev > 180) lon -= 360
    while (prev - lon > 180) lon += 360
    out.push([lon, ring[i][1]])
  }
  return out
}

function pathUnwrapped(
  ctx: CanvasRenderingContext2D,
  ring: number[][],
  shift: number,
  w: number,
  h: number,
) {
  if (ring.length < 2) return
  ctx.moveTo(lonToX(ring[0][0] + shift, w), latToY(ring[0][1], h))
  for (let i = 1; i < ring.length; i++) {
    ctx.lineTo(lonToX(ring[i][0] + shift, w), latToY(ring[i][1], h))
  }
  ctx.closePath()
}

/**
 * Paint one polygon (outer + holes). Antimeridian-crossing outers are unwrapped
 * and drawn at lon / lon±360 so land stays solid on the equirectangular canvas.
 */
function paintPolygon(ctx: CanvasRenderingContext2D, rings: number[][][], w: number, h: number) {
  const outer = rings[0]
  if (!outer || outer.length < 4) return

  const unOuter = unwrapRing(outer)
  const unHoles = rings.slice(1).map(unwrapRing)
  const needsWrap =
    ringCrossesAntimeridian(outer) ||
    unOuter.some((p) => p[0] < -180 || p[0] > 180)
  const shifts = needsWrap ? [0, -360, 360] : [0]

  for (const shift of shifts) {
    ctx.beginPath()
    pathUnwrapped(ctx, unOuter, shift, w, h)
    for (const hole of unHoles) {
      pathUnwrapped(ctx, hole, shift, w, h)
    }
    ctx.fill('evenodd')
  }
}

function strokeBorders(ctx: CanvasRenderingContext2D, rings: number[][][], w: number, h: number) {
  for (const ring of rings) {
    const un = unwrapRing(ring)
    const needsWrap =
      ringCrossesAntimeridian(ring) || un.some((p) => p[0] < -180 || p[0] > 180)
    const shifts = needsWrap ? [0, -360, 360] : [0]
    for (const shift of shifts) {
      if (un.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(lonToX(un[0][0] + shift, w), latToY(un[0][1], h))
      for (let i = 1; i < un.length; i++) {
        ctx.lineTo(lonToX(un[i][0] + shift, w), latToY(un[i][1], h))
      }
      ctx.stroke()
    }
  }
}

/**
 * Country basemap via equirectangular canvas texture (solid land, no mesh holes)
 * + text-only Chinese labels.
 */
export class CountriesLayer {
  readonly group = new THREE.Group()
  /** Equirectangular map for SphereGeometry — ocean + land + borders */
  mapTexture: THREE.CanvasTexture | null = null
  private labels: THREE.Sprite[] = []
  private pack: CountriesPack | null = null
  private loaded = false

  async load(url = '/geo/countries-teach.json') {
    if (this.loaded) return
    const res = await fetch(url)
    if (!res.ok) throw new Error(`countries pack HTTP ${res.status}`)
    this.pack = (await res.json()) as CountriesPack
    this.build()
    this.loaded = true
  }

  get disclaimer() {
    return this.pack?.disclaimer ?? ''
  }

  setVisible(v: boolean) {
    this.group.visible = v
  }

  updateBillboards(camera: THREE.Camera) {
    if (!this.group.visible) return
    const camDir = camera.position.clone().normalize()
    for (const s of this.labels) {
      const n = s.position.clone().normalize()
      s.visible = n.dot(camDir) > 0.12
    }
  }

  dispose() {
    this.mapTexture?.dispose()
    this.mapTexture = null
    for (const s of this.labels) {
      const m = s.material as THREE.SpriteMaterial
      m.map?.dispose()
      m.dispose()
    }
    this.labels = []
    this.group.clear()
  }

  private build() {
    if (!this.pack) return

    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = MAP_OCEAN
    ctx.fillRect(0, 0, TEX_W, TEX_H)

    ctx.fillStyle = MAP_LAND
    ctx.strokeStyle = MAP_BORDER
    ctx.lineWidth = 1.25
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const c of this.pack.countries) {
      const polys = polygonsOf(c)
      for (const rings of polys) {
        paintPolygon(ctx, rings, TEX_W, TEX_H)
      }
    }
    // borders in a second pass so shared edges stay crisp
    for (const c of this.pack.countries) {
      for (const rings of polygonsOf(c)) {
        strokeBorders(ctx, rings, TEX_W, TEX_H)
      }
    }

    this.mapTexture = new THREE.CanvasTexture(canvas)
    this.mapTexture.colorSpace = THREE.SRGBColorSpace
    this.mapTexture.anisotropy = 4
    this.mapTexture.needsUpdate = true

    for (const c of this.pack.countries) {
      if (!c.label) continue
      const polys = polygonsOf(c)
      let best: number[][] | null = null
      let bestA = 0
      for (const rings of polys) {
        const a = ringArea(rings[0])
        if (a > bestA) {
          bestA = a
          best = rings[0]
        }
      }
      if (!best) continue
      const [lon, lat] = c.id === 'CN' ? ([105, 35] as [number, number]) : ringCentroid(best)
      const [x, y, z] = latLonToVec(lat, lon, R_LABEL)
      const sprite = makeLabelSprite(c.nameZh)
      sprite.position.set(x, y, z)
      this.group.add(sprite)
      this.labels.push(sprite)
    }

    this.group.visible = false
  }
}
