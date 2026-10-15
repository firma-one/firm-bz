'use client'

import React from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

interface GoogleDriveImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedFiles: any[] // Picker API docs define the exact shape, but usually array of objects
    onConfirm: () => void
    loading: boolean
}

export function GoogleDriveImportDialog({
    open,
    onOpenChange,
    selectedFiles,
    onConfirm,
    loading,
}: GoogleDriveImportDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Import from Google Drive</DialogTitle>
                    <DialogDescription>
                        You selected {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}. Files already inside this project folder will be added as-is; everything else will be copied in.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <div className="bg-surface-subtle p-3 rounded-md border border-line">
                        <div className="text-small font-semibold text-fg-muted mb-2">Selected Files</div>
                        <div className="space-y-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                            {selectedFiles.map((file) => (
                                <div key={file.id} className="flex items-center gap-2 text-sm text-fg-muted">
                                    <FileText className="h-3.5 w-3.5 text-fg-subtle" />
                                    <span className="truncate">{file.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                    <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800" onClick={() => onConfirm()} disabled={loading}>
                        {loading && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Import Files
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
