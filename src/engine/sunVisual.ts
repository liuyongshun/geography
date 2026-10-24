import * as THREE from 'three'

/** 版本号变更时强制绕过浏览器 / WebView 对 public 贴图的缓存 */
export const SUN_TEX_VERSION = '20261022-realistic-alpha-a'
export const SUN_TEXTURE_URL = `/textures/sun-realistic.png?v=${SUN_TEX_VERSION}`

/** 透明 PNG 做成朝向相机的单层日面，保留日珥且避免黑底暗边。 */
export function makeSunBillboard(radius: number): {
  group: THREE.Group
  lookAt: (camera: THREE.Camera) => void
  dispose: () => void
} {
  const group = new THREE.Group()
  group.name = 'sun-realistic'

  // PNG 还在解码时先显示圆形暖色占位，避免方形平面白闪。
  const fallback = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.82, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )

  const disk = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  disk.visible = false
  group.add(fallback, disk)

  let disposed = false
  const loader = new THREE.TextureLoader()
  loader.load(
    SUN_TEXTURE_URL,
    (tex) => {
      if (disposed) {
        tex.dispose()
        return
      }
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const mat = disk.material as THREE.MeshBasicMaterial
      mat.map = tex
      mat.alphaTest = 0.02
      mat.needsUpdate = true
      disk.visible = true
      fallback.visible = false
    },
    undefined,
    () => {
      // 加载失败时保留圆形占位，不显示方形平面。
    },
  )

  return {
    group,
    lookAt(camera: THREE.Camera) {
      group.lookAt(camera.position)
    },
    dispose() {
      disposed = true
      fallback.geometry.dispose()
      ;(fallback.material as THREE.Material).dispose()
      disk.geometry.dispose()
      const dm = disk.material as THREE.MeshBasicMaterial
      dm.map?.dispose()
      dm.dispose()
    },
  }
}
