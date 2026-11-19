import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/billing/open-polar-customer-portal', () => ({ openPolarCustomerPortalSession: vi.fn() }))

import { AiCreditsRow } from './current-plan-summary'
import type { BillingPlanUsage } from './polar-plans-picker'
import { emptyFeatureCounts, type AiFeature } from '@/lib/ai/features'

function usage(byFeature: Partial<Record<AiFeature, number>>, unfinished = { calls: 0, credits: 0 }): BillingPlanUsage {
    const full = { ...emptyFeatureCounts(), ...byFeature }
    return {
        firms: null, clients: null, engagements: null, documents: null, clientContacts: null,
        aiCredits: {
            used: Object.values(full).reduce((a, b) => a + b, 0),
            byFeature: full,
            periodStartIso: '2026-10-01T00:00:00Z',
            allowance: 25,
            enforced: true,
            unfinished,
        },
    }
}

describe('AiCreditsRow', () => {
    it('counts the newer features in the row they belong with, so the rows add up to the total', () => {
        render(<AiCreditsRow usage={usage({ brief: 1, firmChat: 2, summary: 1, statusUpdate: 1, replyDraft: 1, chat: 1, reviewerChat: 3 })} />)
        const bar = screen.getByLabelText(/Briefs and assistant: 3/)
        expect(bar.getAttribute('aria-label')).toMatch(/Engagement summaries and drafts: 3/)
        expect(bar.getAttribute('aria-label')).toMatch(/Engagement assistant chat: 4/)
    })

    it('leaves Doc Search out now that Ask Brio is hidden', () => {
        render(<AiCreditsRow usage={usage({ brief: 1, chat: 2 })} />)
        expect(screen.getByText('Briefs and assistant')).toBeTruthy()
        expect(screen.getByText('Engagement assistant chat')).toBeTruthy()
        expect(screen.queryByText('Firm Doc Search')).toBeNull()
    })

    it('still lists Doc Search when this period already spent credits on it, so the rows add up', () => {
        render(<AiCreditsRow usage={usage({ brief: 1, searchInterpret: 0.5 })} />)
        expect(screen.getByText('Firm Doc Search')).toBeTruthy()
    })

    it('names the unfinished calls and the credits they took, in one quiet line', () => {
        render(<AiCreditsRow usage={usage({ chat: 6, memoMinutes: 3 }, { calls: 3, credits: 4 })} />)
        const line = screen.getByText(/unfinished/)
        expect(line.textContent).toBe('Includes 3 unfinished calls · 4 credits (stopped, cut off or failed)')
        // Neutral text: not a warning color.
        expect(line.className).toContain('text-fg-subtle')
    })

    it('says one call and one credit in the singular', () => {
        render(<AiCreditsRow usage={usage({ chat: 2 }, { calls: 1, credits: 1 })} />)
        expect(screen.getByText(/unfinished/).textContent).toBe('Includes 1 unfinished call · 1 credit (stopped, cut off or failed)')
    })

    it('says nothing about unfinished calls when there were none, or the answer predates them', () => {
        const { unmount } = render(<AiCreditsRow usage={usage({ chat: 2 })} />)
        expect(screen.queryByText(/unfinished/)).toBeNull()
        unmount()
        const old = usage({ chat: 2 })
        delete old.aiCredits!.unfinished
        render(<AiCreditsRow usage={old} />)
        expect(screen.queryByText(/unfinished/)).toBeNull()
    })

    it('shows credits that are not whole calls as credits', () => {
        render(<AiCreditsRow usage={usage({ memoMinutes: 2.5 })} />)
        expect(screen.getByLabelText(/Engagement summaries and drafts: 2\.5/)).toBeTruthy()
        expect(screen.queryByText(/\bcalls?\b/)).toBeNull()
    })
})
