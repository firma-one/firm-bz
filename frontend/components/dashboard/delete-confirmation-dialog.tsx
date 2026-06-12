"use client"

import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatFileSize } from "@/lib/utils"

interface DeleteConfirmationDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    count: number
    totalSize: number
}

export function DeleteConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    count,
    totalSize,
}: DeleteConfirmationDialogProps) {
    return (
        <ConfirmDialog
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            iconVariant="red"
            title={`Move ${count} file${count === 1 ? '' : 's'} to Trash`}
            subtitle="Items in Trash are deleted forever after 30 days."
            description={<>You are about to remove <span className="font-semibold text-[#1b1b1d]">{formatFileSize(totalSize)}</span> of data. Items in Trash are deleted forever after 30 days.</>}
            confirmLabel="Delete"
            confirmVariant="red"
            onCancel={onClose}
            onConfirm={onConfirm}
        />
    )
}
