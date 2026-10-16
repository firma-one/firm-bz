import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/billing/open-polar-customer-portal', () => ({ openPolarCustomerPortalSession: vi.fn() }))

import { AiCreditsRow } from './current-plan-summary'
import type { BillingPlanUsage } from './polar-plans-picker'

function usage(byFeature: Partial<Record<'brief' | 'summary' | 'chat' | 'searchInterpret' | 'filesAgent', number>>): BillingPlanUsage {
    const full = { brief: 0, summary: 0, chat: 0, searchInterpret: 0, filesAgent: 0, ...byFeature }
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
    it('leaves Doc Search out now that Ask Brio is hidden', () => {
        render(<AiCreditsRow usage={usage({ brief: 1, chat: 2 })} />)
        expect(screen.getByText('Firm briefs')).toBeTruthy()
        expect(screen.getByText('Engagement assistant chat')).toBeTruthy()
        expect(screen.queryByText('Firm Doc Search')).toBeNull()
    })

    it('still lists Doc Search when this period already spent credits on it, so the rows add up', () => {
        render(<AiCreditsRow usage={usage({ brief: 1, searchInterpret: 0.5 })} />)
        expect(screen.getByText('Firm Doc Search')).toBeTruthy()
    })
})
