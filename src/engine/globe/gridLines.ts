import * as THREE from 'three'
import { geoPosition } from './coords'

/** 球面上的加粗弧线（Tube），WebGL 下 LineBasic 线宽无效。 */
export function makeGlobeTube(
  points: THREE.Vector3[],
  tubeRadius: number,
  color: number,
  opacity: number,
  clippingPlanes: THREE.Plane[] = [],
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points)
  const tubular = Math.max(8, points.length * 2)
  const geo = new THREE.TubeGeometry(curve, tubular, tubeRadius, 6, false)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    clippingPlanes,
  })
  return new THREE.Mesh(geo, mat)
}

/** 虚线纬圈：按经度分段 Tube（dash/gap 单位为度） */
export function makeGlobeDashedParallel(
  lat: number,
  tubeRadius: number,
  color: number,
  opacity: number,
  dashDeg: number,
  gapDeg: number,
  clippingPlanes: THREE.Plane[] = [],
  relAlt = 0.018,
): THREE.Group {
  const group = new THREE.Group()
  const step = Math.max(2, Math.floor(dashDeg / 3))
  for (let lon0 = -180; lon0 < 180; lon0 += dashDeg + gapDeg) {
    const pts: THREE.Vector3[] = []
    for (let lon = lon0; lon <= lon0 + dashDeg; lon += step) {
      const p = geoPosition(lat, lon, relAlt)
      pts.push(new THREE.Vector3(p.x, p.y, p.z))
    }
    if (pts.length < 2) continue
    group.add(makeGlobeTube(pts, tubeRadius, color, opacity, clippingPlanes))
  }
  return group
}

/** 经线：固定 lng，lat 从南到北 */
export function meridianPoints(lng: number, relAlt = 0.018, step = 3): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let lat = -85; lat <= 85; lat += step) {
    const p = geoPosition(lat, lng, relAlt)
    pts.push(new THREE.Vector3(p.x, p.y, p.z))
  }
  return pts
}

/** 纬线：固定 lat，lng 绕一圈 */
export function parallelPoints(lat: number, relAlt = 0.018, step = 4): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let lng = -180; lng <= 180; lng += step) {
    const p = geoPosition(lat, lng, relAlt)
    pts.push(new THREE.Vector3(p.x, p.y, p.z))
  }
  return pts
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((c) => {
    if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
      c.geometry.dispose()
      const m = c.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  })
}
