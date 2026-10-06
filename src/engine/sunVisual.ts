import * as THREE from 'three'

export const SUN_HMI_URL = '/textures/sun-hmi.jpg'

/** HMI 是圆日面 + 方图黑底，不能直接贴到 UV 球上（会出现黑圈）。做成朝向相机的日面。 */
export function makeSunBillboard(radius: number): {
  group: THREE.Group
  lookAt: (camera: THREE.Camera) => void
  dispose: () => void
} {
  const group = new THREE.Group()
  group.name = 'sun-hmi'

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.28, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  )
  glow.position.z = -0.2
  group.add(glow)

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  group.add(disk)

  const loader = new THREE.TextureLoader()
  loader.load(
    SUN_HMI_URL,
    (src) => {
      src.colorSpace = THREE.SRGBColorSpace
      punchHmiAlpha(src).then((tex) => {
        src.dispose()
        const mat = disk.material as THREE.MeshBasicMaterial
        mat.map = tex
        mat.color.set(0xffffff)
        mat.alphaTest = 0.08
        mat.needsUpdate = true
      })
    },
    undefined,
    () => {
      /* 保留浅色日面 */
    },
  )

  return {
    group,
    lookAt(camera: THREE.Camera) {
      group.lookAt(camera.position)
    },
    dispose() {
      glow.geometry.dispose()
      disk.geometry.dispose()
      const gm = glow.material as THREE.MeshBasicMaterial
      const dm = disk.material as THREE.MeshBasicMaterial
      dm.map?.dispose()
      gm.dispose()
      dm.dispose()
    },
  }
}

async function punchHmiAlpha(src: THREE.Texture): Promise<THREE.CanvasTexture> {
  const img = src.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement
  const w = 'width' in img ? Number(img.width) : 512
  const h = 'height' in img ? Number(img.height) : 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const cx = w * 0.5
  const cy = h * 0.5
  const maxR = Math.min(w, h) * 0.49
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4
    const x = p % w
    const y = Math.floor(p / w)
    const dx = x - cx
    const dy = y - cy
    const r = Math.hypot(dx, dy)
    const lum = Math.max(px[i]!, px[i + 1]!, px[i + 2]!)
    if (r > maxR || lum < 18) {
      px[i + 3] = 0
    } else {
      px[i + 3] = 255
    }
  }
  ctx.putImageData(data, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
