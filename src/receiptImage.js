import { dollars } from './format'

// Draws "your week, as a receipt" on a canvas so it can be saved or shared as a picture. It contains totals and
// category names only. Browser only: it needs a canvas.

const WIDTH = 360 // the paper, in CSS pixels; the picture is drawn at 2x
const MARGIN = 28
const SCALE = 2
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
const INK = '#17201B'
const MUTED = '#57625B'
const RULE = '#B9C2BB'
const HIGHLIGHT = '#F7D774'
const GROUND = '#F6F7F4'

function wrap(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = attempt
    }
  }
  if (line) lines.push(line)
  return lines
}

// Bars for the barcode, always the same for the same summary.
function barcode(seed) {
  let state = 0
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0
  const bars = []
  for (let index = 0; index < 44; index++) {
    state = (state * 1664525 + 1013904223) >>> 0
    bars.push(1 + (state >>> 29) % 3)
  }
  return bars
}

/** Resolves to a canvas. `summary` comes from summarize(), `note` from summaryNote(), `footer` from receiptFooter(). */
export async function drawReceipt(summary, { note, footer }) {
  try { await document.fonts?.load(`600 13px ${MONO}`) } catch { /* fall back to the system monospace font */ }

  const paper = WIDTH
  const inner = paper - 48
  const money = (cents) => dollars.format(cents / 100)
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = `400 12px ${MONO}`
  const noteLines = wrap(measure, note, inner)
  const footerLines = wrap(measure, footer, inner)

  const rows = summary.categories.length
  const height = 40 + 30 + 20 + 14 + rows * 22 + 14 + 34 + 12 + 3 * 20 + 14 + noteLines.length * 18 + 8 + footerLines.length * 18 + 22 + 50 + 30 + 12
  const canvas = document.createElement('canvas')
  canvas.width = (paper + MARGIN * 2) * SCALE
  canvas.height = (height + MARGIN * 2) * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = GROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // The paper, with a torn bottom edge and a soft shadow.
  const left = MARGIN
  const top = MARGIN
  const tooth = 10
  ctx.save()
  ctx.shadowColor = 'rgba(23, 32, 27, 0.14)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.moveTo(left, top)
  ctx.lineTo(left + paper, top)
  ctx.lineTo(left + paper, top + height - tooth)
  for (let x = left + paper; x > left; x -= tooth) {
    ctx.lineTo(x - tooth / 2, top + height)
    ctx.lineTo(x - tooth, top + height - tooth)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  const x0 = left + 24
  const x1 = left + paper - 24
  let y = top + 40
  const text = (value, x, align, font, color) => {
    ctx.font = font
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(value, x, y)
  }
  const rule = () => {
    ctx.strokeStyle = RULE
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  text('CARTTRAIL', left + paper / 2, 'center', `600 18px ${MONO}`, INK)
  y += 22
  text(summary.title, left + paper / 2, 'center', `400 12px ${MONO}`, MUTED)
  y += 18
  text(summary.label, left + paper / 2, 'center', `400 12px ${MONO}`, MUTED)
  y += 16
  rule()
  y += 24

  for (const entry of summary.categories) {
    let name = entry.name.toUpperCase()
    ctx.font = `400 13px ${MONO}`
    while (ctx.measureText(name).width > inner - 90 && name.length > 4) name = name.slice(0, -2)
    text(name, x0, 'left', `400 13px ${MONO}`, INK)
    text(money(entry.cents), x1, 'right', `400 13px ${MONO}`, INK)
    y += 22
  }
  y -= 8
  rule()
  y += 28

  // SUBTOTAL, with the highlighter swipe behind it.
  ctx.fillStyle = HIGHLIGHT
  ctx.fillRect(x0 - 6, y - 15, inner + 12, 20)
  text('SUBTOTAL', x0, 'left', `600 13px ${MONO}`, INK)
  text(money(summary.cents), x1, 'right', `600 13px ${MONO}`, INK)
  y += 30

  for (const [label, value] of [['TRIPS', summary.trips], ['STORES', summary.stores], ['ITEMS PURCHASED', summary.items]]) {
    text(label, x0, 'left', `400 13px ${MONO}`, INK)
    text(String(value), x1, 'right', `400 13px ${MONO}`, INK)
    y += 20
  }
  y -= 4
  rule()
  y += 22

  for (const line of noteLines) {
    text(line, left + paper / 2, 'center', `400 12px ${MONO}`, MUTED)
    y += 18
  }
  y += 6
  for (const line of footerLines) {
    text(line, left + paper / 2, 'center', `600 12px ${MONO}`, INK)
    y += 18
  }
  y += 14

  const bars = barcode(`${summary.title}${summary.label}${summary.cents}`)
  const total = bars.reduce((sum, bar) => sum + bar * 2, 0)
  let bx = left + (paper - total) / 2
  ctx.fillStyle = INK
  for (const [index, bar] of bars.entries()) {
    if (index % 2 === 0) ctx.fillRect(bx, y, bar * 2, 44)
    bx += bar * 2
  }
  return canvas
}

export const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
