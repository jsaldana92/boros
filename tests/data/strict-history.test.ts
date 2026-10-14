import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID as uid } from 'node:crypto'
import { previousResults, instructionHistory } from '../../src/lib/previous-results.ts'
import { blankSession, assessSession, hasSessionInput, type SessionDraft, type CompletedSession } from '../../src/schemas/session.ts'
import { copyExercise } from '../../src/schemas/plan.ts'

function fixture() {
  const template = uid(), workoutId = uid(), profileId = uid()
  const exercise = copyExercise({name:'Bench',sets:[{reps:{min:2,max:5},rir:{min:2,max:2}},{reps:{min:4,max:8}}],tagNames:[]},{kind:'exercise',id:template})
  const day = {id:uid(),name:'BENCHING',exercises:[exercise]}, at='2026-10-13T12:00:00.000Z'
  const draft: SessionDraft = {id:uid(),profileId,revision:1,source:{kind:'workout',workoutId},sourceDayId:day.id,day,input:blankSession(day,'kg'),startedAt:at,updatedAt:at}
  const saved = (n: number): CompletedSession => ({...structuredClone(draft),id:uid(),draftId:uid(),completedAt:`2026-10-${String(n).padStart(2,'0')}T10:00:00.000Z`,loggedAt:at,notes:'',partial:false,exercises:[{id:exercise.id,notes:'',sets:[{skipped:false,weightKg:0,load:0,unit:'kg',reps:0,rir:0},{skipped:false,weightKg:10,load:10,unit:'kg',reps:8}]}]})
  const hint = (records: CompletedSession[]) => previousResults(draft,records,'lb')[exercise.id]
  const history = (records: CompletedSession[]) => instructionHistory(draft,exercise,records)
  return {draft,exercise,template,saved,hint,history}
}
test('whole ordered prescription: RIR, missing/zero, total count, later reps/ranges and mode all gate hints',()=>{
  for(const alter of [e=>e.prescription.sets[0].rir={min:1,max:1},e=>e.prescription.sets.push(e.prescription.sets[0]),e=>e.prescription.sets[1].reps.max=9,e=>e.prescription.sets[0].reps.min=3,e=>e.prescription.sets[1].rir={min:0,max:0},e=>e.prescription.lrDistinction=true]) {
    const f=fixture(), saved=f.saved(10); alter(saved.day.exercises[0]); assert.deepEqual(f.hint([saved]),[undefined,undefined])
    assert.equal(f.history([saved]).length,1)
  }
  const f=fixture(); assert.deepEqual(f.hint([f.saved(10)]),[{load:'0',reps:'0',rir:'0'},{load:'22.046226',reps:'8'}]); assert.equal(hasSessionInput(f.draft.input),false);assert.equal(assessSession(f.draft.input).recorded,0)
})
test('plan+workout+run, standalone identity, canonical workout merges, custom context and slots stay separate',()=>{
  const f=fixture(), s=f.saved(10); s.source!.workoutId=uid(); assert.deepEqual(f.hint([s]),[undefined,undefined])
  const aliases=[{id:f.draft.source!.workoutId!,profileId:f.draft.profileId},{id:s.source!.workoutId!,profileId:f.draft.profileId,mergedIntoId:f.draft.source!.workoutId!}]
  assert.equal(previousResults(f.draft,[s],'kg',[],aliases)[f.exercise.id][1]!.load,'10')
  delete f.draft.source; delete s.source; f.draft.sourcePlanId=s.sourcePlanId=uid();f.draft.occurrence={scheduleId:uid()} as never;s.occurrence=structuredClone(f.draft.occurrence)
  assert.equal(f.hint([s])[0]!.load,'0')
  for(const key of ['sourcePlanId','sourceDayId']) { const wrong=structuredClone(s);wrong[key]=uid();assert.deepEqual(f.hint([wrong]),[undefined,undefined]) }
  s.occurrence!.scheduleId=uid();assert.deepEqual(f.hint([s]),[undefined,undefined])
  delete f.draft.sourcePlanId;delete f.draft.occurrence;f.draft.source={kind:'custom'};delete s.sourcePlanId;delete s.occurrence;s.source={kind:'custom'}
  s.day.exercises[0].id=uid();s.exercises[0].id=s.day.exercises[0].id
  assert.equal(f.hint([s])[0]!.load,'0')
  s.source={kind:'workout',workoutId:uid()};assert.deepEqual(f.hint([s]),[undefined,undefined]);s.source={kind:'custom'};s.sourcePlanId=uid();assert.deepEqual(f.hint([s]),[undefined,undefined]);delete s.sourcePlanId
  f.draft.day.exercises.push({...structuredClone(f.exercise),id:uid()});assert.deepEqual(f.hint([s]),[undefined,undefined])
})
test('History chooses two contextual performances, then profile fallbacks; older hint source stays visible exactly once',()=>{
  const f=fixture(), compatible=f.saved(7), recent=f.saved(9), newest=f.saved(10), elsewhere=f.saved(12)
  recent.day.exercises[0].prescription.sets[1].reps.min=1;newest.day.exercises[0].prescription.sets[1].rir={min:0,max:0};elsewhere.source!.workoutId=uid()
  assert.deepEqual(f.history([compatible,recent,newest,elsewhere]).map(p=>p.session.id),[newest.id,compatible.id])
  assert.deepEqual(f.history([newest,elsewhere]).map(p=>p.session.id),[newest.id,elsewhere.id])
  f.draft.source!.workoutId=uid();assert.deepEqual(f.history([compatible,recent,newest,elsewhere]).map(p=>p.session.id),[elsewhere.id,newest.id])
  const foreign=f.saved(13);foreign.profileId=uid();const empty=f.saved(13);empty.exercises[0].sets=[{skipped:true},{skipped:true}];const active=f.saved(13);active.draftId=f.draft.id
  assert.equal(f.history([foreign,empty,active]).length,0)
  assert.deepEqual(f.hint([compatible,recent,newest,elsewhere]),[undefined,undefined])
})
test('one saved occurrence supplies all hints; actual performance time beats logged time; side and set zeros survive',()=>{
  const f=fixture(), old=f.saved(10), later=f.saved(11);old.loggedAt='2026-10-14T12:00:00.000Z';later.exercises[0].sets[1]={skipped:true}
  assert.deepEqual(f.hint([old,later]),[{load:'0',reps:'0',rir:'0'},undefined])
  f.exercise.prescription.lrDistinction=true;later.day.exercises[0].prescription.lrDistinction=true
  later.exercises[0].sets=[{sides:{left:{skipped:false,weightKg:0,reps:0,rir:0},right:{skipped:false,weightKg:10,reps:5,rir:2}}},{sides:{left:{skipped:true},right:{skipped:false,weightKg:20,reps:7}}}]
  assert.deepEqual(f.hint([old,later]),[{sides:{left:{load:'0',reps:'0',rir:'0'},right:{load:'22.046226',reps:'5',rir:'2'}}},{sides:{left:undefined,right:{load:'44.092452',reps:'7'}}}])
  const unrelated=structuredClone(later);unrelated.day.exercises[0].source={kind:'exercise',id:uid()};assert.deepEqual(f.hint([unrelated]),[undefined,undefined])
})
