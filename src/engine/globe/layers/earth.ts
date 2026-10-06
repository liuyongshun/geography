import ThreeGlobe from 'three-globe'
import {
  Color,
  MeshBasicMaterial,
  MeshPhongMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import type { GlobeContext, GlobeFrameState, GlobeLayer, LayerId, LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { fetchGibsSurfaceObjectUrl, type GibsProduct } from '../gibs'

const MARBLE = '/textures/earth-blue-marble.jpg'
const NIGHT = '/textures/earth-night.jpg'
const BUMP = '/textures/earth-topology.png'

type Surface =
  | 'marble'
  | 'night'
  | 'sst'
  | 'chlorophyll'
  | 'snowice'
  | 'precip'
  | 'popdensity'
  | 'insolation'

/** 表面类 Tag 优先级（靠前优先）；互斥由 layerConflicts 保证通常只有一个 */
const SURFACE_ORDER: Array<{ layer: LayerId; surface: Surface }> = [
  { layer: 'nightlights', surface: 'night' },
  { layer: 'insolation', surface: 'insolation' },
  { layer: 'sst', surface: 'sst' },
  { layer: 'chlorophyll', surface: 'chlorophyll' },
  { layer: 'snowice', surface: 'snowice' },
  { layer: 'precip', surface: 'precip' },
  { layer: 'popdensity', surface: 'popdensity' },
]

/**
 * 基准地球表面：大理石 / 夜光 / 若干 GIBS 专题贴图。
 */
export class EarthLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('earth')!
  private globe: ThreeGlobe | null = null
  private ctx: GlobeContext | null = null
  private surface: Surface = 'marble'
  private dayMaterial: MeshPhongMaterial | null = null
  private overlayMaterial: MeshBasicMaterial | null = null
  private nightTexture: Texture | null = null
  private overlayBlobUrl: string | null = null
  private loadToken = 0
  private insolationMonth = -1

  mount(ctx: GlobeContext) {
    this.ctx = ctx
    this.globe = new ThreeGlobe({ waitForGlobeReady: true, animateIn: false })
      .globeImageUrl(MARBLE)
      .bumpImageUrl(BUMP)
      .showAtmosphere(true)
      .atmosphereColor('#4a90c8')
      .atmosphereAltitude(0.12)
      .showGraticules(false)

    this.dayMaterial = this.globe.globeMaterial() as MeshPhongMaterial
    ctx.scene.add(this.globe)
    ctx.globe = this.globe
  }

  setEnabled(_on: boolean) {
    if (this.globe) this.globe.visible = true
  }

  update(state: GlobeFrameState) {
    if (!this.globe) return
    this.globe.showGraticules(false)

    let next: Surface = 'marble'
    for (const { layer, surface } of SURFACE_ORDER) {
      if (state.layers[layer]) {
        next = surface
        break
      }
    }
    if (next === this.surface) {
      if (next === 'insolation' && state.month !== this.insolationMonth) {
        this.insolationMonth = state.month
        void this.applyGibs('insolation', state.month)
      }
      return
    }
    this.surface = next
    if (next === 'insolation') this.insolationMonth = state.month
    this.applySurface(next, state.month)
  }

  syncPov() {}

  dispose() {
    this.loadToken += 1
    this.revokeOverlay()
    this.overlayMaterial?.dispose()
    this.nightTexture?.dispose()
    this.overlayMaterial = null
    this.nightTexture = null
    this.dayMaterial = null
    if (this.globe && this.ctx) {
      this.ctx.scene.remove(this.globe)
      this.ctx.globe = null
    }
    this.globe = null
    this.ctx = null
  }

  private applySurface(mode: Surface, month = 6) {
    if (!this.globe) return
    this.ensureTilesOff()

    if (mode === 'marble') {
      this.loadToken += 1
      this.applyMarble()
      return
    }
    if (mode === 'night') {
      void this.applyNight()
      return
    }
    void this.applyGibs(mode, month)
  }

  private async applyNight() {
    if (!this.globe) return
    const token = ++this.loadToken
    const finish = (tex: Texture) => {
      if (!this.globe || this.surface !== 'night' || token !== this.loadToken) return
      if (!this.overlayMaterial) this.overlayMaterial = new MeshBasicMaterial()
      this.overlayMaterial.map = tex
      this.overlayMaterial.needsUpdate = true
      this.globe.globeMaterial(this.overlayMaterial)
      this.globe.showAtmosphere(true)
      this.globe.atmosphereColor('#152238')
      this.globe.atmosphereAltitude(0.09)
    }
    if (this.nightTexture) {
      finish(this.nightTexture)
      return
    }
    new TextureLoader().load(
      NIGHT,
      (tex) => {
        if (token !== this.loadToken) {
          tex.dispose()
          return
        }
        tex.colorSpace = SRGBColorSpace
        this.nightTexture = tex
        finish(tex)
      },
      undefined,
      (err) => console.warn('[EarthLayer] 夜景失败', err),
    )
  }

  private async applyGibs(mode: Exclude<Surface, 'marble' | 'night'>, month = 6) {
    if (!this.globe) return
    const token = ++this.loadToken
    const product: GibsProduct | 'snowice' = mode
    try {
      const url = await fetchGibsSurfaceObjectUrl(product, MARBLE, 2048, 1024, month)
      if (token !== this.loadToken || this.surface !== mode || !this.globe) {
        URL.revokeObjectURL(url)
        return
      }
      this.revokeOverlay()
      this.overlayBlobUrl = url
      const tex = await new Promise<Texture>((resolve, reject) => {
        new TextureLoader().load(url, resolve, undefined, reject)
      })
      if (token !== this.loadToken || this.surface !== mode || !this.globe) {
        tex.dispose()
        return
      }
      tex.colorSpace = SRGBColorSpace
      if (!this.overlayMaterial) this.overlayMaterial = new MeshBasicMaterial()
      this.overlayMaterial.map?.dispose()
      this.overlayMaterial.map = tex
      this.overlayMaterial.needsUpdate = true
      this.globe.globeMaterial(this.overlayMaterial)
      this.globe.showAtmosphere(true)
      this.globe.atmosphereColor('#4a90c8')
      this.globe.atmosphereAltitude(0.11)
    } catch (err) {
      console.warn(`[EarthLayer] ${mode} 加载失败`, err)
      if (token === this.loadToken && this.surface === mode) this.applyMarble()
    }
  }

  private applyMarble() {
    if (!this.globe || !this.dayMaterial) return
    this.revokeOverlay()
    this.dayMaterial.color = new Color(0xffffff)
    this.dayMaterial.emissive = new Color(0x000000)
    this.dayMaterial.emissiveIntensity = 0
    this.dayMaterial.emissiveMap = null
    this.dayMaterial.shininess = 15
    this.dayMaterial.needsUpdate = true
    this.globe.globeMaterial(this.dayMaterial)
    this.globe.globeImageUrl(MARBLE)
    this.globe.bumpImageUrl(BUMP)
    this.globe.showAtmosphere(true)
    this.globe.atmosphereColor('#4a90c8')
    this.globe.atmosphereAltitude(0.12)
  }

  private revokeOverlay() {
    if (this.overlayBlobUrl) {
      URL.revokeObjectURL(this.overlayBlobUrl)
      this.overlayBlobUrl = null
    }
  }

  private ensureTilesOff() {
    if (!this.globe) return
    try {
      ;(this.globe as unknown as { globeTileEngineUrl: (v: null) => void }).globeTileEngineUrl(null)
      this.globe.globeTileEngineClearCache()
    } catch {
      /* ignore */
    }
  }
}
