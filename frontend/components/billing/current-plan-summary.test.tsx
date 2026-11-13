import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/billing/open-polar-customer-portal', () => ({ openPolarCustomerPortalSession: vi.fn() }))

import { AiCreditsRow } from './current-plan-summary'
import type { BillingPlanUsage } from './polar-plans-picker'
import { emptyFeatureCounts, type AiFeature } from '@/lib/ai/features'

function usage(byFeature: Partial<Record<AiFeature, number>>): BillingPlanUsage {
    const full = { ...emptyFeatureCounts(), ...byFeature }
    return {
        firms: null, clients: null, engagements: null, documents: null, clientContacts: null,
        aiCredits: {
            used: Object.values(full).reduce((a, b) => a + b, 0),
            byFeature: full,
            periodStartIso: '2026-10-01T00:00:00Z',
            allowance: 25,
            enforced: true,
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
})
