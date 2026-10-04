import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getFirmHierarchy } from '@/lib/actions/hierarchy'

/**
 * Resolve sidebar "Recents" against live data.
 *
 * Recents are a localStorage cache that nothing reconciled against the DB, so a client or
 * engagement deleted anywhere (by this user on another device, or by a colleague) kept sitting
 * in the sidebar and 404'd when clicked. The caller posts what it has cached; this returns the
 * subset that still exists and is still visible to the caller, with canonical names.
 *
 * Two deliberate properties:
 *
 *  - Visibility comes from `getFirmHierarchy`, the same source the client/engagement pages gate
 *    on, so "pruned from recents" and "404s when opened" cannot drift apart.
 *  - Any failure returns a non-200 rather than a short list. The caller prunes from this
 *    response, so an empty body on a transient error would silently wipe the user's recents.
 */

type RecentNavType = 'client' | 'engagement'

type IncomingItem = {
  type: RecentNavType
  slug: string
  /** Owning client's slug. Equal to `slug` for client entries. */
  clientSlug: string
}

type ResolvedItem = IncomingItem & { name: string }

// Generous bound — the sidebar caps itself at 10 per firm. Guards against a junk payload.
const MAX_ITEMS = 50

function isValidItem(raw: unknown): raw is IncomingItem {
  if (!raw || typeof raw !== 'object') return false
  const item = raw as Record<string, unknown>
  return (
    (item.type === 'client' || item.type === 'engagement') &&
    typeof item.slug === 'string' && item.slug.length > 0 &&
    typeof item.clientSlug === 'string' && item.clientSlug.length > 0
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const firmSlug = typeof payload.firmSlug === 'string' ? payload.firmSlug : null
  const rawItems = Array.isArray(payload.items) ? payload.items : null
  if (!firmSlug || !rawItems) {
    return NextResponse.json({ error: 'firmSlug and items are required' }, { status: 400 })
  }

  const items = rawItems.slice(0, MAX_ITEMS).filter(isValidItem)
  if (items.length === 0) return NextResponse.json({ items: [] })

  // getFirmHierarchy redirects (which throws) for a signed-out user or an unknown firm, and
  // returns [] for a non-member. Treat every throw as "can't answer" rather than "nothing is
  // live" so a blip can't prune anything.
  let hierarchy
  try {
    hierarchy = await getFirmHierarchy(firmSlug)
  } catch {
    return NextResponse.json({ error: 'Could not resolve recents' }, { status: 503 })
  }

  const clientNameBySlug = new Map<string, string>()
  const engagementNameByKey = new Map<string, string>()
  for (const client of hierarchy) {
    clientNameBySlug.set(client.slug, client.name)
    for (const engagement of client.engagements ?? []) {
      // Engagement slugs are only unique within a client, so key on both.
      engagementNameByKey.set(`${client.slug}/${engagement.slug}`, engagement.name)
    }
  }

  // Membership and soft-delete are already enforced in the hierarchy query itself. We do not
  // additionally filter on the per-engagement `canView` it computes: that is derived from the
  // userSettingsPlus permission cache, which degrades to "no permissions" when its read fails
  // — which would look like "every engagement is gone" and wipe the list.
  const resolved: ResolvedItem[] = []
  for (const item of items) {
    const name = item.type === 'client'
      ? clientNameBySlug.get(item.slug)
      : engagementNameByKey.get(`${item.clientSlug}/${item.slug}`)
    if (name) resolved.push({ ...item, name })
  }

  return NextResponse.json({ items: resolved })
}
