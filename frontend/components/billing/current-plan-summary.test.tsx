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
    it('puts every Brio feature in exactly one row, so the rows add up to the total', () => {
        // One credit in each of the 16 features.
        const all = { brief: 1, dayBrief: 1, dayBriefRewrite: 1, chat: 1, firmChat: 1, reviewerChat: 1, searchInterpret: 1,
            summary: 1, statusUpdate: 1, replyDraft: 1, nudgeDraft: 1, memoMinutes: 1, memoRaid: 1, notesProposals: 1, raidCheck: 1, filesAgent: 1 }
        render(<AiCreditsRow usage={usage(all)} />)
        const label = screen.getByLabelText(/Your brief and Firm brief: 3/).getAttribute('aria-label')!
        expect(label).toMatch(/Questions to Brio: 4/)
        expect(label).toMatch(/Summaries, updates and drafts: 4/)
        expect(label).toMatch(/Memos and RAID: 4/)
        expect(label).toMatch(/Files agent: 1/)
        const total = (label.match(/: \d+(?:\.\d+)?/g) ?? []).reduce((n, m) => n + Number(m.slice(2)), 0)
        expect(total).toBe(16)
    })

    it('names memo reads and the RAID check apart from summaries and drafts', () => {
        render(<AiCreditsRow usage={usage({ memoMinutes: 2, memoRaid: 3, summary: 1 })} />)
        const label = screen.getByLabelText(/Memos and RAID: 5/).getAttribute('aria-label')!
        expect(label).toMatch(/Summaries, updates and drafts: 1/)
    })

    it('leaves the Files agent out until it has spent credits (it is not released)', () => {
        render(<AiCreditsRow usage={usage({ dayBrief: 1, chat: 2 })} />)
        expect(screen.getByText('Your brief and Firm brief')).toBeTruthy()
        expect(screen.getByText('Questions to Brio')).toBeTruthy()
        expect(screen.queryByText('Files agent')).toBeNull()
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
        expect(screen.getByLabelText(/Memos and RAID: 2\.5/)).toBeTruthy()
        expect(screen.queryByText(/\bcalls?\b/)).toBeNull()
    })
})
