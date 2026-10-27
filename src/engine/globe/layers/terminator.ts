import * as THREE from 'three'
import { subsolarLatitude } from '@/engine/atmosphere'
import { GLOBE_R, type GlobeContext, type GlobeFrameState, type GlobeLayer, type LayerMeta } from '../types'
import { layerMeta } from '../catalog'
import { geoPosition } from '../coords'
import { earthTwilightGLSL } from '@/engine/realisticEarth'

/**
 * 晨昏：柔和夜色与地表霞光，随月份 / 黄赤交角移动。
 */
export class TerminatorLayer implements GlobeLayer {
  readonly meta: LayerMeta = layerMeta('terminator')!
  private group = new THREE.Group()
  private night: THREE.Mesh
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
        ${earthTwilightGLSL}
        void main() {
          float d = dot(normalize(vNormalW), normalize(uSun));
          // 夜半球 + 柔边
          float night = 1.0 - smoothstep(-0.12, 0.08, d);
          vec3 glow = earthTwilight(d);
          float warmth = clamp(glow.r * 2.0, 0.0, 0.65);
          float a = max(night * uOpacity, warmth);
          if (a < 0.002) discard;
          vec3 color = mix(vec3(0.02, 0.04, 0.12), glow * 1.8, warmth / max(a, 0.001));
          gl_FragColor = vec4(color, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    this.night = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.001, 96, 64), nightMat)
    this.group.add(this.night)
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

  }

  tick(_dt: number, state: GlobeFrameState) {
    if (state.layers.terminator) this.update(state)
  }

  dispose() {
    this.night.geometry.dispose()
    ;(this.night.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }
}
