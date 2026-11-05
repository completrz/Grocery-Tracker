import { useState } from 'react'
import { supabase } from './supabase'
import { Logo, ReceiptPaper } from './ui'

export default function SignIn() {
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState(() => {
    // Shown once after the user deletes their account from their Profile.
    try {
      if (window.sessionStorage.getItem('carttrail-deleted')) {
        window.sessionStorage.removeItem('carttrail-deleted')
        return 'Your account and data have been deleted.'
      }
    } catch { /* the note is optional */ }
    return ''
  })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function resetPassword() {
    if (!email.trim()) {
      setMessage('Enter your email above, then choose “Forgot your password?” again.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (error) throw error
      // Same answer whether or not an account exists, so this can't be used to find out who has one.
      setNotice('If an account exists for that email, we’ve sent a link to choose a new password.')
    } catch {
      setMessage('Couldn’t send the email right now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.get('email').trim(),
        password: form.get('password'),
      })
      if (error) throw error
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/', window.location.origin).href },
      })
      if (error) throw error
    } catch (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <main className="auth-main">
        <Logo />
        <div className="auth-content">
          <div>
            <h1>Turn grocery receipts into a spending history.</h1>
            <p className="lede">Photograph a receipt, check the items against the printed subtotal, and see where the month’s grocery money went.</p>
          </div>
          <form className="stack" onSubmit={signIn}>
            <label className="field">Email
              <input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <div><button className="link-button" type="button" disabled={busy} onClick={resetPassword}>Forgot your password?</button></div>
            <button className="btn btn-primary btn-large btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button className="btn btn-secondary btn-block" type="button" disabled={busy} onClick={signInWithGoogle}>
              Sign in with Google
            </button>
            {notice && <p className="note" role="status">{notice}</p>}
            {message && <p className="note note-warn" role="alert">{message}</p>}
          </form>
          <p className="small muted">CartTrail accounts are invite-only for now. Ask whoever set up your CartTrail to add you.</p>
          <p className="small"><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/support/">Support</a></p>
        </div>
      </main>
      <aside className="auth-aside" aria-hidden="true">
        <ReceiptPaper className="receipt-tilted" store="H-E-B" date="11/03/2026   6:42 PM"
          lines={[
            { name: 'BANANAS', price: '1.27' },
            { name: 'ROMA TOMATOES', price: '1.01' },
            { name: 'JALAPENO PEPPERS', price: '0.38' },
            { name: 'H-E-B BOLILLO 6CT', price: '2.46' },
          ]}
          subtotal="5.12" total="5.12" />
      </aside>
    </div>
  )
}
