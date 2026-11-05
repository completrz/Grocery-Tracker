import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import PlaceSearch from './PlaceSearch'
import { GhostBars } from './ui'
import 'leaflet/dist/leaflet.css'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const hasPoint = (receipt) => receipt.latitude != null && receipt.longitude != null

function groupLocations(receipts) {
  const groups = new Map()
  for (const receipt of receipts.filter(hasPoint)) {
    const key = [receipt.latitude, receipt.longitude].join(',')
    const group = groups.get(key) ?? {
      key, point: [receipt.latitude, receipt.longitude], stores: new Set(), cents: 0, count: 0,
    }
    group.stores.add(receipt.store)
    group.cents += receipt.receipt_items.reduce((total, item) => total + item.line_total_cents, 0)
    group.count += 1
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents)
}

export default function SpendingMap({ receipts, onSave, onHide, readOnly = false }) {
  const node = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const [receiptId, setReceiptId] = useState('')
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [tileError, setTileError] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const groups = useMemo(() => groupLocations(receipts), [receipts])
  const receipt = receipts.find((entry) => entry.id === receiptId) ?? receipts.find((entry) => !hasPoint(entry)) ?? receipts[0]
  const lat = draft && draft.id === receipt?.id ? draft.lat : receipt?.latitude ?? ''
  const lng = draft && draft.id === receipt?.id ? draft.lng : receipt?.longitude ?? ''

  useEffect(() => {
    const instance = L.map(node.current, { scrollWheelZoom: false, maxZoom: 19 }).setView([39, -98], 4)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(instance)
    tiles.on('tileerror', () => setTileError(true))
    tiles.on('tileload', () => setTileError(false))
    map.current = instance
    return () => { instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const instance = map.current
    const layer = L.layerGroup().addTo(instance)
    const byKey = new Map()
    const max = Math.max(1, ...groups.map((group) => Math.abs(group.cents)))
    for (const group of groups) {
      const popup = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = [...group.stores].join(', ')
      const detail = document.createElement('div')
      detail.textContent = money.format(group.cents / 100) + ' · ' + group.count + ' receipt(s)'
      popup.append(name, detail)
      const marker = L.circleMarker(group.point, {
        radius: 7 + 13 * Math.sqrt(Math.abs(group.cents) / max),
        color: '#FFFFFF', fillColor: '#1D5C3A', fillOpacity: 1, weight: 3, bubblingMouseEvents: false,
      }).addTo(layer).bindPopup(popup)
        .bindTooltip(name.textContent, { permanent: true, direction: 'bottom', className: 'map-label', offset: [0, 4] })
      byKey.set(group.key, marker)
    }
    markers.current = byKey
    if (groups.length === 1) instance.setView(groups[0].point, 13)
    if (groups.length > 1) instance.fitBounds(groups.map((group) => group.point), { padding: [28, 28], maxZoom: 14 })
    return () => layer.remove()
  }, [groups])

  useEffect(() => {
    if (!receipt || busy) return
    const instance = map.current
    const click = ({ latlng }) => setDraft({
      id: receipt.id, lat: latlng.lat.toFixed(5), lng: latlng.wrap().lng.toFixed(5),
    })
    instance.on('click', click)
    return () => instance.off('click', click)
  }, [receipt, busy])

  useEffect(() => {
    if (!draft || draft.id !== receipt?.id || lat === '' || lng === '') return
    const point = [Number(lat), Number(lng)]
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > 85 || Math.abs(point[1]) > 180) return
    const marker = L.circleMarker(point, {
      radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#F0B429', fillOpacity: 1, interactive: false,
    }).addTo(map.current)
    return () => marker.remove()
  }, [draft, receipt?.id, lat, lng])

  async function save(point) {
    setBusy(true)
    setMessage('')
    try {
      await onSave(receipt.id, point)
      setDraft(null)
      setMessage(point ? 'Pin saved.' : 'Pin removed.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const point = [Number(lat), Number(lng)]
    if (lat === '' || lng === '' || !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 85 || Math.abs(point[1]) > 180) {
      setMessage('Enter a latitude from −85 to 85 and a longitude from −180 to 180.')
      return
    }
    save(point.map((value) => Number(value.toFixed(5))))
  }

  const mapped = receipts.filter(hasPoint).length

  return (
    <div>
      <div className="map-layout">
        <div className="map-stage">
          <div ref={node} className="spending-map" role="img" aria-label="Map of the store branches you’ve pinned, sized by spending" />
        </div>
        <div className="map-side">
          <div className="row-between">
            <h2 className="h-section" id="spending-map-title">Where you shop</h2>
            <button className="link-button" type="button" onClick={onHide}>Hide map</button>
          </div>
          <p className="muted small">{mapped} of {receipts.length} receipts in these filters are pinned. The basemap comes from OpenStreetMap.</p>
          {tileError && <p className="note note-warn" role="status">Some map tiles didn’t load. Your pinned branches are still listed here.</p>}
          {groups.length === 0 && (
            <>
              <GhostBars count={3} />
              <p className="muted">No pinned branches for these filters yet. Pin a receipt to a branch and it will show up here and on the map.</p>
            </>
          )}
          {groups.length > 0 && (
            <ul className="shop-list">
              {groups.map((group) => (
                <li key={group.key}>
                  <button type="button" className="shop-button" onClick={() => {
                    map.current.setView(group.point, 14)
                    markers.current.get(group.key)?.openPopup()
                  }}>
                    <span>
                      <span className="strong">{[...group.stores].join(', ')}</span>
                      <span className="small muted block">{group.count === 1 ? '1 trip' : group.count + ' trips'}</span>
                    </span>
                    <strong>{money.format(group.cents / 100)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {receipt && !readOnly && (
            <button className="link-button" type="button" aria-expanded={pinOpen} onClick={() => setPinOpen(!pinOpen)}>Pin a receipt to a branch</button>
          )}
        </div>
      </div>

      {receipt && pinOpen && !readOnly && (
        <form className="map-form panel-pad stack" onSubmit={submit}>
          <h3 className="h-small">Pin a receipt to a branch</h3>
          <p className="muted small">Choose a receipt, then click its store on the map, search for it, or enter coordinates.</p>
          <fieldset className="plain-fieldset stack" disabled={busy}>
            <label className="field">Receipt
              <select value={receipt.id} onChange={(event) => { setReceiptId(event.target.value); setDraft(null); setMessage('') }}>
                {receipts.map((entry) => <option key={entry.id} value={entry.id}>
                  {entry.store}, {entry.purchased_on}{hasPoint(entry) ? ' (pinned)' : ''}
                </option>)}
              </select>
            </label>
            <PlaceSearch key={receipt.id} near={groups[0] ? { latitude: groups[0].point[0], longitude: groups[0].point[1] } : null} onSelect={(place) => {
              const lat = place.latitude.toFixed(5)
              const lng = place.longitude.toFixed(5)
              setDraft({ id: receipt.id, lat, lng })
              setMessage(place.name + ', ' + place.address + '. Save to pin this receipt here.')
              map.current.setView([Number(lat), Number(lng)], 15)
            }} />
            <div className="field-pair">
              <label className="field">Latitude<input type="number" min="-85" max="85" step="any" required value={lat}
                onChange={(event) => setDraft({ id: receipt.id, lat: event.target.value, lng })} /></label>
              <label className="field">Longitude<input type="number" min="-180" max="180" step="any" required value={lng}
                onChange={(event) => setDraft({ id: receipt.id, lat, lng: event.target.value })} /></label>
            </div>
            <div className="button-row">
              <button className="btn btn-primary" type="submit">Save pin</button>
              {hasPoint(receipt) && <button className="btn btn-tertiary" type="button" onClick={() => save(null)}>Remove pin</button>}
            </div>
          </fieldset>
          {message && <p className="note" role="status">{message}</p>}
        </form>
      )}
    </div>
  )
}
