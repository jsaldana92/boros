// Approved production destination; a configured override still passes validation.
export function getSupportUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'ko-fi.com' ||
      url.username || url.password || url.port || url.pathname === '/') return undefined
    return url.href
  } catch {
    return undefined
  }
}

export const supportUrl = getSupportUrl(import.meta.env.VITE_KOFI_URL?.trim() || 'https://ko-fi.com/jhonatansaldana')
