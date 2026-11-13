import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

/**
 * The tour's firm Overview panel: the app's floating Brio panel with the firm as its subject, in
 * demo form. It arrives collapsed, on its own tour anchor; a canned answer types out and links the
 * engagements it names to the tour's pages, opened in place.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { DemoBrioChat, type DemoChatSubject } from './demo-brio-chat'
import { FIRM_CHAT_CAPABILITY } from '@/lib/ai/firm-chat'
import { firmChat, DEMO_FIRM_CHAT_QUESTIONS } from '@/lib/demo/demo-brio'
import type { FirmEngagementRow } from '@/lib/insights/firm-engagement-pace'

const DAY = 86_400_000
const NOW = new Date('2026-11-12T12:00:00Z').getTime()

/** One engagement past its due date, so "Which engagements are slipping?" names it. */
const ROWS: FirmEngagementRow[] = [{
    engagementId: 'e1', name: 'Q4 Growth Strategy', slug: 'q4-growth', clientName: 'Northwind', clientSlug: 'northwind',
    startDate: new Date(NOW - 60 * DAY).toISOString(), dueDate: new Date(NOW - 5 * DAY).toISOString(), lead: null,
    deliverables: { total: 4, toDo: 1, inProgress: 1, inReview: 1, approved: 1, overdue: 2 },
}]

const SUBJECT: DemoChatSubject = { kind: 'firm', hrefFor: (l) => `/tour/${l.clientSlug}/${l.slug}` }

beforeEach(() => {
    vi.useFakeTimers()
    push.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('DemoBrioChat with the firm as its subject', () => {
    it('arrives collapsed on its own tour anchor, then answers with engagement links to the tour', () => {
        render(<DemoBrioChat subject={SUBJECT} turns={firmChat(ROWS, NOW)} />)
        act(() => { vi.advanceTimersByTime(0) })

        const launcher = screen.getByRole('button', { name: 'Open the firm assistant' })
        expect(launcher.textContent).toContain('about the firm')
        // The guided tour's Brio steps point at the engagement pages' launcher, not this one.
        expect(launcher.getAttribute('data-demo-tour')).toBe('firm-chat')
        expect(screen.queryByPlaceholderText('Ask about engagements, clients or deadlines')).toBeNull()

        fireEvent.click(launcher)
        expect(screen.getByPlaceholderText('Ask about engagements, clients or deadlines')).toBeTruthy()
        expect(screen.getAllByText(FIRM_CHAT_CAPABILITY).length).toBeGreaterThan(0)
        expect(screen.getByText('This firm')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: new RegExp(DEMO_FIRM_CHAT_QUESTIONS[0].replace('?', '\\?')) }))
        act(() => { vi.advanceTimersByTime(10_000) })

        const link = screen.getByRole('link', { name: '"Q4 Growth Strategy"' })
        expect(link.getAttribute('href')).toBe('/tour/northwind/q4-growth')
        expect(screen.getByText('Based on 1 engagement')).toBeTruthy()
        fireEvent.click(link)
        expect(push).toHaveBeenCalledWith('/tour/northwind/q4-growth')
    })

    it('stops an answer part-way and keeps what arrived', () => {
        render(<DemoBrioChat subject={SUBJECT} turns={firmChat(ROWS, NOW)} />)
        act(() => { vi.advanceTimersByTime(0) })
        fireEvent.click(screen.getByRole('button', { name: 'Open the firm assistant' }))
        fireEvent.click(screen.getByRole('button', { name: new RegExp(DEMO_FIRM_CHAT_QUESTIONS[0].replace('?', '\\?')) }))
        act(() => { vi.advanceTimersByTime(1_000) })

        fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
        expect(screen.getByText('Stopped · this answer is incomplete.')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Send question' })).toBeTruthy()
    })
})
