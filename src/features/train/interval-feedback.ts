import { phaseTitle, type IntervalState, type IntervalCue } from '../../schemas/interval-session.ts'
import { TimerFeedback, type AudioPort } from './timer-feedback.ts'
import { alertFocus } from './audio-runtime.ts'
export type IntervalAudio = { start: AudioPort; warning: AudioPort; end: AudioPort; complete: AudioPort }
// One controller per active draft runtime. Only committed, owned cues reach it.
export class IntervalFeedback {
  private seen = new Set<string>()
  private media: IntervalAudio
  private speech?: SpeechSynthesis
  private completion: TimerFeedback
  private generation = 0
  private queue: { cue: IntervalCue; phaseName?: string }[] = []
  private activePhaseId?: string
  private initialized = false
  private visible = true
  private lastAt?: number
  private releases = new Set<() => void>()
  private speechRelease?: () => void
  private cancelSpeech() { try { this.speech?.cancel() } catch { /* Optional. */ } this.speechRelease?.(); this.speechRelease = undefined }
  private focus() { const release = alertFocus().acquire(); const done = () => { release(); this.releases.delete(done) }; this.releases.add(done); return done }
  constructor(media: IntervalAudio, speech?: SpeechSynthesis) {
    this.media = media; this.speech = speech
    this.completion = new TimerFeedback(() => media.complete, () => {}, () => {})
  }
  cancel() {
    this.generation++; this.queue = []; this.completion.cancel()
    this.releases.forEach(release => release()); this.releases.clear()
    this.cancelSpeech()
    for (const audio of Object.values(this.media)) try { audio.onended = null; audio.onerror = null; audio.pause(); audio.currentTime = 0 } catch { /* Optional. */ }
  }
  unlock(sound: boolean) {
    if (!sound) return
    this.cancel()
    const generation = this.generation
    for (const audio of Object.values(this.media)) try {
      audio.muted = true; audio.volume = 0
      void audio.play().then(() => { if (generation === this.generation) { audio.pause(); audio.currentTime = 0 } }).catch(() => {})
    } catch { /* Optional browser audio permission; preparation stays silent. */ }
  }
  reset() { this.cancel(); this.seen.clear(); this.initialized = false; this.lastAt = undefined }
  private playNext() {
    const item = this.queue.shift(); if (!item) { return }
    const generation = this.generation
    const currentStart = item.cue.kind === 'start' && this.activePhaseId === item.cue.phaseId && this.lastAt !== undefined && Date.now() - this.lastAt < 1500
    if (Date.now() - Date.parse(item.cue.at) > 1500 && !currentStart) { this.playNext(); return }
    if (item.cue.kind === 'complete') { void this.completion.complete(item.cue.key, true, async () => true); return }
    if (item.cue.kind === 'rest') { this.speak(item); this.playNext(); return }
    const audio = this.media[item.cue.kind]
    const release = this.focus()
    let finished = false
    const finish = () => {
      if (finished || generation !== this.generation) return
      finished = true; audio.onended = null; audio.onerror = null
      release()
      if (!this.queue.length && item.cue.kind === 'start') this.speak(item)
      this.playNext()
    }
    try { this.cancelSpeech(); audio.currentTime = 0; audio.muted = false; audio.volume = 1; audio.onended = finish; audio.onerror = finish; void audio.play().catch(finish) } catch { finish() }
  }
  private speak(item: { cue: IntervalCue; phaseName?: string }) {
    if (!item.phaseName || this.activePhaseId !== item.cue.phaseId || this.lastAt === undefined || Date.now() - this.lastAt >= 1500) return
    try {
      this.cancelSpeech()
      const voice = this.speech?.getVoices().find(voice => voice.localService)
      if (voice && typeof SpeechSynthesisUtterance !== 'undefined') {
        const utterance = new SpeechSynthesisUtterance(item.phaseName)
        const release = this.focus(); this.speechRelease = release; utterance.onend = release; utterance.onerror = release
        utterance.voice = voice; this.speech!.speak(utterance)
      }
    } catch { this.cancelSpeech() /* Optional local speech never changes timing. */ }
  }
  update(state: IntervalState, sound: boolean, now: number, visible = true) {
    this.activePhaseId = state.status === 'running' ? state.phaseId : undefined
    const cues = state.execution?.cues ?? [], unseen = cues.filter(c => !this.seen.has(c.key))
    cues.forEach(c => this.seen.add(c.key))
    if (!this.initialized) { this.initialized = true; this.visible = visible; this.lastAt = now; return }
    const wasVisible = this.visible, gap = this.lastAt !== undefined && now - this.lastAt > 1500; this.visible = visible; this.lastAt = now
    if (!sound || !visible || !wasVisible || gap || state.status === 'paused' || state.status === 'stopped') { this.cancel(); return }
    const fresh = unseen.filter(c => now - Date.parse(c.at) >= 0 && now - Date.parse(c.at) < 1500)
    if (!fresh.length) return
    this.cancel()
    const rest = fresh.find(c => c.kind === 'rest' && c.phaseId === state.phaseId)
    // End precedes the next start at a zero-rest boundary. The bounded queue is
    // replaced by each newer boundary; media completion never drives the clock.
    this.queue = fresh.filter(cue => cue.kind !== 'rest').slice(-2).map(cue => ({ cue, phaseName: phaseTitle(state.phases.find(p => p.id === cue.phaseId)) }))
    this.playNext()
    if (rest) {
      // Announce on entry, even when the rest is shorter than the end asset.
      // Duck the existing exercise-end cue instead of queuing obsolete speech
      // behind it. This adds no rest beep and never affects the phase clock.
      if (fresh.some(c => c.kind === 'end')) this.media.end.volume = 0.35
      this.speak({ cue: rest, phaseName: phaseTitle(state.phases.find(p => p.id === rest.phaseId)) })
    }
  }
}
