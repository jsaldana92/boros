import { Component, Suspense, useLayoutEffect, type ReactNode } from 'react'
import { rememberScreen, type Screen } from './navigation-preference'

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <section><h1>Screen unavailable</h1><p role="alert">This screen could not open. Check your connection and reload your saved workspace, or choose another screen.</p><button onClick={() => window.location.reload()}>Reload Boros</button></section> : this.props.children
  }
}
function OpenedScreen({ screen, children }: { screen: Screen; children: ReactNode }) {
  // A suspended or failed screen has not opened. Preserve the last successful
  // preference, including after a canceled unsaved-edit navigation guard.
  useLayoutEffect(() => { rememberScreen(screen) }, [screen])
  return children
}
export function ScreenView({ screen, children }: { screen: Screen; children: ReactNode }) {
  return <ScreenBoundary key={screen}><Suspense fallback={<p role="status">Opening screen…</p>}><OpenedScreen screen={screen}>{children}</OpenedScreen></Suspense></ScreenBoundary>
}
