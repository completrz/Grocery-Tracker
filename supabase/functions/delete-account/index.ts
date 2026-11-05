import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Deletes a signed-in user's data, or their whole account. POST { "scope": "data" | "account", "confirm": "DELETE" }.
//   data     receipts, items, saved store branches, remembered categories and the budget. The account stays.
//   account  everything above plus the profile, avatar, notification settings and devices, and the sign-in itself.
// The caller must have signed in within the last 30 minutes (the app asks email users for their password first).
// Keep this a single file, and deploy it with "Verify JWT" off: it authenticates the caller itself.

const RECENT_SIGN_IN_MS = 30 * 60 * 1000
const CHUNK = 200

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

// Error codes meaning "this table doesn't exist (yet)", so an optional migration that was never applied is skipped.
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !Deno.env.get(name))
  if (missing.length > 0) {
    console.error('delete-account: missing secrets:', missing.join(', '))
    return json({ error: 'Deleting data is not configured on the server.' }, 503)
  }

  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return json({ error: 'Sign in first.' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return json({ error: 'Your session expired. Sign in again.' }, 401)
    const user = data.user

    const body = await request.json().catch(() => ({}))
    if (body?.confirm !== 'DELETE' || (body?.scope !== 'data' && body?.scope !== 'account')) {
      return json({ error: 'Confirm by typing DELETE.' }, 400)
    }

    const signedInAt = Date.parse(user.last_sign_in_at ?? '')
    if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > RECENT_SIGN_IN_MS) {
      return json({ error: 'For your security, sign out and sign back in, then try again.', code: 'reauth' }, 403)
    }

    const userId = user.id

    // Required tables: any failure stops everything before the account is touched, so the user can simply retry.
    const { data: receipts, error: receiptsError } = await admin.from('receipts').select('id').eq('user_id', userId)
    if (receiptsError) throw receiptsError
    const ids = (receipts ?? []).map((receipt: { id: string }) => receipt.id)
    for (let start = 0; start < ids.length; start += CHUNK) {
      const { error: itemsError } = await admin.from('receipt_items').delete().in('receipt_id', ids.slice(start, start + CHUNK))
      if (itemsError) throw itemsError
    }
    const { error: deleteReceiptsError } = await admin.from('receipts').delete().eq('user_id', userId)
    if (deleteReceiptsError) throw deleteReceiptsError

    const optional = async (table: string) => {
      const { error: tableError } = await admin.from(table).delete().eq('user_id', userId)
      if (tableError && !MISSING_TABLE.has(tableError.code ?? '')) throw tableError
    }
    await optional('store_branches')
    await optional('receipt_category_rules')
    await optional('grocery_budgets')

    if (body.scope === 'account') {
      await optional('push_subscriptions')
      await optional('notification_settings')
      await optional('notification_log')
      await optional('profiles')
      const { data: files } = await admin.storage.from('avatars').list(userId)
      if (files?.length) await admin.storage.from('avatars').remove(files.map((file: { name: string }) => `${userId}/${file.name}`))
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
      if (deleteUserError) throw deleteUserError
    }

    return json({ deleted: body.scope })
  } catch (error) {
    console.error('delete-account: failed:', error instanceof Error ? error.message : JSON.stringify(error))
    return json({ error: 'Something went wrong while deleting. Some data may already be gone, so try again.' }, 500)
  }
})
