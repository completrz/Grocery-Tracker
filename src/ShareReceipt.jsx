import { useEffect, useMemo, useState } from 'react'
import { receiptFooter, usePrefs } from './delight'
import { drawReceipt, toBlob } from './receiptImage'
import { summarize, summaryNote, summaryText } from './summary'

// "Your week, as a receipt": a picture of the last 7 days (or the month so far) that can be saved or shared.
export default function ShareReceipt({ receipts, rules, count }) {
  const { tone } = usePrefs()
  const [period, setPeriod] = useState('week')
  const [picture, setPicture] = useState({ url: '', blob: null })
  const [message, setMessage] = useState('')
  const summary = useMemo(() => summarize(receipts, rules, period), [receipts, rules, period])
  const note = summary ? summaryNote(summary, tone) : ''
  const description = summary ? summaryText(summary, note) : ''

  useEffect(() => {
    if (!summary) return
    const draw = { active: true, url: '' }
    drawReceipt(summary, { note, footer: receiptFooter(count) }).then(toBlob).then((blob) => {
      if (!draw.active || !blob) return
      draw.url = URL.createObjectURL(blob)
      setPicture({ url: draw.url, blob })
    })
    return () => {
      draw.active = false
      if (draw.url) URL.revokeObjectURL(draw.url)
    }
  }, [summary, note, count])

  const file = () => new File([picture.blob], `carttrail-${period}.png`, { type: 'image/png' })
  const canShare = typeof navigator.canShare === 'function' && picture.blob && navigator.canShare({ files: [file()] })

  async function share() {
    setMessage('')
    try {
      await navigator.share({ files: [file()], title: 'My CartTrail receipt' })
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage('Couldn’t open sharing. You can save the picture instead.')
    }
  }

  function save() {
    const link = document.createElement('a')
    link.href = picture.url
    link.download = `carttrail-${period}.png`
    link.click()
  }

  return (
    <section className="stack-sm" aria-labelledby="share-title">
      <div>
        <h2 className="h-section" id="share-title">{period === 'week' ? 'Your week' : 'Your month'}, as a receipt</h2>
        <p className="muted small">A picture to save or share. It shows totals and category names only: no stores and no item names.</p>
      </div>
      <div className="segmented" role="group" aria-label="Period">
        <button type="button" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>Last 7 days</button>
        <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>This month</button>
      </div>
      {!summary && <p className="muted">Nothing to print for {period === 'week' ? 'the last 7 days' : 'this month'} yet.</p>}
      {summary && (
        <>
          <div className="share-preview">
            {picture.url ? <img src={picture.url} alt={description} /> : <p className="muted small" role="status">Printing…</p>}
          </div>
          <div className="button-row">
            <button className="btn btn-secondary" type="button" disabled={!picture.url} onClick={save}>Save image</button>
            {canShare && <button className="btn btn-primary" type="button" onClick={share}>Share</button>}
          </div>
          {message && <p className="note" role="status">{message}</p>}
        </>
      )}
    </section>
  )
}
