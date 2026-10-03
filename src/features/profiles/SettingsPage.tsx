import { useState } from 'react'
import { Heart, ExternalLink } from 'lucide-react'
import { useWorkspace } from '../../app/workspace-context'
import { supportUrl } from '../../app/config'
import { profiles } from '../../db/profiles'
import { ProfileEditor } from './ProfileEditor'
import { StorageExplanation } from './StorageNotice'
import { useScreenNavigation } from '../../app/navigation-context'
import { ScreenButton } from '../../app/ScreenButton'
import { pages } from '../../app/pages'
import { DownloadData } from '../backups/DownloadData'
import { RestoreData } from '../backups/RestoreData'

export function SettingsPage() {
  const workspace = useWorkspace()
  const { returnScreen } = useScreenNavigation()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <>
    <h1>Settings</h1>
    <ScreenButton className="settings-return" to={returnScreen}>Return to {pages.find((page) => page.screen === returnScreen)?.label ?? 'Train'}</ScreenButton>
    <section className="settings-section" aria-labelledby="profile-heading"><h2 id="profile-heading">Profile</h2>
      <fieldset disabled={busy}><label>Active profile<select value={workspace.snapshot.profile.id} onChange={async (e) => {
        setBusy(true); setError('')
        try { await workspace.select(e.target.value) } catch { setError('Could not switch profiles. Your current profile is still selected.') } finally { setBusy(false) }
      }}>{workspace.profileList.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      <form className="create-profile" onSubmit={async (event) => {
        event.preventDefault(); if (!workspace.allowLeave()) return
        setBusy(true); setError('')
        try { const profile = await profiles.create(name); workspace.useCreated(profile.id); setName('') }
        catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}><label>New profile name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><button type="submit">Create profile</button></form></fieldset>
      {error && <p role="alert">{error}</p>}
      <ProfileEditor key={workspace.snapshot.profile.id} initial={workspace.snapshot} />
    </section>
    <section className="settings-section" aria-labelledby="appearance-heading"><h2 id="appearance-heading">Appearance</h2>
      <div className="segmented" role="group" aria-label="Appearance">{(['dark', 'light'] as const).map((theme) => <button key={theme} type="button" disabled={busy} aria-pressed={workspace.theme === theme} onClick={async () => {
        setBusy(true); setError('')
        try { await profiles.setTheme(theme) } catch { setError('Appearance could not be saved. Your previous setting is unchanged.') } finally { setBusy(false) }
      }}>{theme === 'dark' ? 'Dark' : 'Light'}</button>)}</div>
    </section>
    <section className="settings-section" aria-labelledby="data-heading"><h2 id="data-heading">Data</h2><StorageExplanation /><p role="status">{workspace.dataNotice}</p><DownloadData key={workspace.snapshot.profile.id} /><RestoreData key={`restore:${workspace.snapshot.profile.id}`} /></section>
    <section className="settings-section" aria-labelledby="support-heading"><h2 id="support-heading">Support</h2>
      {supportUrl ? <a className="support-link" href={supportUrl} target="_blank" rel="noopener noreferrer"><Heart aria-hidden="true" size={20} /><span>Support Boros<small>Ko-fi</small></span><ExternalLink aria-hidden="true" size={18} /><span className="sr-only"> (opens in a new tab)</span></a> : <><button className="support-link" disabled aria-describedby="support-note"><Heart aria-hidden="true" size={20} /><span>Support Boros<small>Ko-fi</small></span><ExternalLink aria-hidden="true" size={18} /></button><p id="support-note" className="muted">Support link coming soon.</p></>}
    </section>
  </>
}
