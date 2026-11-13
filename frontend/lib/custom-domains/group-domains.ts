import 'server-only'

import { Prisma, type GroupDomain } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { userFacing } from '@/lib/actions/action-result'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { getPlatformBrandDomain } from '@/config/platform-domain'
import {
    checkCustomHost, checkSubdomainLabel, isPlatformHost, kindsForPlan, normalizeHost, lowestPlanFor, LIVE_STATUSES,
    type DomainKind, type DomainStatus, type NameCheck,
} from '@/lib/custom-domains/domain-rules'
import { checkDomainReachable, type ReachabilityResult } from '@/lib/custom-domains/reachability'
import { notifyDomainDecision, notifyDomainRequested, notifyDomainUnreachable } from '@/lib/custom-domains/domain-emails'

/**
 * A Firm Group's custom domain, end to end (.claude/plans/branded-host-email-links.md): a Group admin
 * requests one, a System Admin approves it after setting it up on Vercel, and from then on sign-in and
 * email links use it. Server only, and every function takes an explicit user, so none of this may be
 * exported from a 'use server' module: lib/actions/custom-domains.ts and system-custom-domains.ts read
 * the user from the session and call these.
 */

export type DomainRow = Pick<GroupDomain, 'id' | 'host' | 'kind' | 'status' | 'reachable' | 'lastCheckedAt' | 'lastCheckError' | 'requestedAt' | 'reviewedAt' | 'reviewNote'> & {
    requestedByName: string | null
}

export type GroupDomainState = {
    groupId: string
    groupName: string
    /** The requested or approved domain, if any. */
    live: DomainRow | null
    /** The latest rejection, when nothing is live, so the admin sees why. */
    lastRejected: DomainRow | null
    plan: string | null
    /** What the plan includes, from /pricing. With billing gates off, both are open. */
    allowed: Record<DomainKind, boolean>
    /** "Pro", "Enterprise": the lowest plan that includes each kind, for the upgrade line. */
    lowestPlan: Record<DomainKind, string | null>
}

function enforceBillingGates(): boolean {
    return process.env.ENFORCE_BILLING_GATES === 'true'
}

const ROW_SELECT = {
    id: true, host: true, kind: true, status: true, reachable: true, lastCheckedAt: true, lastCheckError: true,
    requestedAt: true, reviewedAt: true, reviewNote: true, requestedBy: true,
} as const

async function displayNames(userIds: string[]): Promise<Map<string, { name: string | null; email: string | null }>> {
    const ids = Array.from(new Set(userIds)).filter(Boolean)
    const out = new Map<string, { name: string | null; email: string | null }>()
    if (ids.length === 0) return out
    const rows = await prisma.$queryRaw<{ id: string; email: string | null; meta: Record<string, unknown> | null }[]>`
        SELECT id::text AS id, email, raw_user_meta_data AS meta FROM auth.users WHERE id = ANY(${ids}::uuid[])`
    for (const r of rows) {
        const meta = r.meta ?? {}
        const full = [meta.first_name, meta.last_name].filter((x) => typeof x === 'string' && x).join(' ')
        const name = (typeof meta.full_name === 'string' && meta.full_name) || full || (typeof meta.name === 'string' ? meta.name : '') || null
        out.set(r.id, { name, email: r.email })
    }
    return out
}

async function withNames<T extends { requestedBy: string }>(rows: T[]): Promise<(Omit<T, 'requestedBy'> & { requestedByName: string | null })[]> {
    const names = await displayNames(rows.map((r) => r.requestedBy))
    return rows.map(({ requestedBy, ...rest }) => {
        const n = names.get(requestedBy)
        return { ...rest, requestedByName: n?.name ?? n?.email ?? null }
    })
}

// ── Group admin ──────────────────────────────────────────────────────────────────────────────────

/** The Group a firm belongs to. */
export async function groupOfFirm(firmId: string): Promise<{ id: string; name: string; slug: string }> {
    const firm = await prisma.firm.findFirst({
        where: { id: firmId, deletedAt: null },
        select: { group: { select: { id: true, name: true, slug: true } } },
    })
    if (!firm) throw userFacing("This workspace couldn't be found.", 'not_found')
    return firm.group
}

/** Throws unless the user is this Group's admin, the only role that manages its billing and domain. */
export async function assertGroupAdmin(userId: string, groupId: string): Promise<void> {
    const row = await prisma.groupMember.findFirst({ where: { userId, groupId, role: 'GROUP_ADMIN' }, select: { id: true } })
    if (!row) throw userFacing('Only the workspace admin can change its domain.', 'forbidden')
}

export async function isGroupAdmin(userId: string, groupId: string): Promise<boolean> {
    const row = await prisma.groupMember.findFirst({ where: { userId, groupId, role: 'GROUP_ADMIN' }, select: { id: true } })
    return row !== null
}

export async function getGroupDomainState(groupId: string): Promise<GroupDomainState> {
    const [group, sub, live, rejected] = await Promise.all([
        prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } }),
        getActiveSubscriptionForGroup(groupId),
        prisma.groupDomain.findFirst({ where: { groupId, status: { in: LIVE_STATUSES } }, select: ROW_SELECT }),
        prisma.groupDomain.findFirst({ where: { groupId, status: 'REJECTED' }, orderBy: { reviewedAt: 'desc' }, select: ROW_SELECT }),
    ])
    const plan = sub?.plan ?? null
    const kinds = kindsForPlan(plan)
    const gated = enforceBillingGates()
    const [liveRow] = live ? await withNames([live]) : [null]
    const [rejectedRow] = !live && rejected ? await withNames([rejected]) : [null]
    return {
        groupId,
        groupName: group.name,
        live: liveRow,
        lastRejected: rejectedRow,
        plan,
        allowed: { SUBDOMAIN: !gated || kinds.SUBDOMAIN, CUSTOM: !gated || kinds.CUSTOM },
        lowestPlan: { SUBDOMAIN: lowestPlanFor('SUBDOMAIN'), CUSTOM: lowestPlanFor('CUSTOM') },
    }
}

export type Availability = NameCheck

/** Whether a name can be requested by this Group: its shape, then whether another Group holds it. */
export async function checkAvailability(groupId: string, kind: DomainKind, value: string): Promise<Availability> {
    const shape = kind === 'SUBDOMAIN' ? checkSubdomainLabel(value) : checkCustomHost(value)
    if (!shape.ok) return shape
    const holder = await prisma.groupDomain.findFirst({
        where: { host: shape.host, status: { in: LIVE_STATUSES } },
        select: { groupId: true },
    })
    if (holder && holder.groupId !== groupId) return { ok: false, reason: 'format', message: 'Already in use · try another' }
    return shape
}

export async function requestDomain(userId: string, groupId: string, kind: DomainKind, value: string): Promise<DomainRow> {
    await assertGroupAdmin(userId, groupId)
    const state = await getGroupDomainState(groupId)
    if (!state.allowed[kind]) {
        const plan = state.lowestPlan[kind]
        throw userFacing(plan ? `${kind === 'CUSTOM' ? 'Your own domain' : 'A custom subdomain'} is available on ${plan}${kind === 'SUBDOMAIN' ? ' and up' : ''}.` : 'Your plan doesn\'t include a custom domain.', 'plan_limit')
    }
    if (state.live) throw userFacing(`${state.live.host} is already ${state.live.status === 'APPROVED' ? 'live' : 'waiting for approval'}. Cancel or remove it first.`, 'already_live')
    const check = await checkAvailability(groupId, kind, value)
    if (!check.ok) throw userFacing(check.message, check.reason)
    let row
    try {
        row = await prisma.groupDomain.create({
            data: { groupId, host: check.host, kind, status: 'REQUESTED', requestedBy: userId },
            select: ROW_SELECT,
        })
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw userFacing('Already in use · try another', 'taken')
        }
        throw e
    }
    void notifyDomainRequested({ host: row.host, kind, groupName: state.groupName, plan: state.plan }).catch((err) =>
        logger.error('Custom domain request email failed', err as Error, 'CustomDomains', { groupId }))
    const [named] = await withNames([row])
    return named
}

export async function cancelRequest(userId: string, groupId: string): Promise<void> {
    await assertGroupAdmin(userId, groupId)
    const { count } = await prisma.groupDomain.updateMany({ where: { groupId, status: 'REQUESTED' }, data: { status: 'CANCELLED' } })
    if (count === 0) throw userFacing('There is no request waiting.', 'not_found')
}

export async function removeDomain(userId: string, groupId: string): Promise<void> {
    await assertGroupAdmin(userId, groupId)
    const { count } = await prisma.groupDomain.updateMany({ where: { groupId, status: 'APPROVED' }, data: { status: 'REMOVED' } })
    if (count === 0) throw userFacing('There is no live domain to remove.', 'not_found')
    clearDomainCache()
}

// ── System Admin ─────────────────────────────────────────────────────────────────────────────────

export type SystemDomainRow = DomainRow & {
    groupId: string
    groupName: string
    groupSlug: string
    plan: string | null
    requestedByEmail: string | null
}

export type SystemDomainFilter = 'waiting' | 'live' | 'unreachable' | 'all'

export async function listDomainsForSystem(filter: SystemDomainFilter): Promise<{ rows: SystemDomainRow[]; counts: Record<Exclude<SystemDomainFilter, 'all'>, number> }> {
    const where: Prisma.GroupDomainWhereInput =
        filter === 'waiting' ? { status: 'REQUESTED' }
        : filter === 'live' ? { status: 'APPROVED' }
        : filter === 'unreachable' ? { status: 'APPROVED', reachable: false }
        : {}
    const [rows, waiting, live, unreachable] = await Promise.all([
        prisma.groupDomain.findMany({
            where,
            orderBy: { requestedAt: 'desc' },
            take: 200,
            select: { ...ROW_SELECT, groupId: true, group: { select: { name: true, slug: true, subscriptions: { where: { active: true, deletedAt: null }, select: { plan: true }, take: 1 } } } },
        }),
        prisma.groupDomain.count({ where: { status: 'REQUESTED' } }),
        prisma.groupDomain.count({ where: { status: 'APPROVED' } }),
        prisma.groupDomain.count({ where: { status: 'APPROVED', reachable: false } }),
    ])
    const names = await displayNames(rows.map((r) => r.requestedBy))
    return {
        rows: rows.map(({ group, requestedBy, ...r }) => ({
            ...r,
            groupName: group.name,
            groupSlug: group.slug,
            plan: group.subscriptions[0]?.plan ?? null,
            requestedByName: names.get(requestedBy)?.name ?? null,
            requestedByEmail: names.get(requestedBy)?.email ?? null,
        })),
        counts: { waiting, live, unreachable },
    }
}

export async function checkDomainNow(domainId: string): Promise<ReachabilityResult> {
    const row = await prisma.groupDomain.findUniqueOrThrow({ where: { id: domainId }, select: { host: true, status: true } })
    const result = await checkDomainReachable(row.host)
    if (row.status === 'APPROVED') {
        await prisma.groupDomain.update({
            where: { id: domainId },
            data: { reachable: result.ok, lastCheckedAt: new Date(), lastCheckError: result.ok ? null : result.message },
        })
        clearDomainCache()
    }
    return result
}

export async function approveDomain(adminUserId: string, domainId: string, note: string | null): Promise<void> {
    const row = await prisma.groupDomain.findUnique({ where: { id: domainId }, select: { host: true, status: true, groupId: true, requestedBy: true } })
    if (!row || row.status !== 'REQUESTED') throw userFacing('This request is no longer waiting.', 'not_found')
    const check = await checkDomainReachable(row.host)
    if (!check.ok) throw userFacing(`Not reachable yet · ${check.message}`, 'unreachable')
    await prisma.groupDomain.update({
        where: { id: domainId },
        data: { status: 'APPROVED', reviewedBy: adminUserId, reviewedAt: new Date(), reviewNote: note?.trim() || null, reachable: true, lastCheckedAt: new Date(), lastCheckError: null },
    })
    clearDomainCache()
    void notifyDomainDecision({ groupId: row.groupId, requestedBy: row.requestedBy, host: row.host, approved: true, note }).catch((err) =>
        logger.error('Custom domain approval email failed', err as Error, 'CustomDomains', { domainId }))
}

export async function rejectDomain(adminUserId: string, domainId: string, note: string): Promise<void> {
    if (!note.trim()) throw userFacing('Add a note so the workspace admin knows why.', 'note_required')
    const row = await prisma.groupDomain.findUnique({ where: { id: domainId }, select: { host: true, status: true, groupId: true, requestedBy: true } })
    if (!row || row.status !== 'REQUESTED') throw userFacing('This request is no longer waiting.', 'not_found')
    await prisma.groupDomain.update({
        where: { id: domainId },
        data: { status: 'REJECTED', reviewedBy: adminUserId, reviewedAt: new Date(), reviewNote: note.trim() },
    })
    void notifyDomainDecision({ groupId: row.groupId, requestedBy: row.requestedBy, host: row.host, approved: false, note }).catch((err) =>
        logger.error('Custom domain rejection email failed', err as Error, 'CustomDomains', { domainId }))
}

/** A System Admin assigns a domain to a Group directly, approved: how the existing subdomains move over. */
export async function addDomainForGroup(adminUserId: string, groupSlug: string, kind: DomainKind, value: string): Promise<void> {
    const group = await prisma.group.findUnique({ where: { slug: groupSlug.trim().toLowerCase() }, select: { id: true } })
    if (!group) throw userFacing(`No workspace with the slug "${groupSlug}".`, 'not_found')
    const live = await prisma.groupDomain.findFirst({ where: { groupId: group.id, status: { in: LIVE_STATUSES } }, select: { host: true } })
    if (live) throw userFacing(`This workspace already has ${live.host}.`, 'already_live')
    // A System Admin may assign a reserved label (datasentry, say, or app if ever needed), but never one
    // of Firma's own hosts.
    const host = kind === 'SUBDOMAIN' ? `${value.trim().toLowerCase()}.${getPlatformBrandDomain()}` : normalizeHost(value)
    const shape = kind === 'SUBDOMAIN' ? checkSubdomainLabel(value) : checkCustomHost(value)
    if (!shape.ok && shape.reason !== 'reserved') throw userFacing(shape.message, shape.reason)
    if (isPlatformHost(host)) throw userFacing(`${host} is one of Firma's own addresses.`, 'platform')
    const holder = await prisma.groupDomain.findFirst({ where: { host, status: { in: LIVE_STATUSES } }, select: { id: true } })
    if (holder) throw userFacing('Already in use by another workspace.', 'taken')
    const reach = await checkDomainReachable(host)
    if (!reach.ok) throw userFacing(`Not reachable yet · ${reach.message}`, 'unreachable')
    try {
        await prisma.groupDomain.create({
            data: {
                groupId: group.id, host, kind, status: 'APPROVED', requestedBy: adminUserId, reviewedBy: adminUserId,
                reviewedAt: new Date(), reachable: true, lastCheckedAt: new Date(),
            },
        })
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw userFacing('Already in use by another workspace.', 'taken')
        throw e
    }
    clearDomainCache()
}

/** The daily re-check of every approved domain. A domain that stops answering turns off its hand-off and email links. */
export async function recheckApprovedDomains(): Promise<{ checked: number; nowUnreachable: string[]; recovered: string[] }> {
    const rows = await prisma.groupDomain.findMany({ where: { status: 'APPROVED' }, select: { id: true, host: true, reachable: true, groupId: true, requestedBy: true } })
    const nowUnreachable: string[] = []
    const recovered: string[] = []
    for (const row of rows) {
        const result = await checkDomainReachable(row.host)
        await prisma.groupDomain.update({
            where: { id: row.id },
            data: { reachable: result.ok, lastCheckedAt: new Date(), lastCheckError: result.ok ? null : result.message },
        })
        if (row.reachable && !result.ok) {
            nowUnreachable.push(row.host)
            void notifyDomainUnreachable({ groupId: row.groupId, requestedBy: row.requestedBy, host: row.host, reason: result.message }).catch((err) =>
                logger.error('Custom domain unreachable email failed', err as Error, 'CustomDomains', { host: row.host }))
        }
        if (!row.reachable && result.ok) recovered.push(row.host)
    }
    clearDomainCache()
    return { checked: rows.length, nowUnreachable, recovered }
}

// ── Lookups for sign-in and email links ──────────────────────────────────────────────────────────

/** groupId → approved, reachable host (or null). Cached briefly: read on every email and sign-in. */
const cache = new Map<string, { host: string | null; at: number }>()
const TTL_MS = 60_000

export function clearDomainCache(): void {
    cache.clear()
}

/** Whether branded hosts are used at all: production only, so local and preview links never point at production hosts. */
export function brandedHostsEnabled(): boolean {
    return process.env.VERCEL_ENV === 'production' || process.env.CUSTOM_DOMAINS_IN_DEV === 'true'
}

/** A Group's approved, reachable domain, for links and sign-in. Null when it has none (or outside production). */
export async function brandedHostForGroup(groupId: string): Promise<string | null> {
    if (!brandedHostsEnabled()) return null
    const hit = cache.get(groupId)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.host
    try {
        const row = await prisma.groupDomain.findFirst({ where: { groupId, status: 'APPROVED', reachable: true }, select: { host: true } })
        const host = row?.host ?? null
        cache.set(groupId, { host, at: Date.now() })
        return host
    } catch (e) {
        // A link must never fail because of this: fall back to the main host.
        logger.warn('brandedHostForGroup lookup failed', 'CustomDomains', { groupId, error: String(e) })
        return null
    }
}

export async function brandedHostForGroupSlug(groupSlug: string): Promise<{ groupId: string; host: string } | null> {
    if (!brandedHostsEnabled()) return null
    const group = await prisma.group.findUnique({ where: { slug: groupSlug }, select: { id: true } })
    if (!group) return null
    const host = await brandedHostForGroup(group.id)
    return host ? { groupId: group.id, host } : null
}

export type { DomainKind, DomainStatus }
