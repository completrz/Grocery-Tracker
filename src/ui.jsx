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
export function ReceiptPaper({ store, address, date, lines, subtotal, total, children, className = '', style }) {
  return (
    <div className={'receipt-paper ' + className} style={style}>
      <div className="receipt-body">
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
      {categories.map((category) => (
        <li key={category.name}>
          <div className="bar-label"><span>{category.name}</span><strong>{dollarsFormat.format(category.cents / 100)}</strong></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(2, Math.abs(category.cents) / max * 100) + '%' }} /></div>
        </li>
      ))}
    </ul>
  )
}

