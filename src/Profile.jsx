import { useEffect, useState } from 'react'
import { InstallCard, NotificationsCard } from './AppSettings'
import { printFeedback, setPrefs, usePrefs } from './delight'
import { supabase } from './supabase'
import { Avatar } from './ui'

// The Edge Function that deletes data. The Supabase dashboard editor names functions at random, so a different
// name can be set with VITE_DELETE_FUNCTION.
const deleteFunction = import.meta.env.VITE_DELETE_FUNCTION || 'delete-account'

const plural = (count, one, many = one + 's') => `${count} ${count === 1 ? one : many}`
const detectedZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function zoneOptions(current) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes(current) ? zones : [current, ...zones]
}

function AccountCard({ user, profile, profileReady, avatarUrl, recovery, onSaveProfile, onUploadAvatar, onRemoveAvatar, onSignOut }) {
  const [name, setName] = useState(profile.display_name)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordMessage, setPasswordMessage] = useState({ text: '', tone: 'info' })

  async function saveName(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await onSaveProfile({ display_name: name.trim() })
      setMessage('Saved.')
    } catch {
      setMessage('Couldn’t save your name. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseAvatar(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      await onUploadAvatar(file)
      setMessage('Picture updated.')
    } catch (error) {
      setMessage(error.message || 'Couldn’t update your picture. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAvatar() {
    setBusy(true)
    setMessage('')
    try {
      await onRemoveAvatar()
      setMessage('Picture removed.')
    } catch {
      setMessage('Couldn’t remove your picture. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (password.length < 8) return setPasswordMessage({ text: 'Use at least 8 characters.', tone: 'error' })
    if (password !== confirm) return setPasswordMessage({ text: 'The two passwords don’t match.', tone: 'error' })
    setBusy(true)
    setPasswordMessage({ text: '', tone: 'info' })
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setPasswordMessage({ text: error.message || 'Couldn’t change your password.', tone: 'error' })
    setPassword('')
    setConfirm('')
    setPasswordMessage({ text: 'Your password has been changed.', tone: 'info' })
  }

  return (
    <section className="panel stack" aria-labelledby="account-title">
      <h2 className="h-small" id="account-title">Account</h2>
      <div className="profile-top">
        <Avatar name={profile.display_name} email={user.email} userId={user.id} url={avatarUrl} size={72} />
        {profileReady && (
          <div className="stack-sm">
            <div className="button-row">
              <label className="btn btn-secondary">
                <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={chooseAvatar} />
                {avatarUrl ? 'Change picture' : 'Upload a picture'}
              </label>
              {avatarUrl && <button className="btn btn-tertiary" type="button" disabled={busy} onClick={removeAvatar}>Remove</button>}
            </div>
            <p className="small muted">Pictures are cropped to a square and shrunk before they are saved, which also removes any location data in the photo.</p>
          </div>
        )}
      </div>

      {profileReady && (
        <form className="stack-sm" onSubmit={saveName}>
          <label className="field">Your name
            <input value={name} maxLength={60} autoComplete="name" placeholder="Optional" onChange={(event) => { setName(event.target.value); setMessage('') }} />
          </label>
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={busy || name.trim() === profile.display_name}>Save name</button>
          </div>
        </form>
      )}

      <dl className="facts">
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Sign-in</dt><dd>{user.hasPassword ? 'Email and password' : 'Google'}</dd></div>
      </dl>

      {user.hasPassword && (
        <details className="disclosure" open={recovery}>
          <summary>Change password</summary>
          <form className="stack-sm" onSubmit={changePassword}>
            {recovery && <p className="note">Choose a new password below.</p>}
            <label className="field">New password
              <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">Confirm new password
              <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </label>
            {passwordMessage.text && <p className={passwordMessage.tone === 'error' ? 'note note-warn' : 'note'} role="status">{passwordMessage.text}</p>}
            <div className="button-row"><button className="btn btn-secondary" type="submit" disabled={busy}>Change password</button></div>
          </form>
        </details>
      )}

      {message && <p className="note" role="status">{message}</p>}
      <div><button className="btn btn-secondary" type="button" onClick={onSignOut}>Sign out</button></div>
    </section>
  )
}

function PreferencesCard({ userId, budget }) {
  const [zone, setZone] = useState(null) // null until loaded; false when the settings table isn't there
  const [value, setValue] = useState(budget?.cents == null ? '' : String(budget.cents / 100))
  const [budgetMessage, setBudgetMessage] = useState({ text: '', tone: 'info' })
  const [zoneMessage, setZoneMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('notification_settings').select('timezone').maybeSingle().then(({ data, error }) => {
      if (active) setZone(error ? false : data?.timezone ?? detectedZone())
    })
    return () => { active = false }
  }, [])

  async function saveBudget(event) {
    event.preventDefault()
    const amount = Number(value)
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      return setBudgetMessage({ text: 'Enter an amount between $0 and $1,000,000.', tone: 'error' })
    }
    setBusy(true)
    try {
      await budget.save(Math.round(amount * 100))
      setBudgetMessage({ text: 'Budget saved.', tone: 'info' })
    } catch {
      setBudgetMessage({ text: 'Couldn’t save your budget. Try again in a moment.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function chooseZone(event) {
    const next = event.target.value
    const before = zone
    setZone(next)
    setZoneMessage('')
    const { error } = await supabase.from('notification_settings').upsert({ user_id: userId, timezone: next }, { onConflict: 'user_id' })
    if (error) {
      setZone(before)
      setZoneMessage('Couldn’t save your time zone. Try again in a moment.')
    } else {
      setZoneMessage('Saved.')
    }
  }

  if (!budget && zone === false) return null
  return (
    <section className="panel stack" aria-labelledby="preferences-title">
      <h2 className="h-small" id="preferences-title">Preferences</h2>
      {budget && (
        <form className="stack-sm" onSubmit={saveBudget}>
          <label className="field">Monthly grocery budget ($)
            <input type="number" inputMode="decimal" min="0" step="1" placeholder="500" value={value} onChange={(event) => { setValue(event.target.value); setBudgetMessage({ text: '', tone: 'info' }) }} />
          </label>
          {budgetMessage.text && <p className={budgetMessage.tone === 'error' ? 'note note-warn' : 'note'} role="status">{budgetMessage.text}</p>}
          <div className="button-row"><button className="btn btn-secondary" type="submit" disabled={busy}>Save budget</button></div>
        </form>
      )}
      {zone && (
        <div className="stack-sm">
          <label className="field">Time zone
            <select value={zone} onChange={chooseZone}>
              {zoneOptions(zone).map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <p className="small muted">Notifications arrive at 10am in this time zone.</p>
          {zoneMessage && <p className="note" role="status">{zoneMessage}</p>}
        </div>
      )}
    </section>
  )
}

function TouchesCard() {
  const { sound, buzz, tone } = usePrefs()
  const canBuzz = typeof navigator.vibrate === 'function'
  return (
    <section className="panel stack" aria-labelledby="touches-title">
      <h2 className="h-small" id="touches-title">Little touches</h2>
      <label className="field">Tone of the notes
        <select value={tone} onChange={(event) => setPrefs({ tone: event.target.value })}>
          <option value="plain">Straightforward</option>
          <option value="playful">Playful</option>
        </select>
      </label>
      <p className="small muted">Playful adds a short aside to the notes on your overview, like “Your wallet noticed before you did.”</p>
      <ul className="pref-list">
        <li>
          <label className="pref">
            <input type="checkbox" checked={sound} onChange={(event) => setPrefs({ sound: event.target.checked })} />
            <span><strong>Printer sound when I save</strong><span className="muted small block">A short thermal-printer noise. Off by default.</span></span>
          </label>
        </li>
        {canBuzz && (
          <li>
            <label className="pref">
              <input type="checkbox" checked={buzz} onChange={(event) => setPrefs({ buzz: event.target.checked })} />
              <span><strong>Buzz when I save</strong><span className="muted small block">A short vibration on phones. Off by default.</span></span>
            </label>
          </li>
        )}
      </ul>
      <div><button className="btn btn-secondary" type="button" onClick={() => printFeedback({ force: true })}>Preview</button></div>
      <p className="small muted">These choices are remembered on this device only.</p>
    </section>
  )
}

function DeleteForm({ scope, user, onDeleted }) {
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const everything = scope === 'account'

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      // Email users prove it is them first; that also refreshes the recent sign-in the server requires.
      if (user.hasPassword) {
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
        if (error) throw new Error('That password isn’t right.')
      }
      const { error } = await supabase.functions.invoke(deleteFunction, { body: { scope, confirm: 'DELETE' } })
      if (error) {
        const details = error.context instanceof Response ? await error.context.json().catch(() => null) : null
        throw new Error(details?.error || 'Couldn’t delete right now. Try again in a moment.')
      }
      await onDeleted(scope)
    } catch (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  return (
    <details className="danger">
      <summary>{everything ? 'Delete my account' : 'Delete my receipts and data'}</summary>
      <form className="stack-sm" onSubmit={submit}>
        <p>{everything
          ? 'This permanently deletes your account and everything in it: receipts, items, store branches, budget, profile, picture, notification settings and devices.'
          : 'This permanently deletes your receipts, items, saved store branches, remembered categories and budget. Your account stays.'} It can’t be undone. Export a CSV first if you might want your history.</p>
        {user.hasPassword && (
          <label className="field">Your password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
        )}
        <label className="field">Type DELETE to confirm
          <input value={word} autoComplete="off" onChange={(event) => setWord(event.target.value)} />
        </label>
        {message && <p className="note note-warn" role="alert">{message}</p>}
        <div className="button-row">
          <button className="btn btn-danger" type="submit" disabled={busy || word !== 'DELETE' || (user.hasPassword && password === '')}>
            {busy ? 'Deleting…' : everything ? 'Delete my account' : 'Delete my data'}
          </button>
        </div>
      </form>
    </details>
  )
}

function DataCard({ user, receiptCount, itemCount, onExport, onDeleted }) {
  return (
    <section className="panel stack" aria-labelledby="data-title">
      <h2 className="h-small" id="data-title">Your data</h2>
      <p className="muted">You have {plural(receiptCount, 'receipt')} with {plural(itemCount, 'item')}. Only you can see them.</p>
      <div className="button-row">
        <button className="btn btn-secondary" type="button" disabled={receiptCount === 0} onClick={onExport}>Export CSV</button>
      </div>
      <div className="stack-sm">
        <DeleteForm scope="data" user={user} onDeleted={onDeleted} />
        <DeleteForm scope="account" user={user} onDeleted={onDeleted} />
      </div>
      <p className="small muted">Learn more in the <a href="/privacy/">privacy policy</a> or <a href="/delete-account/">how deleting works</a>.</p>
    </section>
  )
}

export default function Profile({ user, profile, profileReady, avatarUrl, recovery, budget, receiptCount, itemCount, sample, onSaveProfile, onUploadAvatar, onRemoveAvatar, onSignOut, onExport, onDeleted }) {
  return (
    <div className="stack-xl">
      <div>
        <h1 className="h-page">{profile.display_name ? `Hi, ${profile.display_name}` : 'Profile'}</h1>
        <p className="lede">Your account, preferences and data.</p>
      </div>
      <div className="settings-grid">
        <AccountCard user={user} profile={profile} profileReady={profileReady} avatarUrl={avatarUrl} recovery={recovery}
          onSaveProfile={onSaveProfile} onUploadAvatar={onUploadAvatar} onRemoveAvatar={onRemoveAvatar} onSignOut={onSignOut} />
        <PreferencesCard userId={user.id} budget={budget} />
        <TouchesCard />
        <NotificationsCard userId={user.id} />
        <InstallCard />
      </div>
      <DataCard user={user} receiptCount={sample ? 0 : receiptCount} itemCount={sample ? 0 : itemCount} onExport={onExport} onDeleted={onDeleted} />
    </div>
  )
}
