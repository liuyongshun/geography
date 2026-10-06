import * as THREE from 'three'

export type LabelKind = 'country' | 'city' | 'anno' | 'compass' | 'zone'

/** 球半径约 100 时的世界单位高度 */
const WORLD_H: Record<LabelKind, number> = {
  country: 2.4,
  city: 1.6,
  anno: 2.0,
  compass: 3.2,
  zone: 2.1,
}

const FILL: Record<LabelKind, string> = {
  country: '#f2eee4',
  city: '#d8e4f0',
  anno: '#7ec8f0',
  compass: '#ffe08a',
  zone: '#ffc14d',
}

/**
 * 轻量中文标签：无底色，细描边，字号按 kind 区分。
 */
export function makeGeoLabelSprite(text: string, kind: LabelKind = 'country'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontPx =
    kind === 'compass' ? 28 : kind === 'country' ? 22 : kind === 'anno' || kind === 'zone' ? 16 : 18
  const weight = kind === 'compass' || kind === 'zone' ? 700 : 500
  const font = `${weight} ${fontPx}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`
  ctx.font = font
  const tw = Math.ceil(ctx.measureText(text).width)
  const padX = kind === 'compass' ? 8 : 6
  const padY = kind === 'compass' ? 6 : 4
  canvas.width = Math.max(2, tw + padX * 2)
  canvas.height = fontPx + padY * 2
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = canvas.width / 2
  const cy = canvas.height / 2 + 0.5
  ctx.lineJoin = 'round'
  ctx.lineWidth = kind === 'compass' ? 4 : kind === 'country' ? 3 : 2.5
  ctx.strokeStyle = 'rgba(8, 14, 28, 0.8)'
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = FILL[kind]
  ctx.fillText(text, cx, cy)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const sprite = new THREE.Sprite(mat)
  const h = WORLD_H[kind]
  sprite.scale.set((canvas.width / canvas.height) * h, h, 1)
  sprite.userData.labelKind = kind
  return sprite
}

export function disposeLabelSprite(sprite: THREE.Sprite) {
  const mat = sprite.material as THREE.SpriteMaterial
  mat.map?.dispose()
  mat.dispose()
}
