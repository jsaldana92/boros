export const workoutFixture = () => ({
  schemaVersion: 1, kind: 'workout', workout: {
    name: 'Élévation 肩',
    sets: [{ reps: { min: 5, max: 8 }, rir: { min: 0, max: 0 } }, { reps: { min: 10, max: 10 }, rir: null }, { reps: { min: 8, max: 12 }, rir: { min: 1, max: 2 } }],
    restBetweenSetsSeconds: 0, restAfterExerciseSeconds: null,
    instructions: 'First line\n<img src=x onerror="window.importExecuted=true">\n肩を上げる',
    youtubeUrl: 'https://youtu.be/abcdefghijk', tags: ['Strength', '肩'],
  },
})
export const planFixture = () => ({ schemaVersion: 1, kind: 'plan', plan: { name: 'Four-day import', trainingDaysPerWeek: 4, days: Array.from({ length: 4 }, (_, index) => ({ name: `Day ${index + 1}`, exercises: [workoutFixture().workout] })) } })
