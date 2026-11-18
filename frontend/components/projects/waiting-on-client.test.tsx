import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { DeliverableProgress } from '@/lib/insights/engagement-insights'
import type { NudgeStatus } from '@/lib/ai/nudge-draft'

/**
 * Waiting on Reviewers after a nudge: the row says who was nudged and when, from the moment it is
 * sent, offers another only after a few days without a response, and none once they respond.
 */

const h = vi.hoisted(() => ({
    statuses: [] as NudgeStatus[],
    toast: vi.fn(),
}))

vi.mock('@/lib/actions/status-update', () => ({
    getNudgeRecipients: async () => ({ ok: true, data: [{ userId: 'dana', name: 'Dana Whitfield', role: 'Reviewer' }] }),
    getNudgeStatuses: async () => ({ ok: true, data: h.statuses }),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: h.toast }) }))
// The composer is tested on its own (components/brio/draft-composer.test.tsx): here, Send only.
vi.mock('@/components/brio/draft-composer', () => ({
    DraftComposer: ({ onSend, onSent, onOpenChange }: {
        onSend: (text: string, ids: string[]) => Promise<{ ok: boolean }>
        onSent?: () => void
        onOpenChange: (open: boolean) => void
    }) => (
        <button type="button" onClick={async () => { const r = await onSend('Hi Dana', ['dana']); if (r.ok) { onSent?.(); onOpenChange(false) } }}>
            Send nudge
        </button>
    ),
}))

import { WaitingOnClient } from './waiting-on-client'

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const deliverables: DeliverableProgress[] = [{
    id: 'd1', docId: 'QSR-9', name: 'Market Report', stage: 'in_review', dueDate: null, isOverdue: false,
    createdAt: null, finalizedAt: null, stageSince: ago(16),
}]
const status = (over: Partial<NudgeStatus>): NudgeStatus => ({
    deliverableId: 'd1', nudgedAt: ago(0), recipientId: 'dana', recipientName: 'Dana Whitfield', repliedAt: null, doneAt: null, ...over,
})

beforeEach(() => {
    h.statuses = []
    h.toast.mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
})

describe('WaitingOnClient', () => {
    it('says the nudge went out the moment it is sent, with nothing more to press', async () => {
        render(<WaitingOnClient projectId="e1" deliverables={deliverables} engagementBase="/d/g/f/c/e" />)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Nudge$/ })) })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send nudge' })) })
        expect(screen.getByText('Nudged Dana today')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^Nudge( again)?$/ })).toBeNull()
        expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nudge sent' }))
    })

    it('remembers a nudge sent before, and offers another once a few days pass without a response', async () => {
        h.statuses = [status({ nudgedAt: ago(1) })]
        const { unmount } = render(<WaitingOnClient projectId="e1" deliverables={deliverables} engagementBase="/d/g/f/c/e" />)
        expect(await screen.findByText('Nudged Dana yesterday')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /nudge/i })).toBeNull()
        unmount()

        h.statuses = [status({ nudgedAt: ago(4) })]
        render(<WaitingOnClient projectId="e1" deliverables={deliverables} engagementBase="/d/g/f/c/e" />)
        expect(await screen.findByText('Nudged Dana 4 days ago')).toBeTruthy()
        expect(screen.getByRole('button', { name: /Nudge again/ })).toBeTruthy()
    })

    it('stops nudging once they reply or tick it off, and links a reply to the discussion', async () => {
        h.statuses = [status({ nudgedAt: ago(6), repliedAt: ago(0) })]
        const { unmount } = render(<WaitingOnClient projectId="e1" deliverables={deliverables} engagementBase="/d/g/f/c/e" />)
        const reply = await screen.findByRole('link', { name: 'Dana replied today' })
        expect(reply.getAttribute('href')).toBe('/d/g/f/c/e/comments#doc-comment:d1')
        expect(screen.queryByRole('button', { name: /nudge/i })).toBeNull()
        unmount()

        h.statuses = [status({ nudgedAt: ago(6), doneAt: ago(1) })]
        render(<WaitingOnClient projectId="e1" deliverables={deliverables} engagementBase="/d/g/f/c/e" />)
        await waitFor(() => expect(screen.getByText('Dana marked it done yesterday')).toBeTruthy())
        expect(screen.queryByRole('button', { name: /nudge/i })).toBeNull()
    })
})
