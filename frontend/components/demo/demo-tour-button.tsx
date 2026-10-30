'use client'

import { MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { Hint } from '@/components/ui/tooltip'

/** A quiet floating button in the bottom-right corner
 * that replays the tour, hidden while the tour panel is open (to start, running, exploring, or ending). */
export function DemoTourButton() {
    const { restartTour, run, active, showIntroModal, showOutroModal, finishedNode } = useDemoTour()

    // The tour panel sits in the same corner.
    if (run || active || showIntroModal || showOutroModal || finishedNode) return null

    return (
        // Hidden while a pane is docked on the right (demoPaneOpen): it would sit on the pane's buttons.
        <div className="fixed bottom-6 right-6 z-[10040] [[data-demo-pane=open]_&]:hidden">
            <Hint label="Replay the product tour" side="left">
                <button
                    type="button"
                    onClick={restartTour}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-popover transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                    aria-label="Replay the product tour"
                >
                    <MapPinned className="h-5 w-5" />
                </button>
            </Hint>
        </div>
    )
}
