import { lazy, type ReactNode } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { ScreenView } from './ScreenView'
import { useWorkspace } from './workspace-context'
import { WorkspaceProvider } from './WorkspaceProvider'
import { NavigationContext } from './navigation-context'
import { isScreen, type Screen } from './navigation-preference'

const SettingsPage = lazy(() => import('../features/profiles/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const CreatePage = lazy(() => import('../features/create/CreatePage').then((m) => ({ default: m.CreatePage })))
const TrainPage = lazy(() => import('../features/train/TrainPage').then((m) => ({ default: m.TrainPage })))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const ProgressPage = lazy(() => import('../features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })))

function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { requestLeave } = useWorkspace()
  const candidate = location.pathname.slice(1)
  const screen = isScreen(candidate) ? candidate : 'train'
  const previous = location.state?.returnScreen
  const returnScreen = isScreen(previous) && previous !== 'settings' ? previous : 'train'
  return <NavigationContext.Provider value={{ screen, returnScreen, trainingEntry: location.state?.trainingEntry, openScreen: (destination, trainingEntry) => {
    if (!isScreen(destination) || destination === screen) return
    void requestLeave().then((allowed) => { if (allowed) navigate(`/${destination}`, { replace: true, state: destination === 'settings' ? { returnScreen: screen } : trainingEntry ? { trainingEntry, returnScreen: screen } : null }) })
  } }}>{children}</NavigationContext.Provider>
}

export function AppRouter({ initialScreen }: { initialScreen: Screen }) {
  // Keep memory history alive while profile selection reloads the workspace.
  return <MemoryRouter initialEntries={[`/${initialScreen}`]}><WorkspaceProvider><NavigationProvider><Routes>
    <Route element={<AppShell />}>
      <Route path="/settings" element={<ScreenView screen="settings"><SettingsPage /></ScreenView>} />
      <Route path="/create" element={<ScreenView screen="create"><CreatePage /></ScreenView>} />
      <Route path="/train" element={<ScreenView screen="train"><TrainPage /></ScreenView>} />
      <Route path="/calendar" element={<ScreenView screen="calendar"><CalendarPage /></ScreenView>} />
      <Route path="/progress" element={<ScreenView screen="progress"><ProgressPage /></ScreenView>} />
      <Route path="*" element={<Navigate to="/train" replace />} />
    </Route>
  </Routes></NavigationProvider></WorkspaceProvider></MemoryRouter>
}
