import { trainingRuntime } from '../train/training-runtime'
import { useRef, useState } from 'react'
import { Heart, ExternalLink } from 'lucide-react'
import { useWorkspace } from '../../app/workspace-context'
import { supportUrl } from '../../app/config'
import { profiles } from '../../db/profiles'
import { ProfileEditor } from './ProfileEditor'
import { StorageExplanation } from './StorageNotice'
import { effectiveProfileName } from '../../schemas/profile'
import { DownloadData } from '../backups/DownloadData'
import { RestoreData } from '../backups/RestoreData'

export function SettingsPage() {
  const workspace = useWorkspace()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false), lock = useRef(false)
  return <>
    <h1>Settings</h1>
    <section className="settings-section" aria-labelledby="profile-heading"><h2 id="profile-heading">Profile</h2>
      <fieldset disabled={busy}><label>Active profile<select aria-label="Active profile" value={workspace.snapshot.profile.id} onChange={async (e) => {
        const target = e.target.value
        if (lock.current) return
        lock.current = true; setBusy(true); setError('')
        try {
          if (target === 'new-profile') {
            if (!await workspace.requestLeave()) return
            const profile = await profiles.createNextGuest()
            workspace.useCreated(profile.id)
          } else await workspace.select(target)
        } catch (e) { setError(`Could not change profiles. ${e instanceof Error ? e.message : 'Try again.'} Your current profile is still selected.`) }
        finally { lock.current = false; setBusy(false) }
      }}>{workspace.profileList.map((profile) => <option key={profile.id} value={profile.id}>{effectiveProfileName(profile)}</option>)}<option value="new-profile">New profile</option></select></label></fieldset>
      {error && <p role="alert">{error}</p>}
      <ProfileEditor key={workspace.snapshot.profile.id} initial={workspace.snapshot} />
    </section>
    <section className="settings-section" aria-labelledby="appearance-heading"><h2 id="appearance-heading">Appearance</h2>
      <div className="segmented" role="group" aria-label="Appearance">{(['dark', 'light'] as const).map((theme) => <button key={theme} type="button" disabled={busy} aria-pressed={workspace.theme === theme} onClick={async () => {
        setBusy(true); setError('')
        try { await profiles.setTheme(theme) } catch { setError('Appearance could not be saved. Your previous setting is unchanged.') } finally { setBusy(false) }
      }}>{theme === 'dark' ? 'Dark' : 'Light'}</button>)}</div>
    </section>
    <section className="settings-section" aria-labelledby="sound-heading"><h2 id="sound-heading">Sound</h2><div className="segmented" role="group" aria-label="Sound">{([false, true] as const).map((sound) => <button key={String(sound)} disabled={busy} aria-pressed={workspace.sound === sound} onClick={async () => { setBusy(true); setError(''); try { trainingRuntime().setSound(sound); await profiles.setSound(sound) } catch (e) { trainingRuntime().setSound(workspace.sound); setError((e as Error).message) } finally { setBusy(false) } }}>{sound ? 'On' : 'Off'}</button>)}</div><p className="muted">Timer completion: Sound On plays three times; Off attempts one vibration where supported. Device restrictions may prevent feedback, especially in the background.</p></section>
    <section className="settings-section" aria-labelledby="data-heading"><h2 id="data-heading">Data</h2><StorageExplanation concise /><p role="status">{workspace.dataNotice}</p><DownloadData key={workspace.snapshot.profile.id} /><RestoreData key={`restore:${workspace.snapshot.profile.id}`} /></section>
    <section className="settings-section" aria-labelledby="support-heading"><h2 id="support-heading">Support</h2>
      {supportUrl ? <a className="support-link" href={supportUrl} target="_blank" rel="noopener noreferrer"><Heart aria-hidden="true" size={20} /><span>Support Boros<small>Ko-fi</small></span><ExternalLink aria-hidden="true" size={18} /><span className="sr-only"> (opens in a new tab)</span></a> : <><button className="support-link" disabled aria-describedby="support-note"><Heart aria-hidden="true" size={20} /><span>Support Boros<small>Ko-fi</small></span><ExternalLink aria-hidden="true" size={18} /></button><p id="support-note" className="muted">Support link unavailable.</p></>}
    </section>
  </>
}
