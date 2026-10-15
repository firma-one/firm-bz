'use client'

import { useState, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Building2 } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { switchFirm } from '@/lib/actions/firms'
import { firmPath } from '@/lib/navigation/firm-paths'

interface FirmSwitchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /**
     * Group the target firm lives in — a firm switch always targets a specific group's firm,
     * so callers should always have this available (via FirmOption.groupSlug or their own
     * route params). Optional only as a defensive fallback for malformed/stale data.
     */
    groupSlug?: string
    targetFirmSlug: string
    targetFirmName: string
    currentFirmName?: string
}

export function FirmSwitchDialog({
    open,
    onOpenChange,
    groupSlug,
    targetFirmSlug,
    targetFirmName,
    currentFirmName
}: FirmSwitchDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const switchInProgressRef = useRef(false)

    const handleSwitch = async () => {
        if (switchInProgressRef.current) return
        switchInProgressRef.current = true
        setIsLoading(true)
        setError(null)

        try {
            // Switch firm and rebuild permissions
            await switchFirm(targetFirmSlug)

            // Force refresh the Supabase session to get the new JWT with injected metadata
            const { supabase } = await import('@/lib/supabase')
            await supabase.auth.refreshSession()

            // Rebuild permission cache for consistency with onboarding
            const { buildUserSettingsPlus } = await import('@/lib/actions/user-settings')
            await buildUserSettingsPlus()

            // Hard navigation: the firm links in FirmList are prefetched by Next.js before the
            // switch happens, so router.push()/router.refresh() can serve that stale pre-switch
            // RSC payload for the target slug. A full page load guarantees a fresh request with
            // the refreshed session cookie and bypasses the router's prefetch cache entirely.
            // Falls back to /d (resolves via resolveDefaultFirmLandingPath) on the rare chance
            // a caller doesn't have groupSlug available — /d/f/... is no longer a valid route.
            window.location.href = groupSlug ? firmPath(groupSlug, targetFirmSlug) : '/d'
        } catch (err: any) {
            setError(err.message || 'Failed to switch firm')
            setIsLoading(false)
        } finally {
            switchInProgressRef.current = false
        }
    }

    const handleCancel = () => {
        if (!isLoading) {
            setError(null)
            onOpenChange(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleCancel}>
            <DialogContent className="sm:max-w-[420px] p-0 gap-0">

                <VisuallyHidden><DialogTitle>Switch Firm</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-line flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded bg-surface-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-fg-muted" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-fg leading-tight">Switch Firm</p>
                        <p className="text-xs text-fg-muted mt-0.5">You are switching to a different firm workspace.</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {error && (
                        <div className="bg-tag-red-bg border border-tag-red-bg text-tag-red-fg text-xs px-3 py-2 rounded">
                            {error}
                        </div>
                    )}
                    <p className="text-sm text-fg-muted">
                        {currentFirmName ? (
                            <>
                                You are about to switch from <span className="font-semibold text-fg">{currentFirmName}</span> to <span className="font-semibold text-fg">{targetFirmName}</span>.
                            </>
                        ) : (
                            <>
                                You are about to switch to <span className="font-semibold text-fg">{targetFirmName}</span>.
                            </>
                        )}
                    </p>
                    <p className="text-xs text-fg-subtle">
                        Your permissions will be refreshed for this firm workspace.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="!rounded border-line-strong"
                        onClick={handleCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="greenCta"
                        onClick={handleSwitch}
                        disabled={isLoading}
                        className="min-w-[8rem]"
                    >
                        {isLoading ? <LoadingSpinner size="sm" /> : 'Switch Firm'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
