'use client'

import { useEffect, useState } from 'react'
import { StatusIcon } from '@/components/ui/status-icon'
import { WorkspaceLoaderMessage, WorkspaceLoaderScreen } from '@/components/app/workspace-loader'

const LOADING_PHASE_MS = 900
const WELCOME_PHASE_MS = 2000
// Matches --ui-dur-slow, the screen's fade-out.
const EXIT_ANIMATION_MS = 320

/**
 * Self-contained "just landed" overlay shown on a firm dashboard's own first paint, right
 * after arriving via `/d`'s landing-path resolution (see `resolveDefaultFirmLandingPath`'s
 * `?landed=new` / `?landed=returning` query param). Two phases in one continuously-mounted
 * component — a loading-styled phase (matching `/d`'s own loader visually, so it reads as
 * continuous even though it's technically a separate mount after the redirect), then a
 * closing message — before auto-closing on its own. Does not depend on `/d`'s loading.tsx
 * having rendered correctly first; this is entirely self-timed on the destination page.
 * Drawn on the shared WorkspaceLoaderScreen, the same screen as the loaders before it.
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
        <WorkspaceLoaderScreen closing={closing}>
            <div key={phase} className="flex flex-col items-center gap-3 animate-in fade-in duration-ui-base ease-ui-out">
                {phase === 'loading' ? (
                    <WorkspaceLoaderMessage
                        message={variant === 'new' ? 'Setting up your workspace' : 'Loading your workspace'}
                    />
                ) : (
                    <>
                        {/* The status language's "Done", not a big brand-colored check. */}
                        <StatusIcon stage="done" size={20} />
                        <div className="space-y-0.5">
                            <p className="text-h3 text-fg">
                                {variant === 'new'
                                    ? `Welcome to Firma${firstName ? `, ${firstName}` : ''}`
                                    : `Welcome back${firstName ? `, ${firstName}` : ''}`}
                            </p>
                            <p className="text-small text-fg-muted">Your workspace is ready.</p>
                        </div>
                    </>
                )}
            </div>
        </WorkspaceLoaderScreen>
    )
}
