import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DemoHex } from '@/demos/theme'
import { configureEarthRenderer, createRealisticEarth } from '@/engine/realisticEarth'
import { makeSunBillboard } from '@/engine/sunVisual'

export const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
const R = 100
const center = v(0, -R, 0)
/** 与受热过程相同：地表法线为上，东西向为横轴，教学高度沿球面径向展开。 */
export function at(x: number, height: number, z = 0) {
  return v(x / R, 1, z / R).normalize().multiplyScalar(R + height).add(center)
}

/** 两课共用的课堂场景：受控镜头、箭头质点和显式资源回收。 */
export function createAtmosphereScene(host: HTMLElement, canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  configureEarthRenderer(renderer, 1.12)
  renderer.setClearColor(DemoHex.canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.4, 2200)
  const target = v(0, 18, 0)
  const home = v(0, 30, 112)
  camera.position.copy(home)
  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 60
  controls.maxDistance = 245
  controls.minPolarAngle = Math.PI * 0.18
  controls.maxPolarAngle = Math.PI * 0.53
  controls.minAzimuthAngle = -Math.PI / 3
  controls.maxAzimuthAngle = Math.PI / 3
  scene.add(new THREE.HemisphereLight('#c9e6ff', '#283747', 2))
  const light = new THREE.DirectionalLight('#fff0d5', 3)
  light.position.set(-30, 70, 40)
  scene.add(light)
  // 直接复用受热过程的 Blue Marble 昼景、夜光及地表光照着色器。
  const earth = createRealisticEarth(renderer, R, v(0, 1, .3).normalize(), {
    segments: 128, atmosphereScale: 1.05, atmosphereStrength: .95, nightIntensity: 1.15,
  })
  earth.surface.position.copy(center)
  earth.atmosphere.position.copy(center)
  scene.add(earth.surface, earth.atmosphere)
  const earthOrientation = new THREE.Quaternion()
  let nightScene = false
  function region(latitude = 31, longitude = 105, night = false) {
    nightScene = night
    const lat = THREE.MathUtils.degToRad(latitude)
    const lon = THREE.MathUtils.degToRad(longitude)
    const normal = v(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
    const east = v(0, 1, 0).cross(normal).normalize()
    const side = east.clone().cross(normal).normalize()
    earthOrientation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, normal, side)).invert()
    earth.surface.quaternion.copy(earthOrientation)
    earth.atmosphere.quaternion.copy(earthOrientation)
    const localSun = night ? v(-.7, -.8, -.3).normalize() : v(-.18, 1, .32).normalize()
    earth.setSunDirection(localSun.clone().applyQuaternion(earthOrientation.clone().invert()))
  }
  region()
  let root = new THREE.Group()
  scene.add(root)
  type Flow = { curve: THREE.CatmullRomCurve3; arrows: THREE.Group[]; speed: number }
  const flows: Flow[] = []
  const labels: { sprite: THREE.Sprite; width: number; height: number; minFont: number }[] = []
  let viewportHeight = 1
  const ticks: ((time: number) => void)[] = []
  let elapsed = 0
  let last = 0
  let frame = 0
  let disposed = false
  let cloudTexture: THREE.Texture | undefined
  const cloudMaterials: THREE.SpriteMaterial[] = []
  const sun = makeSunBillboard(4.5)
  sun.group.visible = false
  scene.add(sun.group)
  new THREE.TextureLoader().load('/textures/weather/cloud-realistic.webp', (texture) => {
    if (disposed) { texture.dispose(); return }
    texture.colorSpace = THREE.SRGBColorSpace
    cloudTexture = texture
    cloudMaterials.forEach((material) => { material.map = texture; material.opacity = .92; material.needsUpdate = true })
  })
  // 星点沿用深空环境，避免用空黑背景承载抽象图块。
  const starPositions: number[] = []
  for (let i = 0; i < 160; i++) {
    const a = i * 2.39996323
    const y = 1 - 2 * (i + .5) / 160
    const r = Math.sqrt(1 - y * y)
    starPositions.push(Math.cos(a) * r * 650, y * 650, Math.sin(a) * r * 650)
  }
  const starGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: DemoHex.inkMuted, size: 1.1, sizeAttenuation: false, transparent: true, opacity: .45, toneMapped: false }))
  scene.add(stars)

  function release(object: THREE.Object3D) {
    const textures = new Set<THREE.Texture>()
    object.traverse((child) => {
      const drawable = child as THREE.Mesh
      drawable.geometry?.dispose()
      if (drawable.material) {
        const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material]
        for (const material of materials) {
          const map = (material as THREE.MeshBasicMaterial).map
          if (map && map !== cloudTexture) textures.add(map)
          material.dispose()
        }
      }
    })
    textures.forEach((texture) => texture.dispose())
  }
  function clear() {
    release(root)
    scene.remove(root)
    root = new THREE.Group()
    scene.add(root)
    flows.length = 0
    labels.length = 0
    ticks.length = 0
    cloudMaterials.length = 0
    sun.group.visible = false
  }
  function mesh(geometry: THREE.BufferGeometry, color: string, pos: THREE.Vector3, opacity = 1) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.78, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide })
    const item = new THREE.Mesh(geometry, material)
    item.position.copy(at(pos.x, pos.y, pos.z))
    root.add(item)
    return item
  }
  function line(points: THREE.Vector3[], color: string, radius = 0.1, opacity = 1) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => at(p.x, p.y, p.z)))
    const item = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, radius, 6, false), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }))
    root.add(item)
    return curve
  }
  function label(text: string, pos: THREE.Vector3, color: string = DemoHex.ink, size = 2.2) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = '500 32px sans-serif'
    canvas.width = Math.ceil(ctx.measureText(text).width + 32)
    canvas.height = 64
    ctx.fillStyle = 'rgba(7,11,22,0.84)'
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, 64, 12)
    ctx.fill()
    ctx.font = '500 32px sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, 33)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false }))
    sprite.position.copy(at(pos.x, pos.y, pos.z))
    sprite.scale.set(size * canvas.width / 32, size * 2, 1)
    sprite.renderOrder = 10
    root.add(sprite)
    labels.push({ sprite, width: sprite.scale.x, height: sprite.scale.y, minFont: size >= 2 ? 11 : 9 })
    return sprite
  }
  function flow(points: THREE.Vector3[], color: string, speed = 0.09, count = 5) {
    const curve = line(points, color, 0.1, 0.38)
    const arrows: THREE.Group[] = []
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()
      const material = new THREE.MeshBasicMaterial({ color, toneMapped: false })
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.57, 1.8, 10), material)
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.3, 8), material)
      tail.position.y = -1.7
      group.add(head, tail)
      root.add(group)
      arrows.push(group)
    }
    flows.push({ curve, arrows, speed })
  }
  function shell(height: number, color: string, opacity = .2) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
    // 与受热过程的同心球壳完全同一空间结构，薄膜在临边更明显。
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 shellNormal; varying vec3 shellView;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        shellNormal = normalize(normalMatrix * normal);
        shellView = -(modelViewMatrix * vec4(position, 1.0)).xyz;`)
      shader.fragmentShader = `varying vec3 shellNormal; varying vec3 shellView;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
        float rim = 1.0 - abs(dot(normalize(shellNormal), normalize(shellView)));
        diffuseColor.a *= .2 + .65 * pow(rim, 2.0);
        #include <opaque_fragment>`)
    }
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R + height, 128, 96), material)
    globe.position.copy(center)
    globe.renderOrder = 2
    root.add(globe)
    return globe
  }
  function cloud(x: number, h: number, z = 0, scale = 1) {
    const material = new THREE.SpriteMaterial({ map: cloudTexture, color: nightScene ? '#657386' : '#ffffff', transparent: true, opacity: cloudTexture ? .92 : 0, depthWrite: false, alphaTest: .12 })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(at(x, h, z))
    sprite.scale.set(24 * scale, 10 * scale, 1)
    sprite.renderOrder = 5
    cloudMaterials.push(material)
    root.add(sprite)
    ticks.push((t) => {
      sprite.position.copy(at(x + Math.sin(t * .25 + x * .05) * 1.5, h + Math.sin(t * .22 + x * .05) * .45, z + Math.sin(t * .2 + x * .05) * .35))
    })
    return sprite
  }
  function patch(x: number, z: number, radius: number, color: string, opacity = .22) {
    const geometry = new THREE.CircleGeometry(radius, 64, 0, Math.PI * 2)
    const attribute = geometry.getAttribute('position')
    for (let i = 0; i < attribute.count; i++) {
      const p = at(x + attribute.getX(i), .18, z + attribute.getY(i))
      attribute.setXYZ(i, p.x, p.y, p.z)
    }
    geometry.computeVertexNormals()
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const item = new THREE.Mesh(geometry, material)
    root.add(item)
    line(Array.from({ length: 65 }, (_, i) => v(x + Math.cos(i / 64 * Math.PI * 2) * radius, .25, z + Math.sin(i / 64 * Math.PI * 2) * radius)), color, .08, .6)
    return item
  }
  function showSun(x = -25, h = 44, z = -5) {
    sun.group.position.copy(at(x, h, z))
    sun.group.visible = true
  }
  function reset() {
    camera.position.copy(home)
    controls.target.copy(target)
    controls.update()
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    viewportHeight = height
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // 窄屏保持横向完整，镜头距离随画布比例自适应。
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * Math.max(1, 1.45 / camera.aspect)))
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  const up = v(0, 1, 0)
  const viewPosition = v(0, 0, 0)
  function start(isPlaying: () => boolean) {
    function animate(stamp: number) {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const dt = last ? Math.min((stamp - last) / 1000, 0.06) : 0
      last = stamp
      if (isPlaying()) elapsed += dt
      for (const { curve, arrows, speed } of flows) {
        arrows.forEach((arrow, index) => {
          const t = (elapsed * speed + index / arrows.length) % 1
          arrow.position.copy(curve.getPointAt(t))
          arrow.quaternion.setFromUnitVectors(up, curve.getTangentAt(t).normalize())
        })
      }
      ticks.forEach((tick) => tick(elapsed))
      controls.update()
      camera.updateMatrixWorld()
      for (const { sprite, width, height, minFont } of labels) {
        viewPosition.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse)
        const worldPerPixel = 2 * Math.abs(viewPosition.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewportHeight
        const scale = Math.min(2.4, Math.max(1, minFont * 2 * worldPerPixel / height))
        sprite.scale.set(width * scale, height * scale, 1)
      }
      sun.lookAt(camera)
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(animate)
  }
  function dispose() {
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    controls.dispose()
    clear()
    release(earth.surface)
    release(earth.atmosphere)
    earth.disposeTextures()
    cloudTexture?.dispose()
    sun.dispose()
    starGeometry.dispose()
    stars.material.dispose()
    renderer.dispose()
  }
  return { renderer, scene, camera, controls, mesh, line, label, flow, shell, cloud, patch, showSun, region, clear, reset, start, dispose, ticks }
}
export type AtmosphereScene = ReturnType<typeof createAtmosphereScene>
