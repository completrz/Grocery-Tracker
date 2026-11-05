import { dollars as dollarsFormat } from './format'

const paths = {
  scan: ['M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2', 'M8 12h8'],
  plus: ['M12 5v14M5 12h14'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 8v5M12 16.5v.5', 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0'],
  pin: ['M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z', 'M9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0'],
  search: ['M15.5 15.5 21 21m-3.5-10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'],
}

export function Icon({ name, size = 18, strokeWidth = 2 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

export function Logo() {
  return (
    <span className="logo">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="var(--accent)" />
        <path d="M8 6h12v15l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" fill="#FFFFFF" />
        <path d="M11 11h6M11 14.5h4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="wordmark">CartTrail</span>
    </span>
  )
}

const TORN_EDGE = 'M0 0H300V0L290 10 280 0 270 10 260 0 250 10 240 0 230 10 220 0 210 10 200 0 190 10 180 0 170 10 160 0 150 10 140 0 130 10 120 0 110 10 100 0 90 10 80 0 70 10 60 0 50 10 40 0 30 10 20 0 10 10 0 0Z'

// White paper strip with a torn bottom edge and a highlighter swipe behind
// the SUBTOTAL line. `lines` is [{ name, price }], `children` renders under the subtotal.
export function ReceiptPaper({ store, address, date, lines, subtotal, total, children, stamp, className = '', style }) {
  return (
    <div className={'receipt-paper ' + className} style={style}>
      <div className={stamp ? 'receipt-body has-stamp' : 'receipt-body'}>
        <div className="receipt-store">{store}</div>
        {address && <div className="receipt-sub">{address}</div>}
        {date && <div className="receipt-sub">{date}</div>}
        <div className="receipt-rule" />
        {lines.map((line, index) => (
          <div className="receipt-row" key={index}>
            <span>{line.name}</span><span>{line.price}</span>
          </div>
        ))}
        <div className="receipt-rule receipt-rule-last" />
        <div className="receipt-row receipt-subtotal"><span>SUBTOTAL</span><span>{subtotal}</span></div>
        {total && <div className="receipt-row receipt-total"><span>TOTAL</span><span>{total}</span></div>}
        {children}
        {stamp && <div className="stamp" aria-hidden="true">{stamp}</div>}
      </div>
      <svg className="receipt-edge" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true">
        <path d={TORN_EDGE} fill="#FFFFFF" />
      </svg>
    </div>
  )
}

export function CategoryBars({ categories }) {
  const max = Math.max(1, ...categories.map((category) => Math.abs(category.cents)))
  return (
    <ul className="bar-list">
      {categories.map((category, index) => (
        <li key={category.name}>
          <div className="bar-label"><span><span className="aisle">Aisle {index + 1}</span>{category.name}</span><strong>{dollarsFormat.format(category.cents / 100)}</strong></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(2, Math.abs(category.cents) / max * 100) + '%' }} /></div>
        </li>
      ))}
    </ul>
  )
}


// Placeholder shapes for panels with nothing to show yet. They hold the layout open
// and never contain numbers, so nothing here can be mistaken for real data.
export function GhostBars({ count = 4 }) {
  return (
    <ul className="bar-list ghost" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className="bar-label"><span className="ghost-text" style={{ width: 90 - index * 12 }} /><span className="ghost-text" style={{ width: 44 }} /></div>
          <div className="bar-track" />
        </li>
      ))}
    </ul>
  )
}

export function GhostRows({ columns, rows = 3 }) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} className="ghost" aria-hidden="true">
      {Array.from({ length: columns }, (_, col) => (
        <td key={col} className={col === 0 ? undefined : 'num'}><span className="ghost-text" style={{ width: col === 0 ? 120 - row * 14 : 48 }} /></td>
      ))}
    </tr>
  ))
}

// A blank receipt strip with the same silhouette as <ReceiptPaper>.
export function GhostReceipt() {
  const rows = [110, 90, 120, 100]
  return (
    <div className="receipt-paper" aria-hidden="true">
      <div className="receipt-body">
        <div className="ghost-center"><span className="ghost-text" style={{ width: 70 }} /></div>
        <div className="ghost-center"><span className="ghost-text" style={{ width: 110 }} /></div>
        <div className="receipt-rule" />
        {rows.map((width, index) => (
          <div className="receipt-row" key={index}><span className="ghost-text" style={{ width }} /><span className="ghost-text" style={{ width: 36 }} /></div>
        ))}
        <div className="receipt-rule receipt-rule-last" />
        <div className="receipt-row receipt-subtotal"><span className="ghost-text" style={{ width: 80 }} /><span className="ghost-text" style={{ width: 44 }} /></div>
      </div>
      <svg className="receipt-edge" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true">
        <path d={TORN_EDGE} fill="#FFFFFF" />
      </svg>
    </div>
  )
}

// A circle with the user's picture, or their initial on a colour that is stable for their account.
const AVATAR_COLORS = ['#1D5C3A', '#2F5D62', '#7A3B1D', '#4F5B2A', '#8A3A3A', '#3F4A52']

export function Avatar({ name, email, userId, url, size = 36 }) {
  const initial = (Array.from((name || '').trim())[0] ?? Array.from(email || '?')[0]).toUpperCase()
  let hash = 0
  for (const char of userId || email || '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  return url
    ? <img className="avatar" src={url} alt="" style={style} />
    : <span className="avatar" aria-hidden="true" style={{ ...style, background: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] }}>{initial}</span>
}

// Shown while data loads: a receipt that prints its lines one by one.
export function LoadingReceipt({ label = 'Printing your receipts…' }) {
  return (
    <div className="printing" role="status" aria-label={label}>
      <div className="receipt-paper">
        <div className="receipt-body">
          {[88, 66, 78, 58, 72].map((width, index) => (
            <div className="receipt-row printing-row" key={index} style={{ '--i': index }}>
              <span className="ghost-text" style={{ width: width + '%' }} /><span className="ghost-text" style={{ width: 36 }} />
            </div>
          ))}
          <div className="receipt-rule receipt-rule-last" />
          <div className="receipt-row receipt-subtotal"><span className="ghost-text" style={{ width: 80 }} /><span className="ghost-text" style={{ width: 44 }} /></div>
        </div>
        <svg className="receipt-edge" viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true"><path d={TORN_EDGE} fill="#FFFFFF" /></svg>
      </div>
      <p className="muted small">{label}</p>
    </div>
  )
}
