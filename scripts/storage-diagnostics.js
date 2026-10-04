// Run in DevTools on the affected Boros page before/after an update.
// Read-only: no writes, downloads, network requests, deletes or storage resets.
// Reports identifiers/counts, not names, notes, measurements or photo contents.
void (async () => {
  const report = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    origin: location.origin,
    browser: navigator.userAgent,
    secureContext: window.isSecureContext,
    displayModes: ['browser', 'standalone', 'minimal-ui', 'fullscreen'].filter((mode) => matchMedia(`(display-mode: ${mode})`).matches),
    iosStandalone: navigator.standalone ?? null,
    manifestLink: document.querySelector('link[rel="manifest"]')?.href ?? null,
    loadedScripts: Array.from(document.scripts, (script) => script.src).filter(Boolean),
  }
  const inspect = async (name, operation) => {
    try { report[name] = await operation() } catch (error) { report[name] = { error: `${error.name}: ${error.message}` } }
  }
  await inspect('storage', async () => ({ estimate: await navigator.storage?.estimate(), persistent: await navigator.storage?.persisted() }))
  await inspect('serviceWorkers', async () => (await navigator.serviceWorker?.getRegistrations() ?? []).map((registration) => ({ scope: registration.scope, script: registration.active?.scriptURL })))
  await inspect('databases', async () => {
    if (!indexedDB.databases) throw new Error('Database enumeration unavailable; no database was opened.')
    return indexedDB.databases()
  })
  if (Array.isArray(report.databases) && report.databases.some((db) => db.name === 'boros')) {
    await inspect('boros', async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('boros')
        let finished = false
        const fail = (error) => { finished = true; clearTimeout(timeout); reject(error) }
        const timeout = setTimeout(() => fail(new Error('Timed out opening existing database.')), 8000)
        request.onupgradeneeded = () => request.transaction.abort() // Never create a missing DB.
        request.onblocked = () => fail(new Error('Database opening is blocked by another connection.'))
        request.onerror = () => fail(request.error)
        request.onsuccess = () => { clearTimeout(timeout); if (finished) request.result.close(); else { finished = true; resolve(request.result) } }
      })
      try {
        const stores = Array.from(db.objectStoreNames)
        const transaction = db.transaction(stores, 'readonly')
        const complete = new Promise((resolve, reject) => {
          transaction.oncomplete = resolve
          transaction.onabort = transaction.onerror = () => reject(transaction.error)
        })
        const read = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
        const [counts, profiles, settings] = await Promise.all([
          Promise.all(stores.map(async (store) => [store, await read(transaction.objectStore(store).count())])),
          stores.includes('profiles') ? read(transaction.objectStore('profiles').getAll()) : [],
          stores.includes('settings') ? read(transaction.objectStore('settings').get('workspace')) : undefined,
        ])
        await complete
        return { name: db.name, version: db.version, counts: Object.fromEntries(counts), profiles: profiles.map(({ id, kind, createdAt }) => ({ id, kind, createdAt })), workspacePresent: !!settings, activeProfileId: settings?.activeProfileId ?? null }
      } finally { db.close() }
    })
  }
  console.log(JSON.stringify(report, null, 2))
})()
