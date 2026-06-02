'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { safeInngestSend } from '@/lib/inngest/client'
import { getFirmReminderConfig } from '@/lib/actions/firms'
import { logger } from '@/lib/logger'

// ─── Stored shape ────────────────────────────────────────────────────────────

export type ReminderItem = {
    id: string               // nanoid
    entityKey: string        // "platform.clients.id"
    entityValue: string      // actual entity primary key
    action: string           // "Follow-up"
    dateKey: string | null   // "platform.clients.followUpDate" | null
    dateValue: string | null // ISO date | null
    hiddenAt: string | null  // null = visible
    createdAt: string        // ISO date
    note?: string | null     // optional user note
}

// ─── Context shape returned to UI ────────────────────────────────────────────

export type ReminderWithContext = {
    id: string
    entityKey: string
    entityValue: string
    action: string
    dateKey: string | null
    dateValue: string | null
    hiddenAt: string | null
    note?: string | null     // optional user note
    // resolved
    entityName: string
    entitySlug: string | null
    firmSlug: string | null
    ctaUrl: string | null
    // computed (null when dateValue is null)
    delta: number | null
    label: string
    labelStyle: 'slate' | 'amber' | 'orange' | 'red'
}

// ─── Entity resolver map ─────────────────────────────────────────────────────

type EntityContext = {
    name: string
    slug: string | null
    firmSlug: string | null
    ctaUrl: string | null
}

const ENTITY_RESOLVERS: Record<string, (id: string) => Promise<EntityContext>> = {
    'platform.clients': async (id) => {
        const c = await (prisma as any).client.findUnique({
            where: { id },
            select: { name: true, slug: true, firm: { select: { slug: true } } },
        })
        return {
            name: c?.name ?? '',
            slug: c?.slug ?? null,
            firmSlug: c?.firm?.slug ?? null,
            ctaUrl: c?.firm?.slug && c?.slug ? `/d/f/${c.firm.slug}/c/${c.slug}` : null,
        }
    },
    'platform.engagements': async (id) => {
        const e = await (prisma as any).engagement.findUnique({
            where: { id },
            select: { name: true, slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
        })
        const firmSlug = e?.client?.firm?.slug ?? null
        const clientSlug = e?.client?.slug ?? null
        return {
            name: e?.name ?? '',
            slug: e?.slug ?? null,
            firmSlug,
            ctaUrl: firmSlug && clientSlug && e?.slug ? `/d/f/${firmSlug}/c/${clientSlug}/e/${e.slug}` : null,
        }
    },
    'platform.engagement_invitations': async (id) => {
        const inv = await (prisma as any).engagementInvitation.findUnique({
            where: { id },
            select: { email: true, engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } } },
        })
        const firmSlug = inv?.engagement?.client?.firm?.slug ?? null
        const clientSlug = inv?.engagement?.client?.slug ?? null
        const engSlug = inv?.engagement?.slug ?? null
        return {
            name: inv?.email ?? '',
            slug: null,
            firmSlug,
            ctaUrl: firmSlug && clientSlug && engSlug ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}` : null,
        }
    },
    'platform.connectors': async (id) => {
        const c = await (prisma as any).connector.findUnique({
            where: { id },
            select: { name: true, settings: true },
        })
        const email = (c?.settings as any)?.accountEmail ?? c?.name ?? 'Google Drive'
        return { name: email, slug: null, firmSlug: null, ctaUrl: '/d/onboarding' }
    },
    'platform.firm_invitations': async (id) => {
        const inv = await (prisma as any).firmInvitation.findUnique({
            where: { id },
            select: { email: true, firm: { select: { slug: true } } },
        })
        const firmSlug = inv?.firm?.slug ?? null
        return {
            name: inv?.email ?? 'Invited member',
            slug: null,
            firmSlug,
            ctaUrl: firmSlug ? `/d/f/${firmSlug}/settings` : null,
        }
    },
    'platform.documents': async (id) => {
        const doc = await (prisma as any).engagementDocument.findUnique({
            where: { id },
            select: {
                name: true,
                engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } },
            },
        })
        const firmSlug = doc?.engagement?.client?.firm?.slug ?? null
        const clientSlug = doc?.engagement?.client?.slug ?? null
        const engSlug = doc?.engagement?.slug ?? null
        return {
            name: doc?.name ?? 'Shared document',
            slug: null,
            firmSlug,
            ctaUrl: firmSlug && clientSlug && engSlug
                ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files`
                : null,
        }
    },
    'platform.doc_comments': async (id) => {
        const c = await (prisma as any).docCommentMessage.findUnique({
            where: { id },
            select: {
                content: true,
                projectDocumentId: true,
                engagement: { select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } } },
            },
        })
        const firmSlug = c?.engagement?.client?.firm?.slug ?? null
        const clientSlug = c?.engagement?.client?.slug ?? null
        const engSlug = c?.engagement?.slug ?? null
        const preview = c?.content?.slice(0, 60) ?? 'Comment'
        return {
            name: preview,
            slug: null,
            firmSlug,
            ctaUrl: firmSlug && clientSlug && engSlug
                ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-comment:${c?.projectDocumentId}:${id}`
                : null,
        }
    },
}

// ─── Date field clearer map ──────────────────────────────────────────────────

const DATE_FIELD_CLEARERS: Record<string, (entityValue: string) => Promise<void>> = {
    'platform.clients.followUpDate': async (id) => {
        await (prisma as any).client.update({ where: { id }, data: { followUpDate: null } })
    },
    'platform.clients.expectedCloseDate': async (id) => {
        await (prisma as any).client.update({ where: { id }, data: { expectedCloseDate: null } })
    },
    'platform.engagements.dueDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { dueDate: null } })
    },
    'platform.engagements.kickoffDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { kickoffDate: null } })
    },
    'platform.engagements.followUpDate': async (id) => {
        await (prisma as any).engagement.update({ where: { id }, data: { followUpDate: null } })
    },
    'platform.firm_invitations.expireAt': async (id) => {
        // Invitations are not cleared — just remove the reminder when done
    },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entityTableKey(entityKey: string): string {
    // "platform.clients.id" → "platform.clients"
    return entityKey.split('.').slice(0, 2).join('.')
}

function computeLabel(delta: number): { label: string; labelStyle: ReminderWithContext['labelStyle'] } {
    switch (delta) {
        case 2:  return { label: 'Due in 2 days', labelStyle: 'slate' }
        case 1:  return { label: 'Due tomorrow',  labelStyle: 'slate' }
        case 0:  return { label: 'Due today',     labelStyle: 'amber' }
        case -1: return { label: '1 day overdue', labelStyle: 'orange' }
        case -2: return { label: '2 days overdue', labelStyle: 'red' }
        default: return { label: delta > 0 ? `Due in ${delta} days` : `${Math.abs(delta)} days overdue`, labelStyle: delta > 0 ? 'slate' : 'red' }
    }
}

async function loadItems(userId: string): Promise<ReminderItem[]> {
    const p = await prisma.userPersonalization.findUnique({
        where: { userId },
        select: { reminders: true },
    })
    return Array.isArray(p?.reminders) ? (p!.reminders as ReminderItem[]) : []
}

async function saveItems(userId: string, items: ReminderItem[]): Promise<void> {
    await prisma.userPersonalization.upsert({
        where: { userId },
        create: { userId, reminders: items as any },
        update: { reminders: items as any },
    })
}

// ─── Public server actions ───────────────────────────────────────────────────

export async function getUserReminders(): Promise<ReminderWithContext[]> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return []

    const items = await loadItems(user.id)

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in30Days = new Date(today); in30Days.setDate(today.getDate() + 30); in30Days.setHours(23, 59, 59, 999)

    const validItems = items.filter((item) => item.entityKey && item.entityValue && item.action)

    const inWindow = validItems.filter((item) => {
        if (!item.dateValue) return true // date-less: always show
        const d = new Date(item.dateValue)
        return d <= in30Days // show all overdue + upcoming within 30d
    })

    const resolved = await Promise.all(
        inWindow.map(async (item): Promise<ReminderWithContext | null> => {
            const tableKey = entityTableKey(item.entityKey)
            const resolver = ENTITY_RESOLVERS[tableKey]
            const ctx = resolver
                ? await resolver(item.entityValue).catch(() => null)
                : null
            if (!ctx) return null

            let delta: number | null = null
            let label = ''
            let labelStyle: ReminderWithContext['labelStyle'] = 'slate'

            if (item.dateValue) {
                const d = new Date(item.dateValue); d.setHours(0, 0, 0, 0)
                delta = Math.round((d.getTime() - today.getTime()) / 86400000)
                const computed = computeLabel(delta)
                label = computed.label
                labelStyle = computed.labelStyle
            }

            return {
                id: item.id,
                entityKey: item.entityKey,
                entityValue: item.entityValue,
                action: item.action,
                dateKey: item.dateKey,
                dateValue: item.dateValue,
                hiddenAt: item.hiddenAt,
                note: item.note ?? null,
                entityName: ctx.name,
                entitySlug: ctx.slug,
                firmSlug: ctx.firmSlug,
                ctaUrl: ctx.ctaUrl,
                delta,
                label,
                labelStyle,
            }
        })
    )

    const results = resolved.filter(Boolean) as ReminderWithContext[]
    // Sort: date-based first (ascending), then date-less
    return results.sort((a, b) => {
        if (!a.dateValue && !b.dateValue) return 0
        if (!a.dateValue) return 1
        if (!b.dateValue) return -1
        return new Date(a.dateValue).getTime() - new Date(b.dateValue).getTime()
    })
}

/** Upsert a reminder linked to a DB date field. Called from client.ts when followUpDate changes. */
export async function upsertFollowUpReminder(params: {
    userId: string
    entityKey: string
    entityValue: string
    action: string
    dateKey: string | null
    dateValue: string | null
    entityName: string
    firmId: string
    ctaUrl: string | null
    note?: string | null
}): Promise<void> {
    const items = await loadItems(params.userId)

    const existing = items.find(
        (r) => r.entityKey === params.entityKey &&
               r.entityValue === params.entityValue &&
               r.dateKey === params.dateKey
    )

    if (!params.dateValue && params.dateKey !== null) {
        // Date was cleared — remove the reminder node and cancel Inngest
        if (existing) {
            await safeInngestSend('reminder.email.cancelled', { reminderId: existing.id })
            await safeInngestSend('reminder.recurring.cancelled', { reminderId: existing.id })
            const next = items.filter((r) => r.id !== existing.id)
            await saveItems(params.userId, next)
        }
        return
    }

    if (existing) {
        // Update dateValue (and note if provided)
        const wasScheduled = existing.dateValue !== params.dateValue
        const next = items.map((r) =>
            r.id === existing.id
                ? { ...r, dateValue: params.dateValue, ...(params.note !== undefined && { note: params.note }) }
                : r
        )
        await saveItems(params.userId, next)
        if (wasScheduled) {
            await safeInngestSend('reminder.email.cancelled', { reminderId: existing.id })
            await safeInngestSend('reminder.recurring.cancelled', { reminderId: existing.id })
            await scheduleReminderEmail(existing.id, params)
            await scheduleRecurringReminder(existing.id, params)
        }
    } else {
        // Create new reminder item
        const id = generateId()
        const newItem: ReminderItem = {
            id,
            entityKey: params.entityKey,
            entityValue: params.entityValue,
            action: params.action,
            dateKey: params.dateKey,
            dateValue: params.dateValue,
            hiddenAt: null,
            createdAt: new Date().toISOString(),
            note: params.note ?? null,
        }
        await saveItems(params.userId, [...items, newItem])
        await scheduleReminderEmail(id, params)
        await scheduleRecurringReminder(id, params)
        await sendImmediateReminderEmail(params)
    }
}

async function scheduleReminderEmail(
    reminderId: string,
    params: { entityKey: string; entityValue: string; action: string; dateKey: string | null; dateValue: string | null; entityName: string; firmId: string; ctaUrl: string | null; userId: string }
): Promise<void> {
    if (!params.dateValue) return
    const fireAt = new Date(params.dateValue)
    if (fireAt <= new Date()) return // past dates — don't schedule
    fireAt.setUTCHours(9, 0, 0, 0)

    await safeInngestSend('reminder.email.scheduled', {
        reminderId,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        entityName: params.entityName,
        action: params.action,
        userId: params.userId,
        firmId: params.firmId,
        dateKey: params.dateKey,
        fireAt: fireAt.toISOString(),
        ctaUrl: params.ctaUrl,
    })
}

async function scheduleRecurringReminder(
    reminderId: string,
    params: { entityKey: string; entityValue: string; action: string; dateKey: string | null; dateValue: string | null; entityName: string; firmId: string; ctaUrl: string | null; userId: string }
): Promise<void> {
    const config = await getFirmReminderConfig(params.firmId)
    if (!config.recurring.enabled) return

    const now = new Date()
    let nextFireAt: Date

    if (params.dateValue) {
        const dueDate = new Date(params.dateValue)
        const startDate = new Date(dueDate)
        startDate.setDate(startDate.getDate() - config.recurring.startDaysBeforeDue)
        // Start from max(today, dueDate - startDaysBeforeDue)
        nextFireAt = startDate > now ? startDate : now
        // Don't schedule if already past due date
        if (nextFireAt >= dueDate) return
    } else {
        // Date-less reminder — start recurring from now
        nextFireAt = now
    }

    nextFireAt.setUTCHours(9, 0, 0, 0)
    // If that time is already past today, advance to tomorrow
    if (nextFireAt <= now) {
        nextFireAt.setDate(nextFireAt.getDate() + 1)
    }

    await safeInngestSend('reminder.recurring.scheduled', {
        reminderId,
        userId: params.userId,
        firmId: params.firmId,
        entityName: params.entityName,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        action: params.action,
        ctaUrl: params.ctaUrl,
        dueDate: params.dateValue ?? null,
        frequencyDays: config.recurring.frequencyDays,
        startDaysBeforeDue: config.recurring.startDaysBeforeDue,
        nextFireAt: nextFireAt.toISOString(),
    })
}

async function sendImmediateReminderEmail(
    params: { entityName: string; firmId: string; ctaUrl: string | null; userId: string; action: string }
): Promise<void> {
    const config = await getFirmReminderConfig(params.firmId)
    if (!config.immediateOnCreate) return

    try {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const { sendEmail } = await import('@/lib/email')
        const { renderReminderEmail } = await import('@/lib/email-templates/reminder')
        const admin = createAdminClient()
        const { data } = await admin.auth.admin.getUserById(params.userId)
        const email = data?.user?.email
        if (!email) return

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const ctaUrl = params.ctaUrl ? `${appUrl}${params.ctaUrl}` : null
        const { subject, html } = renderReminderEmail({
            entityName: params.entityName,
            action: params.action,
            ctaUrl,
            ctaLabel: 'View →',
            kind: 'created',
        })
        await sendEmail(email, subject, html)
    } catch (e) {
        logger.error('sendImmediateReminderEmail failed', e as Error, 'Reminders', { userId: params.userId })
    }
}

/** Mark a reminder done: remove the node, clear the dateKey column, cancel Inngest. */
export async function markReminderDone(reminderId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return

    const items = await loadItems(user.id)
    const item = items.find((r) => r.id === reminderId)
    if (!item) return

    // Clear the date column in the DB
    if (item.dateKey && DATE_FIELD_CLEARERS[item.dateKey]) {
        await DATE_FIELD_CLEARERS[item.dateKey](item.entityValue).catch(() => {})
    }

    // Cancel Inngest jobs
    await safeInngestSend('reminder.email.cancelled', { reminderId })
    await safeInngestSend('reminder.recurring.cancelled', { reminderId })

    // Remove node from array
    await saveItems(user.id, items.filter((r) => r.id !== reminderId))
}

/** Hide a reminder from the panel (sets hiddenAt). */
export async function hideReminder(reminderId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return

    const items = await loadItems(user.id)
    const next = items.map((r) =>
        r.id === reminderId ? { ...r, hiddenAt: new Date().toISOString() } : r
    )
    await saveItems(user.id, next)
}

/** Unhide a reminder (clears hiddenAt). */
export async function showReminder(reminderId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return

    const items = await loadItems(user.id)
    const next = items.map((r) =>
        r.id === reminderId ? { ...r, hiddenAt: null } : r
    )
    await saveItems(user.id, next)
}

function generateId(): string {
    // Simple ID: timestamp + random suffix
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Mark multiple reminders done at once. */
export async function markAllRemindersDone(reminderIds: string[]): Promise<void> {
    for (const id of reminderIds) {
        await markReminderDone(id)
    }
}

/** Create a manual (ad-hoc) reminder for the currently logged-in user. Called from client UI. */
export async function createManualReminder(params: {
    entityKey: string
    entityValue: string
    action: string
    dateValue: string | null
    entityName: string
    firmId: string
    ctaUrl: string | null
    note?: string | null
}): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    await upsertFollowUpReminder({
        userId: user.id,
        entityKey: params.entityKey,
        entityValue: params.entityValue,
        action: params.action,
        dateKey: null,
        dateValue: params.dateValue,
        entityName: params.entityName,
        firmId: params.firmId,
        ctaUrl: params.ctaUrl,
        note: params.note,
    })
}
