import { useEffect, useRef, useState } from 'react'

const trendMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const axisMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0, notation: 'compact' })
const fullMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const tickMonth = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const monthDate = (month) => new Date(month + '-01T00:00:00Z')
const monthIndex = (month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1

function scale(values, line) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const minSpan = Math.max(1, Math.abs(max) * .1)
  const low = line ? Math.max(0, Math.min(min, max - minSpan)) : Math.min(0, min)
  const high = line ? Math.max(max, low + minSpan) : Math.max(1, max)
  const rough = (high - low) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((tick) => tick >= rough / magnitude) ?? 10) * magnitude
  const bottom = Math.floor(low / step) * step
  const top = Math.ceil(high / step) * step
  return Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, index) => bottom + step * index)
}

export default function TrendChart({ points, label, line = false, emptyText = 'No data for these filters.' }) {
  const host = useRef(null)
  const [width, setWidth] = useState(520)
  const [hover, setHover] = useState(null)
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(210, Math.round(entry.contentRect.width))))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  const height = 218
  const left = 58
  const right = width - 16
  const bottom = height - 31
  const top = 13
  const selected = points.find((point) => point.month === (hover ?? selection)) ?? points.at(-1)
  const ticks = points.length ? scale(points.map((point) => point.cents), line) : []
  const start = points.length ? monthIndex(points[0].month) : 0
  const span = points.length ? monthIndex(points.at(-1).month) - start : 0
  const x = (month) => span ? left + 20 + (monthIndex(month) - start) / span * (right - left - 40) : (left + right) / 2
  const y = (cents) => bottom - (cents - ticks[0]) / (ticks.at(-1) - ticks[0]) * (bottom - top)
  const slots = Math.min(width < 360 ? 3 : 6, points.length)
  const shown = new Set(Array.from({ length: slots }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, slots - 1))]?.month))
  const barWidth = Math.max(2, Math.min(34, (right - left - 40) / Math.max(1, span) * .62))

  return (
    <div className="interactive-chart" ref={host}>
      {!selected ? (
        <div className="ghost-chart">
          <svg viewBox="0 0 520 160" preserveAspectRatio="none" aria-hidden="true">
            {[16, 56, 96, 136].map((y) => <line key={y} x1="0" x2="520" y1={y} y2={y} className="chart-grid" />)}
            {line && <path d="M20 120 C120 110 160 70 260 80 S420 40 500 36" className="ghost-line" />}
          </svg>
          <p className="muted small">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="chart-inspector" aria-live="polite">
            <div><span>{fullMonth.format(monthDate(selected.month))}</span>
              <strong>{trendMoney.format(selected.cents / 100)}</strong></div>
            <small>{selected.detail}</small>
          </div>
          <svg viewBox={'0 0 ' + width + ' ' + height} role="group" aria-label={label}
            onMouseLeave={() => setHover(null)}>
            {ticks.map((tick) => (
              <g key={tick} aria-hidden="true">
                <line x1={left} x2={right} y1={y(tick)} y2={y(tick)}
                  className={tick === 0 ? 'chart-zero' : 'chart-grid'} />
                <text x={left - 8} y={y(tick) + 4} textAnchor="end">{(Math.abs(tick) < 100000 ? trendMoney : axisMoney).format(tick / 100)}</text>
              </g>
            ))}
            {line && points.slice(1).map((point, index) => {
              const previous = points[index]
              return <line key={point.month} x1={x(previous.month)} x2={x(point.month)}
                y1={y(previous.cents)} y2={y(point.cents)} className="trend-line"
                strokeDasharray={monthIndex(point.month) - monthIndex(previous.month) > 1 ? '4 4' : undefined} />
            })}
            {points.map((point, index) => {
              const cx = x(point.month)
              const cy = y(point.cents)
              const active = point.month === selected.month
              const hitLeft = index === 0 ? left : (cx + x(points[index - 1].month)) / 2
              const hitRight = index === points.length - 1 ? right : (cx + x(points[index + 1].month)) / 2
              return (
                <g key={point.month}>
                  {shown.has(point.month) && <text aria-hidden="true" x={cx} y={height - 9} textAnchor="middle">{tickMonth.format(monthDate(point.month))}</text>}
                  {active && <line aria-hidden="true" x1={cx} x2={cx} y1={top} y2={bottom} className="chart-guide" />}
                  {line
                    ? <circle aria-hidden="true" cx={cx} cy={cy} r={active ? 5 : 3.5} className="trend-dot" />
                    : <rect aria-hidden="true" x={cx - barWidth / 2} y={Math.min(cy, y(0))}
                        width={barWidth} height={Math.max(1, Math.abs(cy - y(0)))} rx="2" className={active ? 'trend-bar active' : 'trend-bar'} />}
                  <rect className="chart-hit" x={hitLeft} y={top - 4} width={hitRight - hitLeft}
                    height={bottom - top + 8} fill="transparent" tabIndex="0" role="button"
                    aria-label={fullMonth.format(monthDate(point.month)) + ', ' + trendMoney.format(point.cents / 100) + ', ' + point.detail}
                    aria-pressed={selection === point.month}
                    onMouseEnter={() => setHover(point.month)}
                    onFocus={() => setHover(point.month)}
                    onBlur={() => setHover(null)}
                    onClick={() => { setSelection(point.month); setHover(null) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelection(point.month)
                      }
                      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                        event.preventDefault()
                        const next = index + (event.key === 'ArrowRight' ? 1 : -1)
                        host.current.querySelectorAll('.chart-hit')[next]?.focus()
                      }
                    }} />
                </g>
              )
            })}
          </svg>
          <details className="chart-values">
            <summary>View chart data</summary>
            <table><thead><tr><th scope="col">Month</th><th scope="col">Amount</th><th scope="col">Observations</th></tr></thead>
              <tbody>{points.map((point) => <tr key={point.month}>
                <th scope="row">{fullMonth.format(monthDate(point.month))}</th>
                <td>{trendMoney.format(point.cents / 100)}</td><td>{point.detail}</td>
              </tr>)}</tbody>
            </table>
          </details>
        </>
      )}
    </div>
  )
}
