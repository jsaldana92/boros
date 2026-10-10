import { alertFocus } from './audio-runtime.ts'
export interface AudioPort { muted: boolean; volume?: number; currentTime: number; onended: ((event: Event) => unknown) | null; onerror: ((event: Event | string) => unknown) | null; play: () => Promise<void>; pause: () => void }

// One owned sequence; media completion events (not duration guesses) advance it.
export class TimerFeedback {
  private audio?: AudioPort
  private generation = 0
  private completed = new Set<string>()
  private release?: () => void
  private failed: (message: string) => void
  private createAudio: () => AudioPort
  private vibrate: (milliseconds: number) => void
  constructor(createAudio: () => AudioPort, vibrate: (milliseconds: number) => void, failed: (message: string) => void) { this.createAudio = createAudio; this.vibrate = vibrate; this.failed = failed }
  cancel() {
    this.generation++
    this.release?.(); this.release = undefined
    if (this.audio) { this.audio.muted = true; this.audio.volume = 0; this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.currentTime = 0 }
  }
  // Called synchronously from REST / Reset while user activation is available.
  unlock(sound: boolean) {
    this.cancel()
    if (!sound) return
    try {
      const audio = this.audio ??= this.createAudio(), generation = this.generation
      audio.muted = true; audio.volume = 0
      void audio.play().then(() => { if (generation === this.generation) { audio.pause(); audio.currentTime = 0 } }).catch(() => { if (generation === this.generation) this.failed('Sound could not be enabled. The timer will still show completion.') })
    } catch { this.failed('Sound is unavailable. The timer will still show completion.') }
  }
  async complete(token: string, sound: boolean, claim: () => Promise<boolean>, fresh = true) {
    if (this.completed.has(token)) return
    this.completed.add(token)
    // A slow unlock promise must never pause the subsequent completion sequence.
    const generation = ++this.generation
    let accepted: boolean
    try { accepted = await claim() } catch { if (generation === this.generation) this.failed('Timer finished. Completion feedback could not be claimed.'); return }
    if (!accepted || generation !== this.generation) return
    if (!sound) { if (fresh) try { this.vibrate(100) } catch { /* Visible completion stays available. */ } return }
    try {
      const audio = this.audio ??= this.createAudio()
      this.release = alertFocus().acquire()
      audio.pause(); audio.currentTime = 0; audio.muted = false; audio.volume = 1
      let ended = 0
      const fail = () => { if (generation === this.generation) { this.cancel(); this.failed('Timer finished. Sound could not play on this device.') } }
      const play = () => { if (generation !== this.generation) return; audio.currentTime = 0; void audio.play().catch(fail) }
      audio.onerror = fail
      audio.onended = () => { if (generation !== this.generation) return; if (++ended < 3) play(); else { audio.onended = null; audio.onerror = null; this.release?.(); this.release = undefined } }
      play()
    } catch { this.cancel(); this.failed('Timer finished. Sound is unavailable on this device.') }
  }
}
