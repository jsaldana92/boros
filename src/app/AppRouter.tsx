import { TrainingRuntimeProvider } from './TrainingRuntimeProvider'
import { lazy, useCallback, useRef, useState, type ReactNode } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { ScreenView } from './ScreenView'
import { useWorkspace } from './workspace-context'
import { WorkspaceProvider } from './WorkspaceProvider'
import { NavigationContext, type ScreenNavigation } from './navigation-context'
import { isScreen, type Screen } from './navigation-preference'

const SettingsPage = lazy(() => import('../features/profiles/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const CreatePage = lazy(() => import('../features/create/CreatePage').then((m) => ({ default: m.CreatePage })))
const TrainPage = lazy(() => import('../features/train/TrainPage').then((m) => ({ default: m.TrainPage })))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const ProgressPage = lazy(() => import('../features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })))

const trainingReturnKey = 'boros.training-return'
function readTrainingReturn(): ScreenNavigation['trainingEntry'] {
  try {
    const value = JSON.parse(sessionStorage.getItem(trainingReturnKey) ?? 'null')
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return value && uuid.test(value.profileId) && uuid.test(value.draftId) ? { profileId: value.profileId, draftId: value.draftId } : undefined
  } catch { return undefined }
}
function saveTrainingReturn(entry?: ScreenNavigation['trainingEntry']) {
  try { if (entry?.draftId) sessionStorage.setItem(trainingReturnKey, JSON.stringify({ profileId: entry.profileId, draftId: entry.draftId })); else sessionStorage.removeItem(trainingReturnKey) } catch { /* Memory return still works when storage is unavailable. */ }
}

function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { requestLeave, snapshot } = useWorkspace()
  const [resume, setResume] = useState<ScreenNavigation['trainingEntry']>(readTrainingReturn)
  const activeTraining = useRef<ScreenNavigation['trainingEntry']>(undefined)
  const navigating = useRef(false)
  const rememberTraining = useCallback((entry?: ScreenNavigation['trainingEntry']) => { activeTraining.current = entry; if (!entry) { setResume(undefined); saveTrainingReturn() } }, [])
  const candidate = location.pathname.slice(1)
  const screen = isScreen(candidate) ? candidate : 'train'
  const previous = location.state?.returnScreen
  const returnScreen = isScreen(previous) && previous !== 'settings' ? previous : 'train'
  return <NavigationContext.Provider value={{ screen, returnScreen, trainingEntry: location.state?.trainingEntry ?? (resume?.profileId === snapshot.profile.id ? resume : undefined), rememberTraining, openScreen: (destination, trainingEntry) => {
    if (!isScreen(destination) || destination === screen) return
    if (navigating.current) return
    navigating.current = true
    void requestLeave(destination).then((allowed) => {
      if (!allowed) return
      if (destination === 'settings' && screen === 'train') { setResume(activeTraining.current); saveTrainingReturn(activeTraining.current) }
      if (destination !== 'settings' && destination !== 'train') { setResume(undefined); saveTrainingReturn() }
      navigate(`/${destination}`, { replace: true, state: destination === 'settings' ? { returnScreen: screen } : trainingEntry ? { trainingEntry, returnScreen: screen } : null })
    }).finally(() => { navigating.current = false })
  } }}>{children}</NavigationContext.Provider>
}

export function AppRouter({ initialScreen }: { initialScreen: Screen }) {
  // Keep memory history alive while profile selection reloads the workspace.
  return <MemoryRouter initialEntries={[`/${initialScreen}`]}><WorkspaceProvider><NavigationProvider><TrainingRuntimeProvider><Routes>
    <Route element={<AppShell />}>
      <Route path="/settings" element={<ScreenView screen="settings"><SettingsPage /></ScreenView>} />
      <Route path="/create" element={<ScreenView screen="create"><CreatePage /></ScreenView>} />
      <Route path="/train" element={<ScreenView screen="train"><TrainPage /></ScreenView>} />
      <Route path="/calendar" element={<ScreenView screen="calendar"><CalendarPage /></ScreenView>} />
      <Route path="/progress" element={<ScreenView screen="progress"><ProgressPage /></ScreenView>} />
      <Route path="*" element={<Navigate to="/train" replace />} />
    </Route>
  </Routes></TrainingRuntimeProvider></NavigationProvider></WorkspaceProvider></MemoryRouter>
}
