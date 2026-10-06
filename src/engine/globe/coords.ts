import { GLOBE_R } from './types'

/** 与 three-globe `polar2Cartesian` 完全一致，保证教学叠加层与底图对齐 */
export function geoPosition(
  lat: number,
  lng: number,
  relAltitude = 0,
  radius = GLOBE_R,
): { x: number; y: number; z: number } {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  const r = radius * (1 + relAltitude)
  const phiSin = Math.sin(phi)
  return {
    x: r * phiSin * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * phiSin * Math.sin(theta),
  }
}
