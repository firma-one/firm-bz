/**
 * A user's reminders are one JSON array, so every write is a read-modify-write. The intake route
 * used to append with a raw read-then-upsert outside withReminderLock; two overlapping writes for
 * the same lead each read the old array and the second one dropped the first's reminder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderItem } from '@/lib/actions/user-reminders'

const store = new Map<string, ReminderItem[]>()
const isAgent = vi.fn()
const tick = () => new Promise((r) => setTimeout(r, 5))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPersonalization: {
      // Both sides yield, so unserialised callers interleave the way concurrent requests do.
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const reminders = store.get(where.userId)
        await tick()
        return reminders ? { reminders: [...reminders] } : null
      },
      upsert: async ({ where, update }: { where: { userId: string }; update: { reminders: ReminderItem[] } }) => {
        await tick()
        store.set(where.userId, update.reminders)
      },
    },
  },
}))

vi.mock('@/lib/ai/agent-email', () => ({ isAgentUserIdAsync: (id: string) => isAgent(id) }))

function item(id: string): ReminderItem {
  return {
    id,
    entityKey: 'platform.engagements.shares',
    entityValue: 'eng-1',
    action: `Review: "${id}"`,
    dateKey: 'date',
    dateValue: '2026-10-15',
    hiddenAt: null,
    createdAt: '2026-10-15T00:00:00Z',
  }
}

describe('appendReminderItem', () => {
  beforeEach(() => {
    store.clear()
    isAgent.mockResolvedValue(false)
  })

  it('keeps every reminder when appends for one user overlap', async () => {
    const { appendReminderItem } = await import('./reminder-store')
    store.set('lead-1', [item('existing')])
    await Promise.all([
      appendReminderItem('lead-1', item('intake-a')),
      appendReminderItem('lead-1', item('intake-b')),
      appendReminderItem('lead-1', item('intake-c')),
    ])
    expect(store.get('lead-1')!.map((r) => r.id).sort()).toEqual(['existing', 'intake-a', 'intake-b', 'intake-c'])
  })

  it('serialises with other locked mutations of the same user', async () => {
    const { appendReminderItem, withReminderLock, loadReminderItems, saveReminderItems } = await import('./reminder-store')
    store.set('lead-1', [item('old')])
    await Promise.all([
      withReminderLock('lead-1', async () => {
        const items = await loadReminderItems('lead-1')
        await saveReminderItems('lead-1', items.map((r) => ({ ...r, hiddenAt: '2026-10-15T00:00:00Z' })))
      }),
      appendReminderItem('lead-1', item('new')),
    ])
    const saved = store.get('lead-1')!
    expect(saved.map((r) => r.id)).toEqual(['old', 'new'])
    expect(saved[0].hiddenAt).not.toBeNull()
  })

  it('does not add the same id twice', async () => {
    const { appendReminderItem } = await import('./reminder-store')
    expect(await appendReminderItem('lead-1', item('intake-a'))).toBe(true)
    expect(await appendReminderItem('lead-1', item('intake-a'))).toBe(false)
    expect(store.get('lead-1')).toHaveLength(1)
  })

  it('skips the agent user', async () => {
    isAgent.mockResolvedValue(true)
    const { appendReminderItem } = await import('./reminder-store')
    expect(await appendReminderItem('brio', item('intake-a'))).toBe(false)
    expect(store.has('brio')).toBe(false)
  })
})
