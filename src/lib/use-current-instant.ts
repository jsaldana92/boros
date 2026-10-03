import { useEffect, useState } from 'react'

// Recheck at each minute boundary and immediately after a suspended tab resumes.
export function useCurrentInstant() {
  const [instant, setInstant] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      setInstant(new Date())
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000)
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return instant
}
