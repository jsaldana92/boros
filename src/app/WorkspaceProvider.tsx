import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { profiles } from '../db/profiles'
import { WorkspaceContext } from './workspace-context'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>()
  const [initError, setInitError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    let alive = true
    profiles.initialize().then((settings) => { if (alive) setActiveId(settings.activeProfileId) })
      .catch((error: Error) => { if (alive) setInitError(error.message) })
    return () => { alive = false }
  }, [attempt])
  const result = useLiveQuery(async () => {
    if (!activeId) return undefined
    try {
      const [snapshot, profileList, settings] = await Promise.all([profiles.snapshot(activeId), profiles.list(), profiles.settings()])
      if (!settings) throw new Error('Workspace settings are missing.')
      return { data: { snapshot, profileList, settings }, error: '' }
    } catch (error) { return { data: undefined, error: (error as Error).message } }
  }, [activeId, attempt])
  const theme = result?.data?.settings.theme ?? 'dark'
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  const allowLeave = () => !dirty || window.confirm('Discard your unsaved changes?')
  const error = initError || result?.error
  if (error) return <main className="startup"><h1>Browser storage unavailable</h1><p role="alert">{error}</p><p>Your existing data has not been cleared. Check browser storage permissions and available space, then retry.</p><button onClick={() => { setInitError(''); setAttempt((value) => value + 1) }}>Retry storage</button></main>
  if (!result?.data || result.data.snapshot.profile.id !== activeId) return <main className="startup" role="status">Opening your local workspace...</main>
  const { snapshot, profileList, settings } = result.data
  return <WorkspaceContext.Provider value={{ snapshot, profileList, theme, noticeAccepted: settings.noticeAccepted, dirty, setDirty, allowLeave,
    select: async (id) => { if (!allowLeave()) return; await profiles.select(id); setDirty(false); setActiveId(id) },
    useCreated: (id) => { setDirty(false); setActiveId(id) },
  }}>{children}</WorkspaceContext.Provider>
}
