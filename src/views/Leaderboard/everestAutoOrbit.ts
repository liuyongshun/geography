// OrbitControls defines speed 1 as one revolution per 60 seconds.
export const AUTO_ORBIT_SPEED = 1 // One minute per revolution.
export const ORBIT_RESUME_DELAY_MS = 4000

export class EverestAutoOrbit {
  interacting = false
  private resumeAt = 0
  private lastTick: number | undefined

  tick(now: number) {
    const delta = this.lastTick === undefined ? 0 : Math.min(.1, Math.max(0, (now - this.lastTick) / 1000))
    this.lastTick = now
    return delta
  }
  resetClock() { this.lastTick = undefined }
  beginInteraction() { this.interacting = true }
  endInteraction(now: number) { this.interacting = false; this.pause(now) }
  pause(now: number) { this.resumeAt = now + ORBIT_RESUME_DELAY_MS }
  canRotate(now: number) { return !this.interacting && now >= this.resumeAt }
}
