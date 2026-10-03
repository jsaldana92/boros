import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BorosDatabase } from '../../src/db/database.ts'
import { profileService } from '../../src/db/profiles.ts'
import { planService } from '../../src/db/plans.ts'
import { exerciseService } from '../../src/db/exercises.ts'
import { importSession } from '../../src/db/imports.ts'
import { interchangeSchema } from '../../src/schemas/interchange.ts'
import { formattingInstructions, parseInterchange, toImportDraft } from '../../src/features/create/interchange.ts'
import { workoutFixture, planFixture } from '../fixtures/interchange.ts'

const draft = (kind: 'workout' | 'plan') => { const value = toImportDraft(interchangeSchema.parse(kind === 'workout' ? workoutFixture() : planFixture())); if (value.kind === 'plan') value.input.durationWeeks = 2; return value }
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new BorosDatabase(`boros-test-imports-${crypto.randomUUID()}`)
  t.after(() => db.delete())
  const profiles = profileService(db), settings = await profiles.initialize()
  return { db, profiles, id: settings.activeProfileId }
}
const counts = async (db: BorosDatabase) => Promise.all(db.tables.map((table) => table.count()))

test('public fixtures, raw/fenced JSON and both prompt examples share the strict contract', () => {
  for (const fixture of [workoutFixture(), planFixture()]) {
    for (const text of [JSON.stringify(fixture), `\n\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\`\n`]) assert.deepEqual(parseInterchange(text).value, fixture)
  }
  for (const kind of ['plan', 'workout'] as const) {
    const instructions = formattingInstructions(kind)
    assert.equal(parseInterchange(instructions.slice(instructions.indexOf('\n{') + 1)).value?.kind, kind)
    assert.match(instructions, /Never invent a tutorial URL/)
  }
})

test('optional defaults preserve absent values versus zero, Unicode, multiline plain text and local IDs', () => {
  const minimal = interchangeSchema.parse({ schemaVersion: 1, kind: 'workout', workout: { name: 'A', sets: [{ reps: { min: 1, max: 1 } }] } })
  assert.equal(minimal.kind, 'workout')
  if (minimal.kind !== 'workout') return
  assert.deepEqual(minimal.workout, { name: 'A', sets: [{ reps: { min: 1, max: 1 }, rir: null }], restBetweenSetsSeconds: null, restAfterExerciseSeconds: null, instructions: '', youtubeUrl: null, tags: [] })
  const value = draft('workout'); if (value.kind !== 'workout') return
  assert.equal(value.input.restBetweenSeconds, 0); assert.equal(value.input.restAfterSeconds, undefined)
  assert.deepEqual(value.input.sets[0].rir, { min: 0, max: 0 }); assert.equal(value.input.sets[1].rir, undefined)
  assert.equal(value.input.instructions, workoutFixture().workout.instructions)
  const plan = draft('plan'); if (plan.kind !== 'plan') return
  const ids = plan.input.days.flatMap((day) => [day.id, ...day.exercises.map((item) => item.id)])
  assert.equal(new Set(ids).size, 8); for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/)
})

test('malformed/prose/multiple-block JSON, versions, mismatched payloads and excessive input are rejected', () => {
  const json = JSON.stringify(workoutFixture())
  for (const text of ['', '{', `Here: ${json}`, `${json} done`, `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``, 'x'.repeat(1_000_001)]) assert.equal(parseInterchange(text).value, undefined)
  for (const value of [null, [], true, { ...workoutFixture(), schemaVersion: 99 }, { ...workoutFixture(), schemaVersion: '1' }, { ...workoutFixture(), kind: 'plan' }, { ...workoutFixture(), plan: planFixture().plan }]) assert.equal(interchangeSchema.safeParse(value).success, false)
})

test('unknown fields at every object level are rejected with precise nested paths', () => {
  const paths: (string | number)[][] = [[], ['plan'], ['plan', 'days', 1], ['plan', 'days', 1, 'exercises', 0], ['plan', 'days', 1, 'exercises', 0, 'sets', 2], ['plan', 'days', 1, 'exercises', 0, 'sets', 2, 'reps'], ['plan', 'days', 1, 'exercises', 0, 'sets', 2, 'rir']]
  for (const path of paths) {
    const fixture = planFixture()
    let object: any = fixture
    for (const part of path) object = object[part]
    object.profileId = 'foreign'
    const expected = path.reduce<string>((text, part) => typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part, '')
    assert.ok(parseInterchange(JSON.stringify(fixture)).issues.some((issue) => issue.path === `${expected ? `${expected}.` : ''}profileId`))
  }
})

test('nested required values, numeric types/ranges/day count and unsafe tutorial links fail without coercion', () => {
  const mutations: ((value: any) => void)[] = [
    (v) => { v.plan.name = '' }, (v) => { v.plan.trainingDaysPerWeek = 3 }, (v) => { v.plan.trainingDaysPerWeek = '4' },
    (v) => { v.plan.days = [] }, (v) => { v.plan.days[0].name = ' ' }, (v) => { v.plan.days[0].exercises = [] },
    ...['0', 0, -1, 1.5, null, Number.MAX_SAFE_INTEGER + 1].map((number) => (v: any) => { v.plan.days[1].exercises[0].sets[2].reps.min = number }),
    (v) => { v.plan.days[1].exercises[0].sets[2].reps.max = 2 },
    ...['sets', 'name'].map((key) => (v: any) => { delete v.plan.days[0].exercises[0][key] }),
    ...['instructions', 'tags'].map((key) => (v: any) => { v.plan.days[0].exercises[0][key] = null }),
    (v) => { v.plan.days[0].exercises[0].restBetweenSetsSeconds = -1 },
    (v) => { v.plan.days[0].exercises[0].sets[0].rir.max = -1 },
    ...['javascript:alert(1)', 'http://youtu.be/abcdefghijk', 'https://youtube.com.evil/watch?v=abcdefghijk', 'https://user:pass@youtube.com/watch?v=abcdefghijk', 'https://example.com/video'].map((url) => (v: any) => { v.plan.days[0].exercises[0].youtubeUrl = url }),
  ]
  for (const mutate of mutations) { const value = planFixture(); mutate(value); assert.equal(parseInterchange(JSON.stringify(value)).value, undefined) }
  const bad = planFixture(); bad.plan.days[1].exercises[0].sets[2].reps.max = 2
  assert.ok(parseInterchange(JSON.stringify(bad)).issues.some((issue) => issue.path === 'plan.days[1].exercises[0].sets[2].reps.max'))
})

test('parsing, validation, draft conversion and discarded sessions write nothing', async (t) => {
  const { db, id } = await setup(t), before = await counts(db)
  parseInterchange('bad'); draft('plan'); draft('workout'); importSession(id, db)
  assert.deepEqual(await counts(db), before)
})

test('final imports resolve normalized profile tags atomically and plans do not create library exercises', async (t) => {
  const { db, id, profiles } = await setup(t)
  const plan = draft('plan'), workout = draft('workout'); if (plan.kind !== 'plan' || workout.kind !== 'workout') return
  const other = await profiles.create('Other'); await profiles.select(other.id)
  const session = importSession(id, db)
  await session.savePlan(plan.input)
  assert.equal(await db.plans.count(), 1); assert.equal(await db.exercises.count(), 0); assert.equal(await db.tags.count(), 2)
  workout.input.tagNames = [' STRENGTH ', '肩']
  await importSession(id, db).saveWorkout(workout.input)
  assert.equal(await db.tags.count(), 2)
  assert.equal((await planService(db).library(other.id)).plans.length, 0)
  assert.equal((await exerciseService(db).library(other.id)).exercises.length, 0)
  await importSession(other.id, db).saveWorkout(workout.input)
  assert.equal(await db.tags.count(), 4); assert.equal(await db.exercises.count(), 2)
})

test('duplicate names need explicit renaming; edited invalid inputs cannot save', async (t) => {
  const { db, id } = await setup(t)
  for (const kind of ['plan', 'workout'] as const) {
    const value = draft(kind), session = importSession(id, db)
    if (value.kind === 'plan') {
      await session.savePlan(value.input)
      const next = importSession(id, db)
      await assert.rejects(next.savePlan({ ...value.input, name: ' FOUR-DAY   IMPORT ' }), /already exists/)
      await assert.rejects(next.savePlan({ ...value.input, days: [] }))
      await next.savePlan({ ...value.input, name: 'Renamed' })
    } else {
      await session.saveWorkout(value.input)
      const next = importSession(id, db)
      await assert.rejects(next.saveWorkout({ ...value.input, name: ' ÉLÉVATION   肩 ' }), /already exists/)
      await assert.rejects(next.saveWorkout({ ...value.input, sets: [] }))
      await next.saveWorkout({ ...value.input, name: 'Renamed' })
    }
  }
  assert.equal(await db.plans.count(), 2); assert.equal(await db.exercises.count(), 2)
})

test('artifact failures roll back tags, retry succeeds once and concurrent/uncertain retries never duplicate or overwrite', async (t) => {
  const { db, id } = await setup(t)
  for (const kind of ['plan', 'workout'] as const) {
    const value = draft(kind), session = importSession(id, db)
    const table = kind === 'plan' ? db.plans : db.exercises
    const save = () => value.kind === 'plan' ? session.savePlan(value.input) : session.saveWorkout(value.input)
    const before = await counts(db)
    const fail = () => { throw new Error('Simulated disk full') }
    table.hook('creating', fail)
    await assert.rejects(save(), /disk full/)
    table.hook('creating').unsubscribe(fail)
    assert.deepEqual(await counts(db), before)
    const [first, second] = await Promise.all([save(), save()])
    assert.equal(first.id, second.id); assert.equal(await table.count(), 1)
    value.input.name = 'Changed after uncertain commit'
    assert.equal((await save()).name, first.name)
    assert.equal(await table.count(), 1)
  }
})
