"use client"

import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ExternalLink, X, Download } from "lucide-react"
import { DocumentIcon } from "@/components/ui/document-icon"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { getDocumentEditUrl, getDocumentPreviewUrl, ReGrantEditorAccessButton } from "@/components/files/document-edit-sheet"

interface FilePreviewSheetProps {
    isOpen: boolean
    onClose: () => void
    document: any
    onDownload?: (doc: any) => void
    /** When provided, "Edit" opens embedded editor (no Google branding). Otherwise falls back to new tab. */
    onEdit?: () => void
}

export function FilePreviewSheet({
    isOpen,
    onClose,
    document,
    onDownload,
    onEdit,
}: FilePreviewSheetProps) {
    if (!document) return null

    const driveFileId = (document as { externalId?: string }).externalId ?? document.id

    const getPreviewUrl = () => getDocumentPreviewUrl(document)

    const getEditUrl = () => getDocumentEditUrl(document)

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col h-full bg-surface-subtle">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                    <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <DocumentIcon mimeType={document.mimeType} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <SheetTitle className="text-base font-semibold text-gray-900 truncate" title={document.name}>
                                {document.name}
                            </SheetTitle>
                            <SheetDescription className="flex items-center text-xs text-gray-500 space-x-2">
                                <span>{formatFileSize(document.size)}</span>
                                <span>•</span>
                                <span>Edited {formatSmartDateTime(document.modifiedTime)}</span>
                            </SheetDescription>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        {onDownload && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDownload(document)}
                                title="Download"
                                className="text-gray-500 hover:text-gray-900"
                            >
                                <Download className="h-5 w-5" />
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(getPreviewUrl(), '_blank')}
                            className="hidden sm:flex items-center space-x-2 border-slate-200 text-slate-600 hover:bg-surface-hover hover:text-slate-800"
                            title="Open original file in a new tab"
                        >
                            <ExternalLink className="h-4 w-4" />
                            <span>Open in Browser</span>
                        </Button>
                        {document.projectId && !document.isGuest ? (
                            <ReGrantEditorAccessButton
                                projectId={document.projectId}
                                documentId={document.id}
                                isGuest={document.isGuest}
                            />
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onEdit ? onEdit() : window.open(getEditUrl(), '_blank')}
                                className="hidden sm:flex items-center space-x-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                            >
                                <ExternalLink className="h-4 w-4" />
                                <span>Edit</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                            title="Close preview"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="flex-1 overflow-hidden relative bg-gray-100 flex flex-col">
                    <iframe
                        src={getPreviewUrl()}
                        className="w-full h-full border-0"
                        title="File Preview"
                        allowFullScreen
                    />

                    {/* Fallback/Info Overlay if iframe fails to load or is blocked */}
                    <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-gray-200 p-4 text-center text-sm text-gray-500 sm:hidden">
                        {document.projectId && !document.isGuest ? (
                            <div className="flex justify-center w-full">
                                <ReGrantEditorAccessButton
                                    projectId={document.projectId}
                                    documentId={document.id}
                                    isGuest={document.isGuest}
                                />
                            </div>
                        ) : (
                            <Button
                                className="w-full bg-green-600 text-white hover:bg-green-700"
                                onClick={() => onEdit ? onEdit() : window.open(getEditUrl(), '_blank')}
                            >
                                Edit
                            </Button>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
