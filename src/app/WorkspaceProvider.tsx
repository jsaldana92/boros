import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { profiles, type ProfileSnapshot } from '../db/profiles'
import type { Profile, WorkspaceSettings } from '../schemas/profile'
import { WorkspaceContext } from './workspace-context'
import { BrowserCompatibilityError } from '../lib/browser-crypto'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>()
  const [initError, setInitError] = useState<Error>()
  const [attempt, setAttempt] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [dataNotice, setDataNotice] = useState('')
  const cached = useRef<{ snapshot: ProfileSnapshot; profileList: Profile[]; settings: WorkspaceSettings } | undefined>(undefined)
  useEffect(() => {
    let alive = true
    profiles.initialize().then((settings) => { if (alive) setActiveId(settings.activeProfileId) })
      .catch((error: Error) => { if (alive) setInitError(error) })
    return () => { alive = false }
  }, [attempt])
  const result = useLiveQuery(async () => {
    if (!activeId) return undefined
    try {
      const [snapshot, profileList, settings] = await Promise.all([profiles.snapshot(activeId), profiles.list(), profiles.settings()])
      if (!settings) throw new Error('Workspace settings are missing.')
      cached.current = { snapshot, profileList, settings }
      return { data: cached.current, error: undefined }
    } catch (error) { return { data: cached.current, error: error as Error } }
  }, [activeId, attempt])
  // Keep an old editor mounted when its owner was retired in another tab. Its
  // save fails the existing owner check, while recoverable input remains visible.
  const available = result
  const theme = available?.data?.settings.theme ?? 'dark'
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  const allowLeave = () => !dirty || window.confirm('Discard your unsaved changes?')
  const error = initError || result?.error
  const incompatible = error instanceof BrowserCompatibilityError
  if (error && !available?.data) return <main className="startup"><h1>{incompatible ? 'Browser compatibility issue' : 'Browser storage unavailable'}</h1><p role="alert">{error.message}</p>{!incompatible && <p>Check browser storage permissions and available space, then retry. A profile restored or cleared in another tab must be reopened.</p>}<button onClick={() => { setInitError(undefined); setAttempt((value) => value + 1) }}>{incompatible ? 'Retry opening workspace' : 'Retry storage'}</button></main>
  if (!available?.data || available.data.snapshot.profile.id !== activeId) return <main className="startup" role="status">Opening your local workspace...</main>
  const { snapshot, profileList, settings } = available.data
  return <WorkspaceContext.Provider value={{ snapshot, profileList, theme, noticeAccepted: settings.noticeAccepted, dirty, setDirty, allowLeave, dataNotice,
    select: async (id) => { if (!allowLeave()) return; await profiles.select(id); setDirty(false); setDataNotice(''); setActiveId(id) },
    useCreated: (id, notice = '') => { setDirty(false); setDataNotice(notice); setActiveId(id) },
  }}>{globalThis.isSecureContext === false && <aside className="storage-notice" role="alert"><p>This connection is not secure. Open Boros with valid HTTPS. Backups require a secure connection; existing data stays at this website address.</p></aside>}{error && <aside className="storage-notice" role="alert"><p>{incompatible ? error.message : 'This workspace is unavailable or was restored/cleared in another tab. Old edits cannot be saved into the replacement. Copy any unsaved input before reopening.'}</p><button onClick={() => { if (!allowLeave()) return; setDirty(false); setInitError(undefined); setAttempt((value) => value + 1) }}>Reopen workspace</button></aside>}{children}</WorkspaceContext.Provider>
}
