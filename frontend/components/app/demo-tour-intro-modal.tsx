"use client"

import { useDemoTour, markDemoTourSeen } from "@/lib/demo-tour-context"
import { Clock3, FastForward, MapPinned, Play, Square } from "lucide-react"

export function DemoTourIntroModal() {
  const { showIntroModal, closeIntroModal, startTour, resumeTour, resumableTourProgress } = useDemoTour()

  if (!showIntroModal) return null

  const hasProgress = resumableTourProgress !== null && resumableTourProgress.stepIndex > 0

  function handleSkip() {
    markDemoTourSeen()
    closeIntroModal()
  }

  function handleResume() {
    if (resumableTourProgress) resumeTour(resumableTourProgress.stepIndex)
  }

  return (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleSkip} />

      <div className="relative bg-white rounded-[2px] shadow-2xl border border-[#e5e7eb] w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-primary/8 border-b border-[#e5e7eb] px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-[2px] bg-primary flex items-center justify-center shrink-0">
            <MapPinned className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Welcome to the Demo Firm</p>
            <p className="text-xs text-[#45474c] mt-0.5">This is a demo firm with sample data</p>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
            <Clock3 className="h-3 w-3" /> ~3 min
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {hasProgress ? (
            <p className="text-xs text-[#45474c] leading-relaxed">
              You were in the middle of the tour. Would you like to <strong className="text-[#1b1b1d]">pick up where you left off</strong> or start from the beginning?
            </p>
          ) : (
            <>
              <p className="text-xs text-[#45474c] leading-relaxed">
                Take a <strong className="text-[#1b1b1d]">guided tour</strong> to discover how Firma works — from managing clients and engagements to sharing documents and using the command palette.
              </p>
              <ul className="space-y-1.5 text-xs text-[#45474c]">
                <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary shrink-0" />Firm, Clients &amp; Engagements</li>
                <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary shrink-0" />File uploads &amp; document actions</li>
                <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary shrink-0" />Shares, Comments, Audit &amp; Members</li>
                <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary shrink-0" />Reminders, Bookmarks &amp; Profile</li>
              </ul>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-2">
          {hasProgress ? (
            <>
              <button
                type="button"
                onClick={handleResume}
                className="group flex-1 h-9 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all flex items-center justify-center gap-1.5"
              >
                Resume Tour <FastForward className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={startTour}
                className="flex-1 h-9 rounded-[2px] border border-[#e5e7eb] text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] hover:bg-[#f3f4f6] transition-colors"
              >
                Start over
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startTour}
                className="group flex-1 h-9 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all flex items-center justify-center gap-1.5"
              >
                Start Tour <Play className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 h-9 rounded-[2px] border border-[#e5e7eb] text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1.5"
              >
                <Square className="h-3.5 w-3.5" /> Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
