import { useLayoutEffect, type ReactNode } from 'react'
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { SettingsPage } from '../features/profiles/SettingsPage'
import { CreatePage } from '../features/create/CreatePage'
import { TrainPage } from '../features/train/TrainPage'
import { pages } from './pages'
import { useWorkspace } from './workspace-context'
import { WorkspaceProvider } from './WorkspaceProvider'
import { NavigationContext } from './navigation-context'
import { isScreen, rememberScreen, type Screen } from './navigation-preference'

function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { allowLeave } = useWorkspace()
  const candidate = location.pathname.slice(1)
  const screen = isScreen(candidate) ? candidate : 'train'
  const previous = location.state?.returnScreen
  const returnScreen = isScreen(previous) && previous !== 'settings' ? previous : 'train'
  // Commit-only persistence: a canceled guard never navigates or writes here.
  useLayoutEffect(() => { if (isScreen(candidate)) rememberScreen(candidate) }, [candidate])
  return <NavigationContext.Provider value={{ screen, returnScreen, openScreen: (destination) => {
    if (!isScreen(destination) || destination === screen || !allowLeave()) return
    navigate(`/${destination}`, { replace: true, state: destination === 'settings' ? { returnScreen: screen } : null })
  } }}>{children}</NavigationContext.Provider>
}

export function AppRouter({ initialScreen }: { initialScreen: Screen }) {
  // Keep memory history alive while profile selection reloads the workspace.
  return <MemoryRouter initialEntries={[`/${initialScreen}`]}><WorkspaceProvider><NavigationProvider><Routes>
    <Route element={<AppShell />}>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/train" element={<TrainPage />} />
      {pages.filter((page) => !['/settings', '/create', '/train'].includes(page.path)).map((page) => <Route key={page.path} path={page.path} element={<PlaceholderPage page={page} />} />)}
      <Route path="*" element={<Navigate to="/train" replace />} />
    </Route>
  </Routes></NavigationProvider></WorkspaceProvider></MemoryRouter>
}
