'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mail, ShieldCheck, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { SecureOpenModalMode } from '@/lib/use-secure-open-document'

interface SecureAccessModalProps {
    isOpen: boolean
    onClose: () => void
    email: string
    fileName: string
    mimeType?: string
    externalId?: string
    firmId?: string
    /** 'loading' (generic, provider-neutral, shown before the provider is known) | 'opening'
     *  (OneDrive/SharePoint — auto-closes) | 'email' (Google — stays open) | 'error'. Falls back
     *  to the old isLoading/error boolean props' behavior when omitted. */
    mode?: SecureOpenModalMode
    isLoading?: boolean
    error?: string | null
}

export function SecureAccessModal({
    isOpen,
    onClose,
    email,
    fileName,
    mimeType,
    externalId,
    firmId,
    mode,
    isLoading,
    error,
}: SecureAccessModalProps) {
    const isFolder = mimeType?.includes('folder')
    const proxyThumbnailUrl = externalId && firmId
        ? `/api/proxy/thumbnail/${encodeURIComponent(externalId)}?firmId=${encodeURIComponent(firmId)}&size=400`
        : null
    // Falls back to the mimeType-based DocumentIcon when the thumbnail 404s/fails to load
    // (e.g. the proxy has no thumbnail for this file yet) — previously showed the browser's
    // broken-image icon instead.
    const [thumbnailFailed, setThumbnailFailed] = useState(false)

    const effectiveMode: SecureOpenModalMode = mode ?? (error ? 'error' : isLoading ? 'loading' : 'email')
    const isBusy = effectiveMode === 'loading' || effectiveMode === 'opening'

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (isBusy) return
                if (!open) onClose()
            }}
        >
            <DialogContent
                className="sm:max-w-sm border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb]"
                hideClose={isBusy}
                onInteractOutside={(e) => { if (isBusy) e.preventDefault() }}
                onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault() }}
            >
                <VisuallyHidden><DialogTitle>Secure Access Request</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded flex items-center justify-center shrink-0 bg-primary/10 ring-1 ring-primary/20">
                        {effectiveMode === 'error' ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : effectiveMode === 'opening' ? (
                            <ExternalLink className="h-4 w-4 text-primary" />
                        ) : effectiveMode === 'loading' ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                        ) : (
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        )}
                    </div>
                    <div>
                        <p className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">
                            {effectiveMode === 'error' ? 'Access Unavailable'
                                : effectiveMode === 'opening' ? 'Opening Document'
                                : effectiveMode === 'loading' ? 'Preparing Secure Access'
                                : 'Secure Access Request'}
                        </p>
                        {effectiveMode === 'error' ? (
                            <p className="text-xs text-destructive mt-0.5">Unable to complete secure access</p>
                        ) : effectiveMode === 'opening' ? (
                            <p className="text-xs text-[#45474c] mt-0.5">Opening in a new tab…</p>
                        ) : effectiveMode === 'loading' ? (
                            <p className="text-xs text-[#45474c] mt-0.5">Verifying access, one moment…</p>
                        ) : (
                            <p className="text-xs text-[#45474c] mt-0.5">A verification link has been sent to your inbox</p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {effectiveMode === 'error' ? (
                        <div className="flex items-start gap-3 p-3 rounded bg-white border border-destructive/20">
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <p className="text-xs text-[#1b1b1d] leading-relaxed">{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* File preview strip */}
                            <div className="flex items-center gap-3 p-3 rounded bg-white border border-[#e5e7eb]">
                                {proxyThumbnailUrl && !thumbnailFailed ? (
                                    <div className="h-10 w-10 rounded overflow-hidden shrink-0 border border-[#e5e7eb]">
                                        <img
                                            src={proxyThumbnailUrl}
                                            alt={fileName}
                                            className="h-full w-full object-cover"
                                            onError={() => setThumbnailFailed(true)}
                                        />
                                    </div>
                                ) : isFolder ? (
                                    <div className="h-10 w-10 flex items-center justify-center shrink-0">
                                        <SharedFolderIcon fillLevel={1} tooltip="shared" className="h-8 w-8" />
                                    </div>
                                ) : (
                                    <div className="h-10 w-10 flex items-center justify-center shrink-0">
                                        <DocumentIcon mimeType={mimeType} size={32} />
                                    </div>
                                )}
                                <p className="text-xs font-medium text-[#1b1b1d] truncate leading-snug">{fileName}</p>
                            </div>

                            {effectiveMode === 'opening' ? (
                                <p className="text-xs text-[#45474c] leading-relaxed">
                                    Your document is ready — it should open in a new tab momentarily.
                                </p>
                            ) : effectiveMode === 'loading' ? (
                                <div className="space-y-1.5">
                                    <div className="h-3 w-full bg-[#e5e7eb] rounded animate-pulse" />
                                    <div className="h-3 w-4/5 bg-[#e5e7eb] rounded animate-pulse" />
                                </div>
                            ) : (
                                <>
                                    {/* Email destination */}
                                    <div className="flex items-center gap-3 p-3 rounded bg-white border border-[#e5e7eb]">
                                        <div className="h-7 w-7 rounded flex items-center justify-center shrink-0 bg-[#f9f9fb] border border-[#e5e7eb]">
                                            <Mail className="h-4 w-4 text-[#45474c]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-headline font-bold tracking-widest uppercase text-[#45474c] leading-tight">Verification Inbox</p>
                                            <p className="text-xs font-medium text-[#1b1b1d] truncate mt-0.5">{email}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-[#45474c] leading-relaxed">
                                        Your storage provider requires a one-time verification step. Please follow the link in the email to open the document securely.
                                    </p>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {effectiveMode !== 'opening' && (
                    <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end">
                        <Button
                            variant="blackCta"
                            onClick={onClose}
                            disabled={isBusy}
                            className="rounded text-[10px] font-headline font-bold tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {effectiveMode === 'error' ? 'Close' : effectiveMode === 'loading' ? (
                                <span className="inline-flex items-center gap-1" aria-label="Please wait">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                                </span>
                            ) : 'I understand. Close this message'}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
