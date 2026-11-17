import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { tourSteps } from '@/components/demo/demo-tour-steps'

/**
 * The tour's start panel when a run was left partway (Deepak, 2026-11-17): Resume is the main button,
 * so the obvious press keeps the place; Start over plays the whole tour afresh.
 */

const h = vi.hoisted(() => ({
    resumable: null as { scope: null; step: number } | null,
    startTour: vi.fn(),
    resumeTour: vi.fn(),
}))

vi.mock('@/lib/demo/demo-tour-context', () => ({
    useDemoTour: () => ({
        mode: 'autoplay', setMode: vi.fn(), narration: true, setNarration: vi.fn(),
        showIntroModal: true, closeIntroModal: vi.fn(), startTour: h.startTour, resumeTour: h.resumeTour, resumable: h.resumable,
        completedNodes: [], startNode: vi.fn(), paused: false, setPaused: vi.fn(),
        active: false, run: [], scope: null, stepIndex: 0, showOutroModal: false, finishedNode: null,
        jumpToStep: vi.fn(), endTour: vi.fn(), closeNodeEnd: vi.fn(), restartTour: vi.fn(), replayTour: vi.fn(), saveProgress: vi.fn(),
    }),
}))

import { DemoTourPanel } from './demo-tour-panel'

/** The whole tour's first step on the engagement's Audit section. */
const AUDIT_STEP = tourSteps(null).findIndex((s) => s.node === 'engagement-audit')

beforeEach(() => {
    h.startTour.mockClear()
    h.resumeTour.mockClear()
})

describe('the tour start panel', () => {
    it('leads with Resume when a run was left partway, with Start over beside it', () => {
        h.resumable = { scope: null, step: AUDIT_STEP }
        render(<DemoTourPanel />)
        expect(screen.getByTestId('tour-stopped-at').textContent).toMatch(/You stopped at .*Audit/)
        expect(screen.queryByRole('button', { name: /Play the whole tour/ })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
        expect(h.resumeTour).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
        expect(h.startTour).toHaveBeenCalledTimes(1)
    })

    it('offers the whole tour when nothing was left partway', () => {
        h.resumable = null
        render(<DemoTourPanel />)
        expect(screen.queryByTestId('tour-stopped-at')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Play the whole tour/ }))
        expect(h.startTour).toHaveBeenCalledTimes(1)
    })
})
