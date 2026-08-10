'use client'

import { MapPinned as MapIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

/** Static counterpart to the topbar map-icon in app-topbar.tsx. */
export function DemoTourTopbarButton() {
    const { run, restartTour } = useDemoTour()
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={() => { if (!run) restartTour() }}
                    disabled={run}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Start guided tour"
                >
                    <MapIcon className="h-5 w-5" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{run ? 'Tour in progress' : 'Start guided tour'}</TooltipContent>
        </Tooltip>
    )
}
