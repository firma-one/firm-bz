import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryDraftReview, type SummaryDraftReviewProps } from './summary-draft-review'

const props = (over: Partial<SummaryDraftReviewProps> = {}): SummaryDraftReviewProps => ({
    streaming: false, streamText: '', generatedAt: null, value: '', onChange: vi.fn(), mode: 'preview', onModeChange: vi.fn(),
    unfilledSections: [], busyAction: null, onPublish: vi.fn(), onDismiss: vi.fn(), onCopy: vi.fn(), copied: false,
    note: null, published: null, draftBehind: false, onRewrite: vi.fn(), ...over,
})

describe('SummaryDraftReview · while Brio writes', () => {
    // No Stop (2026-11-19): a draft takes seconds and the server finishes and saves it anyway.
    it('says Brio is writing, with nothing to press', () => {
        render(<SummaryDraftReview {...props({ streaming: true, streamText: '## Summary\nHalf a' })} />)
        expect(screen.getByText(/is writing/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Discard|Publish/ })).toBeNull()
    })

    it('has no Stop once the draft is written', () => {
        render(<SummaryDraftReview {...props({ value: '## Summary\nDone.' })} />)
        expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull()
    })
})
