import type { EngagementInsightsResponse } from '@/app/api/projects/[projectId]/insights/route'
import { ASSISTANT } from './assistant'

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

export const MAX_HISTORY_MESSAGES = 12
export const MAX_QUESTION_LENGTH = 1000

export const CHAT_SYSTEM_PROMPT = `You are ${ASSISTANT.name}, an analyst assistant for a professional services firm, answering questions about one engagement.

You are given a snapshot of that engagement's current data. Follow these rules without exception:

1. Answer ONLY from the snapshot. Never invent a number, name, date, status, or document that is not present in it.
2. If the snapshot does not contain the answer, say so plainly and name what data would be needed. Do not guess or extrapolate.
3. Be concise and concrete. Prefer specifics ("3 deliverables overdue, the oldest by 12 days") over generalities ("some work is behind").
4. You have read-only access. You cannot create, edit, share, assign, or change the status of anything. If asked to perform an action, say you cannot and describe where in the app the user can do it.
5. Never speculate about individuals' performance or intent. Report what the data shows.
6. Short prose or a short list. No headers. Keep it under about 150 words unless genuinely more is needed.`

function fmtDate(d: string | null | undefined): string {
    return d ? new Date(d).toISOString().slice(0, 10) : 'not set'
}

/**
 * Builds the model's view of the engagement.
 *
 * Deliberately excludes free-text document content, comment bodies, and member email addresses:
 * the chat answers questions about delivery state, and widening the payload widens the blast
 * radius of any prompt-injection in user-authored content. Counts and statuses are enough.
 */
export function buildEngagementContext(
    data: EngagementInsightsResponse,
    meta: { clientName?: string; engagementName?: string },
): string {
    const lines: string[] = []

    lines.push(`Engagement: ${meta.engagementName ?? 'unnamed'}${meta.clientName ? ` (client: ${meta.clientName})` : ''}`)
    lines.push(`Today: ${new Date().toISOString().slice(0, 10)}`)
    lines.push(`Kickoff: ${fmtDate(data.kickoffDate)}; due: ${fmtDate(data.engagementDueDate)}` +
        (typeof data.engagementDaysUntilDue === 'number' ? ` (${data.engagementDaysUntilDue} days until due)` : ''))

    if (data.insightsSummary) lines.push(`Manager's note: ${data.insightsSummary}`)

    if (data.healthScore) {
        lines.push(`Overall health: ${data.healthScore.score}/100 (${data.healthScore.level}).` +
            (data.healthScore.penalties?.length
                ? ` Deductions: ${data.healthScore.penalties.map((p: any) => `${p.label ?? p.reason ?? 'issue'} -${p.points ?? p.value ?? '?'}`).join(', ')}.`
                : ''))
    }

    if (data.deliveryHealth) {
        const d = data.deliveryHealth
        lines.push(`Delivery: ${d.approvedCount}/${d.totalCount} approved, ${d.overdueCount} overdue, ` +
            `score ${d.score}/100 (${d.level}), avg ${d.avgDaysPerStage ?? '?'} days per stage.`)
    }

    if (data.sharesProgress) {
        const s = data.sharesProgress
        lines.push(`Deliverable stages: ${s.toDo} to do, ${s.inProgress} in progress, ${s.approved} approved, ` +
            `${s.finalized} finalized (${s.total} total).`)
        lines.push(`External participants: ${s.externalCollaborators} collaborators, ${s.externalViewers} viewers.`)
    }

    if (data.deliverables?.length) {
        lines.push('Deliverables:')
        for (const d of data.deliverables.slice(0, 40)) {
            lines.push(`  - ${d.name} [${d.docId ?? 'no id'}] stage=${d.stage}` +
                `, due=${fmtDate(d.dueDate)}${d.isOverdue ? ' OVERDUE' : ''}` +
                `${d.finalizedAt ? ', finalized' : ''}`)
        }
        if (data.deliverables.length > 40) lines.push(`  ...and ${data.deliverables.length - 40} more.`)
    }

    if (data.documentsDueSoon?.length) {
        lines.push('Documents due soon: ' +
            data.documentsDueSoon.slice(0, 15)
                .map((d: any) => `${d.fileName ?? d.name} (due ${fmtDate(d.dueDate)})`)
                .join('; ') + '.')
    }

    if (data.commentThreads) {
        lines.push(`Comment threads: ${data.commentThreads.total} total, ` +
            `${data.commentThreads.unanswered} awaiting a reply from the firm.`)
    }

    // Document names only — never the message bodies, which are user-authored text.
    if (data.unansweredThreads?.length) {
        lines.push('Documents with unanswered client comments: ' +
            data.unansweredThreads.slice(0, 10).map((t: any) => t.documentName).join('; ') + '.')
    }

    if (data.planningHygiene) {
        const p = data.planningHygiene
        lines.push(`Planning coverage: ${p.deliverableWithDueDate}/${p.deliverableTotal} deliverables have a due date; ` +
            `${p.docWithDueDate}/${p.docTotal} documents have a due date; ${p.docWithAssignee} documents have an assignee.`)
    }

    if (data.pace) {
        lines.push(`Pace: ${data.pace.deliveredPct}% of work delivered, ${data.pace.timePct}% of the timeline elapsed` +
            `${data.pace.hasDeadline ? '' : ' (no deadline set)'}.`)
    }

    if (data.approvalCycle) {
        lines.push(`Approval cycle: avg ${data.approvalCycle.avgCycleDays ?? '?'} days, ` +
            `median ${data.approvalCycle.medianCycleDays ?? '?'} days across ${data.approvalCycle.approvedCount} approved deliverables.`)
    }

    if (data.firstTimeRight) {
        lines.push(`First-time-right: ${data.firstTimeRight.firstTime} approved without rework, ` +
            `${data.firstTimeRight.reworked} needed revisions.`)
    }

    if (data.revisionMetrics?.length) {
        const reworked = data.revisionMetrics.filter((r: any) => r.revisions > 0)
        if (reworked.length) {
            lines.push('Revision rounds: ' +
                reworked.slice(0, 10).map((r: any) => `${r.name} x${r.revisions}`).join('; ') + '.')
        }
    }

    if (data.storageHealth) {
        const s = data.storageHealth
        lines.push(`Files: ${s.totalFiles} total, ${s.staleFiles?.length ?? 0} stale, ` +
            `${s.duplicateCount ?? 0} duplicates, ${s.badlyNamedCount ?? 0} poorly named.`)
    }

    if (data.folderHealth) {
        lines.push(`Folder structure: score ${data.folderHealth.score}/100, ` +
            `${data.folderHealth.totalFolders} folders, max depth ${data.folderHealth.maxDepth}, ` +
            `${data.folderHealth.emptyFolders} empty, ${data.folderHealth.orphanedFiles} orphaned files.`)
    }

    lines.push(`Team: ${data.memberCount} member(s)` +
        (data.membersByRole ? ` by role — ${Object.entries(data.membersByRole).map(([r, n]) => `${r}: ${n}`).join(', ')}` : '') + '.')

    if (data.pendingInvitations?.length) {
        lines.push(`${data.pendingInvitations.length} invitation(s) pending acceptance.`)
    }

    return lines.join('\n')
}

export function sanitizeHistory(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((m): m is ChatMessage =>
            Boolean(m) && typeof m === 'object' &&
            ((m as any).role === 'user' || (m as any).role === 'assistant') &&
            typeof (m as any).content === 'string' &&
            (m as any).content.trim().length > 0)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_LENGTH) }))
}
