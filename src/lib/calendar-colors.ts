// A cosmetic, profile-scoped preference; no user records or database migrations.
// Retain assignments for removed/hidden plans so returning plans keep their color.
const remembered = new Map<string, Record<string, number>>()
const hash = (id: string) => [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0) % 10
export function calendarColors(profileId: string, planIds: string[], storage?: Pick<Storage, 'getItem' | 'setItem'>): Record<string, number> {
  const key = `boros.calendar-colors.${profileId}`
  const saved: Record<string, number> = { ...remembered.get(key) }
  try {
    storage ??= window.localStorage
    const value: unknown = JSON.parse(storage.getItem(key) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) for (const [id, color] of Object.entries(value)) {
      if (/^[a-z0-9-]+$/i.test(id) && Number.isInteger(color) && color >= 0 && color < 10) saved[id] = color
    }
  } catch { /* Cosmetic preferences must not block a database-backed screen. */ }
  const ids = [...new Set(planIds)].sort(), used = new Set(ids.flatMap((id) => saved[id] === undefined ? [] : [saved[id]]))
  for (const id of ids) if (saved[id] === undefined) {
    const first = hash(id), available = Array.from({ length: 10 }, (_, i) => (first + i) % 10).find((color) => !used.has(color))
    saved[id] = available ?? first; used.add(saved[id])
  }
  remembered.set(key, saved)
  try { storage?.setItem(key, JSON.stringify(saved)) } catch { /* Keep the in-memory preference if storage is unavailable. */ }
  return saved
}
