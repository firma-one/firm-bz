"use client"

import { useDemoTour } from "@/lib/demo-tour-context"
import { CheckCircle2, MapPinned, RefreshCw } from "lucide-react"

export function DemoTourOutroModal() {
  const { showOutroModal, closeOutroModal, slugs, restartTour } = useDemoTour()

  if (!showOutroModal) return null

  return (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={closeOutroModal} />

      {/* Modal */}
      <div className="relative bg-white rounded-[2px] shadow-2xl border border-[#e5e7eb] w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-primary/8 border-b border-[#e5e7eb] px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-[2px] bg-primary flex items-center justify-center shrink-0">
            <MapPinned className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">That&apos;s the full tour!</p>
            <p className="text-xs text-[#45474c] mt-0.5">You&apos;ve seen the key features of Firma</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-[#45474c] leading-relaxed">
            Feel free to explore the demo on your own. The sample data is yours to play with — nothing here is permanent.
          </p>
          <ul className="space-y-2 text-xs text-[#45474c]">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
              <span>Use the <MapPinned className="inline-block align-middle h-3.5 w-3.5 mx-0.5 text-[#1b1b1d]" /> <strong className="text-[#1b1b1d]">map icon</strong> in the top bar to replay the tour any time.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
              <span>Use the <strong className="text-[#1b1b1d]">firm switcher</strong> in the sidebar to <strong className="text-[#1b1b1d]">create your own firm</strong>.</span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={closeOutroModal}
            className="flex-1 h-9 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </button>
          <button
            type="button"
            onClick={() => {
              closeOutroModal()
              if (slugs?.firmSlug) void restartTour(slugs.firmSlug)
            }}
            className="flex-1 h-9 rounded-[2px] border border-[#e5e7eb] text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Replay
          </button>
        </div>
      </div>
    </div>
  )
}
