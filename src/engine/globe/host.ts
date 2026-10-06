import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { type HotspotId, subsolarLatitude } from '@/engine/atmosphere'
import { defaultLayerMap } from './catalog'
import { geoPosition } from './coords'
import { EarthLayer } from './layers/earth'
import { CountriesLayer } from './layers/countries'
import { CitiesLayer } from './layers/cities'
import { LatLonLayer } from './layers/latlon'
import { CompassLayer } from './layers/compass'
import { DegreesLayer } from './layers/degrees'
import { TimezonesLayer } from './layers/timezones'
import { RiversLayer } from './layers/rivers'
import { PlatesLayer } from './layers/plates'
import { PressureLayer } from './layers/pressure'
import { CirculationLayer } from './layers/circulation'
import { SunLayer } from './layers/sun'
import { TerminatorLayer } from './layers/terminator'
import { EarthquakesLayer } from './layers/earthquakes'
import { WindFieldLayer } from './layers/windfield'
import { OceanCurrentsLayer } from './layers/oceanCurrents'
import {
  NightLightsLayer,
  SstLayer,
  ChlorophyllLayer,
  SnowIceLayer,
  PrecipLayer,
  PopDensityLayer,
  InsolationLayer,
} from './layers/surfaceTags'
import type { GlobeContext, GlobeFrameState, GlobeLayer, GlobePick, GlobePickCity, LayerId } from './types'
import { GLOBE_R } from './types'

export type { GlobeFrameState, LayerId } from './types'
export { LAYER_CATALOG, toggleableLayers, layerMeta, defaultLayerMap } from './catalog'

/**
 * 地球基地 Host：Three 场景 + 可插拔图层。
 * 课程侧只通过 update(state) / setLayer(id, on) 驱动。
 */
export class GlobeHost {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
  private overlayRoot = new THREE.Group()
  private sectionDisk: THREE.Mesh
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private raf = 0
  private disposed = false
  private lastT = performance.now()
  private state: GlobeFrameState
  private layers = new Map<LayerId, GlobeLayer>()
  private earthLayer: EarthLayer | null = null
  private ambient!: THREE.AmbientLight
  private keyLight!: THREE.DirectionalLight
  private onPick: (id: HotspotId) => void
  private framed = false

  /** 国家底图免责声明（countries 层加载后填充） */
  countriesDisclaimer = ''
  onCountriesReady: ((disclaimer: string) => void) | null = null
  onCityPick: ((city: GlobePickCity) => void) | null = null

  constructor(
    canvas: HTMLCanvasElement,
    initial: Omit<GlobeFrameState, 'layers'> & { layers?: Record<LayerId, boolean> },
    onPick: (id: HotspotId) => void,
  ) {
    this.onPick = onPick
    this.state = {
      ...initial,
      layers: { ...defaultLayerMap(), ...initial.layers },
    }
    // 非剖面：裁切面推到球外，避免经纬网管线被默认剖面半切
    this.clipPlane.constant = this.state.sectioned ? 0 : GLOBE_R * 2

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x070b16)

    const w = canvas.clientWidth || 640
    const h = canvas.clientHeight || 480
    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 2000)
    this.camera.position.set(0, 40, 280)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h, false)
    this.renderer.localClippingEnabled = true

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = GLOBE_R * 1.6
    this.controls.maxDistance = GLOBE_R * 6

    this.ambient = new THREE.AmbientLight(0x8eb6c8, 0.7)
    this.scene.add(this.ambient)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
    this.keyLight.position.set(400, 120, 200)
    this.scene.add(this.keyLight)

    this.sectionDisk = new THREE.Mesh(
      new THREE.CircleGeometry(GLOBE_R, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0b132b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.94,
      }),
    )
    this.sectionDisk.rotation.y = Math.PI / 2
    this.sectionDisk.visible = false
    this.scene.add(this.sectionDisk)
    this.scene.add(this.overlayRoot)

    const ctx: GlobeContext = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      overlayRoot: this.overlayRoot,
      clipPlane: this.clipPlane,
      globe: null,
      getState: () => this.state,
    }

    // 注册顺序：earth 必须最先
    const earth = new EarthLayer()
    this.earthLayer = earth
    const factories: GlobeLayer[] = [
      earth,
      new LatLonLayer(),
      new CompassLayer(),
      new DegreesLayer(),
      new TimezonesLayer(),
      new CountriesLayer(),
      new CitiesLayer(),
      new RiversLayer(),
      new OceanCurrentsLayer(),
      new PlatesLayer(),
      new EarthquakesLayer(),
      new PressureLayer(),
      new CirculationLayer(),
      new WindFieldLayer(),
      new SunLayer(),
      new TerminatorLayer(),
      new NightLightsLayer(),
      new SstLayer(),
      new ChlorophyllLayer(),
      new SnowIceLayer(),
      new PrecipLayer(),
      new PopDensityLayer(),
      new InsolationLayer(),
    ]

    for (const layer of factories) {
      this.layers.set(layer.meta.id, layer)
      const result = layer.mount(ctx)
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).then(() => {
          if (layer.meta.id === 'countries') {
            const c = layer as CountriesLayer
            this.countriesDisclaimer = c.disclaimer
            this.onCountriesReady?.(c.disclaimer)
          }
          layer.setEnabled(this.state.layers[layer.meta.id])
          layer.update?.(this.state)
        })
      } else {
        layer.setEnabled(this.state.layers[layer.meta.id])
      }
    }

    // earth 同步挂载后 ctx.globe 已赋值；刷新依赖 globe 的层
    for (const layer of this.layers.values()) {
      if (layer.meta.id === 'earth') continue
      layer.setEnabled(this.state.layers[layer.meta.id])
      layer.update?.(this.state)
    }

    canvas.addEventListener('pointerdown', this.onPointer)
    this.loop()
  }

  update(partial: Partial<Omit<GlobeFrameState, 'layers'>> & { layers?: Partial<Record<LayerId, boolean>> }) {
    if (partial.layers) {
      this.state.layers = { ...this.state.layers, ...partial.layers }
    }
    const { layers: _l, ...rest } = partial
    Object.assign(this.state, rest)

    this.clipPlane.constant = this.state.sectioned ? 0 : GLOBE_R * 2
    this.sectionDisk.visible = this.state.sectioned

    for (const [id, layer] of this.layers) {
      layer.setEnabled(this.state.layers[id])
      layer.update?.(this.state)
    }

    // 主光沿太阳直射方向（地理照明，替代固定侧光）
    const subLat = subsolarLatitude(this.state.month, this.state.axialTilt)
    const sunPos = geoPosition(subLat, 0, 4)
    this.keyLight.position.set(sunPos.x, sunPos.y, sunPos.z)

    // 夜光：球面已用无光照材质，压暗灯光主要让叠加标注/国界不抢戏
    if (this.state.layers.nightlights) {
      this.ambient.intensity = 0.25
      this.keyLight.intensity = 0.15
    } else if (this.state.layers.insolation) {
      this.ambient.intensity = 0.85
      this.keyLight.intensity = 0.45
    } else {
      this.ambient.intensity = 0.45
      this.keyLight.intensity = 1.25
    }

    // 打开国家政区时对准东亚，便于核对方位
    if (this.state.layers.countries && !this.framed) {
      this.frameEastAsia()
      this.framed = true
    }
    if (!this.state.layers.countries) this.framed = false
  }

  setLayer(id: LayerId, on: boolean) {
    this.update({ layers: { [id]: on } })
  }

  resize(width: number, height: number) {
    if (height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.controls.dispose()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer)
    for (const layer of this.layers.values()) layer.dispose()
    this.layers.clear()
    this.sectionDisk.geometry.dispose()
    ;(this.sectionDisk.material as THREE.Material).dispose()
    this.renderer.dispose()
  }

  private frameEastAsia() {
    const p = geoPosition(28, 110, 2.2)
    this.camera.position.set(p.x, p.y, p.z)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastT) / 1000)
    this.lastT = now
    this.controls.update()
    this.earthLayer?.syncPov()
    for (const layer of this.layers.values()) {
      layer.tick?.(dt, this.state)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private onPointer = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    // 城市优先于气压带，避免重叠难点
    const order: LayerId[] = [
      'cities',
      'earthquakes',
      'pressure',
      'circulation',
      'windfield',
      'oceanCurrents',
      'countries',
      'rivers',
      'plates',
      'sun',
      'insolation',
      'terminator',
      'nightlights',
      'sst',
      'chlorophyll',
      'snowice',
      'precip',
      'popdensity',
      'compass',
      'degrees',
      'timezones',
      'latlon',
      'earth',
    ]
    for (const id of order) {
      const layer = this.layers.get(id)
      const hit = layer?.pick?.(this.raycaster) as GlobePick | null | undefined
      if (!hit) continue
      if (hit.kind === 'city') {
        this.onCityPick?.(hit)
        return
      }
      if (hit.kind === 'belt') {
        this.onPick(hit.id)
        return
      }
    }
  }
}
