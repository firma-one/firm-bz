'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'

const LOADING_PHASE_MS = 900
const WELCOME_PHASE_MS = 2000
const EXIT_ANIMATION_MS = 200

/**
 * Self-contained "just landed" overlay shown on a firm dashboard's own first paint, right
 * after arriving via `/d`'s landing-path resolution (see `resolveDefaultFirmLandingPath`'s
 * `?landed=new` / `?landed=returning` query param). Two phases in one continuously-mounted
 * component — a loading-styled phase (matching `/d`'s own loader visually, so it reads as
 * continuous even though it's technically a separate mount after the redirect), then a
 * closing message — before auto-closing on its own. Does not depend on `/d`'s loading.tsx
 * having rendered correctly first; this is entirely self-timed on the destination page.
 */
export function LandingArrivalOverlay({
    variant,
    firstName,
    onClose,
}: {
    variant: 'new' | 'returning'
    firstName?: string
    onClose: () => void
}) {
    const [phase, setPhase] = useState<'loading' | 'welcome'>('loading')
    const [closing, setClosing] = useState(false)

    useEffect(() => {
        const toWelcome = setTimeout(() => setPhase('welcome'), LOADING_PHASE_MS)
        const toCloseStart = setTimeout(() => setClosing(true), LOADING_PHASE_MS + WELCOME_PHASE_MS)
        return () => {
            clearTimeout(toWelcome)
            clearTimeout(toCloseStart)
        }
    }, [])

    useEffect(() => {
        if (!closing) return
        const toClose = setTimeout(onClose, EXIT_ANIMATION_MS)
        return () => clearTimeout(toClose)
    }, [closing, onClose])

    return (
        <div
            // Fully opaque, not translucent — AppSidebar/dashboard content behind this overlay
            // is already mounted and may still be transitioning its own loading state; any
            // transparency here would let that bleed through and read as this overlay flickering.
            // Uses the app's own main-content background color (not a dark scrim) so the
            // eventual swap to real content isn't a stark light<->dark cut.
            className={cn(
                'fixed inset-0 z-[200] flex items-center justify-center bg-[#f9f9fb] transition-opacity duration-300 ease-out',
                closing ? 'opacity-0' : 'opacity-100 animate-in fade-in',
            )}
            role="status"
            aria-live="polite"
        >
            <div
                className={cn(
                    'w-full max-w-md rounded-lg border border-[#e5e7eb] bg-white px-10 py-8 shadow-xl mx-4 transition-all duration-300 ease-out',
                    closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100 animate-in fade-in zoom-in-95',
                )}
            >
                <div className="flex min-h-[160px] flex-col items-center justify-center">
                    <div key={phase} className="w-full animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
                        {phase === 'loading' ? (
                            <LoadingSpinner
                                className="min-h-0 p-0"
                                size="lg"
                                message={variant === 'new' ? 'Setting up your workspace...' : 'Loading your workspace...'}
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-center">
                                <CheckCircle2 className="h-12 w-12 text-primary" strokeWidth={1.5} />
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-[#1b1b1d] tracking-tight">
                                        {variant === 'new'
                                            ? `Welcome to Firma${firstName ? `, ${firstName}` : ''}!`
                                            : `Welcome back${firstName ? `, ${firstName}` : ''}!`}
                                    </p>
                                    <p className="text-xs text-gray-500 font-medium">Your workspace is ready.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
