import 'server-only'

import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withoutAgentIds } from '@/lib/ai/agent-email'
import { createEventNotifications } from '@/lib/notify-event'
import { documentLink, isDeliverableFolder } from '@/lib/notification-links'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { logger } from '@/lib/logger'

/**
 * How a background job that couldn't do its part with storage tells a person (decision 2 of
 * .claude/plans/error-handling-audit.md). A revoke or grant runs after the toast, so a toast can't carry
 * it: the engagement's Leads get an Inbox notification instead, saying what, who and why.
 *
 * Only people: the Brio agent is never told. With no Lead on the engagement, its firm's admins are.
 * One notification per Lead for each person and kind of problem, however many files it names, and the
 * same problem isn't reported twice in a day (`dedupeKey`).
 *
 * The notification is an ordinary Inbox row (`STORAGE_ACCESS_NOT_CHANGED`), rendered like any other:
 * no schema change.
 */

export const STORAGE_ACCESS_NOTICE_TYPE = 'STORAGE_ACCESS_NOT_CHANGED'

export type StorageAccessProblemKind =
    /** A file permission that should have been taken back still stands. */
    | 'revoke'
    /** A folder grant that should have been taken back still stands. */
    | 'folder_revoke'
    /** A folder or file the person should have been given wasn't shared. */
    | 'grant'
    /** Marked Completed, but they can still edit. */
    | 'read_only'
    /** Reopened, but they can't edit again. */
    | 'restore'

export interface StorageAccessProblem {
    kind: StorageAccessProblemKind
    /** Whose access it is. */
    userId: string
    /** What it's on, as a person names it: "Budget.xlsx", "General". */
    itemName: string
    itemType: 'file' | 'folder'
    /** The file's row in Firma, when there is one: a single-file notice links to it. */
    documentId?: string | null
    /** Why, in words for people: a StorageFailure's message. */
    reason: string
    /** What identifies the fact (a permission or folder id), so the same one isn't reported twice. */
    key: string
}

type Place = {
    firmId: string
    clientId: string
    slugs: { groupSlug: string; firmSlug: string; clientSlug: string; engagementSlug: string } | null
}

async function placeOf(engagementId: string): Promise<Place | null> {
    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: {
            firmId: true,
            clientId: true,
            slug: true,
            client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } },
        },
    })
    if (!engagement) return null
    const groupSlug = engagement.client?.firm?.group?.slug
    const firmSlug = engagement.client?.firm?.slug
    const clientSlug = engagement.client?.slug
    return {
        firmId: engagement.firmId,
        clientId: engagement.clientId,
        slugs: groupSlug && firmSlug && clientSlug && engagement.slug
            ? { groupSlug, firmSlug, clientSlug, engagementSlug: engagement.slug }
            : null,
    }
}

/** The engagement's Leads, people only; its firm's admins when it has none. */
async function recipientsFor(engagementId: string, firmId: string): Promise<string[]> {
    const leads = await prisma.engagementMember.findMany({
        where: { engagementId, role: 'eng_admin' },
        select: { userId: true },
    })
    const people = await withoutAgentIds(leads.map((l) => l.userId))
    if (people.length > 0) return people
    const admins = await prisma.firmMember.findMany({
        where: { firmId, role: 'firm_admin' },
        select: { userId: true },
    })
    return withoutAgentIds(admins.map((a) => a.userId))
}

/** The engagement's storage, as people name it: "Google Drive", "OneDrive", or "Storage" when unknown. */
export async function storageProviderName(engagementId: string): Promise<string> {
    try {
        const connectorId = await resolveEngagementConnectorId(engagementId)
        if (!connectorId) return 'Storage'
        const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
        if (connector?.type === 'GOOGLE_DRIVE') return 'Google Drive'
        if (connector?.type === 'ONEDRIVE') return 'OneDrive'
    } catch {
        // The words are still right without it.
    }
    return 'Storage'
}

function whatOf(problems: StorageAccessProblem[]): string {
    if (problems.length === 1) return problems[0].itemName
    const types = new Set(problems.map((p) => p.itemType))
    const noun = types.size > 1 ? 'items' : `${problems[0].itemType}s`
    return `${problems.length} ${noun}`
}

function titleFor(kind: StorageAccessProblemKind, provider: string, who: string, what: string): string {
    switch (kind) {
        case 'revoke': return `${provider} still lets ${who} open ${what}`
        case 'folder_revoke': return `${provider} still gives ${who} access to ${what}`
        case 'grant': return `${provider} didn't share ${what} with ${who}`
        case 'read_only': return `${provider} still lets ${who} edit ${what}`
        case 'restore': return `${provider} didn't give ${who} edit access back to ${what}`
    }
}

function leadFor(kind: StorageAccessProblemKind, provider: string): string {
    switch (kind) {
        case 'revoke':
        case 'folder_revoke': return "Couldn't take back their access"
        case 'grant': return `They can't open it in ${provider} yet`
        case 'read_only': return "Couldn't make it read only for them"
        case 'restore': return "Couldn't give them edit access back"
    }
}

function listOf(problems: StorageAccessProblem[]): string {
    const names = Array.from(new Set(problems.map((p) => p.itemName)))
    const shown = names.slice(0, 5).join(', ')
    return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown
}

function keyOf(engagementId: string, recipientId: string, kind: StorageAccessProblemKind, userId: string, facts: string[]): string {
    const day = new Date().toISOString().slice(0, 10)
    const digest = createHash('sha1').update(facts.slice().sort().join('|')).digest('hex').slice(0, 16)
    return `storage-access:${kind}:${engagementId}:${userId}:${recipientId}:${day}:${digest}`
}

/**
 * Tells the engagement's Leads what storage still allows, or still refuses, after a job gave up. Answers
 * how many notifications it wrote. Never throws: a notice that can't be written is logged.
 */
export async function notifyLeadsOfStorageAccess(
    engagementId: string,
    problems: StorageAccessProblem[],
    opts?: { provider?: string },
): Promise<number> {
    if (problems.length === 0) return 0
    try {
        const place = await placeOf(engagementId)
        if (!place) return 0
        const recipients = await recipientsFor(engagementId, place.firmId)
        if (recipients.length === 0) {
            logger.warn('No one to tell that storage access was not changed', { engagementId, problems: problems.length })
            return 0
        }
        const provider = opts?.provider ?? await storageProviderName(engagementId)

        const userIds = Array.from(new Set(problems.map((p) => p.userId)))
        const people = await prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
            Prisma.sql`SELECT id::text, email FROM auth.users WHERE id = ANY(${userIds}::uuid[])`
        )
        const emailOf = new Map(people.map((p) => [p.id, p.email]))

        const docIds = Array.from(new Set(problems.map((p) => p.documentId).filter((id): id is string => !!id)))
        const docs = docIds.length
            ? await prisma.engagementDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, isFolder: true, settings: true } })
            : []
        const docById = new Map(docs.map((d) => [d.id, d]))

        const groups = new Map<string, StorageAccessProblem[]>()
        for (const problem of problems) {
            const group = `${problem.kind}:${problem.userId}`
            groups.set(group, [...(groups.get(group) ?? []), problem])
        }

        const rows = []
        for (const group of Array.from(groups.values())) {
            const { kind, userId } = group[0]
            const who = emailOf.get(userId) ?? 'a member'
            const title = titleFor(kind, provider, who, whatOf(group))
            const body = group.length === 1
                ? `${leadFor(kind, provider)} · ${group[0].reason}`
                : `${leadFor(kind, provider)} · ${group[0].reason}\n\n${listOf(group)}`
            const single = group.length === 1 && group[0].documentId ? docById.get(group[0].documentId) : undefined
            const ctaUrl = place.slugs
                ? single
                    ? documentLink(place.slugs, { id: single.id, deliverable: isDeliverableFolder(single) })
                    : engagementPath(place.slugs.groupSlug, place.slugs.firmSlug, place.slugs.clientSlug, place.slugs.engagementSlug, {
                        tab: kind === 'revoke' ? 'files' : 'members',
                    })
                : null
            for (const recipientId of recipients) {
                rows.push({
                    firmId: place.firmId,
                    clientId: place.clientId,
                    engagementId,
                    documentId: single?.id ?? null,
                    userId: recipientId,
                    type: STORAGE_ACCESS_NOTICE_TYPE,
                    title,
                    body,
                    ctaUrl,
                    metadata: {
                        kind,
                        subjectUserId: userId,
                        items: group.map((p) => ({ name: p.itemName, key: p.key })),
                        reason: group[0].reason,
                    },
                    dedupeKey: keyOf(engagementId, recipientId, kind, userId, group.map((p) => p.key)),
                })
            }
        }
        await createEventNotifications(rows)
        return rows.length
    } catch (e) {
        logger.error('Could not tell the Leads that storage access was not changed', e as Error, undefined, { engagementId })
        return 0
    }
}

/** "General", "General and Confidential", "General, Confidential and Staging". */
export function listWords(items: string[]): string {
    if (items.length <= 1) return items[0] ?? ''
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The warning a server action answers when it did its part in Firma but storage still gives access:
 * "Removed in Firma, but Google Drive still gives them access to General and Budget.xlsx · {reason}".
 * Null when nothing still stands.
 */
export function accessStillStanding(opts: {
    done: string
    provider: string
    folders?: string[]
    files?: string[]
    reason?: string
}): string | null {
    const folders = Array.from(new Set(opts.folders ?? []))
    const files = Array.from(new Set(opts.files ?? []))
    if (folders.length === 0 && files.length === 0) return null
    const parts: string[] = []
    if (folders.length > 0) parts.push(listWords(folders))
    if (files.length === 1) parts.push(files[0])
    else if (files.length > 1) {
        const shown = files.slice(0, 3)
        parts.push(`${files.length} files (${files.length > 3 ? `${shown.join(', ')} and ${files.length - 3} more` : listWords(shown)})`)
    }
    const reason = opts.reason ? ` · ${opts.reason}` : ''
    const provider = opts.provider === 'Storage' ? 'storage' : opts.provider
    return `${opts.done}, but ${provider} still gives them access to ${parts.join(' and ')}${reason}`
}

/**
 * The warning a delete answers when storage still gives access to what was deleted: "Engagement
 * deleted. Google Drive still gives ana@client.com access to its folders and shares Budget.xlsx · {why}".
 * Null when nothing still stands.
 */
export function accessLeftAfterDelete(opts: {
    done: string
    provider: string
    left: { files: string[]; folderAccess: string[]; foldersUnchecked: boolean; reason?: string }
}): string | null {
    const { done, provider, left } = opts
    const clauses: string[] = []
    if (left.folderAccess.length > 0) {
        const who = left.folderAccess.length > 3 ? `${left.folderAccess.length} people` : listWords(left.folderAccess)
        clauses.push(`gives ${who} access to its folders`)
    }
    if (left.files.length === 1) clauses.push(`shares ${left.files[0]}`)
    else if (left.files.length > 1) clauses.push(`shares ${left.files.length} of its files`)
    const reason = left.reason ? ` · ${/[.!?]$/.test(left.reason) ? left.reason : `${left.reason}.`}` : '.'
    const open = provider === 'Storage' ? '' : ` Open ${provider} to remove that access.`
    if (clauses.length > 0) {
        return `${done}. ${provider} still ${clauses.join(' and ')}${reason}${open}`
    }
    if (left.foldersUnchecked) {
        return `${done}. ${provider} couldn't be checked for who still has access to its folders${reason}${open}`
    }
    return null
}
