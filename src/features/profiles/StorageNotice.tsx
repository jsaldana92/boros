import { useState } from 'react'
import { profiles } from '../../db/profiles'

export function StorageExplanation() {
  return <><p>Data is saved in this browser. Clearing site data removes your profiles and logs. Download a backup to keep a copy.</p><p className="muted">Data belongs to this browser and website address. Private browsing is unsuitable for durable records. Profiles are not password-protected; anyone using this browser can select them. Download Data and Upload Data in Settings provide local backups and a reviewed restore.</p></>
}
export function StorageNotice() {
  const [error, setError] = useState('')
  return <section className="storage-notice" aria-label="About browser storage"><StorageExplanation /><button onClick={async () => {
    try { await profiles.acceptNotice() } catch { setError('Could not remember this notice. Please try again.') }
  }}>Understood</button>{error && <p role="alert">{error}</p>}</section>
}
