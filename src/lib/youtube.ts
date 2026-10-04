import { isYouTubeUrl } from '../schemas/exercise.ts'

// Reuse saved-URL validation, then discard every caller-supplied parameter.
export function youtubeEmbedUrl(value?: string): string | undefined {
  if (!value || !isYouTubeUrl(value)) return undefined
  const url = new URL(value)
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
    : url.pathname === '/watch' ? url.searchParams.get('v')! : url.pathname.split('/')[2]
  return `https://www.youtube.com/embed/${id}?autoplay=0&controls=1&playsinline=1&fs=1`
}
