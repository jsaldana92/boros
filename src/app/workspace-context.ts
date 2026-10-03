import { createContext, useContext } from 'react'
import type { Profile, Theme } from '../schemas/profile'
import type { ProfileSnapshot } from '../db/profiles'

export interface Workspace {
  snapshot: ProfileSnapshot
  profileList: Profile[]
  theme: Theme
  noticeAccepted: boolean
  dirty: boolean
  setDirty: (value: boolean) => void
  allowLeave: () => boolean
  select: (id: string) => Promise<void>
  dataNotice: string
  useCreated: (id: string, notice?: string) => void
}
export const WorkspaceContext = createContext<Workspace | undefined>(undefined)
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('Workspace is not ready.')
  return context
}
