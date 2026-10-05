import { recordCounts } from '../../src/schemas/backup.ts'
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { scheduleService } from '../../src/db/schedules.ts'
import { captureProfile } from '../../src/db/backups.ts'
import { groupedPlan } from '../fixtures/group2.ts'
import { dateRange, monthStart, viewRange, weekday } from '../../src/lib/calendar-dates.ts'
import { planStatus, schedulePending } from '../../src/lib/plan-status.ts'
import { occurrences } from '../../src/schemas/schedule.ts'
import { profileInputSchema } from '../../src/schemas/profile.ts'
import { generateBackup, sha256 } from '../../src/features/backups/archive.ts'
import { readBackup } from '../../src/features/backups/read-backup.ts'
import { buildRestorePlan } from '../../src/features/backups/restore-plan.ts'
import { canonicalSnapshot } from '../../src/features/backups/restore-records.ts'
import { csvTables } from '../../src/features/backups/csv.ts'
import { validateBackupData } from '../../src/schemas/backup.ts'

async function setup(t) {
  const db = new BorosDatabase(`boros-test-group3-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  const plans = planService(db), sessions = sessionService(db), schedules = scheduleService(db)
  const raw = groupedPlan(); raw.durationWeeks = 1
  const plan = await plans.save(id, raw)
  const createSchedule = (zone = 'UTC', start = '2025-01-06') => schedules.create(id, { planId: plan.id, planRevision: plan.revision, startWeek: start, timeZone: zone, mapping: [{ dayId: plan.days[0].id, weekday: 0 }] })
  return { db, id, profiles, plans, sessions, schedules, plan, createSchedule }
}
const profileInput = (p, timeZone) => ({ name: p.kind === 'guest' ? '' : p.name, weightUnit: p.weightUnit, heightUnit: p.heightUnit, timeZone })
const filled = (draft) => { const input = structuredClone(draft.input); input.exercises.forEach((e) => e.sets.forEach((s) => Object.assign(s, { load: '20', reps: '5' }))); return input }

test('legacy time-zone fields remain compatible; selection never rewrites profile, schedules, sessions or measurements', async (t) => {
  const { db, id, profiles, sessions, plan, createSchedule } = await setup(t)
  const schedule = await createSchedule('America/New_York')
  const draft = await sessions.start(id, plan.id, plan.days[0].id); await sessions.complete(id, draft.id, draft.revision, filled(draft), false)
  const original = await profiles.getProfile(id)
  await profiles.save(id, original.revision, { ...profileInput(original, 'America/New_York'), weightKg: 75.123456789 })
  const before = await captureProfile(id, db), other = await profiles.create('Other')
  const changed = await profiles.save(id, before.profile.revision, profileInput(before.profile, 'Asia/Tokyo'))
  assert.equal(changed.timeZone, 'Asia/Tokyo'); assert.equal((await profiles.getProfile(other.id)).timeZone, undefined)
  const after = await captureProfile(id, db)
  for (const key of ['schedules', 'sessions', 'drafts', 'measurements']) assert.deepEqual(after[key], before[key])
  assert.equal(after.schedules[0].timeZone, schedule.timeZone)
  for (const invalid of ['', '+02:00', 'Mars/Olympus']) assert.equal(profileInputSchema.safeParse(profileInput(changed, invalid)).success, false)
  await db.profiles.update(id, { timeZone: undefined })
  await profiles.select(id)
  const initialized = await profiles.snapshot(id); assert.equal(initialized.profile.timeZone, undefined); assert.equal(initialized.profile.revision, changed.revision)
  db.close(); await db.open(); assert.deepEqual((await profiles.snapshot(id)).profile, initialized.profile); assert.equal(db.verno, 5)
})

test('Train preferences survive reload, reject stale/foreign/missing selections and keep archived identities for restore', async (t) => {
  const { db, id, profiles, plans, sessions, plan, createSchedule } = await setup(t)
  const baseline = await profiles.getProfile(id), schedule = await createSchedule(), draft = await sessions.start(id, plan.id, plan.days[0].id)
  const saved = await profiles.selectPlans(id, baseline.revision, [plan.id]); db.close(); await db.open()
  assert.deepEqual((await profiles.getProfile(id)).selectedPlanIds, [plan.id])
  await assert.rejects(profiles.selectPlans(id, baseline.revision, []), /changed in another tab/)
  await assert.rejects(profiles.save(id, baseline.revision, profileInput(baseline, 'UTC')), /changed in another tab/)
  const other = await profiles.create('Other'); await assert.rejects(profiles.selectPlans(other.id, other.revision, [plan.id]), /unavailable/)
  await assert.rejects(profiles.selectPlans(id, saved.revision, [crypto.randomUUID()]), /unavailable/)
  await assert.rejects(profiles.selectPlans(id, saved.revision, [plan.id, plan.id]), /only once/)
  const archived = await plans.setArchived(id, plan.id, plan.revision, true)
  assert.deepEqual((await profiles.getProfile(id)).selectedPlanIds, [plan.id]); assert.equal((await sessions.library(id)).plans.length, 1) // Frozen active runs remain available even when their template is archived.
  await plans.setArchived(id, plan.id, archived.revision, false); assert.equal((await sessions.library(id)).plans[0].id, plan.id)
  await profiles.selectPlans(id, saved.revision, [])
  assert.deepEqual(await db.schedules.get([id, schedule.id]), schedule); assert.deepEqual(await sessions.getDraft(id, draft.id), draft)
})

test('calendar month ranges cover whole Monday–Sunday weeks, leap February, month lengths, year boundaries and adjacent events', async (t) => {
  for (const [date, start, end, count] of [
    ['2024-02-15', '2024-01-29', '2024-03-03', 35], ['2025-02-20', '2025-01-27', '2025-03-02', 35],
    ['2025-03-20', '2025-02-24', '2025-04-06', 42], ['2025-04-20', '2025-03-31', '2025-05-04', 35],
    ['2024-12-31', '2024-11-25', '2025-01-05', 42],
  ] as const) { const range = viewRange(date, 'month'); assert.deepEqual(range, { start, end }); assert.equal(dateRange(start, end).length, count); assert.equal(weekday(start), 0); assert.equal(weekday(end), 6) }
  assert.equal(monthStart('2024-01-31', 1), '2024-02-01'); assert.equal(monthStart('2024-12-31', 1), '2025-01-01'); assert.equal(monthStart('2025-01-31', -1), '2024-12-01')
  const { id, schedules, createSchedule } = await setup(t)
  await createSchedule('Asia/Tokyo', '2025-03-31'); const range = viewRange('2025-04-15', 'month')
  const events = await schedules.events(id, range.start, range.end)
  assert.equal(events.length, 1); assert.equal(events[0].ref.scheduledDate, '2025-03-31'); assert.equal(events[0].ref.timeZone, 'Asia/Tokyo')
})

test('status precedence uses each zone, ended misses stay overdue, partial completes only its exact occurrence and last uses actual completion', async (t) => {
  const { id, plan, sessions, createSchedule, db } = await setup(t), first = await createSchedule('Pacific/Honolulu'), second = await createSchedule('Pacific/Kiritimati')
  const now = new Date('2025-01-07T00:30:00Z'), state = async () => planStatus(plan.id, await db.schedules.toArray(), await db.sessions.toArray(), await db.drafts.toArray(), now)
  assert.equal((await state()).status, 'PAST DUE')
  const unscheduled = await sessions.start(id, plan.id, plan.days[0].id); await sessions.complete(id, unscheduled.id, unscheduled.revision, filled(unscheduled), false)
  assert.equal((await state()).status, 'PAST DUE')
  const draft = (await sessions.openOccurrence(id, second.id, plan.days[0].id, '2025-01-06')).draft!, input = filled(draft); input.exercises[0].sets[0].skipped = true
  const partial = await sessions.complete(id, draft.id, draft.revision, input, true)
  assert.equal(partial.partial, true); assert.equal((await state()).status, 'DUE TODAY'); assert.equal((await state()).next?.scheduleId, first.id)
  const remaining = (await sessions.openOccurrence(id, first.id, plan.days[0].id, '2025-01-06')).draft!
  const final = await sessions.complete(id, remaining.id, remaining.revision, filled(remaining), false)
  assert.equal((await state()).status, 'COMPLETED'); assert.equal((await state()).last?.completedAt, final.completedAt)
  assert.equal((await state()).next, undefined)
  const stopped = { ...first, id: crypto.randomUUID(), stoppedFrom: '2025-01-06' }
  assert.equal(planStatus(plan.id, [first, second, stopped], await db.sessions.toArray(), [], now).status, undefined)
})

test('status handles unbounded futures, stopped-only and mixed schedules, truncation, repair and retained drafts without manufacturing completion', async (t) => {
  const { plan, createSchedule } = await setup(t), schedule = await createSchedule(), now = new Date('2025-01-20T12:00:00Z')
  const event = occurrences(schedule, '2025-01-06', '2025-01-06')[0], done = new Set([event.ref.key])
  assert.equal(schedulePending(schedule, done).fullyCompleted, true)
  const unbounded = { ...schedule, endDate: undefined, durationWeeks: undefined }
  assert.equal(schedulePending(unbounded, done).next?.scheduledDate, '2025-01-13'); assert.equal(schedulePending(unbounded, done).fullyCompleted, false)
  assert.equal(planStatus(plan.id, [{ ...schedule, stoppedFrom: '2025-01-07' }], [], [], now).status, undefined)
  assert.equal(planStatus(plan.id, [schedule, { ...schedule, id: crypto.randomUUID(), stoppedFrom: '2025-01-06' }], [], [], now).status, 'PAST DUE')
  assert.equal(planStatus(plan.id, [schedule], [], [], new Date('2025-01-01T12:00:00Z')).status, 'ON GOING')
  const shortened = { ...unbounded, durationChanges: [{ id: crypto.randomUUID(), effectiveFrom: '2025-01-13', durationWeeks: 1, endDate: '2025-01-12' }] }
  assert.equal(schedulePending(shortened, done).fullyCompleted, false)
  const repair = { ...schedule, revisions: schedule.revisions.map((r) => ({ ...r, needsRepair: true })) }
  assert.equal(schedulePending(repair, done).fullyCompleted, false)
  // A start centuries ago still inspects one weekly candidate, not every date.
  const ancient = { ...unbounded, startWeek: '0001-01-01', revisions: unbounded.revisions.map((r) => ({ ...r, effectiveFrom: '0001-01-01' })) }
  assert.equal(schedulePending(ancient, new Set()).next?.scheduledDate, '0001-01-01')
})

test('v3 preferences round-trip; independent ownership, replacement, both merge priorities and clear maintain valid references', async (t) => {
  const { db, id, profiles, plan } = await setup(t)
  const p = await profiles.getProfile(id), zoned = await profiles.save(id, p.revision, profileInput(p, 'Asia/Tokyo')); await profiles.selectPlans(id, zoned.revision, [plan.id])
  const snapshot = await captureProfile(id, db), backup = await readBackup((await generateBackup(snapshot, 'test')).bytes)
  assert.equal(backup.manifest.backupSchemaVersion, 8); assert.equal(backup.data.profile.timeZone, 'Asia/Tokyo'); assert.deepEqual(backup.data.profile.selectedPlanIds, [plan.id])
  const otherRoot = crypto.randomUUID(), local = structuredClone(snapshot); local.plans[0].id = otherRoot; local.profile.selectedPlanIds = []; local.profile.timeZone = 'UTC'
  for (const choice of ['new', 'replace', 'device', 'import'] as const) {
    const result = (await buildRestorePlan(backup, choice === 'new' ? undefined : local, choice, crypto.randomUUID(), choice === 'new' ? 'Copy' : 'Guest', new Date().toISOString())).result
    assert.notEqual(result.profile.id, id); assert.equal(result.profile.timeZone, choice === 'device' ? 'UTC' : 'Asia/Tokyo')
    assert.deepEqual(result.profile.selectedPlanIds, choice === 'device' ? [] : [choice === 'import' ? otherRoot : plan.id]); validateBackupData(canonicalSnapshot(result))
  }
  const cleared = (await buildRestorePlan(undefined, snapshot, 'clear', crypto.randomUUID(), 'Guest', new Date().toISOString())).result
  assert.equal(cleared.profile.timeZone, 'Asia/Tokyo'); assert.equal(cleared.profile.selectedPlanIds, undefined)
  const invalid = structuredClone(backup.data); invalid.profile.selectedPlanIds = [crypto.randomUUID()]; assert.throws(() => validateBackupData(invalid), /selected plan.*missing/)
})

test('bounded status agrees with visible occurrence generation across mapping and duration segments; retained drafts block completion', async (t) => {
  const { plan, createSchedule, sessions, id } = await setup(t), base = await createSchedule()
  const secondRevision = { ...base.revisions[0], id: crypto.randomUUID(), effectiveFrom: '2025-01-13', mapping: [{ dayId: plan.days[0].id, weekday: 3 }] }
  for (const repaired of [true, false]) for (const stopped of [undefined, '2025-01-06', '2025-01-20']) {
    const schedule = { ...base, durationWeeks: 4, endDate: '2025-02-02', stoppedFrom: stopped, revisions: [{ ...base.revisions[0], effectiveUntil: '2025-01-13' }, { ...secondRevision, needsRepair: !repaired }], durationChanges: [{ id: crypto.randomUUID(), effectiveFrom: '2025-01-20', durationWeeks: 3, endDate: '2025-01-26' }] }
    const visible = occurrences(schedule, '2025-01-06', '2025-03-02')
    for (let count = 0; count <= visible.length; count++) {
      const complete = new Set(visible.slice(0, count).map((e) => e.ref.key))
      assert.equal(schedulePending(schedule, complete).next?.key, visible[count]?.ref.key)
    }
  }
  const draft = (await sessions.openOccurrence(id, base.id, plan.days[0].id, '2025-01-06')).draft!
  // A retained started occurrence is pending even if a remap no longer generates it.
  const remapped = { ...base, revisions: base.revisions.map((r) => ({ ...r, mapping: [{ dayId: plan.days[0].id, weekday: 1 }] })) }
  const summary = planStatus(plan.id, [remapped], [], [draft], new Date('2025-01-07T12:00:00Z'))
  assert.equal(summary.status, 'PAST DUE'); assert.equal(summary.next?.key, draft.occurrenceKey)
})

test('strict v2 backup bytes/CSV/checksums remain supported; preferences are not smuggled into older contracts', async (t) => {
  const { db, id } = await setup(t), snapshot = await captureProfile(id, db), generated = await generateBackup(snapshot, 'test'), data = canonicalSnapshot(snapshot)
  data.backupSchemaVersion = 2; delete data.profile.timeZone; delete data.profile.selectedPlanIds; validateBackupData(data)
  const zip = new JSZip(), payload = [['data.json', JSON.stringify(data)], ...csvTables(data).map((table) => [table.path, table.text])]
  const manifest = { ...generated.manifest, backupSchemaVersion: 2, counts: recordCounts(data), csvRows: Object.fromEntries(csvTables(data).map((table) => [table.path, table.rows])), inventory: await Promise.all(payload.map(async ([path, text]) => ({ path, bytes: new TextEncoder().encode(text).length, sha256: await sha256(new TextEncoder().encode(text)), mediaType: path.endsWith('json') ? 'application/json' : 'text/csv; charset=utf-8' }))) }
  for (const [path, text] of payload) zip.file(path, text, { createFolders: false }); zip.file('manifest.json', JSON.stringify(manifest))
  const bytes = await zip.generateAsync({ type: 'uint8array' }), hash = await sha256(bytes), read = await readBackup(bytes)
  assert.equal(read.manifest.backupSchemaVersion, 2); assert.equal(read.data.backupSchemaVersion, 8); assert.equal(read.data.profile.timeZone, undefined); assert.equal(await sha256(bytes), hash)
  assert.deepEqual(read.data.plans, JSON.parse(JSON.stringify(data.plans)))
  data.profile.timeZone = 'UTC'; assert.throws(() => validateBackupData(data), /Unrecognized key/)
})
