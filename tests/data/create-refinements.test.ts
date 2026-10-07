import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { sessionService } from '../../src/db/sessions.ts'
import { copyExercise, trainingBlocks } from '../../src/schemas/plan.ts'
import { parseRest, restFields } from '../../src/lib/rest-duration.ts'
import { parseForm, toForm } from '../../src/features/create/form.ts'
import { formattingInstructions, parseInterchange } from '../../src/features/create/interchange.ts'
import { workoutFixture } from '../fixtures/interchange.ts'

async function setup(t) {
  const db = new BorosDatabase(`boros-test-create-refinements-${crypto.randomUUID()}`); t.after(() => db.delete())
  const profiles = profileService(db), id = (await profiles.initialize()).activeProfileId
  return { db, profiles, id, plans: planService(db), exercises: exerciseService(db), sessions: sessionService(db) }
}

test('initial AI prompts require a complete fenced contract; smart delimiters fail without changing valid Unicode strings', () => {
  for (const kind of ['plan', 'exercise'] as const) {
    const prompt = formattingInstructions(kind)
    assert.match(prompt, /Return the complete result inside exactly one ```json code block\./)
    assert.match(prompt, /straight ASCII double quotes \(U\+0022\)/)
    assert.match(prompt, /without truncation, placeholders, or text outside/)
    assert.doesNotMatch(prompt, /raw JSON without|Reprint the previous/)
    const example = prompt.slice(prompt.indexOf('\n{') + 1)
    assert.equal(parseInterchange(example).value?.kind, kind)
    assert.equal(parseInterchange('```json\n' + example + '\n```').value?.kind, kind)
  }
  const prompt = formattingInstructions('plan')
  assert.match(prompt, /A × 20 → B × 8 → rest between rounds/)
  assert.match(prompt, /A × 20 → B × 8 → rest after the group/)
  assert.match(prompt, /shorter members simply stop/)
  assert.doesNotMatch(formattingInstructions('exercise'), /Superset:|Round 1:|PlanExercise:/)
  const value = workoutFixture(); value.workout.instructions = '“Breathe” — don’t rush. 肩'
  assert.deepEqual(parseInterchange(JSON.stringify(value)).value, value)
  const bad = JSON.stringify(value).replace('"schemaVersion"', '“schemaVersion”')
  assert.equal(parseInterchange(bad).value, undefined)
  assert.match(parseInterchange(bad).issues[0].message, /Curly quotes.*straight ASCII double quotes/)
  assert.match(parseInterchange(bad).issues[0].message, /no automatic quote replacement/)
})

test('rest components round trip blank, zero, 75, 180 and the safe-integer limit; errors are component-specific', () => {
  for (const seconds of [undefined, 0, 75, 180, Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseRest(restFields(seconds)).value, seconds)
    assert.deepEqual(parseRest(restFields(seconds)).errors, {})
    const form = toForm({ name: 'A', sets: [{ reps: { min: 1, max: 1 } }], tagNames: [], restAfterSeconds: seconds })
    form.name = 'Unrelated edit'
    assert.equal(parseForm(form).value?.restAfterSeconds, seconds)
    assert.equal(parseForm(form).value?.restBetweenSeconds, undefined)
  }
  assert.deepEqual(restFields(75), { minutes: '1', seconds: '15' })
  assert.deepEqual(restFields(180), { minutes: '3', seconds: '0' })
  assert.equal(parseRest({ minutes: '2', seconds: '' }).value, 120)
  assert.equal(parseRest({ minutes: '', seconds: '0' }).value, 0)
  for (const seconds of ['60', '-1', '0.5', '1e1', 'bad']) assert.ok(parseRest({ minutes: '', seconds }).errors.seconds)
  for (const minutes of ['-1', '1.2', '1e2', '9007199254740991']) assert.ok(parseRest({ minutes, seconds: '' }).errors.minutes)
})

test('two rounds of A20/B8 have one group rest each, including post-group rest at the end of the session', async (t) => {
  const { id, db, plans, sessions } = await setup(t), groupId = crypto.randomUUID()
  const members = [20, 8].map((reps, i) => ({ ...copyExercise({ name: i ? 'B' : 'A', sets: Array.from({ length: 2 }, () => ({ reps: { min: reps, max: reps } })), tagNames: [], restBetweenSeconds: 999, restAfterSeconds: 999 }), groupId }))
  const plan = await plans.save(id, { name: 'Two rounds', durationWeeks: 1, days: [{ id: crypto.randomUUID(), name: 'AB', groups: [{ id: groupId, number: 1, restBetweenRoundsSeconds: 75, restAfterGroupSeconds: 180 }], exercises: members }] })
  const draft = await sessions.start(id, plan.id, plan.days[0].id), block = trainingBlocks(draft.day)[0]
  assert.deepEqual([0, 1].flatMap((s) => block.members.map((m) => `${m.prescription.name}${m.prescription.sets[s].reps.min}`)), ['A20', 'B8', 'A20', 'B8'])
  const first = await sessions.startGroupTimer(id, draft.id, draft.revision, groupId, 0)
  assert.equal(first!.durationSeconds, 75); assert.equal(first!.position, 'Set 1')
  const last = await sessions.startGroupTimer(id, draft.id, draft.revision, groupId, 1)
  assert.equal(last!.durationSeconds, 180); assert.equal(last!.position, 'Post-Exercise')
  assert.equal(await db.restTimers.count(), 1)
  await assert.rejects(sessions.startTimer(id, draft.id, draft.revision, members[0].id, 0), /superset round/)
})
