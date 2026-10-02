export const screenIds = ['train', 'create', 'calendar', 'progress', 'settings'] as const
export type Screen = (typeof screenIds)[number]
export const screenPreferenceKey = 'boros.navigation.screen'
export const isScreen = (value: unknown): value is Screen => typeof value === 'string' && screenIds.includes(value as Screen)

// Called once before React starts, so StrictMode cannot consume a legacy hash twice.
export function initialScreen(browser: Window): Screen {
  const { hash, pathname, search } = browser.location
  if (hash) {
    const legacy = hash.slice(2).replace(/\/$/, '')
    browser.history.replaceState(browser.history.state, '', pathname + search)
    return hash.startsWith('#/') && isScreen(legacy) ? legacy : 'train'
  }
  try {
    const stored = browser.sessionStorage.getItem(screenPreferenceKey)
    return isScreen(stored) ? stored : 'train'
  } catch { return 'train' }
}

export function rememberScreen(screen: Screen) {
  try { window.sessionStorage.setItem(screenPreferenceKey, screen) } catch { /* Navigation still works when storage is blocked. */ }
}
