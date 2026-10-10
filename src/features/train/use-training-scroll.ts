import { useLayoutEffect } from 'react'
const positions = new Map<string, number>()
export function useTrainingScroll(profileId: string, draftId: string) {
  useLayoutEffect(() => {
    const key = `${profileId}:${draftId}`, position = positions.get(key)
    const frame = requestAnimationFrame(() => { if (position !== undefined) window.scrollTo(0, position) })
    const remember = () => positions.set(key, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', remember) }
  }, [profileId, draftId])
}
