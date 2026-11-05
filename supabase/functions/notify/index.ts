import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import webpush from 'npm:web-push@3.6.7'

// Sends CartTrail's push notifications. Two actions, both POST with a JSON body:
//   { "action": "test" }  a signed-in user sends a test notification to their own devices.
//   { "action": "run" }   the hourly scheduled job; requires the `x-cron-secret` header.
// Keep this a single file: the Supabase dashboard editor does not reliably keep extra files.

export type Settings = { weekly_summary: boolean; budget_alerts: boolean; reminders: boolean; timezone: string }
export type DayReceipt = { purchased_on: string; cents: number }
export type Message = {
  kind: string
  period: string
  alsoLog?: Array<[string, string]>
  title: string
  body: string
  url: string
}

const DAY = 86400000
const SEND_HOUR = 10 // local time; the job runs hourly and each user is only handled at their own 10am
const MAX_MESSAGES_PER_RUN = 2
const REMINDER_MIN_GAP_DAYS = 7
const REMINDER_GIVE_UP_DAYS = 45

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
]

/** Only known push services are ever contacted, whatever a client stored. */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((pattern) => pattern.test(url.hostname))
  } catch {
    return false
  }
}

function localParts(now: Date, timeZone: string): { date: string; weekday: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(now)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
    return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), hour: Number(get('hour')) % 24 }
  } catch {
    return timeZone === 'UTC' ? { date: now.toISOString().slice(0, 10), weekday: 'Mon', hour: now.getUTCHours() } : localParts(now, 'UTC')
  }
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
const addDays = (iso: string, days: number) => new Date(dayNumber(iso) + days * DAY).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => Math.round((dayNumber(to) - dayNumber(from)) / DAY)
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

/**
 * Decides what to send a user right now. Pure: everything it needs is passed in.
 * `sent` holds "kind|period" keys already sent; `lastReminder` is the date of the last reminder.
 * Priority is budget, then weekly summary, then reminder, and a reminder never shares a day with another message.
 */
export function plan(input: {
  now: Date
  settings: Settings
  receipts: DayReceipt[]
  budgetCents: number | null
  sent: Set<string>
  lastReminder: string | null
}): Message[] {
  const { settings, receipts, budgetCents, sent, lastReminder } = input
  const local = localParts(input.now, settings.timezone)
  if (local.hour !== SEND_HOUR) return []
  const today = local.date
  const messages: Message[] = []
  const spentBetween = (from: string, to: string) =>
    receipts.filter((receipt) => receipt.purchased_on >= from && receipt.purchased_on <= to).reduce((sum, receipt) => sum + receipt.cents, 0)

  if (settings.budget_alerts && budgetCents && budgetCents > 0) {
    const month = today.slice(0, 7)
    const spent = spentBetween(month + '-01', today)
    if (spent >= budgetCents && !sent.has(`budget100|${month}`)) {
      messages.push({
        kind: 'budget100', period: month, alsoLog: [['budget80', month]],
        title: 'You’re over budget this month',
        body: `${money(spent)} spent against your ${money(budgetCents)} budget. Open CartTrail to see where it went.`,
        url: '/',
      })
    } else if (spent >= budgetCents * 0.8 && spent < budgetCents && !sent.has(`budget80|${month}`)) {
      messages.push({
        kind: 'budget80', period: month,
        title: '80% of your budget is used',
        body: `${money(spent)} of ${money(budgetCents)} so far this month, with ${money(budgetCents - spent)} left.`,
        url: '/',
      })
    }
  }

  if (settings.weekly_summary && local.weekday === 'Sun' && !sent.has(`weekly|${today}`)) {
    const thisWeek = spentBetween(addDays(today, -6), today)
    const lastWeek = spentBetween(addDays(today, -13), addDays(today, -7))
    if (thisWeek > 0) {
      const change = lastWeek > 0
        ? thisWeek === lastWeek ? ' That’s the same as the week before.'
          : ` That’s ${money(Math.abs(thisWeek - lastWeek))} ${thisWeek > lastWeek ? 'more' : 'less'} than the week before.`
        : ''
      messages.push({
        kind: 'weekly', period: today,
        title: 'Your week in groceries',
        body: `You spent ${money(thisWeek)} over the last 7 days.${change}`,
        url: '/',
      })
    }
  }

  if (settings.reminders && messages.length === 0) {
    const dates = [...new Set(receipts.map((receipt) => receipt.purchased_on).filter((date) => date <= today))].sort()
    if (dates.length > 0) {
      const since = daysBetween(dates[dates.length - 1], today)
      const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date)).slice(-6)
      const median = gaps.length >= 3 ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null
      const threshold = median === null ? 10 : Math.max(REMINDER_MIN_GAP_DAYS, Math.ceil(median * 1.5))
      const recentlyReminded = lastReminder !== null && daysBetween(lastReminder, today) < REMINDER_MIN_GAP_DAYS
      if (since >= threshold && since <= REMINDER_GIVE_UP_DAYS && !recentlyReminded) {
        messages.push({
          kind: 'reminder', period: today,
          title: 'Keep your history complete',
          body: `It’s been ${since} days since your last receipt. Scan the ones you have to keep your trends accurate.`,
          url: '/?scan=1',
        })
      }
    }
  }

  return messages.slice(0, MAX_MESSAGES_PER_RUN)
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index++) diff |= given.charCodeAt(index) ^ expected.charCodeAt(index)
  return diff === 0
}

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

async function deliver(
  admin: ReturnType<typeof createClient>,
  subscriptions: Subscription[],
  payload: { title: string; body: string; url: string; tag?: string },
): Promise<number> {
  let delivered = 0
  for (const subscription of subscriptions) {
    if (!isPushEndpoint(subscription.endpoint)) continue
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      )
      delivered++
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      // The browser says this subscription is gone, so stop sending to it.
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
    }
  }
  return delivered
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return json({ error: 'Push notifications are not configured on the server.' }, 503)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', publicKey, privateKey)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const body = await request.json().catch(() => ({}))

    if (body?.action === 'test') {
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
      if (!token) return json({ error: 'Sign in first.' }, 401)
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data.user) return json({ error: 'Your session expired. Sign in again.' }, 401)
      const { data: subscriptions } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('user_id', data.user.id)
      if (!subscriptions?.length) return json({ error: 'No device is subscribed yet.' }, 404)
      const delivered = await deliver(admin, subscriptions as Subscription[], {
        title: 'CartTrail notifications are on',
        body: 'You’ll get your weekly summary, budget alerts and reminders here.',
        url: '/', tag: 'test',
      })
      return json({ delivered })
    }

    if (body?.action === 'run') {
      if (!sameSecret(request.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))) return json({ error: 'Not allowed.' }, 403)
      const now = new Date()
      const since = new Date(now.getTime() - 120 * DAY).toISOString().slice(0, 10)
      const { data: all } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
      const byUser = new Map<string, Subscription[]>()
      for (const subscription of (all ?? []) as Subscription[]) {
        byUser.set(subscription.user_id, [...(byUser.get(subscription.user_id) ?? []), subscription])
      }

      let users = 0
      let sent = 0
      for (const [userId, subscriptions] of byUser) {
        users++
        const { data: stored } = await admin.from('notification_settings').select('weekly_summary, budget_alerts, reminders, timezone').eq('user_id', userId).maybeSingle()
        const settings: Settings = stored ?? { weekly_summary: true, budget_alerts: true, reminders: true, timezone: 'UTC' }
        const { data: rows } = await admin.from('receipts').select('purchased_on, receipt_items(line_total_cents)').eq('user_id', userId).gte('purchased_on', since)
        const receipts: DayReceipt[] = (rows ?? []).map((row: { purchased_on: string; receipt_items: Array<{ line_total_cents: number }> }) => ({
          purchased_on: row.purchased_on,
          cents: row.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0),
        })).filter((receipt: DayReceipt) => receipt.cents !== 0)
        const { data: budget } = await admin.from('grocery_budgets').select('monthly_cents').eq('user_id', userId).maybeSingle()
        const { data: log } = await admin.from('notification_log').select('kind, period').eq('user_id', userId).gte('sent_at', new Date(now.getTime() - 40 * DAY).toISOString())
        const sentKeys = new Set((log ?? []).map((entry: { kind: string; period: string }) => `${entry.kind}|${entry.period}`))
        const lastReminder = (log ?? []).filter((entry: { kind: string }) => entry.kind === 'reminder')
          .map((entry: { period: string }) => entry.period).sort().pop() ?? null

        for (const message of plan({ now, settings, receipts, budgetCents: budget?.monthly_cents ?? null, sent: sentKeys, lastReminder })) {
          const delivered = await deliver(admin, subscriptions, { title: message.title, body: message.body, url: message.url, tag: message.kind })
          if (delivered > 0) {
            sent++
            const entries = [[message.kind, message.period], ...(message.alsoLog ?? [])]
            await admin.from('notification_log').upsert(
              entries.map(([kind, period]) => ({ user_id: userId, kind, period })),
              { onConflict: 'user_id,kind,period', ignoreDuplicates: true },
            )
          }
        }
      }
      return json({ users, sent })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch {
    return json({ error: 'The notification job could not be completed.' }, 500)
  }
})
