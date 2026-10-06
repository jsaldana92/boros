import { createContext, useContext } from 'react'
import type { Screen } from './navigation-preference'

export interface ScreenNavigation {
  trainingEntry?: { profileId: string; draftId?: string; sessionId?: string }
  rememberTraining: (entry?: ScreenNavigation['trainingEntry']) => void
  screen: Screen
  returnScreen: Screen
  openScreen: (screen: Screen, trainingEntry?: ScreenNavigation['trainingEntry']) => void
}
export const NavigationContext = createContext<ScreenNavigation | undefined>(undefined)
export function useScreenNavigation() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error('Navigation is not ready.')
  return context
}
