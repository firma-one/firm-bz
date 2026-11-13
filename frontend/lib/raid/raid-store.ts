import 'server-only'
import type { User } from '@supabase/supabase-js'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { userFacing } from '@/lib/actions/action-result'
import { loadPeople, type Person } from '@/lib/files/file-creator'
import { formatDisplayName } from '@/lib/comments/mentions'
import { resolveNames } from '@/lib/auth/display-name'
import { parseMemoSettings } from '@/lib/memos/memo-shared'
import {
    RAID_NOTES_MAX,
    RAID_TITLE_MAX,
    RAID_TYPES,
    autoLineFor,
    isAutoSource,
    liveStatusFor,
    overviewSectionOf,
    parseSignalKey,
    shortDay,
    type RaidItemView,
    type RaidMember,
    type RaidSourceKind,
    type RaidSourceView,
    type RaidStatus,
    type RaidType,
} from './raid-shared'

/**
 * The RAID log in the database (.claude/plans/brio-features-round-2.md, §9): reading it for the tab
 * and the card, with each source named the way its chip shows it, and the writes a person makes.
 *
 * Every call is scoped to one engagement; the route has already checked the caller is a Lead or a
 * Contributor · Full Access (lib/raid/raid-access.ts). No memo text is read or written here: a memo
 * source is named by its title and date, which its row holds.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** Who can own an entry: the firm's own people on the engagement. */
export const RAID_OWNER_ROLES = ['eng_admin', 'eng_member'] as const

export const RAID_NOT_FOUND = 'This entry was not found in this engagement. Refresh the log and try again.'

/** One source merged into an entry when a suggestion was accepted onto it. */
export interface RaidExtraSource {
    kind: 'THREAD' | 'MEMO'
    ref: string
    /** THREAD only. */
    quote?: string
    internal: boolean
    /** ISO, when it was merged. */
    at: string
}

export function extraSourcesOf(value: unknown): RaidExtraSource[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((v) => {
        const s = (v ?? {}) as Record<string, unknown>
        if ((s.kind !== 'THREAD' && s.kind !== 'MEMO') || typeof s.ref !== 'string') return []
        return [{
            kind: s.kind,
            ref: s.ref,
            // Never a memo's words, whatever a row holds.
            ...(s.kind === 'THREAD' && typeof s.quote === 'string' ? { quote: s.quote } : {}),
            internal: s.internal === true,
            at: typeof s.at === 'string' ? s.at : '',
        }]
    })
}

/** The person acting, for "Closed by Alex" and createdBy. */
export interface RaidActor {
    userId: string
    firstName: string
}

export function raidActor(user: Pick<User, 'id' | 'email' | 'user_metadata'>): RaidActor {
    const names = resolveNames(user.user_metadata as Record<string, unknown> | undefined, user.email)
    const name = names.firstName || names.displayName.split(' ')[0] || user.email?.split('@')[0] || 'Someone'
    return { userId: user.id, firstName: name }
}

const firstNameOf = (p: Person | undefined) => (p ? formatDisplayName(p.name, p.email).split(/\s+/)[0] || null : null)
const fullNameOf = (p: Person | undefined) => (p ? formatDisplayName(p.name, p.email) : null)

// ── Reading ───────────────────────────────────────────────────────────────────────────────────

const ITEM_SELECT = {
    id: true,
    type: true,
    title: true,
    notes: true,
    ownerUserId: true,
    status: true,
    sourceKind: true,
    sourceRef: true,
    signalKey: true,
    internalSource: true,
    quote: true,
    extraSources: true,
    attachedToId: true,
    raisedAt: true,
    closedAt: true,
    closedReason: true,
    closedBy: true,
    createdBy: true,
} as const

type ItemRow = Prisma.EngagementRaidItemGetPayload<{ select: typeof ITEM_SELECT }>

/** The Leads and Contributors · Full Access on the engagement, named, for the owner picker. */
export async function raidMembers(engagementId: string): Promise<RaidMember[]> {
    const members = await prisma.engagementMember.findMany({
        where: { engagementId, role: { in: [...RAID_OWNER_ROLES] } },
        select: { userId: true },
    })
    const people = await loadPeople(members.map((m) => m.userId))
    return members
        .map((m) => ({ userId: m.userId, name: fullNameOf(people.get(m.userId)) ?? '' }))
        .filter((m) => m.name)
        .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The log as the tab and the card show it: entries (open, recorded, closed) and Brio's suggestions,
 * each with its sources named. Dismissed suggestions stay in the table for dedupe and are never listed.
 */
export async function loadRaidLog(engagementId: string): Promise<{ items: RaidItemView[]; suggestions: RaidItemView[]; members: RaidMember[] }> {
    const rows = await prisma.engagementRaidItem.findMany({
        where: { engagementId, status: { not: 'DISMISSED' } },
        select: ITEM_SELECT,
        orderBy: { raisedAt: 'desc' },
    })

    // What the chips need: the messages and memos cited, and the documents they and the signals name.
    const messageIds = new Set<string>()
    const memoIds = new Set<string>()
    const documentIds = new Set<string>()
    for (const r of rows) {
        for (const s of [{ kind: r.sourceKind as string, ref: r.sourceRef }, ...extraSourcesOf(r.extraSources)]) {
            if (s.kind === 'THREAD' && isUuid(s.ref)) messageIds.add(s.ref)
            if (s.kind === 'MEMO' && isUuid(s.ref)) memoIds.add(s.ref)
        }
        const signal = parseSignalKey(r.signalKey)
        if (signal?.documentId && isUuid(signal.documentId)) documentIds.add(signal.documentId)
    }

    const [messages, memoRows, members] = await Promise.all([
        messageIds.size > 0
            ? prisma.docCommentMessage.findMany({
                where: { engagementId, id: { in: Array.from(messageIds) } },
                select: { id: true, projectDocumentId: true, authorUserId: true, createdAt: true, isInternal: true },
            })
            : Promise.resolve([]),
        memoIds.size > 0
            ? prisma.engagementDocument.findMany({ where: { engagementId, id: { in: Array.from(memoIds) } }, select: { id: true, settings: true } })
            : Promise.resolve([]),
        raidMembers(engagementId),
    ])
    for (const m of messages) documentIds.add(m.projectDocumentId)

    const docs = documentIds.size > 0
        ? await prisma.engagementDocument.findMany({
            where: { engagementId, id: { in: Array.from(documentIds) } },
            select: { id: true, docId: true, fileName: true, parentId: true },
        })
        : []
    const parentIds = Array.from(new Set(docs.filter((d) => !d.docId && d.parentId).map((d) => d.parentId!)))
    const parents = parentIds.length > 0
        ? await prisma.engagementDocument.findMany({ where: { engagementId, isFolder: true, externalId: { in: parentIds } }, select: { externalId: true, docId: true } })
        : []
    const parentRef = new Map(parents.map((p) => [p.externalId, p.docId ?? null]))
    const refOf = new Map(docs.map((d) => [d.id, d.docId ?? (d.parentId ? parentRef.get(d.parentId) ?? null : null)]))

    const people = await loadPeople([
        ...messages.map((m) => m.authorUserId ?? ''),
        ...rows.map((r) => r.ownerUserId ?? ''),
        ...rows.filter((r) => r.sourceKind === 'MANUAL').map((r) => r.createdBy ?? ''),
    ])
    const messageById = new Map(messages.map((m) => [m.id, m]))
    const memoById = new Map(memoRows.map((m) => [m.id, parseMemoSettings(m.settings)]))

    const threadSource = (ref: string | null, quote: string | null, internalFallback: boolean): RaidSourceView => {
        const m = ref ? messageById.get(ref) : undefined
        const parts = ['Thread']
        if (m) {
            const docRef = refOf.get(m.projectDocumentId)
            if (docRef) parts.push(docRef)
            const author = m.authorUserId ? firstNameOf(people.get(m.authorUserId)) : null
            if (author) parts.push(author)
            parts.push(shortDay(m.createdAt))
        }
        return { kind: 'THREAD', label: parts.join(' · '), documentId: m?.projectDocumentId ?? null, memoId: null, quote, internal: m ? m.isInternal : internalFallback }
    }
    const memoSource = (ref: string | null): RaidSourceView => {
        const memo = ref ? memoById.get(ref) : null
        const label = memo ? ['Memo', memo.title, shortDay(`${memo.date}T00:00:00Z`)].filter(Boolean).join(' · ') : 'Memo'
        // A memo's words are never kept: the chip links to the memo instead.
        return { kind: 'MEMO', label, documentId: null, memoId: ref && isUuid(ref) ? ref : null, quote: null, internal: true }
    }

    const sourceOf = (r: ItemRow): RaidSourceView => {
        const kind = r.sourceKind as RaidSourceKind
        if (kind === 'THREAD') return threadSource(r.sourceRef, r.quote, r.internalSource)
        if (kind === 'MEMO') return memoSource(r.sourceRef)
        if (kind === 'MANUAL') {
            const by = r.createdBy ? firstNameOf(people.get(r.createdBy)) : null
            return { kind, label: by ? `Added by ${by}` : 'Added by hand', documentId: null, memoId: null, quote: null, internal: false }
        }
        const signal = parseSignalKey(r.signalKey)
        const documentId = signal?.documentId && isUuid(signal.documentId) ? signal.documentId : null
        if (signal?.kind === 'waiting') {
            const docRef = documentId ? refOf.get(documentId) : null
            return { kind, label: docRef ? `Thread · ${docRef}` : 'Thread', documentId, memoId: null, quote: null, internal: false }
        }
        if (kind === 'HEALTH') {
            return { kind, label: 'Health', documentId: null, memoId: null, quote: null, internal: false, overviewSection: overviewSectionOf(r.signalKey) }
        }
        return { kind, label: 'Board', documentId, memoId: null, quote: null, internal: false }
    }

    const byId = new Map(rows.map((r) => [r.id, r]))
    const view = (r: ItemRow): RaidItemView => {
        const target = r.attachedToId ? byId.get(r.attachedToId) : undefined
        const extras = extraSourcesOf(r.extraSources).map((s) => (s.kind === 'THREAD' ? threadSource(s.ref, s.quote ?? null, s.internal) : memoSource(s.ref)))
        return {
            id: r.id,
            type: r.type as RaidType,
            title: r.title,
            notes: r.notes,
            ownerUserId: r.ownerUserId,
            ownerName: r.ownerUserId ? fullNameOf(people.get(r.ownerUserId)) : null,
            status: r.status as RaidStatus,
            sourceKind: r.sourceKind as RaidSourceKind,
            sources: [sourceOf(r), ...extras],
            internalSource: r.internalSource,
            autoLine: isAutoSource(r.sourceKind as RaidSourceKind) ? autoLineFor(r.signalKey) : null,
            overdue: parseSignalKey(r.signalKey)?.kind === 'overdue',
            attachedTo: target && target.status !== 'SUGGESTED' ? { id: target.id, type: target.type as RaidType, title: target.title } : null,
            raisedAt: r.raisedAt.toISOString(),
            closedAt: r.closedAt ? r.closedAt.toISOString() : null,
            closedReason: r.closedReason,
            canReopen: r.status === 'CLOSED' && (!isAutoSource(r.sourceKind as RaidSourceKind) || !!r.closedBy),
        }
    }

    return {
        items: rows.filter((r) => r.status !== 'SUGGESTED').map(view),
        suggestions: rows.filter((r) => r.status === 'SUGGESTED').map(view).sort((a, b) => a.raisedAt.localeCompare(b.raisedAt)),
        members,
    }
}

/** How many entries are live (open, or a recorded decision): the number on the Discussions switch. */
export async function raidOpenCountFor(engagementId: string): Promise<number> {
    return prisma.engagementRaidItem.count({ where: { engagementId, status: { in: ['OPEN', 'RECORDED'] } } })
}

/** When Brio last read this engagement's conversation (engagement.settings.raid.lastCheckedAt). */
export function lastCheckedAtOf(settings: unknown): string | null {
    const raw = ((settings ?? {}) as { raid?: { lastCheckedAt?: unknown } }).raid?.lastCheckedAt
    if (typeof raw !== 'string') return null
    return Number.isNaN(new Date(raw).getTime()) ? null : raw
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

function cleanTitle(raw: unknown): string {
    const title = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    if (!title) throw userFacing('Give the entry a title.', 'invalid')
    if (title.length > RAID_TITLE_MAX) throw userFacing(`Keep the title under ${RAID_TITLE_MAX} characters.`, 'invalid')
    return title
}

function cleanNotes(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null
    if (typeof raw !== 'string') throw userFacing('The mitigation must be text.', 'invalid')
    const notes = raw.trim()
    if (notes.length > RAID_NOTES_MAX) throw userFacing(`Keep the mitigation under ${RAID_NOTES_MAX.toLocaleString('en-US')} characters.`, 'invalid')
    return notes || null
}

/** An owner must be a Lead or a Contributor · Full Access on this engagement; null clears it. */
async function checkedOwner(engagementId: string, raw: unknown): Promise<string | null> {
    if (raw === null || raw === '') return null
    if (!isUuid(raw)) throw userFacing('Choose an owner from the list.', 'invalid')
    const member = await prisma.engagementMember.findFirst({
        where: { engagementId, userId: raw, role: { in: [...RAID_OWNER_ROLES] } },
        select: { userId: true },
    })
    if (!member) throw userFacing('An owner must be a Lead or a Contributor · Full Access on this engagement.', 'invalid')
    return raw
}

function checkedType(raw: unknown): RaidType {
    if (typeof raw === 'string' && (RAID_TYPES as readonly string[]).includes(raw)) return raw as RaidType
    throw userFacing('Choose Risk, Assumption, Issue or Decision.', 'invalid')
}

async function findItem(engagementId: string, itemId: unknown) {
    if (!isUuid(itemId)) throw userFacing(RAID_NOT_FOUND, 'not_found')
    const row = await prisma.engagementRaidItem.findFirst({ where: { id: itemId, engagementId } })
    if (!row) throw userFacing(RAID_NOT_FOUND, 'not_found')
    return row
}

/** A person's entry: Open, or Recorded for a decision. */
export async function addRaidItem(params: {
    engagementId: string
    firmId: string
    actor: RaidActor
    type: unknown
    title: unknown
    notes?: unknown
    ownerUserId?: unknown
}): Promise<{ id: string }> {
    const type = checkedType(params.type)
    const title = cleanTitle(params.title)
    const notes = cleanNotes(params.notes)
    const ownerUserId = params.ownerUserId === undefined ? null : await checkedOwner(params.engagementId, params.ownerUserId)
    const row = await prisma.engagementRaidItem.create({
        data: {
            firmId: params.firmId,
            engagementId: params.engagementId,
            type,
            title,
            notes,
            ownerUserId,
            status: liveStatusFor(type),
            sourceKind: 'MANUAL',
            internalSource: false,
            raisedAt: new Date(),
            createdBy: params.actor.userId,
            updatedBy: params.actor.userId,
        },
        select: { id: true },
    })
    return row
}

/**
 * Accepts Brio's suggestion. On its own it joins the log as Open (Recorded for a decision). One that
 * adds to an entry merges into that entry's sources instead, and the suggestion row goes. If that entry
 * has since gone, the suggestion joins the log on its own.
 */
export async function acceptRaidSuggestion(engagementId: string, actor: RaidActor, itemId: unknown): Promise<{ id: string; mergedInto: string | null }> {
    const item = await findItem(engagementId, itemId)
    if (item.status !== 'SUGGESTED') throw userFacing('This suggestion was already accepted or dismissed. Refresh the log.', 'conflict')

    const target = item.attachedToId
        ? await prisma.engagementRaidItem.findFirst({ where: { id: item.attachedToId, engagementId, status: { in: ['OPEN', 'RECORDED', 'CLOSED'] } } })
        : null
    if (target && (item.sourceKind === 'THREAD' || item.sourceKind === 'MEMO') && item.sourceRef) {
        const merged: RaidExtraSource = {
            kind: item.sourceKind,
            ref: item.sourceRef,
            // A memo's words are never stored, here or anywhere.
            ...(item.sourceKind === 'THREAD' && item.quote ? { quote: item.quote } : {}),
            internal: item.internalSource,
            at: new Date().toISOString(),
        }
        await prisma.$transaction([
            prisma.engagementRaidItem.update({
                where: { id: target.id },
                data: {
                    extraSources: [...extraSourcesOf(target.extraSources), merged] as unknown as Prisma.InputJsonValue,
                    internalSource: target.internalSource || item.internalSource,
                    updatedBy: actor.userId,
                },
            }),
            prisma.engagementRaidItem.delete({ where: { id: item.id } }),
        ])
        return { id: target.id, mergedInto: target.id }
    }

    await prisma.engagementRaidItem.update({
        where: { id: item.id },
        data: { status: liveStatusFor(item.type as RaidType), attachedToId: null, updatedBy: actor.userId },
    })
    return { id: item.id, mergedInto: null }
}

/** Dismisses Brio's suggestion. Kept, hidden, so the same source isn't suggested again. */
export async function dismissRaidSuggestion(engagementId: string, actor: RaidActor, itemId: unknown): Promise<void> {
    const item = await findItem(engagementId, itemId)
    if (item.status !== 'SUGGESTED') throw userFacing('This suggestion was already accepted or dismissed. Refresh the log.', 'conflict')
    await prisma.engagementRaidItem.update({ where: { id: item.id }, data: { status: 'DISMISSED', updatedBy: actor.userId } })
}

/**
 * A person's edit to an entry in the log: its owner, its mitigation or next step, and the title of an
 * entry a person or Brio wrote. The sync's entries take their titles from the engagement's data.
 */
export async function editRaidItem(engagementId: string, actor: RaidActor, itemId: unknown, patch: { title?: unknown; notes?: unknown; ownerUserId?: unknown }): Promise<void> {
    const item = await findItem(engagementId, itemId)
    if (item.status === 'SUGGESTED' || item.status === 'DISMISSED') throw userFacing('Accept the suggestion first, then edit it.', 'conflict')

    const data: Prisma.EngagementRaidItemUpdateInput = { updatedBy: actor.userId }
    if (patch.title !== undefined) {
        if (isAutoSource(item.sourceKind as RaidSourceKind)) {
            throw userFacing("This entry's title follows the engagement's own data, so it can't be renamed.", 'invalid')
        }
        data.title = cleanTitle(patch.title)
    }
    if (patch.notes !== undefined) data.notes = cleanNotes(patch.notes)
    if (patch.ownerUserId !== undefined) data.ownerUserId = await checkedOwner(engagementId, patch.ownerUserId)
    await prisma.engagementRaidItem.update({ where: { id: item.id }, data })
}

/** Closes an entry. A person's close is final while its signal lasts: the sync won't reopen it. */
export async function closeRaidItem(engagementId: string, actor: RaidActor, itemId: unknown, now: Date = new Date()): Promise<void> {
    const item = await findItem(engagementId, itemId)
    if (item.status !== 'OPEN' && item.status !== 'RECORDED') throw userFacing('Only an open entry or a recorded decision can be closed.', 'conflict')
    await prisma.engagementRaidItem.update({
        where: { id: item.id },
        data: { status: 'CLOSED', closedAt: now, closedBy: actor.userId, closedReason: `Closed by ${actor.firstName} · ${shortDay(now)}`, updatedBy: actor.userId },
    })
}

/**
 * Reopens a closed entry. One the sync closed reopens by itself when its signal comes back, so a
 * person can't reopen it by hand: the next sync would only close it again.
 */
export async function reopenRaidItem(engagementId: string, actor: RaidActor, itemId: unknown): Promise<void> {
    const item = await findItem(engagementId, itemId)
    if (item.status !== 'CLOSED') throw userFacing('Only a closed entry can be reopened.', 'conflict')
    if (isAutoSource(item.sourceKind as RaidSourceKind) && !item.closedBy) {
        throw userFacing('This entry closed itself when the engagement changed. It opens again on its own if that changes back.', 'conflict')
    }
    await prisma.engagementRaidItem.update({
        where: { id: item.id },
        data: { status: liveStatusFor(item.type as RaidType), closedAt: null, closedBy: null, closedReason: null, updatedBy: actor.userId },
    })
}
