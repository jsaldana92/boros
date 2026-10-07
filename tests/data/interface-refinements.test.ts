import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { representativeProfile } from '../fixtures/backup-profile.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { nameKey } from '../../src/schemas/profile.ts'
import { planService } from '../../src/db/plans.ts'
import { weeklyService } from '../../src/db/weekly.ts'
import { newDay, copyExercise } from '../../src/schemas/plan.ts'
import { browserZone } from '../../src/lib/calendar-dates.ts'
import { readCalendarView, saveCalendarView } from '../../src/lib/calendar-view.ts'

test('automatic names allocate first normalized free Guest slot across connections; old records remain intact', async t => {
  const db = new BorosDatabase(`boros-test-interface-${crypto.randomUUID()}`), peer = new BorosDatabase(db.name)
  t.after(async () => { peer.close(); await db.delete() })
  const fixture = await representativeProfile(db), profiles = profileService(db), other = profileService(peer)
  const before = await captureProfile(fixture.id, db)
  const first = await profiles.createNextGuest(); assert.equal(first.name, 'Guest')
  await db.profiles.update(first.id, { kind: 'guest', name: '', nameKey: '' }) // Old unnamed Guest occupies its effective name.
  await profiles.create('  Ｇｕｅｓｔ (1) ')
  await profiles.create('Guest (3)')
  const [a, b] = await Promise.all([profiles.createNextGuest(), other.createNextGuest()])
  assert.deepEqual([a.name, b.name].sort(), ['Guest (2)', 'Guest (4)'])
  assert.notEqual(a.id, b.id)
  assert.equal(new Set((await profiles.list()).map(p => nameKey(p.name || 'Guest'))).size, (await profiles.list()).length)
  for (const profile of [a, b]) {
    const data = await captureProfile(profile.id, db)
    for (const key of ['exercises', 'tags', 'plans', 'schedules', 'drafts', 'sessions', 'measurements', 'photos']) assert.deepEqual(data[key], [])
    assert.equal(profile.weightUnit, 'kg'); assert.equal(profile.heightUnit, 'cm'); assert.equal(profile.timeZone, undefined)
  }
  assert.ok([a.id, b.id].includes((await profiles.settings())!.activeProfileId))
  assert.deepEqual({ ...await captureProfile(fixture.id, db), capturedAt: before.capturedAt }, before)
  await assert.rejects(profiles.create(' guest '), /already exists/)
})

test('failed automatic profile creation rolls back both name allocation and selection', async t => {
  const db = new BorosDatabase(`boros-test-interface-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), settings = await profiles.initialize(), before = await profiles.list()
  const fail = () => { throw new Error('Storage full') }; db.settings.hook('updating', fail)
  await assert.rejects(profiles.createNextGuest(), /Storage full/)
  assert.deepEqual(await profiles.list(), before); assert.deepEqual(await profiles.settings(), settings)
  db.settings.hook('updating').unsubscribe(fail)
  const next = await profiles.createNextGuest(); assert.equal(next.name, 'Guest (1)')
  assert.equal((await profiles.settings())!.activeProfileId, next.id)
})

test('new activations resolve the current device zone, retain existing runs and ignore hidden legacy preferences', async t => {
  const db = new BorosDatabase(`boros-test-interface-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  await db.profiles.update(id, { timeZone: 'Pacific/Honolulu' })
  const plans = planService(db), weekly = weeklyService(db)
  const prescription = (name: string) => ({ name, durationWeeks: 2, days: [{ ...newDay(1), exercises: [copyExercise({ name: 'Press', tagNames: [], sets: [{ reps: { min: 5, max: 5 } }] })] }] })
  const a = await plans.save(id, prescription('A')), b = await plans.save(id, prescription('B'))
  const [first] = await weekly.activate(id, a.id); assert.equal(first.timeZone, browserZone())
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions
  t.mock.method(Intl.DateTimeFormat.prototype, 'resolvedOptions', function () { return { ...resolved.call(this), timeZone: 'Asia/Tokyo' } })
  const [second] = await weekly.activate(id, b.id); assert.equal(second.timeZone, 'Asia/Tokyo')
  assert.deepEqual((await weekly.activate(id, a.id))[0], first)
  const before = await profiles.getProfile(id); await profiles.select(id); await profiles.initialize(); assert.deepEqual(await profiles.getProfile(id), before)
  assert.equal(before.timeZone, 'Pacific/Honolulu'); assert.equal(db.verno, 7)
})

test('Calendar preference validates values, reads without writes and tolerates denied storage', () => {
  let saved: string | null = null, writes = 0
  const storage = { getItem: () => saved, setItem: (_: string, value: string) => { saved = value; writes++ } }
  assert.equal(readCalendarView(storage), 'month'); assert.equal(writes, 0)
  for (const view of ['day', 'week', 'month'] as const) { saveCalendarView(view, storage); assert.equal(readCalendarView(storage), view) }
  saved = 'invalid'; assert.equal(readCalendarView(storage), 'month')
  const denied = { getItem: () => { throw new Error('Denied') }, setItem: () => { throw new Error('Denied') } }
  assert.equal(readCalendarView(denied), 'month'); saveCalendarView('day', denied); assert.equal(readCalendarView(denied), 'day')
})
