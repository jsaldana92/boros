import { CalendarDays, ChartNoAxesCombined, Dumbbell, Plus, UserRound } from 'lucide-react'

export const pages = [
  { screen: 'train', path: '/train', label: 'Train', icon: Dumbbell },
  { screen: 'create', path: '/create', label: 'Create', icon: Plus },
  { screen: 'calendar', path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { screen: 'progress', path: '/progress', label: 'Progress', icon: ChartNoAxesCombined },
  { screen: 'settings', path: '/settings', label: 'Settings', icon: UserRound },
] as const
export type AppPage = (typeof pages)[number]
