export interface ScreenLock { released: boolean; release(): Promise<void>; addEventListener(type: 'release', listener: () => void): void }
export class TimerWakeLock {
  private lock?: ScreenLock
  private pending = false
  private desired = false
  private attempted = false
  private request?: () => Promise<ScreenLock>
  constructor(request?: () => Promise<ScreenLock>) { this.request = request }
  async update(running: boolean, visible: boolean) {
    this.desired = running && visible
    if (!this.desired) { this.attempted = false; const lock = this.lock; this.lock = undefined; try { await lock?.release() } catch { /* Optional. */ } return }
    if (this.lock && !this.lock.released || this.pending || this.attempted || !this.request) return
    this.pending = true; this.attempted = true
    try {
      const lock = await this.request()
      if (!this.desired) await lock.release()
      else { this.lock = lock; lock.addEventListener('release', () => { if (this.lock === lock) this.lock = undefined }) }
    } catch { /* Denied/unsupported does not affect the timestamp clock. */ }
    finally { this.pending = false }
  }
}
