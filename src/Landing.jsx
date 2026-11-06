import SignIn from './SignIn'
import { Logo, SocialLinks } from './ui'
import { SIGNUPS_OPEN, SITE_HOST } from './shared'
import './styles/landing.css'

// The public page people see before they sign in. Everything on it is static; the sign-in form sits at the bottom.

const FEATURES = [
  { id: 'scan', title: 'Snap a receipt', text: 'Take a photo, upload a screenshot or a PDF. CartTrail reads the items and prices for you to check.', alt: 'The check-the-scan screen showing a receipt photo next to the items that were read', pos: '50% 23%' },
  { id: 'checked', title: 'Checked against the printed subtotal', text: 'When your items add up to the subtotal on the receipt, it gets a checked stamp. If not, you see what is off.', alt: 'A saved receipt with a green CHECKED stamp', pos: '50% 41%' },
  { id: 'changed', title: 'See what changed', text: 'Each month is compared with your usual month, in plain words, so surprises stand out.', alt: 'Cards explaining which categories are above or below your usual spending', pos: '50% 0%' },
  { id: 'trends', title: 'Trends, month by month', text: 'Spending, categories and stores over 3, 6 or 12 months.', alt: 'A bar chart of monthly grocery spending', pos: '50% 8%' },
  { id: 'prices', title: 'Rising prices, spotted', text: 'What you pay per unit now, compared with three months ago.', alt: 'A table of item prices now against three months ago', pos: '50% 0%' },
  { id: 'savings', title: 'Where it costs less', text: 'The same item at different stores, worked out from your own receipts.', alt: 'The savings finder listing items that cost less at another store', pos: '50% 0%' },
  { id: 'map', title: 'Where you shop', text: 'Pin receipts to store branches and see your spending on a map.', alt: 'A map with markers for the stores you shop at', pos: '50% 0%' },
  { id: 'budget', title: 'Your monthly budget', text: 'Set an amount and see how much is left, and where the rest went.', alt: 'A monthly budget bar and spending by category', pos: '50% 0%' },
  { id: 'week', title: 'Your week, as a receipt', text: 'Save or share a picture of your week. It shows totals only, with no store names or items.', alt: 'A receipt-shaped summary of one week of grocery spending', pos: '50% 5%' },
]

function Phone({ children, className = '' }) {
  return <div className={'lp-phone ' + className}><div className="lp-screen">{children}</div></div>
}

export default function Landing() {
  const cta = SIGNUPS_OPEN ? 'Get started free' : 'Sign in'
  return (
    <div className="lp">
      <header className="lp-bar container">
        <Logo />
        <a className="btn btn-secondary" href="#sign-in">{SIGNUPS_OPEN ? 'Sign in' : 'Sign in'}</a>
      </header>

      <main>
        <section className="lp-hero container" aria-labelledby="lp-title">
          <div className="lp-hero-text">
            <h1 id="lp-title">Know where your grocery money goes.</h1>
            <p className="lede">Scan a receipt, check it against the printed subtotal, and watch your trends, prices and favorite stores add up.</p>
            <div className="lp-actions">
              <a className="btn btn-primary btn-large" href="#sign-in">{cta}</a>
              <a className="btn btn-secondary btn-large" href="#features">See how it works</a>
            </div>
            <p className="small muted">Works on Android, iPhone and computers. No app store needed.</p>
          </div>
          <Phone className="lp-hero-phone">
            <img src="/promo/hero.webp" width="780" height="1688" alt="The CartTrail overview: what you spent on groceries in the last 30 days, and a chart of spending by day" />
          </Phone>
        </section>

        <section className="lp-section lp-demo container" aria-labelledby="lp-demo-title">
          <div className="lp-demo-text">
            <h2 id="lp-demo-title">See it in 15 seconds</h2>
            <p className="lede">Snap a receipt, see your trends, spot rising prices, and find where you shop. This is the real app.</p>
          </div>
          <Phone className="lp-video-phone">
            <video controls playsInline preload="none" poster="/promo/poster.jpg" width="540" height="960"
              aria-label="A 15 second tour of CartTrail with narration">
              <source src="/promo/carttrail-15s.mp4" type="video/mp4" />
              Your browser can’t play this video.
            </video>
          </Phone>
        </section>

        <section className="lp-section container" id="features" aria-labelledby="lp-features-title">
          <h2 id="lp-features-title">What you can do</h2>
          <ul className="lp-grid">
            {FEATURES.map((feature) => (
              <li key={feature.id} className="lp-card">
                <div className="lp-card-text">
                  <h3>{feature.title}</h3>
                  <p className="muted">{feature.text}</p>
                </div>
                <div className="lp-shot">
                  <img src={`/promo/${feature.id}.webp`} width="780" height="1688" loading="lazy" alt={feature.alt} style={{ objectPosition: feature.pos }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section container" aria-labelledby="lp-install-title">
          <h2 id="lp-install-title">No app store needed</h2>
          <p className="lede">CartTrail is a web app. Add it to your home screen and it opens like any other app, full screen, with no browser bar.</p>
          <div className="lp-install">
            <div className="panel panel-pad stack-sm">
              <h3>Android (Chrome)</h3>
              <ol>
                <li>Open <a href="https://carttrail.app/"><strong>{SITE_HOST}</strong></a> in Chrome.</li>
                <li>Tap the menu (three dots).</li>
                <li>Tap <strong>Install app</strong>.</li>
              </ol>
            </div>
            <div className="panel panel-pad stack-sm">
              <h3>iPhone (Safari)</h3>
              <ol>
                <li>Open <a href="https://carttrail.app/"><strong>{SITE_HOST}</strong></a> in Safari.</li>
                <li>Tap the Share button.</li>
                <li>Tap <strong>Add to Home Screen</strong>.</li>
              </ol>
            </div>
            <div className="panel panel-pad stack-sm">
              <h3>Computer</h3>
              <ol>
                <li>Open <a href="https://carttrail.app/"><strong>{SITE_HOST}</strong></a> in any browser.</li>
                <li>Sign in and scan a receipt, or drop a file onto the page.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="lp-section container" aria-labelledby="lp-privacy-title">
          <h2 id="lp-privacy-title">Your receipts are yours</h2>
          <ul className="lp-points">
            <li><strong>Private by account.</strong> Only you can see your receipts and totals.</li>
            <li><strong>Delete any time.</strong> Remove your account and all of your data from your profile.</li>
            <li><strong>Plain policies.</strong> Read exactly what we collect and who we share it with in the <a href="/privacy/">privacy policy</a>.</li>
          </ul>
        </section>

        <section className="lp-section lp-signin container" aria-label="Sign in">
          <div className="lp-signin-text">
            <h2>{SIGNUPS_OPEN ? 'Ready to see where it goes?' : 'Already have an account?'}</h2>
            <p className="lede">{SIGNUPS_OPEN
              ? 'Create a free account in a few seconds and scan your first receipt.'
              : 'Sign in to scan receipts and see your spending.'}</p>
          </div>
          <div className="panel panel-pad lp-signin-card"><SignIn embedded /></div>
        </section>
      </main>

      <footer className="lp-foot container stack-sm">
        <p className="small"><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/support/">Support</a></p>
        <SocialLinks />
      </footer>
    </div>
  )
}
