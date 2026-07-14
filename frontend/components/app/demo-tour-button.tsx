"use client"

import { MapPinned } from "lucide-react"
import { useDemoTour } from "@/lib/demo-tour-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePathname } from "next/navigation"

interface DemoTourButtonProps {
  firmSlug: string
}

export function DemoTourButton({ firmSlug }: DemoTourButtonProps) {
  const { restartTour, run } = useDemoTour()
  const pathname = usePathname()

  // Only show on firm pages, hide while tour is active
  if (run) return null

  return (
    <div className="fixed bottom-6 right-6 z-[10040]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => restartTour(firmSlug)}
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
