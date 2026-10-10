import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { currentWorkout } from '../db/active-workout'
import { trainingRuntime } from '../features/train/training-runtime'

// Mounted above routes. The service itself also survives workspace/profile UI
// reloads, and is never disposed by leaving Train or closing a presentation.
export function TrainingRuntimeProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  const saved = useLiveQuery(() => db.transaction('r', [db.activeWorkouts, db.drafts, db.restTimers, db.settings], async () => ({ active: await currentWorkout(db), timer: await db.restTimers.get('active'), sound: (await db.settings.get('workspace'))?.sound ?? false })).catch(error => ({ error: (error as Error).message })), [attempt])
  useEffect(() => {
    if (!saved) return
    if ('error' in saved) trainingRuntime().setSound(false)
    else trainingRuntime().sync(saved.active ? `${saved.active.profileId}:${saved.active.draftId}` : undefined, saved.timer, saved.sound)
  }, [saved])
  return <>{saved && 'error' in saved && <aside role="alert">Workout storage is unavailable. {saved.error} <button onClick={() => setAttempt(n => n + 1)}>Retry workout storage</button></aside>}{children}</>
}
