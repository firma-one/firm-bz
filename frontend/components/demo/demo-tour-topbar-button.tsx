'use client'

import { MapPinned } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

/** Static counterpart to the topbar map-icon in app-topbar.tsx. */
export function DemoTourTopbarButton() {
    const { run, restartTour } = useDemoTour()
    return (
        <Hint label={run ? 'Tour in progress' : 'Start the guided tour'} side="bottom">
            <button
                type="button"
                onClick={() => { if (!run) restartTour() }}
                disabled={run}
                className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Start the guided tour"
            >
                <MapPinned className="h-4 w-4" />
            </button>
        </Hint>
    )
}
