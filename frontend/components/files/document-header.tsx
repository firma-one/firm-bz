"use client"

import React from 'react'
import { DocumentIcon } from "@/components/ui/document-icon"
import { Button } from "@/components/ui/button"
import { Download, ExternalLink, MailCheck, Loader2 } from "lucide-react"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { ReGrantEditorAccessButton } from "./document-edit-sheet"

interface DocumentHeaderProps {
    document: {
        id: string
        externalId?: string | null
        name: string
        mimeType?: string
        size?: number | string | null
        modifiedTime?: string | Date
        projectId?: string
        isGuest?: boolean
    }
    onDownload?: (doc: any) => void
    onOpenInBrowser?: () => void
    showEditAuth?: boolean
}

export function DocumentHeader({
    document,
    onDownload,
    onOpenInBrowser,
    showEditAuth = true,
}: DocumentHeaderProps) {
    const fileSize = formatFileSize(document.size)
    const modifiedTime = document.modifiedTime ? formatSmartDateTime(document.modifiedTime) : 'recently'

    return (
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-surface-subtle rounded-lg flex items-center justify-center shrink-0 border border-line">
                    <DocumentIcon mimeType={document.mimeType} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-fg truncate" title={document.name}>
                        {document.name}
                    </h3>
                    <p className="flex items-center text-[11px] text-slate-500 gap-1.5 leading-none mt-1">
                        <span>{fileSize}</span>
                        <span>•</span>
                        <span>Edited {modifiedTime}</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                {onDownload && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => onDownload(document)}
                        title="Download"
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                )}

                {onOpenInBrowser && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={onOpenInBrowser}
                        title="Open original file in a new tab"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                )}

                {showEditAuth && document.projectId && !document.isGuest && (
                    <ReGrantEditorAccessButton
                        projectId={document.projectId}
                        documentId={document.id}
                        isGuest={document.isGuest}
                    />
                )}
            </div>
        </div>
    )
}
