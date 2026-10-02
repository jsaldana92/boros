import { AppRouter } from './app/AppRouter'
import type { Screen } from './app/navigation-preference'

export default function App({ initialScreen }: { initialScreen: Screen }) {
  return <AppRouter initialScreen={initialScreen} />
}
