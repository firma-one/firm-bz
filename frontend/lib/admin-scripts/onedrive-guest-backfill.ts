import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { basePrisma } from '@/lib/prisma'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { logger } from '@/lib/logger'
import type { ModelSummary, ScriptResult } from './index'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH_CALL_CHUNK_SIZE = 15

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * One-time backfill: pre-creates the Entra ID guest object for existing members on
 * already-connected, tenant-backed (non-personal-MSA) OneDrive/SharePoint connectors —
 * the same preInviteGuest step item 19's Part 2 now runs at join-time for NEW members.
 * Existing members joined before that shipped and are still on the old first-file-open
 * path.
 *
 * Deliberately NOT filtered by Firma persona/role (eng_ext_collaborator/eng_viewer vs.
 * eng_admin/eng_member) — "Contributor (Internal)" and similar internal-labeled personas
 * are an app-level access-tier concept only, not a guarantee that the member's email is
 * actually a member of the connected Entra tenant. Runs for EVERY member on a matching
 * connector instead; preCreateGuestInvitation is already confirmed idempotent and safe
 * for true internal/tenant-member emails too — Graph's "already exists in the directory"
 * response for an existing Member (not Guest) is silently treated as a non-fatal no-op,
 * same as an existing Guest. See .claude/plans/connector-microsoft-impl.md, item 19, Part 4.
 */
export async function run(): Promise<ScriptResult> {
  const start = Date.now()
  const summary: Record<string, ModelSummary> = {
    connector: { processed: 0, skipped: 0, errors: 0 },
    engagementMember: { processed: 0, skipped: 0, errors: 0 },
  }

  try {
    const connectors = await basePrisma.connector.findMany({
      where: { type: 'ONEDRIVE' },
      select: { id: true, settings: true },
    })
    const tenantBackedConnectorIds = connectors
      .filter((c) => {
        const settings = c.settings as Record<string, unknown> | null
        return settings?.isPersonalAccount !== true
      })
      .map((c) => c.id)

    summary.connector.processed = tenantBackedConnectorIds.length
    summary.connector.skipped = connectors.length - tenantBackedConnectorIds.length

    if (tenantBackedConnectorIds.length === 0) {
      return { script: 'onedrive-guest-backfill', status: 'success', summary, durationMs: Date.now() - start }
    }

    // Match engagements resolving to a tenant-backed connector via EITHER path: Client.connectorId
    // set directly, OR Client.connectorId is null and the client's Firm falls back to one of these
    // connectors via the legacy Firm.connectorId — the same priority chain
    // resolveEngagementConnectorId() uses elsewhere in item 19. Filtering by client.connectorId
    // alone would silently miss every member on a not-yet-backfilled client. See
    // .claude/plans/connector-microsoft-impl.md, item 19, Part 4.
    const eligible = await basePrisma.engagementMember.findMany({
      where: {
        engagement: {
          client: {
            OR: [
              { connectorId: { in: tenantBackedConnectorIds } },
              { connectorId: null, firm: { connectorId: { in: tenantBackedConnectorIds } } },
            ],
          },
        },
      },
      select: {
        id: true,
        userId: true,
        engagement: {
          select: {
            client: { select: { connectorId: true, firm: { select: { connectorId: true } } } },
          },
        },
      },
    })

    const uniqueUserIds = Array.from(new Set(eligible.map((m) => m.userId)))
    const emailByUserId = new Map<string, string | null>()
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)
          emailByUserId.set(userId, user?.email ?? null)
        } catch {
          emailByUserId.set(userId, null)
        }
      })
    )

    for (const batch of chunk(eligible, GRAPH_CALL_CHUNK_SIZE)) {
      await Promise.all(
        batch.map(async (member) => {
          const connectorId = member.engagement.client.connectorId ?? member.engagement.client.firm.connectorId
          const email = emailByUserId.get(member.userId)

          if (!connectorId || !email) {
            summary.engagementMember.skipped++
            return
          }

          try {
            const adapter = await getPermissionAdapter(connectorId)
            if (!adapter?.preInviteGuest) {
              summary.engagementMember.skipped++
              return
            }
            const { outcome } = await adapter.preInviteGuest(connectorId, email)
            // 'confirmed' means Graph's call succeeded and the guest is provisioned — this does
            // NOT reliably mean "brand new this run" (Graph can return success with the same
            // underlying guest object on a repeat call, confirmed live 2026-08-19 — see
            // preCreateGuestInvitation's doc comment). Bucketed as processed regardless, since a
            // real Graph round-trip happened and the guest's provisioned state was confirmed.
            // 'already_guest_or_member' means Graph explicitly declined (already a guest, or an
            // internal tenant member on a verified domain) — a genuine no-op, bucketed as skipped.
            // 'failed' is a real, unexpected Graph error.
            if (outcome === 'confirmed') {
              summary.engagementMember.processed++
            } else if (outcome === 'already_guest_or_member') {
              summary.engagementMember.skipped++
            } else {
              summary.engagementMember.errors++
            }
          } catch (error) {
            summary.engagementMember.errors++
            logger.warn('[onedrive-guest-backfill] preInviteGuest failed', {
              engagementMemberId: member.id,
              connectorId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })
      )
    }

    return { script: 'onedrive-guest-backfill', status: 'success', summary, durationMs: Date.now() - start }
  } catch (error) {
    return {
      script: 'onedrive-guest-backfill',
      status: 'error',
      summary,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
