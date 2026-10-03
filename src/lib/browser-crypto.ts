export class BrowserCompatibilityError extends Error {
  constructor(message: string) { super(message); this.name = 'BrowserCompatibilityError' }
}

const randomMessage = 'Secure random ID generation is unavailable in this browser. Use an up-to-date browser at a valid HTTPS address. Existing data has not been replaced.'

export function requireSecureRandom(source = globalThis.crypto) {
  if (typeof source?.randomUUID !== 'function' && typeof source?.getRandomValues !== 'function') throw new BrowserCompatibilityError(randomMessage)
}

// Works in windows and workers. Neither path uses weak randomness or rewrites IDs.
export function createId(source = globalThis.crypto): string {
  requireSecureRandom(source)
  if (typeof source.randomUUID === 'function') {
    try { return source.randomUUID() } catch { /* Try the other secure source. */ }
  }
  try {
    const bytes = source.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // UUID version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC variant 10xx
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch { throw new BrowserCompatibilityError(randomMessage) }
}

export function requireBackupCrypto() {
  const subtle = globalThis.crypto?.subtle
  if (typeof subtle?.digest !== 'function') throw new BrowserCompatibilityError('Backup checksum verification requires Web Crypto in a secure browser context. Open Boros over HTTPS with a valid certificate in an up-to-date browser. Checksums cannot be skipped.')
  return subtle
}
