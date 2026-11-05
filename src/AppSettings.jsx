import { useEffect, useState } from 'react'
import { isIOS, isStandalone, useInstallPrompt } from './install'
import { currentSubscription, notifyFunction, pushConfigured, pushSupported, subscribePush, unsubscribePush } from './push'
import { supabase } from './supabase'
import { Icon } from './ui'

const PREFERENCES = [
  ['weekly_summary', 'Weekly summary', 'Sunday morning: what you spent over the last 7 days.'],
  ['budget_alerts', 'Budget alerts', 'When you reach 80% and 100% of your monthly budget.'],
  ['reminders', 'Reminders', 'A nudge when it’s been longer than usual since your last receipt.'],
]

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function InstallCard() {
  const { canPrompt, prompt } = useInstallPrompt()
  const installed = isStandalone()
  return (
    <div className="panel stack-sm">
      <h3 className="h-small">Install CartTrail</h3>
      {installed ? (
        <p className="muted">CartTrail is installed on this device. Press and hold its icon for a one-tap “Scan a receipt” shortcut.</p>
      ) : (
        <>
          <p className="muted">Add it to your home screen to open it full screen, with a one-tap “Scan a receipt” shortcut.</p>
          {canPrompt && <div><button className="btn btn-primary" type="button" onClick={prompt}>Install CartTrail</button></div>}
          {!canPrompt && isIOS() && <p className="small">On iPhone or iPad: tap the Share button in Safari, then <strong>Add to Home Screen</strong>.</p>}
          {!canPrompt && !isIOS() && <p className="small">In your browser’s menu, choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</p>}
        </>
      )}
    </div>
  )
}

export function NotificationsCard({ userId }) {
  const [tableReady, setTableReady] = useState(true)
  const [settings, setSettings] = useState({ weekly_summary: true, budget_alerts: true, reminders: true })
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState(() => (pushSupported() ? Notification.permission : 'unsupported'))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error } = await supabase.from('notification_settings').select('weekly_summary, budget_alerts, reminders, timezone').maybeSingle()
      if (!active) return
      if (error) { setTableReady(false); return }
      if (data) setSettings(data)
      const subscription = await currentSubscription().catch(() => null)
      if (!active) return
      setSubscribed(Boolean(subscription))
      // Keep the saved time zone current so messages arrive at 10am where the user is.
      if (subscription && data && data.timezone !== timeZone()) {
        await supabase.from('notification_settings').upsert({ user_id: userId, timezone: timeZone() }, { onConflict: 'user_id' })
      }
    }
    load()
    return () => { active = false }
  }, [userId])

  async function enable() {
    setBusy(true)
    setMessage('')
    try {
      const subscription = await subscribePush()
      const { endpoint, keys } = subscription.toJSON()
      const { error } = await supabase.from('push_subscriptions').insert({
        endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent.slice(0, 300),
      })
      if (error && error.code !== '23505') throw error
      await supabase.from('notification_settings').upsert({ user_id: userId, timezone: timeZone() }, { onConflict: 'user_id' })
      setSubscribed(true)
      setPermission(Notification.permission)
    } catch (error) {
      setPermission(pushSupported() ? Notification.permission : 'unsupported')
      setMessage(error.message?.startsWith('Notifications') ? error.message : 'Couldn’t turn on notifications. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setMessage('')
    try {
      const endpoint = await unsubscribePush()
      if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      setSubscribed(false)
    } catch {
      setMessage('Couldn’t turn off notifications. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function choose(key, value) {
    const before = settings
    setSettings({ ...settings, [key]: value })
    const { error } = await supabase.from('notification_settings').upsert({ user_id: userId, [key]: value }, { onConflict: 'user_id' })
    if (error) {
      setSettings(before)
      setMessage('Couldn’t save that choice. Try again in a moment.')
    }
  }

  async function sendTest() {
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.functions.invoke(notifyFunction, { body: { action: 'test' } })
      if (error) throw error
      setMessage(data.delivered > 0 ? 'Sent. It should arrive in a few seconds.' : 'No device accepted the notification. Try turning notifications off and on again.')
    } catch {
      setMessage('Couldn’t send a test notification. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (!pushConfigured || !tableReady) return null

  return (
    <div className="panel stack-sm" aria-labelledby="notify-title">
      <h3 className="h-small" id="notify-title">Notifications</h3>
      {permission === 'unsupported' && (
        <p className="muted">
          {isIOS() && !isStandalone()
            ? 'On iPhone, add CartTrail to your home screen first, then open it from there to turn on notifications.'
            : 'This browser doesn’t support notifications.'}
        </p>
      )}
      {permission === 'denied' && !subscribed && (
        <p className="muted">Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.</p>
      )}
      {permission !== 'unsupported' && permission !== 'denied' && !subscribed && (
        <>
          <p className="muted">Get a weekly summary, a heads-up when you near your budget, and a nudge if you’ve gone quiet. You choose which, and can turn it all off any time.</p>
          <div><button className="btn btn-primary" type="button" disabled={busy} onClick={enable}><Icon name="check" /> Turn on notifications</button></div>
        </>
      )}
      {subscribed && (
        <>
          <ul className="pref-list">
            {PREFERENCES.map(([key, label, detail]) => (
              <li key={key}>
                <label className="pref">
                  <input type="checkbox" checked={settings[key]} onChange={(event) => choose(key, event.target.checked)} />
                  <span><strong>{label}</strong><span className="muted small block">{detail}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={sendTest}>Send a test notification</button>
            <button className="btn btn-tertiary" type="button" disabled={busy} onClick={disable}>Turn off on this device</button>
          </div>
        </>
      )}
      {message && <p className="note" role="status">{message}</p>}
    </div>
  )
}
