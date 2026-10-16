'use client'

import { MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { Hint } from '@/components/ui/tooltip'

/** Static counterpart to demo-tour-button.tsx — a quiet floating button in the bottom-right corner
 * that replays the tour, hidden while the tour is running. */
export function DemoTourButton() {
    const { restartTour, run } = useDemoTour()

    if (run) return null

    return (
        <div className="fixed bottom-6 right-6 z-[10040]">
            <Hint label="Replay the guided tour" side="left">
                <button
                    type="button"
                    onClick={restartTour}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-popover transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                    aria-label="Replay the guided tour"
                >
                    <MapPinned className="h-5 w-5" />
                </button>
            </Hint>
        </div>
    )
}
