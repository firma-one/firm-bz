import 'server-only'

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { getSystemAdminEmails } from '@/lib/system/admin-check'
import { platformLink } from '@/lib/navigation/platform-link'
import { renderDomainDecisionEmail, renderDomainRequestedEmail, renderDomainUnreachableEmail } from '@/lib/email-templates/custom-domain'
import type { DomainKind } from '@/lib/custom-domains/domain-rules'

/** Emails for the custom-domain flow. Billing and /system links stay on the main host on purpose. */

async function emailOf(userId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ email: string | null }[]>`SELECT email FROM auth.users WHERE id = ${userId}::uuid`
    return rows[0]?.email ?? null
}

/** The requester, plus the Group's admins, deduplicated. */
async function groupAdminEmails(groupId: string, requestedBy: string): Promise<string[]> {
    const admins = await prisma.groupMember.findMany({ where: { groupId, role: 'GROUP_ADMIN' }, select: { userId: true } })
    const ids = Array.from(new Set([requestedBy, ...admins.map((a) => a.userId)]))
    const emails = await Promise.all(ids.map(emailOf))
    return Array.from(new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase())))
}

export async function notifyDomainRequested(p: { host: string; kind: DomainKind; groupName: string; plan: string | null }): Promise<void> {
    const to = getSystemAdminEmails()
    if (to.length === 0) return
    const { subject, html } = renderDomainRequestedEmail({
        host: p.host,
        kindLabel: p.kind === 'CUSTOM' ? 'Own domain' : 'Subdomain',
        groupName: p.groupName,
        plan: p.plan,
        reviewUrl: platformLink('/system/custom-domains'),
    })
    await Promise.all(to.map((email) => sendEmail(email, subject, html)))
}

export async function notifyDomainDecision(p: { groupId: string; requestedBy: string; host: string; approved: boolean; note: string | null }): Promise<void> {
    const to = await groupAdminEmails(p.groupId, p.requestedBy)
    const { subject, html } = renderDomainDecisionEmail({
        host: p.host,
        approved: p.approved,
        note: p.note?.trim() || null,
        ctaUrl: p.approved ? `https://${p.host}/` : platformLink('/d/billing'),
    })
    await Promise.all(to.map((email) => sendEmail(email, subject, html)))
}

export async function notifyDomainUnreachable(p: { groupId: string; requestedBy: string; host: string; reason: string }): Promise<void> {
    const to = Array.from(new Set([...(await groupAdminEmails(p.groupId, p.requestedBy)), ...getSystemAdminEmails()]))
    const { subject, html } = renderDomainUnreachableEmail({ host: p.host, reason: p.reason, ctaUrl: platformLink('/d/billing') })
    await Promise.all(to.map((email) => sendEmail(email, subject, html)))
}
