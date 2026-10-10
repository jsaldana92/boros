import type { BorosDatabase } from '../../src/db/database.ts'
// Explicit fixture boundary for pre-v12 workspaces with multiple unfinished
// drafts. Only disposable test DBs; production services retain their restriction.
export async function legacyWorkspace(db: BorosDatabase) {
  if (!db.name.startsWith('boros-test-')) throw new Error('Disposable fixture database required')
  await db.activeWorkouts.delete('active')
}
