import 'server-only'

import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { isAgentUser } from '@/lib/ai/files-agent/agent-identity'
import type { FirmEngagementRow } from './firm-engagement-pace'

/** An active engagement as the firm insights route already loads it. */
export interface FirmEngagementInput {
    id: string
    name: string
    slug: string
    kickoffDate: Date | null
    createdAt: Date
    dueDate: Date | null
    client: { name: string; slug: string }
}

type Stage = 'to_do' | 'in_progress' | 'in_review' | 'approved'

/** As in computeEngagementInsights: "done" is the old name for approved; anything else is to do. */
function normalizeStage(raw: unknown): Stage {
    const s = raw === 'done' ? 'approved' : raw
    return s === 'in_progress' || s === 'in_review' || s === 'approved' ? s : 'to_do'
}

/**
 * The Firm Overview's engagement rows: two queries for every active engagement at once (their
 * deliverable folders, their leads), then the leads' names. Deliverables are the engagement's
 * folders marked as deliverables (settings.share.createdAt), as on the engagement Overview.
 */
export async function buildFirmEngagementRows(engagements: FirmEngagementInput[], now: Date = new Date()): Promise<FirmEngagementRow[]> {
    if (engagements.length === 0) return []
    const ids = engagements.map((e) => e.id)

    const [folders, leads] = await Promise.all([
        prisma.engagementDocument.findMany({
            where: { engagementId: { in: ids }, isFolder: true },
            select: { engagementId: true, settings: true, dueDate: true },
        }),
        prisma.engagementMember.findMany({
            where: { engagementId: { in: ids }, role: 'eng_admin' },
            select: { engagementId: true, userId: true },
            orderBy: { createdAt: 'asc' },
        }),
    ])

    // Lead names, once per person. Brio can hold the lead role; it isn't shown as one.
    const people = new Map<string, { name: string; avatarUrl: string | null } | null>()
    const admin = createAdminClient()
    await Promise.all(Array.from(new Set(leads.map((l) => l.userId))).map(async (userId) => {
        try {
            const { data } = await admin.auth.admin.getUserById(userId)
            const user = data?.user
            if (!user?.email || isAgentUser(user)) { people.set(userId, null); return }
            const meta = (user.user_metadata ?? {}) as Record<string, unknown>
            people.set(userId, {
                name: String(meta.full_name ?? meta.name ?? user.email.split('@')[0]),
                avatarUrl: (meta.avatar_url ?? meta.picture ?? null) as string | null,
            })
        } catch {
            people.set(userId, null)
        }
    }))

    const nowMs = now.getTime()
    return engagements.map((e) => {
        const deliverables = { total: 0, toDo: 0, inProgress: 0, inReview: 0, approved: 0, overdue: 0 }
        for (const f of folders) {
            if (f.engagementId !== e.id) continue
            const st = f.settings as { share?: { createdAt?: unknown }; activity?: { status?: unknown } } | null
            if (!st?.share?.createdAt) continue
            const stage = normalizeStage(st.activity?.status ?? 'to_do')
            deliverables.total++
            if (stage === 'to_do') deliverables.toDo++
            else if (stage === 'in_progress') deliverables.inProgress++
            else if (stage === 'in_review') deliverables.inReview++
            else deliverables.approved++
            if (stage !== 'approved' && f.dueDate && f.dueDate.getTime() < nowMs) deliverables.overdue++
        }
        const lead = leads.filter((l) => l.engagementId === e.id).map((l) => people.get(l.userId)).find(Boolean) ?? null
        return {
            engagementId: e.id,
            name: e.name,
            slug: e.slug,
            clientName: e.client.name,
            clientSlug: e.client.slug,
            startDate: (e.kickoffDate ?? e.createdAt).toISOString(),
            dueDate: e.dueDate ? e.dueDate.toISOString() : null,
            lead,
            deliverables,
        }
    })
}
