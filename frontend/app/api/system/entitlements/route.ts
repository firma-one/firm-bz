import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { logger } from '@/lib/logger'
import {
    readEntitlementView,
    resyncGroupEntitlements,
    saveEntitlementOverrides,
    OVERRIDABLE_ENTITLEMENTS,
    type OverridableEntitlement,
} from '@/lib/billing/entitlement-resync'

/**
 * System-admin entitlement inspection, resync and override, scoped to one billing group.
 *
 * Exists because `platform.subscriptions.settings.metadata` is a point-in-time snapshot of Polar
 * product metadata and Polar sends no webhook when product metadata is edited — so a dashboard
 * change never reaches existing subscribers on its own. See `lib/billing/entitlement-resync.ts`
 * for the full reasoning.
 *
 * - `GET`    — read the effective entitlements, overrides, and staleness. No writes.
 * - `POST`   — resync from Polar.
 * - `PUT`    — save overrides, then resync so the response carries the final merged state.
 *
 * Auth follows the sibling `system/user-data-map/reindex` route: cookie session via
 * `@/utils/supabase/server`, then `isSysAdminUser` (which resolves against `SYSTEM_ADMIN_EMAILS`).
 * Cookie rather than Bearer because the caller is the user-data-map page, which fetches without a
 * token — `system/reprovision-firms` uses Bearer only because it is invoked outside the browser.
 */

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Authorized = { userId: string } | { error: NextResponse }

async function authorize(): Promise<Authorized> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.id) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    if (!(await isSysAdminUser(user.id))) {
        return {
            error: NextResponse.json(
                { error: 'Forbidden: System admin access required' },
                { status: 403 },
            ),
        }
    }
    return { userId: user.id }
}

/** Shared so a malformed id never reaches Prisma as a raw string. */
function readGroupId(value: string | null): string | null {
    const id = value?.trim() ?? ''
    return UUID_RE.test(id) ? id : null
}

export async function GET(request: NextRequest) {
    try {
        const auth = await authorize()
        if ('error' in auth) return auth.error

        const groupId = readGroupId(request.nextUrl.searchParams.get('groupId'))
        if (!groupId) {
            return NextResponse.json({ error: 'A valid groupId is required' }, { status: 400 })
        }

        const view = await readEntitlementView(groupId)
        return NextResponse.json({ view, overridable: OVERRIDABLE_ENTITLEMENTS })
    } catch (error) {
        logger.error('[system/entitlements] GET failed:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await authorize()
        if ('error' in auth) return auth.error

        const body = await request.json().catch(() => null) as { groupId?: string } | null
        const groupId = readGroupId(body?.groupId ?? null)
        if (!groupId) {
            return NextResponse.json({ error: 'A valid groupId is required' }, { status: 400 })
        }

        const resync = await resyncGroupEntitlements(groupId, auth.userId)
        const view = await readEntitlementView(groupId)
        return NextResponse.json({ resync, view })
    } catch (error) {
        logger.error('[system/entitlements] resync failed:', error as Error)
        // The Polar message is useful to an admin here (bad product id, revoked token), and this
        // route is system-admin only, so it is surfaced rather than swallowed.
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Resync failed' },
            { status: 500 },
        )
    }
}

export async function PUT(request: NextRequest) {
    try {
        const auth = await authorize()
        if ('error' in auth) return auth.error

        const body = await request.json().catch(() => null) as {
            groupId?: string
            values?: Record<string, string | null>
            note?: string
        } | null

        const groupId = readGroupId(body?.groupId ?? null)
        if (!groupId) {
            return NextResponse.json({ error: 'A valid groupId is required' }, { status: 400 })
        }
        if (!body?.values || typeof body.values !== 'object') {
            return NextResponse.json({ error: 'values is required' }, { status: 400 })
        }
        // Required so "why does this firm have 1000 credits?" stays answerable later — but only
        // when an override is actually being set. Demanding a note to CLEAR every override would
        // leave no way back to the Polar values.
        const note = body.note?.trim() ?? ''
        const settingAny = Object.values(body.values).some((v) => v !== null && v !== '')
        if (settingAny && !note) {
            return NextResponse.json(
                { error: 'A note is required when overriding entitlements' },
                { status: 400 },
            )
        }

        const unknown = Object.keys(body.values).filter(
            (k) => !(OVERRIDABLE_ENTITLEMENTS as readonly string[]).includes(k),
        )
        if (unknown.length > 0) {
            return NextResponse.json(
                { error: `Unknown entitlement(s): ${unknown.join(', ')}` },
                { status: 400 },
            )
        }

        const { view, resync } = await saveEntitlementOverrides({
            groupId,
            values: body.values as Partial<Record<OverridableEntitlement, string | null>>,
            note,
            actorUserId: auth.userId,
        })
        return NextResponse.json({ view, resync })
    } catch (error) {
        logger.error('[system/entitlements] override save failed:', error as Error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not save overrides' },
            { status: 400 },
        )
    }
}
