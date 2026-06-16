'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react'
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
}

export function SecureAccessModal({
    isOpen,
    onClose,
    email,
    fileName,
    mimeType,
    externalId,
    firmId
}: SecureAccessModalProps) {
    const isFolder = mimeType?.includes('folder')
    const proxyThumbnailUrl = externalId && firmId
        ? `/api/proxy/thumbnail/${encodeURIComponent(externalId)}?firmId=${encodeURIComponent(firmId)}&size=400`
        : null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-sm border-[#e5e7eb] p-0 gap-0 rounded-[2px] bg-[#f9f9fb]">
                <VisuallyHidden><DialogTitle>Secure Access Request</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded flex items-center justify-center shrink-0 bg-primary/10 ring-1 ring-primary/20">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">
                            Secure Access Request
                        </p>
                        <p className="text-xs text-[#45474c] mt-0.5">A verification link has been sent to your inbox</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
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
                            <p className="text-xs font-medium text-[#1b1b1d] truncate mt-0.5">{email}</p>
                        </div>
                    </div>

                    <p className="text-xs text-[#45474c] leading-relaxed">
                        Google Drive requires a one-time verification step. Please follow the link in the email to open the document directly.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end">
                    <Button
                        variant="blackCta"
                        onClick={onClose}
                        className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase group"
                    >
                        I understand. Close this message
                        <ArrowRight className="ml-2 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
