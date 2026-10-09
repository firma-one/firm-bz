import { prisma } from '@/lib/prisma'
import { ensureFirmAgentUser } from '@/lib/ai/files-agent/agent-identity'
import type { ScriptResult, ModelSummary } from './index'

/**
 * Adds Brio PMO to firms and engagements that predate the agent.
 *
 * Two rows per firm, doing different jobs. The FIRM row is the real grant: `firm_admin` there
 * means `checkProjectPermission` falls back to firm-level access across every client and
 * engagement, which is what firm-level agentic work will need. The ENGAGEMENT rows exist so Brio
 * appears in each engagement's Members tab, which reads that table specifically.
 *
 * New firms and engagements get these automatically; this covers what already exists. Without it,
 * an agent operation on an older engagement shows a blank actor in the Audit tab.
 *
 * Idempotent, as every script on this page is: the unique constraints on (userId, firmId) and
 * (userId, engagementId) mean a second run inserts nothing. Deleted engagements are skipped —
 * backfilling a member into something nobody can open would be noise in every count that reads it.
 */
export async function run(): Promise<ScriptResult> {
    const startedAt = Date.now()
    const summary: Record<string, ModelSummary> = {
        firmMember: { processed: 0, skipped: 0, errors: 0 },
        engagementMember: { processed: 0, skipped: 0, errors: 0 },
    }
    const firmStats = summary.firmMember
    const stats = summary.engagementMember

    try {
        const firms = await prisma.firm.findMany({ select: { id: true } })
        for (const firm of firms) {
            try {
                const userId = await ensureFirmAgentUser(firm.id)
                if (!userId) { firmStats.errors += 1; continue }
                const existing = await prisma.firmMember.findFirst({
                    where: { userId, firmId: firm.id },
                    select: { id: true },
                })
                if (existing) {
                    firmStats.skipped += 1
                    continue
                }
                await prisma.firmMember.create({
                    data: {
                        userId,
                        firmId: firm.id,
                        role: 'firm_admin',
                        membershipType: 'internal',
                        isDefault: false,
                    },
                })
                firmStats.processed += 1
            } catch {
                firmStats.errors += 1
            }
        }

        const engagements = await prisma.engagement.findMany({
            where: { isDeleted: false },
            select: { id: true, firmId: true },
        })

        for (const engagement of engagements) {
            try {
                const userId = await ensureFirmAgentUser(engagement.firmId)
                if (!userId) { stats.errors += 1; continue }

                const existing = await prisma.engagementMember.findUnique({
                    where: { userId_engagementId: { userId, engagementId: engagement.id } },
                    select: { id: true },
                })
                if (existing) {
                    stats.skipped += 1
                    continue
                }

                await prisma.engagementMember.create({
                    data: {
                        engagementId: engagement.id,
                        userId,
                        // Matches what createEngagement writes. File mutations are gated on the
                        // approving lead rather than on this row, so the role is about how Brio
                        // is listed, not about what it may do.
                        role: 'eng_admin',
                    },
                })
                stats.processed += 1
            } catch {
                stats.errors += 1
            }
        }

        return {
            script: 'brio-member-backfill',
            status: 'success',
            summary,
            durationMs: Date.now() - startedAt,
        }
    } catch (error) {
        return {
            script: 'brio-member-backfill',
            status: 'error',
            summary,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
