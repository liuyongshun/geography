export type UV = readonly [number, number]
export type SurfacePoint = { x: number; y: number; z: number }
export type TerrainSurface = (u: number, v: number) => SurfacePoint
export const DEFAULT_ROUTE_SEGMENTS = 50
export const EDGES_PER_SEGMENT = 6

export function normalizeSegmentCount(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.floor(value))) : DEFAULT_ROUTE_SEGMENTS
}

export function routeStep(score: number, segmentCount = DEFAULT_ROUTE_SEGMENTS) {
  return Number.isFinite(score) ? Math.min(normalizeSegmentCount(segmentCount), Math.max(0, Math.floor(score))) : 0
}

/** Choose an unused starting slot without moving any existing member. */
export function allocateRouteSlot(occupied: number[]) {
  const slots = occupied.filter(slot => Number.isFinite(slot) && slot >= 0 && slot < 4).sort((a, b) => a - b)
  if (!slots.length) return .5
  let largest = -1, selected = .5
  slots.forEach((start, index) => {
    const gap = (slots[index + 1] ?? slots[0] + 4) - start
    if (gap > largest) { largest = gap; selected = (start + gap / 2) % 4 }
  })
  return selected
}

export function perimeterPoint(slot: number): UV {
  const edge = Math.floor(slot), f = slot - edge
  return edge === 0 ? [.06 + f * .88, .06] : edge === 1 ? [.94, .06 + f * .88]
    : edge === 2 ? [.94 - f * .88, .94] : [.06, .94 - f * .88]
}

/** Equal surface-distance stations. Curves are classroom game paths, not real climbing routes. */
export function buildRoute(start: UV, summit: UV, surface: TerrainSurface, segmentCount = DEFAULT_ROUTE_SEGMENTS): UV[] {
  const total = normalizeSegmentCount(segmentCount)
  const sampleCount = Math.max(1000, total * 4)
  const samples: UV[] = []
  const distances = [0]
  const du = summit[0] - start[0], dv = summit[1] - start[1]
  const span = Math.hypot(du, dv) || 1
  let previous: SurfacePoint | undefined
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount
    const bend = Math.sin(Math.PI * t) * .045
    const uv: UV = [start[0] + du * t - dv / span * bend, start[1] + dv * t + du / span * bend]
    samples.push(uv)
    const point = surface(...uv)
    if (previous) distances.push(distances[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z))
    previous = point
  }
  const stations: UV[] = [start]
  let cursor = 1
  for (let step = 1; step < total; step++) {
    const distance = distances[sampleCount] * step / total
    while (cursor < sampleCount && distances[cursor] < distance) cursor++
    const ratio = (distance - distances[cursor - 1]) / Math.max(1e-9, distances[cursor] - distances[cursor - 1])
    const a = samples[cursor - 1], b = samples[cursor]
    stations.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio])
  }
  stations.push(summit)
  return stations
}

export function routePosition(stations: UV[], step: number, surface: TerrainSurface): SurfacePoint {
  const total = stations.length - 1
  const position = Math.min(total, Math.max(0, step))
  const index = Math.min(total - 1, Math.floor(position))
  const ratio = position - index
  const a = stations[index], b = stations[index + 1]
  return surface(a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio)
}

/** Each segment has a small gap and six terrain-hugging edges. */
export function routeVertices(stations: UV[], surface: TerrainSurface) {
  const vertices: number[] = []
  for (let step = 0; step < stations.length - 1; step++) {
    for (let edge = 0; edge < EDGES_PER_SEGMENT; edge++) {
      for (const t of [edge / EDGES_PER_SEGMENT, (edge + 1) / EDGES_PER_SEGMENT]) {
        const p = routePosition(stations, step + t * .86, surface)
        vertices.push(p.x, p.y + .45, p.z)
      }
    }
  }
  return new Float32Array(vertices)
}
export type ClimbMotion = { step: number; arrivalElapsed?: number }
export function createClimbMotion(target: number, previousStep?: number): ClimbMotion {
  return { step: previousStep ?? 0, arrivalElapsed: previousStep === undefined && target > 0 ? 0 : undefined }
}
/** Entry is a short visual replay; the stored score is never changed. */
export function advanceClimbMotion(motion: ClimbMotion, target: number, delta: number, imageReady = true) {
  const dt = Math.max(0, Math.min(.1, delta))
  if (motion.arrivalElapsed !== undefined) {
    if (!imageReady) return true
    motion.arrivalElapsed += dt
    const progress = Math.min(1, Math.max(0, (motion.arrivalElapsed - .35) / 3))
    motion.step = target * progress * progress * (3 - 2 * progress)
    if (progress === 1) motion.arrivalElapsed = undefined
  } else {
    const difference = target - motion.step
    motion.step += Math.sign(difference) * Math.min(Math.abs(difference), dt * 2.5)
  }
  if (Math.abs(target - motion.step) > .0001) return true
  motion.step = target
  return motion.arrivalElapsed !== undefined
}
