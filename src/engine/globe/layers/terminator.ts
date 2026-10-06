import * as THREE from 'three'
import { subsolarLatitude } from '@/engine/atmosphere'
import { GLOBE_R, type GlobeContext, type GlobeFrameState, type GlobeLayer, type LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'

/**
 * 晨昏线：夜半球半透明罩 + 分界细环，随月份 / 黄赤交角移动。
 */
export class TerminatorLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('terminator')!
  private group = new THREE.Group()
  private night: THREE.Mesh
  private ring: THREE.Mesh
  private enabled = false

  constructor() {
    const nightMat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uOpacity: { value: 0.45 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uOpacity;
        varying vec3 vNormalW;
        void main() {
          float d = dot(normalize(vNormalW), normalize(uSun));
          // 夜半球 + 柔边
          float night = smoothstep(0.08, -0.12, d);
          float a = night * uOpacity;
          if (a < 0.02) discard;
          gl_FragColor = vec4(0.02, 0.04, 0.12, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    this.night = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.012, 64, 48), nightMat)

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(GLOBE_R * 1.014, 0.35, 8, 128),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    )
    this.group.add(this.night)
    this.group.add(this.ring)
  }

  mount(ctx: GlobeContext) {
    ctx.overlayRoot.add(this.group)
    this.group.visible = this.enabled
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.group.visible = on
  }

  update(state: GlobeFrameState) {
    this.group.visible = state.layers.terminator
    if (!state.layers.terminator) return

    const lat = subsolarLatitude(state.month, state.axialTilt)
    const sun = geoPosition(lat, 0, 0)
    const sunDir = new THREE.Vector3(sun.x, sun.y, sun.z).normalize()
    const mat = this.night.material as THREE.ShaderMaterial
    mat.uniforms.uSun.value.copy(sunDir)

    // 环平面法线对齐太阳方向
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDir)
  }

  tick(_dt: number, state: GlobeFrameState) {
    if (state.layers.terminator) this.update(state)
  }

  dispose() {
    this.night.geometry.dispose()
    ;(this.night.material as THREE.Material).dispose()
    this.ring.geometry.dispose()
    ;(this.ring.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }
}
