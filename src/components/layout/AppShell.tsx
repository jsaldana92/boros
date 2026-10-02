import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router'
import { useScreenNavigation } from '../../app/navigation-context'
import { ScreenButton } from '../../app/ScreenButton'
import { pages } from '../../app/pages'
import { useWorkspace } from '../../app/workspace-context'
import { Avatar } from '../../features/profiles/Avatar'
import { StorageNotice } from '../../features/profiles/StorageNotice'
import { Ouroboros } from './Ouroboros'

export function AppShell() {
  const { screen } = useScreenNavigation()
  const pathname = `/${screen}`
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const workspace = useWorkspace()
  useEffect(() => {
    document.title = `${pathname === '/settings' ? 'Settings' : pages.find((page) => page.path === pathname)?.label ?? 'Page not found'} | Boros`
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      window.scrollTo(0, 0)
      previousPath.current = pathname
    }
  }, [pathname])
  return <div className="app-shell">
    <button type="button" className="skip-link" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView() }}>Skip to content</button>
    <header className="app-header">
      <ScreenButton to="train" className="brand" aria-label="Boros home"><Ouroboros /><span><strong>Boros</strong><small>Ask not for a lighter burden</small></span></ScreenButton>
      <ScreenButton to="settings" className="profile-link" aria-label="Settings" title={workspace.snapshot.profile.name}>
        <Avatar blob={workspace.snapshot.photo?.blob} name={workspace.snapshot.profile.name} /><span className="profile-label"><strong>{workspace.snapshot.profile.name}</strong><small>Settings</small></span>
      </ScreenButton>
    </header>
    <main id="main-content" ref={mainRef} tabIndex={-1} className="main-content">
      {!workspace.noticeAccepted && <StorageNotice />}
      <Outlet />
    </main>
    <nav aria-label="Main navigation" className="main-nav">{pages.filter((page) => page.path !== '/settings').map(({ screen, label, icon: Icon }) => <ScreenButton key={screen} to={screen} className="nav-link"><Icon size={23} aria-hidden="true" /><span>{label}</span></ScreenButton>)}</nav>
  </div>
}
