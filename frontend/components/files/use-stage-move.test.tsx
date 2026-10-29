import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageConfirmDialog, type StageConfirmation } from './use-stage-move'

// The question a stage move asks (shared by Files, the panes and /tour's Files list).

const approve: StageConfirmation = {
    deliverable: { id: 'D', docId: 'QGT-12', name: 'GTM Playbook' },
    from: 'in_review',
    to: 'approved',
    externalCollaborators: 0,
    viewers: 0,
    approves: true,
}
const share: StageConfirmation = { ...approve, from: 'to_do', to: 'in_review', viewers: 1, approves: false }
const noop = vi.fn()

describe('StageConfirmDialog', () => {
    it('asks to approve, naming the deliverable by its Doc ID', () => {
        render(<StageConfirmDialog confirmation={approve} onOpenChange={noop} onCancel={noop} onConfirm={noop} />)
        expect(screen.getByText('Approve the deliverable?')).toBeTruthy()
        expect(screen.getByText('QGT-12 · GTM Playbook moves to Approved')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    })

    it('asks to share, counting who would newly see its documents', () => {
        render(<StageConfirmDialog confirmation={share} onOpenChange={noop} onCancel={noop} onConfirm={noop} />)
        expect(screen.getByText('Share its documents with 1 reviewer?')).toBeTruthy()
        expect(screen.getByText(/1 reviewer already sees the deliverable/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Move and share' })).toBeTruthy()
    })
})
