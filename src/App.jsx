import { useEffect, useRef, useState } from 'react'
import './styles/app.css'
import Trends from './Trends'
import PlaceSearch from './PlaceSearch'
import Profile from './Profile'
import Overview from './Overview'
import SignIn from './SignIn'
import { categoryKey, defaultCategories, normalizeLabel, resolveCategory, tidyCategory } from './categories'
import { dollars, formatDate, formatShortDate, receiptLines, receiptTotal } from './format'
import { Avatar, Icon, LoadingReceipt, Logo, ReceiptPaper } from './ui'
import { greeting, primeAudio, printFeedback, receiptFooter, usePrefs } from './delight'
import { receiptImpact } from './insights'
import { makeSampleReceipts } from './sampleData'
import { ACCEPT, MAX_BYTES, isReceiptFile, takeSharedFiles, withTimeout } from './shared'

// How long to wait for a scan before giving up (a build variable so it can be shortened for testing).
const SCAN_TIMEOUT = Number(import.meta.env.VITE_SCAN_TIMEOUT_MS) || 70_000
import { supabase } from './supabase'

function todayForDateInput() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function blankItem() {
  return { id: crypto.randomUUID(), name: '', quantity: '1', total: '', category: '' }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        // Following a password-reset email signs the user in and sends them to set a new password.
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        setSession(nextSession)
        setReady(true)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <main className="container page">
        <LoadingReceipt label="Opening CartTrail…" />
      </main>
    )
  }
  return session
    ? <Tracker key={session.user.id} recovery={recovery} user={{
      id: session.user.id,
      email: session.user.email,
      hasPassword: (session.user.app_metadata?.providers ?? [session.user.app_metadata?.provider]).includes('email'),
    }} />
    : <SignIn />
}

function Tracker({ user, recovery }) {
  const userId = user.id
  const [receipts, setReceipts] = useState([])
  const [locationsReady, setLocationsReady] = useState(false)
  const [branchesReady, setBranchesReady] = useState(false)
  const [branches, setBranches] = useState([])
  const [branchDraft, setBranchDraft] = useState(null)
  const [branchMessage, setBranchMessage] = useState('')
  const [items, setItems] = useState(() => [blankItem()])
  const [store, setStore] = useState('')
  const [date, setDate] = useState(todayForDateInput)
  const [receiptId, setReceiptId] = useState('')
  const [scanText, setScanText] = useState('')
  const [azureSubtotal, setAzureSubtotal] = useState(null)
  // A string while the scan found no printed subtotal and the user can type it in; null otherwise.
  const [manualSubtotal, setManualSubtotal] = useState(null)
  // True while the shown subtotal was worked back from the receipt's total rather than read from a subtotal line.
  const [subtotalDerived, setSubtotalDerived] = useState(false)
  const [totalOnly, setTotalOnly] = useState(false)
  const [notice, setNotice] = useState({ text: '', tone: 'info' })
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [sampleReceipts] = useState(() => makeSampleReceipts())
  const [queue, setQueue] = useState([])
  const [skippedNote, setSkippedNote] = useState('')
  const [impact, setImpact] = useState([])
  const [savedTrip, setSavedTrip] = useState(null)
  const [retryFile, setRetryFile] = useState(null)
  const { tone } = usePrefs()
  const [budgetReady, setBudgetReady] = useState(false)
  const [profile, setProfile] = useState({ display_name: '', avatar_path: null })
  const [profileReady, setProfileReady] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [budgetCents, setBudgetCents] = useState(null)
  const [branchSkipped, setBranchSkipped] = useState(false)
  const [branchSearchOpen, setBranchSearchOpen] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [categoryStatus, setCategoryStatus] = useState('')
  const [categoryReady, setCategoryReady] = useState(false)
  const [categoryRules, setCategoryRules] = useState(() => new Map())
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  // The installed app's "Scan a receipt" shortcut opens /?scan=1 straight to the capture screen.
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).has('scan') ? 'capture' : recovery ? 'profile' : 'overview')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewType, setPreviewType] = useState('image')
  const [dragging, setDragging] = useState(false)

  const setMessage = (text, tone = 'info') => setNotice({ text, tone })

  useEffect(() => {
    // The avatars bucket is private, so the picture is shown through a short-lived signed link.
    if (!profile.avatar_path) return
    let active = true
    supabase.storage.from('avatars').createSignedUrl(profile.avatar_path, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setAvatarUrl(data.signedUrl)
    })
    return () => { active = false }
  }, [profile.avatar_path, avatarVersion])

  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    let active = true

    async function loadReceipts() {
      const branchResult = await supabase.from('store_branches')
        .select('id, store, address, source_address, latitude, longitude')
      const rules = await supabase.from('receipt_category_rules').select('store_key, item_key, category')
      const budget = await supabase.from('grocery_budgets').select('monthly_cents').maybeSingle()
      const profileResult = await supabase.from('profiles').select('display_name, avatar_path').maybeSingle()
      const hasCategories = !rules.error
      const columns = 'id, item_name, quantity, line_total_cents' + (hasCategories ? ', category' : '')
      const fields = 'id, store, purchased_on, receipt_items(' + columns + ')' + (!branchResult.error ? ', store_branch_id' : '')
      const load = (select) => supabase.from('receipts').select(select)
        .order('purchased_on', { ascending: false })
      const withLocations = await load(fields + ', latitude, longitude')
      const missingLocationColumns = ['42703', 'PGRST204'].includes(withLocations.error?.code) &&
        /latitude|longitude/i.test(withLocations.error.message)
      const { data, error } = missingLocationColumns ? await load(fields) : withLocations

      if (!active) return
      setLoaded(true)
      setBudgetReady(!budget.error)
      setBudgetCents(budget.data?.monthly_cents ?? null)
      setProfileReady(!profileResult.error)
      setProfile({ display_name: profileResult.data?.display_name ?? '', avatar_path: profileResult.data?.avatar_path ?? null })
      setLocationsReady(!missingLocationColumns && !error)
      setBranchesReady(!branchResult.error)
      setBranches(branchResult.data ?? [])
      setCategoryReady(hasCategories)
      setCategoryError(rules.error && !['PGRST205', '42P01'].includes(rules.error.code)
        ? 'Saved categories could not be loaded.' : '')
      setCategoryRules(new Map((rules.data ?? []).map((rule) => [
        categoryKey(rule.store_key, rule.item_key), rule.category,
      ])))
      setHistoryError(error?.message ?? '')
      if (!error) setReceipts(data.map((receipt) => {
        const branch = branchResult.data?.find((entry) => entry.id === receipt.store_branch_id)
        return branch ? { ...receipt, latitude: branch.latitude, longitude: branch.longitude } : receipt
      }))
    }

    loadReceipts()
    return () => { active = false }
  }, [refresh])

  function updateItem(id, field, value) {
    setSaved(false)
    setItems((current) => current.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    ))
  }

  const addressKey = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

  async function locateBranch(address, merchant, country = '') {
    const base = { storeKey: addressKey(merchant), address, location: null, confirmed: false }
    const known = branches.find((branch) => addressKey(branch.store) === base.storeKey &&
      [branch.address, branch.source_address].some((value) => value && addressKey(value) === addressKey(address)))
    if (known) {
      setBranchDraft({ ...base, location: known, confirmed: true })
      setBranchMessage('Matched a previously confirmed branch.')
      return
    }

    setBranchDraft(base)
    if (!address.trim()) {
      setBranchMessage('No address found. Choose a saved branch or save without a location.')
      return
    }
    if (country && country !== 'USA') {
      setBranchMessage('Automatic address lookup currently covers the U.S. Choose a saved branch or add a map pin later.')
      return
    }

    setBranchMessage('Looking up the store address…')
    try {
      const { data, error } = await supabase.functions.invoke('hyper-handler', {
        body: { action: 'locate-address', address },
      })
      if (error) throw error
      if (!data.location) {
        setBranchMessage('No unique address match. Edit the address, choose a saved branch, or skip.')
        return
      }
      setBranchDraft({ ...base, location: data.location, confirmed: false })
      setBranchMessage('Check this suggested address before using it. Coordinates are approximate.')
    } catch {
      setBranchMessage('Address lookup is unavailable. You can still save this receipt without a location.')
    }
  }

  async function lookUpEnteredAddress() {
    if (!branchDraft?.address.trim()) return
    setBusy(true)
    try {
      await locateBranch(branchDraft.address, store)
    } finally {
      setBusy(false)
    }
  }

  function scanReceipt(event) {
    const files = [...(event.currentTarget.files ?? [])]
    event.currentTarget.value = ''
    handleFiles(files)
  }

  // Every way of getting a file in (the pickers, drag and drop, paste, the Share menu) comes through here.
  function handleFiles(files) {
    if (files.length === 0) return

    const valid = files.filter(isReceiptFile)
    if (valid.length === 0) {
      setMessage(files.length === 1 && files[0].size > MAX_BYTES
        ? 'That file is over 4 MB. Choose a smaller photo or PDF.'
        : 'Choose a JPEG, PNG or PDF of the receipt, under 4 MB.', 'error')
      return
    }

    const hasDraftItems = items.some((item) => item.name.trim() || item.total.trim())
    if (hasDraftItems && !window.confirm('Replace your draft items if this scan finds new items?')) {
      return
    }

    const [first, ...rest] = valid
    setQueue(receiptId ? [] : rest)
    setSkippedNote(files.length > valid.length
      ? `Skipped ${files.length - valid.length === 1 ? '1 file' : (files.length - valid.length) + ' files'} that weren’t a JPEG, PNG or PDF under 4 MB.`
      : '')
    scanFile(first)
  }

  function scanNext() {
    const [next, ...rest] = queue
    if (!next) return
    setQueue(rest)
    setSaved(false)
    scanFile(next)
  }

  async function scanFile(file) {
    setImpact([])
    setSavedTrip(null)
    setRetryFile(null)
    setTotalOnly(false)
    setBusy(true)
    setSaved(false)
    setBranchSkipped(false)
    setMessage('Reading your receipt…')

    try {
      const body = new FormData()
      body.append('photo', file)

      const { data, error } = await withTimeout(supabase.functions.invoke('hyper-handler', { body }), SCAN_TIMEOUT)
      if (error) {
        console.error('Receipt scan failed:', error, error.context)
        const details = error.context instanceof Response
          ? await error.context.json().catch(() => null)
          : null
        console.error('Receipt scan details:', details?.error ?? error.message)
        throw new Error('Couldn’t read this file. Try a sharper photo in good light, or a clearer PDF.')
      }

      setPreviewUrl(URL.createObjectURL(file))
      setPreviewType(file.type === 'application/pdf' ? 'pdf' : 'image')
      setScanText(data.text ?? '')

      if (!receiptId && (data.date || data.items.length > 0)) {
        setDate(data.date || todayForDateInput())
      }

      // Some receipts, such as delivery-app emails, print only a total and no item lines. Keep what was read
      // (store, date, branch, total) and offer the total as a single line instead of discarding the scan.
      const totalOnly = data.items.length === 0
      setTotalOnly(totalOnly && data.subtotal != null)

      setAzureSubtotal(data.subtotal ?? null)
      const derived = data.subtotal != null && ['total', 'total-minus-tax'].includes(data.subtotalSource)
      setSubtotalDerived(derived)
      setManualSubtotal(data.subtotal == null ? '' : derived ? String(data.subtotal) : null)
      if (!receiptId) {
        setStore(data.store ?? '')
      }

      setItems(totalOnly
        ? [{ ...blankItem(), name: data.subtotal != null ? 'Order total' : '', total: data.subtotal != null ? data.subtotal.toFixed(2) : '' }]
        : data.items.map((item) => ({
          ...blankItem(),
          name: item.name ?? '',
          quantity: String(item.quantity ?? 1),
          total: typeof item.total === 'number' ? item.total.toFixed(2) : '',
        })))

      setMessage(!totalOnly ? '' : data.subtotal != null
        ? 'This receipt shows only a total, so we added it as one line. Rename it, or split it into items if you like.'
        : 'We couldn’t find any items on this receipt. Add them by hand below.')
      if (!receiptId && branchesReady) {
        await locateBranch(data.address ?? '', data.store ?? '', data.country ?? '')
      }
    } catch (error) {
      setRetryFile(file)
      setMessage(error.name === 'TimeoutError'
        ? 'That took too long. Check your connection and try again, or try a clearer photo.'
        : error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // The latest handleFiles, for listeners that outlive a single render (paste, the Share menu).
  const handleFilesRef = useRef(() => {})
  useEffect(() => { handleFilesRef.current = handleFiles })

  useEffect(() => {
    // A screenshot pasted with Ctrl+V or Cmd+V on the scan screen is treated like a chosen file.
    if (view !== 'capture') return
    const onPaste = (event) => {
      const files = [...(event.clipboardData?.files ?? [])]
      if (files.length === 0) return
      event.preventDefault()
      handleFilesRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [view])

  useEffect(() => {
    // Files shared to the installed app from Photos, Gmail, Files and so on arrive via the service worker.
    takeSharedFiles().then((files) => {
      if (new URLSearchParams(window.location.search).has('shared')) window.history.replaceState(null, '', '/')
      if (files.length === 0) return
      setView('capture')
      handleFilesRef.current(files)
    }).catch(() => {})
  }, [])

  const enteredItems = items.filter((item) => item.name.trim() || item.total.trim())
  const missingPrices = enteredItems.filter((item) => !item.total.trim()).length
  const enteredCents = enteredItems.reduce(
    (sum, item) => sum + Math.round(Number(item.total) * 100),
    0,
  )
  const subtotalCents = azureSubtotal === null
    ? null
    : Math.round(azureSubtotal * 100)

  const choices = [...new Map([...defaultCategories, ...categoryRules.values()]
    .map((category) => [normalizeLabel(category), category])).values()]
  const activeStore = receiptId ? receipts.find((receipt) => receipt.id === receiptId)?.store ?? '' : store

  async function saveItemCategory(event, itemId) {
    event.preventDefault()
    const category = tidyCategory(new FormData(event.currentTarget).get('category'), choices)
    if (!category) {
      setCategoryStatus('Enter a category to remember.')
      return
    }
    setBusy(true)
    setCategoryStatus('')
    try {
      const { data, error } = await supabase.from('receipt_items')
        .update({ category }).eq('id', itemId).select('id').single()
      if (error) throw error
      if (!data) throw new Error('The receipt item could not be updated.')
      setCategoryStatus('Category saved. Matching items will reuse it.')
      setRefresh((current) => current + 1)
    } catch (error) {
      setCategoryStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveReceipt(event) {
    event.preventDefault()
    primeAudio()

    const rows = enteredItems.map((item) => ({
      item_name: item.name.trim(),
      quantity: Number(item.quantity),
      line_total_cents: item.total.trim()
        ? Math.round(Number(item.total) * 100)
        : NaN,
      ...(categoryReady && item.category.trim()
        ? { category: tidyCategory(item.category, choices) }
        : {}),
    }))

    const invalidItem = rows.some((row) =>
      !row.item_name ||
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0 ||
      !Number.isInteger(row.line_total_cents) ||
      row.line_total_cents < -2147483648 ||
      row.line_total_cents > 2147483647,
    )

    if (rows.length === 0 || invalidItem) {
      setMessage('Every line needs a name, a quantity above zero, and a line total.', 'error')
      return
    }

    if (!receiptId && (!store.trim() || !date)) {
      setMessage('Enter the store and the purchase date before saving.', 'error')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const selectedBranch = branchDraft?.storeKey === addressKey(store) && branchDraft.confirmed
        ? branchDraft.location
        : null
      const { error } = receiptId
        ? await supabase.from('receipt_items').insert(
            rows.map((row) => ({ ...row, receipt_id: receiptId })),
          )
        : await supabase.rpc(branchesReady ? 'save_grocery_receipt_at_branch' : 'save_grocery_receipt', {
            p_store: store.trim(),
            p_purchased_on: date,
            p_items: rows,
            ...(branchesReady ? { p_branch: selectedBranch?.id ? { id: selectedBranch.id } : selectedBranch ? {
              ...selectedBranch, source_address: branchDraft.address,
            } : null } : {}),
          })

      if (error) throw error

      setImpact(receiptId ? [] : receiptImpact({ store: store.trim(), date, items: rows }, receipts))
      setSavedTrip(receiptId ? null : {
        store: store.trim(),
        date: formatDate(date),
        lines: receiptLines(rows),
        subtotal: dollars.format(enteredCents / 100),
        items: rows.length,
        count: receipts.length + 1,
        // The stamp only appears when the items really matched the printed subtotal.
        // A single line copied from the total proves nothing, so a total-only receipt never earns the stamp.
        matched: !totalOnly && subtotalCents !== null && missingPrices === 0 && enteredCents === subtotalCents,
      })
      printFeedback()
      setSaved(true)
      setMessage('')
      setItems([blankItem()])
      setStore('')
      setDate(todayForDateInput())
      setReceiptId('')
      setScanText('')
      setPreviewUrl('')
      setAzureSubtotal(null)
    setManualSubtotal(null)
      setSubtotalDerived(false)
      setTotalOnly(false)
      setBranchDraft(null)
      setBranchSkipped(false)
      setBranchMessage('')
      setRefresh((current) => current + 1)
    } catch (error) {
      setMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveReceiptLocation(id, point) {
    const [latitude, longitude] = point ?? [null, null]
    const { data, error } = await supabase.from('receipts')
      .update({ latitude, longitude, ...(branchesReady ? { store_branch_id: null } : {}) })
      .eq('id', id).select('id, latitude, longitude' + (branchesReady ? ', store_branch_id' : '')).single()
    if (error) throw error
    setReceipts((current) => current.map((receipt) => receipt.id === id ? { ...receipt, ...data } : receipt))
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message, 'error')
  }

  // Accounts with nothing saved see clearly labelled sample data. It is display-only and never written anywhere.
  const sampleMode = loaded && !historyError && receipts.length === 0
  const shown = sampleMode ? sampleReceipts : receipts
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ')
  const visibleReceipts = shown.filter((receipt) =>
    receipt.store.toLowerCase().replace(/\s+/g, ' ').includes(query) ||
    receipt.purchased_on.includes(query) ||
    receipt.receipt_items.some((item) => item.item_name.toLowerCase().replace(/\s+/g, ' ').includes(query)),
  )
  const subtotalMatches = missingPrices === 0 && enteredCents === subtotalCents

  async function saveProfile(patch) {
    const { error } = await supabase.from('profiles').upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    if (error) throw error
    setProfile((current) => ({ ...current, ...patch }))
  }

  // Avatars are cropped to a square and shrunk in the browser first. Redrawing also drops any location data in the photo.
  async function uploadAvatar(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8_000_000) {
      throw new Error('Choose a JPEG, PNG or WebP picture under 8 MB.')
    }
    let bitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      throw new Error('That picture couldn’t be read. Try a different one.')
    }
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('That picture couldn’t be prepared. Try a different one.')
    const path = `${userId}/avatar.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw new Error('Couldn’t save your picture. Try again in a moment.')
    await saveProfile({ avatar_path: path })
    setAvatarVersion((current) => current + 1)
  }

  async function removeAvatar() {
    const { error } = await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`])
    if (error) throw error
    await saveProfile({ avatar_path: null })
    setAvatarUrl('')
  }

  // Called once the server has deleted the user's data or account.
  async function handleDeleted(scope) {
    if (scope === 'account') {
      try { window.sessionStorage.setItem('carttrail-deleted', '1') } catch { /* the note is optional */ }
      await supabase.auth.signOut()
      return
    }
    setBudgetCents(null)
    setBranchDraft(null)
    setRefresh((current) => current + 1)
    openView('overview')
  }

  async function saveBudget(cents) {
    const { error } = await supabase.from('grocery_budgets')
      .upsert({ user_id: userId, monthly_cents: cents }, { onConflict: 'user_id' })
    if (error) throw error
    setBudgetCents(cents)
  }

  // Text cells that start with a formula character are prefixed so spreadsheets don't run them.
  const csvText = (value) => {
    let text = String(value ?? '')
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
    return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
  }

  function exportCsv() {
    const lines = [['date', 'store', 'item', 'quantity', 'line_total', 'category'].join(',')]
    for (const receipt of receipts) {
      for (const item of receipt.receipt_items) {
        lines.push([
          receipt.purchased_on, csvText(receipt.store), csvText(item.item_name), item.quantity,
          (item.line_total_cents / 100).toFixed(2),
          csvText(resolveCategory(categoryRules, receipt.store, item.item_name, item.category)),
        ].join(','))
      }
    }
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `carttrail-receipts-${todayForDateInput()}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function openView(nextView) {
    setView(nextView)
    window.scrollTo(0, 0)
  }

  function openReceipt(id) {
    setSelectedId(id)
    openView('receipts')
  }

  function startScan() {
    setSaved(false)
    openView('capture')
  }

  function discardScan() {
    setRetryFile(null)
    setQueue([])
    setSkippedNote('')
    setImpact([])
    setSavedTrip(null)
    setItems([blankItem()])
    setStore('')
    setDate(todayForDateInput())
    setReceiptId('')
    setScanText('')
    setPreviewUrl('')
    setAzureSubtotal(null)
    setManualSubtotal(null)
      setSubtotalDerived(false)
    setTotalOnly(false)
    setBranchDraft(null)
    setBranchSkipped(false)
    setBranchMessage('')
    setMessage('')
    setSaved(false)
    openView('overview')
  }

  const hasBranchDraft = branchDraft?.storeKey === addressKey(store) && branchDraft.location
  const branchConfirmed = Boolean(hasBranchDraft && branchDraft.confirmed)
  const branchSuggested = Boolean(hasBranchDraft && !branchDraft.confirmed)
  const scanned = Boolean(previewUrl)
  const selectedReceipt = shown.find((receipt) => receipt.id === selectedId)
  const diffCents = subtotalCents === null ? 0 : enteredCents - subtotalCents
  const quickSave = scanned && !receiptId && subtotalCents !== null && subtotalMatches && Boolean(store.trim()) && Boolean(date)
  const navItems = [['overview', 'Overview'], ['receipts', 'Receipts'], ['trends', 'Trends']]

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <button type="button" className="logo-button" aria-label="CartTrail overview" onClick={() => openView('overview')}><Logo /></button>
          <nav aria-label="Main" className="main-nav">
            {navItems.map(([key, label]) => (
              <button key={key} type="button" aria-current={view === key ? 'page' : undefined}
                onClick={() => openView(key)}>{label}</button>
            ))}
          </nav>
          <div className="header-actions">
            <button type="button" className="avatar-button" aria-label="Your profile" aria-current={view === 'profile' ? 'page' : undefined}
              title={profile.display_name || user.email} onClick={() => openView('profile')}>
              <Avatar name={profile.display_name} email={user.email} userId={userId} url={profile.avatar_path ? avatarUrl : ''} size={40} />
            </button>
            <button className="btn btn-primary" type="button" aria-label="Scan a receipt" onClick={startScan}><Icon name="scan" /> <span>Scan<span className="hide-sm"> a receipt</span></span></button>
          </div>
        </div>
      </header>

      <main className="container page">
        {categoryReady && (
          <datalist id="receipt-category-options">
            {choices.map((category) => <option key={category} value={category} />)}
          </datalist>
        )}
        {categoryError && <p className="note note-warn" role="status">{categoryError}</p>}
        {sampleMode && view !== 'capture' && (
          <div className="banner banner-sample" role="note">
            <Icon name="alert" size={22} />
            <div>
              <div className="banner-title">You’re looking at sample data.</div>
              <div>Scan your first receipt and this switches to your own spending. Nothing here is saved to your account.</div>
            </div>
            <button className="btn btn-primary" type="button" onClick={startScan}>Scan a receipt</button>
          </div>
        )}

        <div className="view" key={view}>
        {view === 'overview' && (
          <Overview receipts={shown} rules={categoryRules} loaded={loaded} error={historyError}
            budget={sampleMode || !budgetReady ? null : { cents: budgetCents, save: saveBudget }}
            greeting={greeting(profile.display_name)} shareable={!sampleMode} receiptCount={receipts.length}
            onScan={startScan} onOpenReceipt={openReceipt} onOpenView={openView} />
        )}

        {view === 'profile' && (
          <Profile user={user} profile={profile} profileReady={profileReady} avatarUrl={profile.avatar_path ? avatarUrl : ''}
            recovery={recovery} sample={sampleMode}
            budget={sampleMode || !budgetReady ? null : { cents: budgetCents, save: saveBudget }}
            receiptCount={receipts.length} itemCount={receipts.reduce((sum, receipt) => sum + receipt.receipt_items.length, 0)}
            onSaveProfile={saveProfile} onUploadAvatar={uploadAvatar} onRemoveAvatar={removeAvatar}
            onSignOut={signOut} onExport={exportCsv} onDeleted={handleDeleted} />
        )}

        {view === 'trends' && (
          <Trends receipts={shown} sample={sampleMode} rules={categoryRules} locationsReady={locationsReady || sampleMode} onSaveLocation={saveReceiptLocation} onScan={startScan} />
        )}

        {view === 'receipts' && (
          <div className="stack-xl">
            <div className="page-title-row">
              <div>
                <h1 className="h-page">Receipts</h1>
                <p className="lede">Find past purchases by store, item, or date.</p>
              </div>
              <div className="toolbar">
                <label className="field field-inline">Search receipts
                  <input type="search" placeholder="Store, item, or date" value={search}
                    onChange={(event) => setSearch(event.target.value)} />
                </label>
                {!sampleMode && receipts.length > 0 && (
                  <button className="btn btn-secondary" type="button" onClick={exportCsv}>Export CSV</button>
                )}
              </div>
            </div>

            {historyError && <p className="note note-warn" role="alert">{historyError}</p>}
            {!historyError && !loaded && <LoadingReceipt label="Printing your receipts…" />}
            {!historyError && loaded && visibleReceipts.length === 0 && query && (
              <p className="receipt-tail">NO MATCHES. TRY A STORE, AN ITEM OR A DATE LIKE 2026-11.</p>
            )}
            {visibleReceipts.length > 0 && (
              <div className="table-panel">
                <table>
                  <thead>
                    <tr><th scope="col">Store</th><th scope="col">Date</th><th scope="col" className="num">Items</th><th scope="col" className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {visibleReceipts.map((receipt) => (
                      <tr key={receipt.id} className={receipt.id === selectedId ? 'row-selected' : undefined}>
                        <td className="strong">
                          <button className="link-button link-ink" type="button" aria-expanded={receipt.id === selectedId}
                            onClick={() => setSelectedId(receipt.id === selectedId ? '' : receipt.id)}>{receipt.store}</button>
                        </td>
                        <td className="muted">{formatDate(receipt.purchased_on)}</td>
                        <td className="num muted">{receipt.receipt_items.length}</td>
                        <td className="num strong">{dollars.format(receiptTotal(receipt) / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!sampleMode && visibleReceipts.length > 0 && (
              <p className="receipt-tail">{receipts.length} {receipts.length === 1 ? 'RECEIPT' : 'RECEIPTS'} ON FILE. THANK YOU.</p>
            )}

            {selectedReceipt && (
              <section className="split" aria-labelledby="receipt-detail-title">
                <div className="split-side">
                  <ReceiptPaper store={selectedReceipt.store} date={formatDate(selectedReceipt.purchased_on)}
                    lines={receiptLines(selectedReceipt.receipt_items)}
                    subtotal={dollars.format(receiptTotal(selectedReceipt) / 100)} />
                </div>
                <div className="split-main stack">
                  <h2 className="h-section" id="receipt-detail-title">{selectedReceipt.store}, {formatShortDate(selectedReceipt.purchased_on)}</h2>
                  {categoryReady && !sampleMode && <p className="muted small">Change a category and save it to reuse it for this store and item name.</p>}
                  {categoryReady && !sampleMode && categoryStatus && <p className="note" role="status">{categoryStatus}</p>}
                  {selectedReceipt.receipt_items.length === 0 && <p className="muted">No items saved on this receipt yet.</p>}
                  <ul className="item-list">
                    {selectedReceipt.receipt_items.map((item) => {
                      const category = resolveCategory(categoryRules, selectedReceipt.store, item.item_name, item.category)
                      return (
                        <li key={item.id} className="item-line">
                          <div className="row-between">
                            <span>{item.item_name} × {item.quantity}</span>
                            <strong>{dollars.format(item.line_total_cents / 100)}</strong>
                          </div>
                          {categoryReady && !sampleMode && (
                            <form key={category} className="inline-form" onSubmit={(event) => saveItemCategory(event, item.id)}>
                              <label className="field field-inline">Category
                                <input name="category" list="receipt-category-options" defaultValue={category}
                                  maxLength={64} required disabled={busy} />
                              </label>
                              <button className="btn btn-secondary" type="submit" disabled={busy}>Save category</button>
                            </form>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {!sampleMode && (
                    <div>
                      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
                        setReceiptId(selectedReceipt.id)
                        startScan()
                      }}>Add items to this receipt</button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {view === 'capture' && (
          <form className={dragging ? 'stack-xl is-dragging' : 'stack-xl'} onSubmit={saveReceipt}
            onDragOver={(event) => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDragging(true) } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
            onDrop={(event) => {
              if (!event.dataTransfer?.files?.length) return
              event.preventDefault()
              setDragging(false)
              handleFiles([...event.dataTransfer.files])
            }}>
            <div className="page-title-row">
              <div>
                <h1 className="h-page">{saved ? 'Saved' : scanned ? 'Check the scan' : 'Scan a receipt'}</h1>
                <p className="lede">{saved
                  ? (impact.length > 0 ? 'Here’s what this receipt changed.' : 'Your history is up to date.')
                  : scanned
                    ? 'Compare each line with your photo. Fix anything the scanner misread, then save.'
                    : 'Upload a photo to read it automatically, or type the items in by hand.'}</p>
              </div>
              {!saved && (scanned || items.some((item) => item.name || item.total)) && (
                <button className="link-button" type="button" disabled={busy} onClick={discardScan}>Discard scan</button>
              )}
            </div>

            <fieldset className={saved ? 'plain-fieldset is-saved' : 'plain-fieldset'} disabled={busy}>
              <div className="split split-top">
                <section className="split-side stack-sm" aria-label="Your receipt photo">
                  {scanned && (
                    <>
                      <div className="small strong muted">{previewType === 'pdf' ? 'Your PDF' : 'Your photo'}</div>
                      {previewType === 'pdf' ? (
                        <div className="pdf-card">
                          <Icon name="scan" size={28} />
                          <span className="strong">Your PDF receipt</span>
                          <a href={previewUrl} target="_blank" rel="noreferrer">Open it to compare with the items</a>
                        </div>
                      ) : (
                        <div className="receipt-paper photo-paper"><img src={previewUrl} alt="The receipt you uploaded" /></div>
                      )}
                    </>
                  )}
                  <label className={scanned ? 'btn btn-secondary btn-block' : 'upload'}>
                    <input className="visually-hidden" type="file" accept="image/jpeg,image/png"
                      capture="environment" onChange={scanReceipt} />
                    {scanned
                      ? 'Scan another photo'
                      : <><Icon name="scan" size={28} /><span className="strong">Choose a receipt photo</span><span className="small muted">JPEG, PNG or PDF, up to 4 MB. Files are sent to Azure to be read. On a computer you can also drop a file here or paste a screenshot.</span></>}
                  </label>
                  {!scanned && !receiptId && (
                    <label className="link-button">
                      <input className="visually-hidden" type="file" accept={ACCEPT} multiple onChange={scanReceipt} />
                      Or choose photos or PDFs from your library or files
                    </label>
                  )}
                  {scanText && (
                    <details className="disclosure">
                      <summary>Show the text the scanner read</summary>
                      <pre>{scanText}</pre>
                    </details>
                  )}
                </section>

                <section className="split-main stack-lg" aria-label="Scanned details">
                  {skippedNote && <p className="note" role="status">{skippedNote}</p>}
                  {queue.length > 0 && !saved && (
                    <p className="note" role="status">{queue.length === 1 ? '1 more file is' : queue.length + ' more files are'} queued. Save this receipt to review the next one.</p>
                  )}
                  {notice.text && (
                    <p className={notice.tone === 'error' ? 'note note-warn' : 'note'} role="status" aria-busy={busy}>{notice.text}</p>
                  )}
                  {retryFile && !busy && (
                    <div><button className="btn btn-secondary" type="button" onClick={() => scanFile(retryFile)}>Try this file again</button></div>
                  )}

                  <label className="field">Save to
                    <select value={receiptId} onChange={(event) => { setSaved(false); setReceiptId(event.target.value) }}>
                      <option value="">A new receipt</option>
                      {receipts.map((receipt) => (
                        <option key={receipt.id} value={receipt.id}>{receipt.store}, {receipt.purchased_on}</option>
                      ))}
                    </select>
                  </label>

                  {!receiptId && (
                    <div className="field-pair">
                      <label className="field">Store
                        <input value={store} placeholder="H-E-B" required
                          onChange={(event) => {
                            const value = event.target.value
                            setSaved(false)
                            setStore(value)
                            // The address belongs to the receipt, not to the store name, so typing the name must not
                            // clear it. A saved branch is tied to the old name and has to be chosen again.
                            setBranchDraft((draft) => {
                              if (!draft || draft.storeKey === addressKey(value)) return draft
                              const tied = Boolean(draft.location?.id)
                              return {
                                storeKey: addressKey(value), address: draft.address,
                                location: tied ? null : draft.location, confirmed: tied ? false : draft.confirmed,
                              }
                            })
                          }} />
                      </label>
                      <label className="field">Date
                        <input type="date" value={date} required
                          onChange={(event) => { setSaved(false); setDate(event.target.value) }} />
                      </label>
                    </div>
                  )}

                  <details className="items-review" key={quickSave ? 'quick' : 'edit'} open={!quickSave}>
                    <summary className="items-summary" hidden={!quickSave}>Review the {enteredItems.length === 1 ? '1 item' : enteredItems.length + ' items'}, {dollars.format(enteredCents / 100)}</summary>
                    <div className="table-panel table-panel-flush">
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col" className="col-qty">Qty</th>
                            <th scope="col" className="col-total">Line total</th>
                            {categoryReady && <th scope="col" className="col-category">Category</th>}
                            <th scope="col" className="col-remove"><span className="visually-hidden">Remove</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => (
                            <tr key={item.id}>
                              <td><input className="cell-input" aria-label={`Item ${index + 1} name`} value={item.name} placeholder="Whole milk"
                                onChange={(event) => updateItem(item.id, 'name', event.target.value)} /></td>
                              <td><input className="cell-input" aria-label={`Item ${index + 1} quantity`} type="number" step="any" value={item.quantity}
                                onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} /></td>
                              <td><input className="cell-input cell-money" aria-label={`Item ${index + 1} line total in dollars`} type="number" step="0.01" value={item.total} placeholder="0.00"
                                onChange={(event) => updateItem(item.id, 'total', event.target.value)} /></td>
                              {categoryReady && (
                                <td><input className="cell-input" aria-label={`Item ${index + 1} category`} list="receipt-category-options" value={item.category} maxLength={64}
                                  placeholder={resolveCategory(categoryRules, activeStore, item.name)}
                                  onChange={(event) => updateItem(item.id, 'category', event.target.value)} /></td>
                              )}
                              <td>
                                <button type="button" className="icon-button" aria-label={`Remove ${item.name.trim() || 'item ' + (index + 1)}`}
                                  onClick={() => { setSaved(false); setItems((current) => current.filter((entry) => entry.id !== item.id)) }}>
                                  <Icon name="close" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="table-footer">
                        <button type="button" className="btn btn-quiet" onClick={() => { setSaved(false); setItems((current) => [...current, blankItem()]) }}>
                          <Icon name="plus" size={18} /> Add a line
                        </button>
                      </div>
                    </div>
                    {categoryReady && <p className="muted small spaced">Leave a category blank to use the suggestion. A category you enter is remembered for this store and item name.</p>}
                  </details>

                  {!receiptId && subtotalCents !== null && (
                    missingPrices > 0 ? (
                      <div className="banner banner-warn" role="status">
                        <Icon name="alert" size={22} />
                        <div>
                          <div className="banner-title">Your items add up to {dollars.format(enteredCents / 100)} so far, and {missingPrices === 1 ? '1 line still needs a price' : `${missingPrices} lines still need a price`}.</div>
                          <div>The printed subtotal is {dollars.format(subtotalCents / 100)}.</div>
                        </div>
                      </div>
                    ) : subtotalMatches ? (
                      <div className="banner banner-ok" role="status">
                        <Icon name="check" size={22} strokeWidth={2.4} />
                        <div>
                          <div className="banner-title">Your items add up to {dollars.format(enteredCents / 100)}, matching the printed subtotal.</div>
                          <div>{quickSave ? 'Looks right. Save it, or open the items above to double-check.' : 'Ready to save.'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="banner banner-warn" role="status">
                        <Icon name="alert" size={22} />
                        <div>
                          <div className="banner-title">Your items add up to {dollars.format(enteredCents / 100)}, {dollars.format(Math.abs(diffCents) / 100)} {diffCents > 0 ? 'more' : 'less'} than the printed subtotal of {dollars.format(subtotalCents / 100)}.</div>
                          <div>Compare each line total with the photo. You can still save if the receipt itself is off.</div>
                        </div>
                      </div>
                    )
                  )}
                  {!receiptId && manualSubtotal !== null && (
                    <div className="stack-sm">
                      <p className="note" role="status">
                        {subtotalCents === null
                          ? 'The scanner couldn’t read a printed subtotal. Type it from your receipt and CartTrail will check your items against it.'
                          : subtotalDerived
                            ? 'This receipt doesn’t print a separate subtotal, so CartTrail used its total (less any tax). If your receipt shows something different, change it here.'
                            : 'Using the subtotal you typed.'}
                      </p>
                      <label className="field">Printed subtotal ($)
                        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={manualSubtotal}
                          onChange={(event) => {
                            const value = event.target.value
                            setManualSubtotal(value)
                            setSubtotalDerived(false)
                            setSaved(false)
                            const amount = Number(value)
                            setAzureSubtotal(value.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? amount : null)
                          }} />
                      </label>
                    </div>
                  )}

                  {!receiptId && branchesReady && (
                    <section className="panel branch-panel" aria-labelledby="branch-title">
                      <div className="branch-head">
                        <span className="branch-icon"><Icon name="pin" size={22} /></span>
                        <div className="stack-xs">
                          <h2 className="h-small" id="branch-title">Store branch</h2>
                          {branchSuggested && (
                            <p className="branch-text muted">We found <strong>{branchDraft.location.address}</strong> from the address on your receipt. The map pin is approximate.{' '}
                              <a href={`https://www.openstreetmap.org/?mlat=${branchDraft.location.latitude}&mlon=${branchDraft.location.longitude}#map=17/${branchDraft.location.latitude}/${branchDraft.location.longitude}`}
                                target="_blank" rel="noreferrer">Check on the map</a></p>
                          )}
                          {branchConfirmed && (
                            <p className="branch-text">Pinned to <strong>{branchDraft.location.address}</strong>. Future receipts from this address will use it automatically.</p>
                          )}
                          {!hasBranchDraft && branchSkipped && (
                            <p className="branch-text muted">No branch saved. This receipt won’t appear on the map.</p>
                          )}
                          {!hasBranchDraft && !branchSkipped && (
                            <p className="branch-text muted">{branchMessage || 'Pin this receipt to a store branch so it shows up on the map.'}</p>
                          )}
                          {hasBranchDraft && branchMessage && !branchConfirmed && <p className="small muted" role="status">{branchMessage}</p>}
                        </div>
                      </div>
                      <div className="branch-actions">
                        {branchSuggested && (
                          <button type="button" className="btn btn-secondary" onClick={() => {
                            setBranchDraft({ ...branchDraft, confirmed: true })
                            setBranchSkipped(false)
                          }}>Use this branch</button>
                        )}
                        <button type="button" className="btn btn-outline" aria-expanded={branchSearchOpen}
                          onClick={() => setBranchSearchOpen(!branchSearchOpen)}>{branchConfirmed ? 'Change branch' : 'Search for a store'}</button>
                        {!branchConfirmed && (
                          <button type="button" className="btn btn-tertiary" onClick={() => {
                            setBranchDraft(null)
                            setBranchSkipped(true)
                            setBranchMessage('')
                          }}>Skip</button>
                        )}
                      </div>
                      {branchSearchOpen && (
                        <div className="branch-more stack">
                          <PlaceSearch key={addressKey(store)} near={branches[0] ? { latitude: branches[0].latitude, longitude: branches[0].longitude } : null} onSelect={(place) => {
                            const selectedStore = store.trim() || place.name
                            const existing = branches.find((branch) => addressKey(branch.store) === addressKey(selectedStore) &&
                              addressKey(branch.address) === addressKey(place.address))
                            if (!store.trim()) setStore(selectedStore)
                            setBranchSkipped(false)
                            setBranchDraft({
                              storeKey: addressKey(selectedStore),
                              address: place.address,
                              location: existing ?? place,
                              confirmed: true,
                            })
                            setBranchMessage('')
                            setBranchSearchOpen(false)
                          }} />
                          <label className="field">Saved branch
                            <select
                              value={branchDraft?.storeKey === addressKey(store) && branchDraft.location?.id ? branchDraft.location.id : ''}
                              onChange={(event) => {
                                const branch = branches.find((entry) => entry.id === event.target.value)
                                setBranchSkipped(false)
                                setBranchDraft(branch ? {
                                  storeKey: addressKey(store), address: branch.address, location: branch, confirmed: true,
                                } : null)
                                setBranchMessage(branch ? '' : 'This receipt will be saved without a branch.')
                              }}>
                              <option value="">No saved branch selected</option>
                              {branches.filter((entry) => addressKey(entry.store) === addressKey(store)).map((branch) => (
                                <option key={branch.id} value={branch.id}>{branch.address}</option>
                              ))}
                            </select>
                          </label>
                          <label className="field">Address on the receipt
                            <input value={branchDraft?.storeKey === addressKey(store) ? branchDraft.address : ''}
                              placeholder="Street, city, state, ZIP" maxLength={500}
                              onChange={(event) => {
                                setBranchDraft({ storeKey: addressKey(store), address: event.target.value, location: null, confirmed: false })
                                setBranchMessage('')
                              }} />
                          </label>
                          <div>
                            <button className="btn btn-secondary" type="button" disabled={busy || !branchDraft?.address.trim()}
                              onClick={lookUpEnteredAddress}>Look up this U.S. address</button>
                          </div>
                          {branchMessage && <p className="small muted" role="status">{branchMessage}</p>}
                          <p className="small muted">Looking up an address sends it to the U.S. Census Geocoder.</p>
                        </div>
                      )}
                    </section>
                  )}

                  <div className="save-row">
                    {saved ? (
                      <div className="save-done" role="status">
                        <div className="save-done-row">
                          {savedTrip
                            ? <span className="visually-hidden">Receipt saved.{savedTrip.matched ? ' Checked: the items matched the printed subtotal.' : ''}</span>
                            : <span className="status-pill"><Icon name="check" size={20} strokeWidth={2.4} /> {receiptId ? 'Items saved' : 'Receipt saved'}</span>}
                          <button className="link-button" type="button" onClick={() => openView('overview')}>Back to overview</button>
                        </div>
                        {savedTrip && (
                          <ReceiptPaper className="saved-receipt" store={savedTrip.store} date={savedTrip.date} lines={savedTrip.lines}
                            subtotal={savedTrip.subtotal} stamp={savedTrip.matched ? 'CHECKED' : undefined}>
                            <div className="receipt-foot receipt-foot-first">ITEMS PURCHASED: {savedTrip.items}</div>
                            <div className="receipt-foot"><strong>{receiptFooter(savedTrip.count)}</strong></div>
                          </ReceiptPaper>
                        )}
                        {impact.length > 0 && (
                          <section aria-labelledby="impact-title">
                            <h2 className="h-small spaced-bottom" id="impact-title">What this receipt changed</h2>
                            <ul className="insight-list">
                              {impact.map((row) => (
                                <li key={row.id}>
                                  <div>
                                    <div className="strong">{row.text}</div>
                                    <div className="muted small">{row.detail}{tone === 'playful' && row.quip && <span className="quip"> {row.quip}</span>}</div>
                                  </div>
                                  <span className={'chip chip-' + row.chip.tone}>{row.chip.label}</span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}
                        {queue.length > 0 ? (
                          <div><button className="btn btn-primary btn-large" type="button" onClick={scanNext}>Review the next receipt ({queue.length} waiting)</button></div>
                        ) : (
                          <div>
                            <label className="btn btn-secondary">
                              <input className="visually-hidden" type="file" accept="image/jpeg,image/png" capture="environment" onChange={scanReceipt} />
                              Scan another receipt
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button className="btn btn-primary btn-large" type="submit">{quickSave ? 'Looks right, save receipt' : receiptId ? 'Save items' : 'Save receipt'}</button>
                    )}
                    {!saved && <span className="small muted">{enteredItems.length === 1 ? '1 item' : `${enteredItems.length} items`}, {dollars.format(enteredCents / 100)}</span>}
                  </div>
                </section>
              </div>
            </fieldset>
          </form>
        )}
        </div>
      </main>

      <footer className="container site-footer">
        <nav aria-label="Legal and support">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="/support/">Support</a>
        </nav>
      </footer>
    </div>
  )
}
