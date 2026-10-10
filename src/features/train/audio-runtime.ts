import type { AudioPort } from './timer-feedback.ts'

type Session = { type: string }
// Advisory, feature-detected short-alert mixing. Never request exclusive playback,
// recording, microphone permission or long-lived media-session ownership.
export class AlertFocus {
  private count = 0
  private previous?: string
  private session?: Session
  constructor(session?: Session) { this.session = session }
  acquire() {
    let active = true
    try { if (this.count++ === 0 && this.session) { this.previous = this.session.type; this.session.type = 'transient' } } catch { /* Unsupported category. */ }
    return () => {
      if (!active) return
      active = false
      try { if (--this.count === 0 && this.session?.type === 'transient') this.session.type = this.previous ?? 'auto' } catch { /* Optional platform hint. */ }
    }
  }
}
const navigatorSession = () => { try { return (navigator as Navigator & { audioSession?: Session }).audioSession } catch { return undefined } }
let focus: AlertFocus | undefined
export const alertFocus = () => focus ??= new AlertFocus(typeof navigator === 'undefined' ? undefined : navigatorSession())

// A single gesture-unlocked AudioContext survives every page and popup. Decoded
// assets are cached; each cue gets its own short source, never a silent loop.
let context: AudioContext | undefined
const buffers = new Map<string, Promise<AudioBuffer>>()
function audioContext() {
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Constructor) return undefined
  try { return context ??= new Constructor() } catch { return undefined }
}
export function alertAudio(file: string): AudioPort {
  const url = new URL(import.meta.env.BASE_URL + file, document.baseURI).href
  const ctx = audioContext()
  if (!ctx) return new Audio(url)
  let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, generation = 0, release: (() => void) | undefined, volume = 1, muted = false
  const stop = () => { generation++; if (source) { source.onended = null; try { source.stop() } catch { /* Already ended. */ } source.disconnect(); source = undefined } gain?.disconnect(); gain = undefined; release?.(); release = undefined }
  const port: AudioPort = {
    get muted() { return muted }, set muted(v) { muted = v; if (gain) gain.gain.value = muted ? 0 : volume },
    get volume() { return volume }, set volume(v) { volume = v; if (gain) gain.gain.value = muted ? 0 : volume },
    currentTime: 0, onended: null, onerror: null, pause: stop,
    async play() {
      stop(); const token = generation
      // resume() is invoked before any fetch/await, while activation is available.
      const resumed = ctx.state !== 'running' ? ctx.resume() : Promise.resolve()
      if (muted || volume === 0) { await resumed; return }
      let decoded = buffers.get(url)
      if (!decoded) { decoded = fetch(url).then(r => { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer() }).then(b => ctx.decodeAudioData(b)); buffers.set(url, decoded); void decoded.catch(() => buffers.delete(url)) }
      await resumed; const buffer = await decoded
      if (token !== generation) return
      source = ctx.createBufferSource(); source.buffer = buffer; gain = ctx.createGain(); gain.gain.value = muted ? 0 : volume
      source.connect(gain); gain.connect(ctx.destination); release = alertFocus().acquire()
      source.onended = () => { if (token !== generation) return; source?.disconnect(); source = undefined; gain?.disconnect(); gain = undefined; release?.(); release = undefined; port.onended?.(new Event('ended')) }
      try { source.start() } catch (error) { stop(); throw error }
    },
  }
  return port
}
