import * as THREE from 'three'
import { PRESSURE_BELTS, shiftedLat } from '@/engine/atmosphere'
import { GLOBE_R, type GlobeContext, type GlobeFrameState, type GlobeLayer, type LayerMeta } from '../types'
import { layerMeta } from '../catalog'

const LOW = new THREE.Color('#5ec8e8')
const HIGH = new THREE.Color('#f0b429')

const beltVert = /* glsl */ `
varying float vLat;
void main() {
  // SphereGeometry: y = r * cos(phi), phi 0 at +Y (北纬 90°)
  float r = length(position);
  vLat = 90.0 - degrees(acos(clamp(position.y / max(r, 1e-4), -1.0, 1.0)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const beltFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uCenter;
uniform float uHalf;
uniform float uStrength;
uniform float uHighlight;
varying float vLat;

void main() {
  float d = abs(vLat - uCenter) / max(uHalf, 0.001);
  // 柔边：中心亮、向外高斯衰减，避免硬切色块
  float core = exp(-d * d * 3.2);
  float soft = 1.0 - smoothstep(0.25, 1.05, d);
  float a = (core * 0.55 + soft * 0.28) * uStrength;
  if (uHighlight > 0.5) a = min(1.0, a * 1.75 + 0.08);
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}
`

/**
 * 气压带：纬度柔边发光带（Shader），比实心色环更接近教材示意图观感。
 * 业界没有专用「气压带 npm」；好看效果一般靠自定义 GLSL / 气象粒子（如 earth.nullschool）。
 */
export class PressureLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('pressure')!
  private group = new THREE.Group()
  private ctx: GlobeContext | null = null
  private enabled = true
  private pickMeshes: THREE.Mesh[] = []

  mount(ctx: GlobeContext) {
    this.ctx = ctx
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.clear()
    if (!state.layers.pressure) {
      this.group.visible = false
      return
    }
    this.group.visible = true

    const clip = this.ctx?.clipPlane ? [this.ctx.clipPlane] : []

    for (const belt of PRESSURE_BELTS) {
      const lat = shiftedLat(belt.baseLat, state.month, state.axialTilt)
      const half = belt.halfWidth
      const highlighted = state.highlightId === belt.id
      const color = belt.pressure === 'low' ? LOW : HIGH

      // 略大于实际半宽，shader 负责柔边裁切
      const pad = 1.35
      const phiStart = ((90 - (lat + half * pad)) * Math.PI) / 180
      const phiLength = ((half * 2 * pad) * Math.PI) / 180
      const geo = new THREE.SphereGeometry(
        GLOBE_R * 1.022,
        96,
        24,
        0,
        Math.PI * 2,
        Math.max(0, phiStart),
        Math.max(0.001, phiLength),
      )

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uCenter: { value: lat },
          uHalf: { value: half },
          uStrength: { value: highlighted ? 0.95 : 0.62 },
          uHighlight: { value: highlighted ? 1 : 0 },
        },
        vertexShader: beltVert,
        fragmentShader: beltFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        clipping: true,
        clippingPlanes: clip,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.userData.hotspotId = belt.id
      this.group.add(mesh)

      // 中心细线：教材里常见的「带轴」示意
      const rimGeo = new THREE.SphereGeometry(
        GLOBE_R * 1.024,
        96,
        3,
        0,
        Math.PI * 2,
        ((90 - (lat + 0.45)) * Math.PI) / 180,
        (0.9 * Math.PI) / 180,
      )
      const rimMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: highlighted ? 0.85 : 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        clippingPlanes: clip,
      })
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.userData.hotspotId = belt.id
      this.group.add(rim)

      // 拾取用：不可见但可点的略厚带
      const hitGeo = new THREE.SphereGeometry(
        GLOBE_R * 1.02,
        48,
        12,
        0,
        Math.PI * 2,
        Math.max(0, ((90 - (lat + half)) * Math.PI) / 180),
        Math.max(0.001, ((half * 2) * Math.PI) / 180),
      )
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        clippingPlanes: clip,
      })
      const hit = new THREE.Mesh(hitGeo, hitMat)
      hit.userData.hotspotId = belt.id
      this.group.add(hit)
      this.pickMeshes.push(hit)
    }
  }

  pick(raycaster: THREE.Raycaster): import('../types').GlobePick | null {
    if (!this.group.visible) return null
    const hits = raycaster.intersectObjects(this.pickMeshes, false)
    const id = hits[0]?.object.userData.hotspotId as import('@/engine/atmosphere').HotspotId | undefined
    return id ? { kind: 'belt', id } : null
  }

  dispose() {
    this.clear()
    this.group.removeFromParent()
    this.ctx = null
  }

  private clear() {
    while (this.group.children.length) {
      const mesh = this.group.children[0] as THREE.Mesh
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      this.group.remove(mesh)
    }
    this.pickMeshes = []
  }
}
