import * as THREE from 'three'

/** 版本号变更时强制绕过浏览器 / WebView 对 public 贴图的缓存 */
export const SUN_TEX_VERSION = '20260921-aia171'
export const SUN_HMI_URL = `/textures/sun-hmi.jpg?v=${SUN_TEX_VERSION}`

/** SDO 日面是圆盘 + 方图黑底，不能直接贴 UV 球（会出黑圈）。做成朝向相机的日面。 */
export function makeSunBillboard(radius: number): {
  group: THREE.Group
  lookAt: (camera: THREE.Camera) => void
  dispose: () => void
} {
  const group = new THREE.Group()
  group.name = 'sun-hmi'

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  )
  group.add(disk)

  const loader = new THREE.TextureLoader()
  loader.load(
    SUN_HMI_URL,
    (src) => {
      src.colorSpace = THREE.SRGBColorSpace
      processSunDisk(src)
        .then((tex) => {
          src.dispose()
          const mat = disk.material as THREE.MeshBasicMaterial
          mat.map = tex
          mat.color.set(0xffffff)
          mat.alphaTest = 0.04
          mat.needsUpdate = true
        })
        .catch(() => {
          /* 保留暖色日面 */
        })
    },
    undefined,
    () => {
      /* 保留暖色日面 */
    },
  )

  return {
    group,
    lookAt(camera: THREE.Camera) {
      group.lookAt(camera.position)
    },
    dispose() {
      disk.geometry.dispose()
      const dm = disk.material as THREE.MeshBasicMaterial
      dm.map?.dispose()
      dm.dispose()
    },
  }
}

/** 抠黑底、保留边缘日珥，并略提对比度，避免小尺寸时看起来像纯色圆 */
async function processSunDisk(src: THREE.Texture): Promise<THREE.CanvasTexture> {
  const img = src.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement
  const w = 'width' in img ? Number(img.width) : 512
  const h = 'height' in img ? Number(img.height) : 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const cx = w * 0.5
  const cy = h * 0.5
  const maxR = Math.min(w, h) * 0.495
  const soft = Math.min(w, h) * 0.02

  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4
    const x = p % w
    const y = Math.floor(p / w)
    const r = Math.hypot(x - cx, y - cy)
    const rr = px[i]!
    const gg = px[i + 1]!
    const bb = px[i + 2]!
    const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb

    // 圆外 + 极暗像素（含角标文字区）透明；边缘软过渡保留日珥
    let alpha = 255
    if (r > maxR + soft || lum < 10) {
      alpha = 0
    } else if (r > maxR) {
      alpha = Math.round(255 * (1 - (r - maxR) / soft))
    }

    if (alpha > 0 && lum >= 10) {
      // 轻对比拉伸，黑子 / 活动区在缩小后仍可辨
      const t = Math.min(1, Math.max(0, (lum - 12) / 220))
      const boosted = Math.pow(t, 0.85)
      const gain = 0.72 + boosted * 0.55
      px[i] = Math.min(255, Math.round(rr * gain + 8))
      px[i + 1] = Math.min(255, Math.round(gg * gain * 0.96 + 4))
      px[i + 2] = Math.min(255, Math.round(bb * gain * 0.88))
    }
    px[i + 3] = alpha
  }

  ctx.putImageData(data, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}
