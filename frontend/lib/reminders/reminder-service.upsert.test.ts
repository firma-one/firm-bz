import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Two manual reminders on the same engagement are two reminders. Before `matchAction`, the second
 * overwrote the first's date and note and kept its title, so "Apply 3 selected" on notes into
 * actions left one reminder, and so did adding a second reminder by hand. Reminders tied to a date
 * field still replace each other, as they always have.
 */

const { store } = vi.hoisted(() => ({ store: { items: [] as Array<Record<string, unknown>> } }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/ai/agent-email', () => ({ isAgentUserIdAsync: async () => false }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async () => {}) }))
vi.mock('@/lib/firm-reminder-config', () => ({
    getFirmReminderConfig: async () => ({ immediateOnCreate: false, recurring: { enabled: false }, events: {} }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/reminders/entity-registry', () => ({ resolveEntity: vi.fn() }))
vi.mock('@/lib/reminders/reminder-store', () => ({
    loadReminderItems: async () => store.items,
    saveReminderItems: async (_u: string, next: Array<Record<string, unknown>>) => { store.items = next },
    withReminderLock: async (_u: string, fn: () => Promise<unknown>) => fn(),
}))

import { upsertFollowUpReminder } from './reminder-service'

const base = {
    userId: 'u1', entityKey: 'platform.engagements', entityValue: 'e1', dateKey: null,
    entityName: 'Q4', firmId: 'f1', ctaUrl: null,
}

beforeEach(() => { store.items = [] })

describe('upsertFollowUpReminder', () => {
    it('with matchAction, a second manual reminder on the same engagement is added, not written over', async () => {
        await upsertFollowUpReminder({ ...base, action: 'Call Dana', dateValue: '2026-11-16', matchAction: true })
        await upsertFollowUpReminder({ ...base, action: 'Chase the 1099-B', dateValue: '2026-11-23', matchAction: true })
        expect(store.items.map((r) => [r.action, r.dateValue])).toEqual([
            ['Call Dana', '2026-11-16'],
            ['Chase the 1099-B', '2026-11-23'],
        ])
    })

    it('with matchAction, the same action again still updates it', async () => {
        await upsertFollowUpReminder({ ...base, action: 'Call Dana', dateValue: '2026-11-16', matchAction: true })
        await upsertFollowUpReminder({ ...base, action: 'Call Dana', dateValue: '2026-11-18', matchAction: true })
        expect(store.items.map((r) => r.dateValue)).toEqual(['2026-11-18'])
    })

    it('without it, one reminder per entity and date field, as before', async () => {
        await upsertFollowUpReminder({ ...base, action: 'Review document', dateValue: '2026-11-16' })
        await upsertFollowUpReminder({ ...base, action: 'Review document', dateValue: '2026-11-20' })
        expect(store.items).toHaveLength(1)
    })
})
