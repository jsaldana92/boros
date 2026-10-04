import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TimerFeedback, type AudioPort } from '../../src/features/train/timer-feedback.ts'
import { restLabel } from '../../src/lib/rest-duration.ts'

function fixture() {
  let plays = 0, pauses = 0, vibrations = 0, claims = 0
  const errors: string[] = [], audio: AudioPort = { muted: false, currentTime: 0, onended: null, onerror: null, play: async () => { if (!audio.muted) plays++ }, pause: () => { pauses++ } }
  const feedback = new TimerFeedback(() => audio, () => { vibrations++ }, (error) => errors.push(error))
  return { feedback, audio, errors, counts: () => ({ plays, pauses, vibrations, claims }), claim: async () => { claims++; return true } }
}
test('sound uses exactly three ended-driven plays, once per token, and no guessed durations', async () => {
  const f = fixture(); f.feedback.unlock(true); await Promise.resolve()
  assert.equal(f.counts().plays, 0)
  await f.feedback.complete('one', true, f.claim); assert.equal(f.counts().plays, 1)
  f.audio.onended!(new Event('ended')); assert.equal(f.counts().plays, 2)
  f.audio.onended!(new Event('ended')); assert.equal(f.counts().plays, 3)
  f.audio.onended!(new Event('ended')); assert.equal(f.audio.onended, null)
  await f.feedback.complete('one', true, f.claim)
  assert.equal(f.counts().plays, 3); assert.equal(f.counts().claims, 1)
})
test('stop/reset/leave cancel pending claims and repetitions; unavailable media stays actionable', async () => {
  const f = fixture()
  let resolve!: (value: boolean) => void
  const pending = f.feedback.complete('one', true, () => new Promise<boolean>((done) => { resolve = done }))
  f.feedback.cancel(); resolve(true); await pending; assert.equal(f.counts().plays, 0)
  await f.feedback.complete('two', true, f.claim); const oldEnded = f.audio.onended!
  f.feedback.cancel(); oldEnded(new Event('ended')); assert.equal(f.counts().plays, 1)
  await f.feedback.complete('three', true, async () => false); assert.equal(f.counts().plays, 1)
  f.audio.play = () => Promise.reject(new Error('blocked'))
  await f.feedback.complete('four', true, f.claim); await Promise.resolve(); assert.match(f.errors[0], /could not play/)
  assert.equal(f.audio.onended, null)
})
test('Sound Off vibrates once; absent vibration and failed claim never imply audio success', async () => {
  const f = fixture(); await f.feedback.complete('one', false, f.claim); await f.feedback.complete('one', false, f.claim)
  assert.equal(f.counts().vibrations, 1); assert.equal(f.counts().plays, 0)
  await f.feedback.complete('two', true, async () => { throw new Error('disk') }); assert.match(f.errors[0], /could not be claimed/)
  const unavailable = new TimerFeedback(() => f.audio, () => { throw new Error('unsupported') }, () => assert.fail())
  await unavailable.complete('three', false, async () => true)
  assert.equal(restLabel(0), '0 seconds'); assert.equal(restLabel(59), '59 seconds'); assert.equal(restLabel(60), '1 min 0 sec'); assert.equal(restLabel(125), '2 min 5 sec')
})
test('late media unlock cannot pause a timer that has already begun completion playback', async () => {
  const f = fixture(), play = f.audio.play
  let unlock!: () => void
  f.audio.play = () => f.audio.muted ? new Promise<void>((resolve) => { unlock = resolve }) : play()
  f.feedback.unlock(true); await f.feedback.complete('quick', true, f.claim)
  const pauses = f.counts().pauses; unlock(); await Promise.resolve()
  assert.equal(f.counts().pauses, pauses); assert.equal(f.audio.muted, false)
  f.audio.onended!(new Event('ended')); f.audio.onended!(new Event('ended')); f.audio.onended!(new Event('ended'))
  assert.equal(f.counts().plays, 3)
})
