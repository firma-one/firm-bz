'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mail, ShieldCheck, AlertCircle } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface SecureAccessModalProps {
    isOpen: boolean
    onClose: () => void
    email: string
    fileName: string
    mimeType?: string
    externalId?: string
    firmId?: string
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
    isLoading,
    error,
}: SecureAccessModalProps) {
    const isFolder = mimeType?.includes('folder')
    const proxyThumbnailUrl = externalId && firmId
        ? `/api/proxy/thumbnail/${encodeURIComponent(externalId)}?firmId=${encodeURIComponent(firmId)}&size=400`
        : null

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (isLoading) return
                if (!open) onClose()
            }}
        >
            <DialogContent
                className="sm:max-w-sm border-[#e5e7eb] p-0 gap-0 rounded-[2px] bg-[#f9f9fb]"
                hideClose={isLoading}
                onInteractOutside={(e) => { if (isLoading) e.preventDefault() }}
                onEscapeKeyDown={(e) => { if (isLoading) e.preventDefault() }}
            >
                <VisuallyHidden><DialogTitle>Secure Access Request</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded flex items-center justify-center shrink-0 bg-primary/10 ring-1 ring-primary/20">
                        {error ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        )}
                    </div>
                    <div>
                        <p className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">
                            {error ? 'Access Unavailable' : 'Secure Access Request'}
                        </p>
                        {isLoading ? (
                            <div className="h-3 w-48 bg-[#e5e7eb] rounded animate-pulse mt-1" />
                        ) : error ? (
                            <p className="text-xs text-destructive mt-0.5">Unable to complete secure access</p>
                        ) : (
                            <p className="text-xs text-[#45474c] mt-0.5">A verification link has been sent to your inbox</p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {error ? (
                        <div className="flex items-start gap-3 p-3 rounded-[2px] bg-white border border-destructive/20">
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            <p className="text-xs text-[#1b1b1d] leading-relaxed">{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* File preview strip */}
                            <div className="flex items-center gap-3 p-3 rounded-[2px] bg-white border border-[#e5e7eb]">
                                {proxyThumbnailUrl ? (
                                    <div className="h-10 w-10 rounded-[2px] overflow-hidden shrink-0 border border-[#e5e7eb]">
                                        <img
                                            src={proxyThumbnailUrl}
                                            alt={fileName}
                                            className="h-full w-full object-cover"
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

                            {/* Email destination */}
                            <div className="flex items-center gap-3 p-3 rounded-[2px] bg-white border border-[#e5e7eb]">
                                <div className="h-7 w-7 rounded flex items-center justify-center shrink-0 bg-[#f9f9fb] border border-[#e5e7eb]">
                                    <Mail className="h-4 w-4 text-[#45474c]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] font-headline font-bold tracking-widest uppercase text-[#45474c] leading-tight">Verification Inbox</p>
                                    {isLoading ? (
                                        <div className="h-3 w-36 bg-[#e5e7eb] rounded animate-pulse mt-1" />
                                    ) : (
                                        <p className="text-xs font-medium text-[#1b1b1d] truncate mt-0.5">{email}</p>
                                    )}
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="space-y-1.5">
                                    <div className="h-3 w-full bg-[#e5e7eb] rounded animate-pulse" />
                                    <div className="h-3 w-4/5 bg-[#e5e7eb] rounded animate-pulse" />
                                </div>
                            ) : (
                                <p className="text-xs text-[#45474c] leading-relaxed">
                                    Google Drive requires a one-time verification step. Please follow the link in the email to open the document securely.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end">
                    <Button
                        variant="blackCta"
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {error ? 'Close' : isLoading ? 'Please wait…' : 'I understand. Close this message'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
