import { exerciseInputSchema, type ExerciseInput } from '../../schemas/exercise.ts'

export interface SetFields { repMin: string; repMax: string; rirMin: string; rirMax: string }
export const blankSet = (): SetFields => ({ repMin: '', repMax: '', rirMin: '', rirMax: '' })
export function toForm(input?: ExerciseInput) {
  const text = (value?: number) => value === undefined ? '' : String(value)
  return {
    name: input?.name ?? '', count: String(input?.sets.length ?? 1),
    sets: input?.sets.map((set) => ({ repMin: text(set.reps.min), repMax: set.reps.max === set.reps.min ? '' : text(set.reps.max), rirMin: text(set.rir?.min), rirMax: set.rir?.max === set.rir?.min ? '' : text(set.rir?.max) })) ?? [blankSet()],
    restBetweenSeconds: text(input?.restBetweenSeconds), restAfterSeconds: text(input?.restAfterSeconds), instructions: input?.instructions ?? '', notes: input?.notes ?? '', tutorialUrl: input?.tutorialUrl ?? '', tagNames: input?.tagNames ?? [],
  }
}
export type ExerciseForm = ReturnType<typeof toForm>
export function parseForm(form: ExerciseForm): { value?: ExerciseInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const number = (raw: string, path: string, minimum: number, optional = false): number | undefined => {
    if (!raw.trim()) { if (!optional) errors[path] = 'This field is required.'; return undefined }
    const value = Number(raw)
    if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value < minimum) errors[path] = `Use a whole number of ${minimum} or more.`
    return value
  }
  const count = number(form.count, 'count', 1)
  if (count !== undefined && count > 100) errors.count = 'Use at most 100 sets.'
  if (!errors.count && count !== form.sets.length) errors.count = 'Apply the set count before saving.'
  const sets = form.sets.map((set, index) => {
    const path = `sets.${index}`
    const min = number(set.repMin, `${path}.repMin`, 1)
    const max = number(set.repMax, `${path}.repMax`, 1, true) ?? min
    if (max !== undefined && min !== undefined && max < min) errors[`${path}.repMax`] = 'Maximum reps must be at least the minimum.'
    let rir
    if (set.rirMin.trim() || set.rirMax.trim()) {
      const rmin = number(set.rirMin, `${path}.rirMin`, 0)
      const rmax = number(set.rirMax, `${path}.rirMax`, 0, true) ?? rmin
      if (rmax !== undefined && rmin !== undefined && rmax < rmin) errors[`${path}.rirMax`] = 'Maximum RIR must be at least the minimum.'
      rir = { min: rmin!, max: rmax! }
    }
    return { reps: { min: min!, max: max! }, ...(rir === undefined ? {} : { rir }) }
  })
  const data = { name: form.name, sets, tagNames: form.tagNames, restBetweenSeconds: number(form.restBetweenSeconds, 'restBetweenSeconds', 0, true), restAfterSeconds: number(form.restAfterSeconds, 'restAfterSeconds', 0, true), instructions: form.instructions || undefined, notes: form.notes || undefined, tutorialUrl: form.tutorialUrl.trim() || undefined }
  const parsed = exerciseInputSchema.safeParse(data)
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = issue.path.join('.').replace('reps.min', 'repMin').replace('reps.max', 'repMax').replace('rir.min', 'rirMin').replace('rir.max', 'rirMax')
    errors[key] ??= issue.message
  }
  return { errors, value: !Object.keys(errors).length && parsed.success ? parsed.data : undefined }
}
