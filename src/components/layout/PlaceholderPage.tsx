import { ScreenButton } from '../../app/ScreenButton'
import type { AppPage } from '../../app/pages'

export function PlaceholderPage({ page }: { page?: AppPage }) {
  return <><h1>{page?.label ?? 'Page not found'}</h1><p className="empty-state">{page ? 'Not available yet' : 'Unknown route'}</p>{!page && <ScreenButton className="return-link" to="train">Back to Train</ScreenButton>}</>
}
