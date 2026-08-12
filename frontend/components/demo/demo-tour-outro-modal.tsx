'use client'

import Link from 'next/link'
import { MapPinned, Play, UserPlus } from 'lucide-react'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

/** Static counterpart to demo-tour-outro-modal.tsx — same copy/visual chrome, "firm switcher" bullet
 * kept as-is since the demo sidebar shows the same (inert) element. */
export function DemoTourOutroModal() {
    const { showOutroModal, endTour, restartTour } = useDemoTour()

    if (!showOutroModal) return null

    const close = () => endTour(false)

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={close} />

            <div className="relative bg-white rounded shadow-2xl border border-[#e5e7eb] w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-primary/8 border-b border-[#e5e7eb] px-5 py-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded bg-primary flex items-center justify-center shrink-0">
                        <MapPinned className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">That&apos;s the full tour!</p>
                        <p className="text-xs text-[#45474c] mt-0.5">You&apos;ve seen the key features of Firma</p>
                    </div>
                </div>

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
                            <span><strong className="text-[#1b1b1d]">Sign up</strong> any time to create your own firm with real clients and engagements.</span>
                        </li>
                    </ul>
                </div>

                <div className="px-5 pb-5 flex flex-col gap-2">
                    <Link
                        href="/signup"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all flex items-center justify-center gap-1.5"
                    >
                        <UserPlus className="h-3.5 w-3.5" /> Sign Up
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={restartTour}
                            className="flex-1 h-9 rounded border border-[#e5e7eb] text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1.5"
                        >
                            <Play className="h-3.5 w-3.5" /> Replay
                        </button>
                        <button
                            type="button"
                            onClick={close}
                            className="flex-1 h-9 rounded border border-[#e5e7eb] text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-1.5"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
