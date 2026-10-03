import { profileService } from '../../src/db/profiles.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { planService } from '../../src/db/plans.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { measurementService } from '../../src/db/measurements.ts'
import { copyExercise, newDay, planToInput } from '../../src/schemas/plan.ts'
import type { BorosDatabase } from '../../src/db/database.ts'

// Real services produce valid, exportable snapshots and finalized drafts.
export async function progressFixture(db: BorosDatabase) {
  const profiles = profileService(db), exercises = exerciseService(db), plans = planService(db), sessions = sessionService(db)
  const id = (await profiles.initialize()).activeProfileId
  await profiles.save(id, 1, { name: 'Progress owner', heightUnit: 'cm', weightUnit: 'kg', timeZone: 'America/New_York' })
  const prescription = (name: string, count = 1) => ({ name, sets: Array.from({ length: count }, () => ({ reps: { min: 8, max: 8 } })), tagNames: [] })
  const press = await exercises.save(id, prescription('Press')), row = await exercises.save(id, prescription('Row'))
  const occurrence = (name: string, libraryId?: string, count = 1) => copyExercise(prescription(name, count), libraryId ? { kind: 'exercise', id: libraryId } : undefined)
  const makeDay = () => { const group = crypto.randomUUID(); return { ...newDay(1), name: 'Strength', groups: [{ id: group, number: 1 }], exercises: [occurrence('Press', press.id, 3), { ...occurrence('Press', press.id, 2), groupId: group }, { ...occurrence('Row', row.id), groupId: group }, occurrence('Legacy press'), occurrence('Legacy press')] } }
  const alpha = await plans.save(id, { name: 'Alpha', durationWeeks: 4, days: [makeDay()] }), beta = await plans.save(id, { name: 'Beta', durationWeeks: 4, days: [makeDay()] })
  const complete = async (plan: typeof alpha, timestamp: string, values: (number | null)[][]) => {
    const draft = await sessions.start(id, plan.id, plan.days[0].id), input = structuredClone(draft.input)
    input.notes = 'Saved session note'; input.exercises.forEach((e, i) => { e.notes = `Occurrence ${i + 1} note`; e.sets.forEach((s, j) => { const load = values[i]?.[j]; if (load != null) Object.assign(s, { load: String(load), reps: String(5 + i + j), unit: i === 0 && j === 2 ? 'lb' : 'kg' }) }) })
    const result = await sessions.complete(id, draft.id, draft.revision, input, true)
    const actual = { ...result, startedAt: timestamp, completedAt: timestamp, loggedAt: '2026-01-01T12:00:00.000Z' }
    await db.sessions.put(actual); await db.drafts.update([id, draft.id], { startedAt: timestamp, finalizedAt: timestamp, updatedAt: timestamp })
    return actual
  }
  const first = await complete(alpha, '2025-01-01T12:00:00.000Z', [[0, 10, 100], [20, null], [30], [15], [null]])
  const middle = await complete(beta, '2025-01-03T12:00:00.000Z', [[40, 50, 100], [60, 61], [70], [80], [null]])
  const renamed = await exercises.save(id, prescription('Renamed press'), press)
  await exercises.setArchived(id, renamed.id, renamed.revision, true)
  const unrelated = await exercises.save(id, prescription('Press'))
  const changed = planToInput(alpha); changed.days[0].exercises[2] = { ...occurrence('Press', unrelated.id), groupId: changed.days[0].groups![0].id }
  const alphaChanged = await plans.save(id, changed, alpha)
  const latest = await complete(alphaChanged, '2025-01-05T12:00:00.000Z', [[20, 10, 100], [25, 26], [80], [null], [null]])
  await plans.setArchived(id, beta.id, beta.revision, true)
  // Drafts are intentionally excluded from analytics.
  await sessions.start(id, alphaChanged.id, alphaChanged.days[0].id)
  const weights = measurementService(db)
  for (const [kg, date] of [[70, '2025-01-03'], [72, '2025-01-01'], [70, '2025-01-03']] as const) await weights.save(id, crypto.randomUUID(), undefined, { weightKg: kg, measuredAt: `${date}T12:00:00.000Z` }, undefined, crypto.randomUUID())
  const other = await profiles.create('Other history'), privateExercise = await exercises.save(other.id, prescription('Private exercise'))
  const privatePlan = await plans.save(other.id, { name: 'Private plan', durationWeeks: 1, days: [{ ...newDay(1), exercises: [occurrence('Private exercise', privateExercise.id)] }] })
  const privateDraft = await sessions.start(other.id, privatePlan.id, privatePlan.days[0].id), privateInput = structuredClone(privateDraft.input)
  Object.assign(privateInput.exercises[0].sets[0], { load: '999', reps: '1' }); await sessions.complete(other.id, privateDraft.id, privateDraft.revision, privateInput, false)
  await profiles.select(id)
  return { id, otherId: other.id, alpha: alphaChanged, beta, press, row, unrelated, first, middle, latest }
}
