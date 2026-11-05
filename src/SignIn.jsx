import { useState } from 'react'
import { supabase } from './supabase'
import { Logo, ReceiptPaper } from './ui'

export default function SignIn() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

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
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="field">Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn btn-primary btn-large btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button className="btn btn-secondary btn-block" type="button" disabled={busy} onClick={signInWithGoogle}>
              Sign in with Google
            </button>
            {message && <p className="note note-warn" role="alert">{message}</p>}
          </form>
          <p className="small muted">CartTrail accounts are invite-only for now. Ask whoever set up your CartTrail to add you.</p>
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
