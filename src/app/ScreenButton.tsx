import type { ButtonHTMLAttributes } from 'react'
import { useScreenNavigation } from './navigation-context'
import type { Screen } from './navigation-preference'

// Buttons deliberately expose no server URL to modified clicks or link menus.
export function ScreenButton({ to, className = '', children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { to: Screen }) {
  const { screen, openScreen } = useScreenNavigation()
  return <button {...props} type="button" className={`${className}${screen === to ? ' active' : ''}`} aria-current={screen === to ? 'page' : undefined} onClick={() => openScreen(to)}>{children}</button>
}
