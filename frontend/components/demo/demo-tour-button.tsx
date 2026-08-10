'use client'

import { MapPinned } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Static counterpart to demo-tour-button.tsx — floating bottom-right FAB, hidden while the tour is active. */
export function DemoTourButton() {
    const { restartTour, run } = useDemoTour()

    if (run) return null

    return (
        <div className="fixed bottom-6 right-6 z-[10040]">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={restartTour}
                        className="h-11 w-11 rounded-full bg-primary text-white shadow-lg hover:brightness-105 hover:shadow-xl transition-all flex items-center justify-center"
                        aria-label="Restart guided tour"
                    >
                        <MapPinned className="h-5 w-5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}>
                    <p className="font-medium">Guided Tour</p>
                    <p className="text-xs text-slate-400">Restart the demo tour</p>
                </TooltipContent>
            </Tooltip>
        </div>
    )
}
