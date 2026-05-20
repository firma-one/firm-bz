'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
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

interface FirmSwitchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetFirmSlug: string
    targetFirmName: string
    currentFirmName?: string
}

export function FirmSwitchDialog({
    open,
    onOpenChange,
    targetFirmSlug,
    targetFirmName,
    currentFirmName
}: FirmSwitchDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
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

            // Brief delay so client state (and any RLS) sees the new session before we navigate
            await new Promise(resolve => setTimeout(resolve, 100))

            // Rebuild permission cache for consistency with onboarding
            const { buildUserSettingsPlus } = await import('@/lib/actions/user-settings')
            await buildUserSettingsPlus()

            // Navigate first, then close dialog after a tick so navigation isn't dropped when we unmount
            router.push(`/d/f/${targetFirmSlug}`)
            router.refresh()
            setTimeout(() => onOpenChange(false), 0)
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
            <DialogContent className="sm:max-w-[420px] border-[#e5e7eb] p-0 gap-0 rounded-[2px]">

                <VisuallyHidden><DialogTitle>Switch Firm</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">Switch Firm</p>
                        <p className="text-xs text-[#45474c] mt-0.5">You are switching to a different firm workspace.</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded">
                            {error}
                        </div>
                    )}
                    <p className="text-sm text-[#45474c]">
                        {currentFirmName ? (
                            <>
                                You are about to switch from <span className="font-semibold text-[#1b1b1d]">{currentFirmName}</span> to <span className="font-semibold text-[#1b1b1d]">{targetFirmName}</span>.
                            </>
                        ) : (
                            <>
                                You are about to switch to <span className="font-semibold text-[#1b1b1d]">{targetFirmName}</span>.
                            </>
                        )}
                    </p>
                    <p className="text-xs text-[#9a9ba0]">
                        Your permissions will be refreshed for this firm workspace.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="!rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase border-gray-300"
                        onClick={handleCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="greenCta"
                        onClick={handleSwitch}
                        disabled={isLoading}
                        className="min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase"
                    >
                        {isLoading ? <LoadingSpinner size="sm" /> : 'Switch Firm'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
