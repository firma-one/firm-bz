import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SummaryDraftReview, type SummaryDraftReviewProps } from './summary-draft-review'

const props = (over: Partial<SummaryDraftReviewProps> = {}): SummaryDraftReviewProps => ({
    streaming: false, streamText: '', generatedAt: null, value: '', onChange: vi.fn(), mode: 'preview', onModeChange: vi.fn(),
    unfilledSections: [], busyAction: null, onPublish: vi.fn(), onDismiss: vi.fn(), onCopy: vi.fn(), copied: false,
    note: null, published: null, draftBehind: false, onRewrite: vi.fn(), ...over,
})

describe('SummaryDraftReview — Stop', () => {
    it('offers Stop while Brio is writing', () => {
        const onStop = vi.fn()
        render(<SummaryDraftReview {...props({ streaming: true, streamText: '## Summary\nHalf a', onStop })} />)
        fireEvent.click(screen.getByRole('button', { name: /Stop/ }))
        expect(onStop).toHaveBeenCalled()
    })

    it('has no Stop once the draft is written', () => {
        render(<SummaryDraftReview {...props({ value: '## Summary\nDone.', onStop: vi.fn() })} />)
        expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull()
    })
})
