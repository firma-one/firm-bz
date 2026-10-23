import { useState } from 'react'
import { DriveFile } from '@/lib/types'
import { type ToastType } from '@/components/ui/toast'
import { setRowDragImage } from '@/components/projects/files-drop-zone'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface UseEngagementDragDropOptions {
    canEdit: boolean
    /** Uploads files into the open folder, or into `targetFolderId` when given (a folder row they were dropped on). */
    processUploads: (fileList: FileList, targetFolderId?: string) => Promise<void>
    handleCopyMoveToFolder: (destinationFolderId: string, sourceFile?: DriveFile, action?: 'copy' | 'move') => Promise<void>
    addToast: (toast: { type: ToastType; title: string; message: string }) => void
    /** Whether files from the computer can be dropped here at all (the same rule as New › Upload files). */
    canUpload?: boolean
    /** Whether a folder row may take dropped files itself; off for external members, whose uploads land in their shared folder. */
    canUploadIntoFolders?: boolean
    /** Drag a row as a small card (its icon and name) rather than the browser's copy of the whole row. */
    compactDragImage?: boolean
}

/** Whether a drag carries files from the computer (not a row being moved inside the list). */
function isFileDrag(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes('Files')
}

/** Whether any dropped item is a folder, which a drop can't upload (Upload folder can). */
function hasDirectory(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)
}

/** A folder row that may take dropped files: not an approved deliverable, which is read-only. */
function acceptsUploads(folder: DriveFile): boolean {
    return folder.mimeType === FOLDER_MIME && !(folder.isDeliverable && (folder as { deliverableStatus?: string }).deliverableStatus === 'approved')
}

/*
 * Drag and drop on the Files list (the drop zone: design canvas section 10, 2026-10-23). Files from the
 * computer upload into the open folder wherever they're dropped, rows included, or into a folder row
 * they're dropped on; rows dragged inside the list move into the folder they're dropped on.
 */
export function useEngagementDragDrop({
    canEdit,
    processUploads,
    handleCopyMoveToFolder,
    addToast,
    canUpload = true,
    canUploadIntoFolders = true,
    compactDragImage = false,
}: UseEngagementDragDropOptions) {
    const [draggedItem, setDraggedItem] = useState<DriveFile | null>(null)
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
    const [isInternalDragging, setIsInternalDragging] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    /** While files from the computer are dragged over a folder row that takes them: that folder. Else the open folder is the target. */
    const [dropTargetFolder, setDropTargetFolder] = useState<DriveFile | null>(null)
    /** How many files are being dragged in, for the pill naming where they'll land. */
    const [dragFileCount, setDragFileCount] = useState(0)

    const endFileDrag = () => {
        setIsDragging(false)
        setDropTargetFolder(null)
    }

    const uploadDropped = async (e: React.DragEvent, targetFolder: DriveFile | null) => {
        if (hasDirectory(e)) {
            addToast({
                type: 'info',
                title: 'Folder drag-drop not supported',
                message: 'Use the "Upload folder" button instead.',
            })
            return
        }
        const fileList = e.dataTransfer.files
        if (!fileList || fileList.length === 0) return
        await processUploads(fileList, targetFolder?.id)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        // Only show external upload overlay if dragging actual files from OS
        if (isFileDrag(e) && canUpload) {
            setIsDragging(true)
            setDragFileCount(e.dataTransfer.items.length)
            // Over the list but not over a folder row: the open folder is the target.
            setDropTargetFolder(null)
            e.dataTransfer.dropEffect = 'copy'
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        endFileDrag()
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        endFileDrag()
        if (!canUpload) return
        await uploadDropped(e, null)
    }

    // Internal Item Drag Handlers
    const handleItemDragStart = (e: React.DragEvent, item: DriveFile) => {
        if (!canEdit) return
        setDraggedItem(item)
        setIsInternalDragging(true)
        e.dataTransfer.setData('application/x-pockett-item', item.id)
        e.dataTransfer.effectAllowed = 'move'
        if (compactDragImage) setRowDragImage(e, item.name, item.mimeType === FOLDER_MIME)
    }

    const handleItemDragEnd = () => {
        setDraggedItem(null)
        setDragOverFolderId(null)
        setIsInternalDragging(false)
    }

    const handleItemDragOver = (e: React.DragEvent, targetFolder: DriveFile) => {
        e.preventDefault()
        e.stopPropagation() // Prevent triggering the container's external upload handler

        // Files from the computer: a folder row that takes them is the target, any other row means the open folder.
        if (!draggedItem && isFileDrag(e)) {
            if (!canUpload) return
            setIsDragging(true)
            setDragFileCount(e.dataTransfer.items.length)
            setDropTargetFolder(canUploadIntoFolders && acceptsUploads(targetFolder) ? targetFolder : null)
            e.dataTransfer.dropEffect = 'copy'
            return
        }

        if (!draggedItem || draggedItem.id === targetFolder.id) return

        const isFolder = targetFolder.mimeType === FOLDER_MIME
        if (isFolder) {
            e.dataTransfer.dropEffect = 'move'
            setDragOverFolderId(targetFolder.id)
        }
    }

    const handleItemDragLeave = (e: React.DragEvent) => {
        e.stopPropagation()
        // Only clear highlight if we're actually leaving the row (not just entering a child)
        const rect = e.currentTarget.getBoundingClientRect()
        const isOutside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom
        if (isOutside) {
            setDragOverFolderId(null)
        }
    }

    const handleItemDrop = async (e: React.DragEvent, targetFolder: DriveFile) => {
        e.preventDefault()
        e.stopPropagation() // Prevent triggering the container's external upload handler

        // Files from the computer dropped on a row used to be ignored here; now they upload, into the
        // folder row if it takes them, else into the open folder.
        if (!draggedItem && isFileDrag(e)) {
            endFileDrag()
            if (!canUpload) return
            await uploadDropped(e, canUploadIntoFolders && acceptsUploads(targetFolder) ? targetFolder : null)
            return
        }

        const targetId = targetFolder.id
        const item = draggedItem

        handleItemDragEnd()

        if (!item || item.id === targetId) return
        if (targetFolder.mimeType !== FOLDER_MIME) return

        // Reuse our existing move logic, but pass item explicitly to avoid race condition
        handleCopyMoveToFolder(targetId, item, 'move')
    }

    return {
        draggedItem,
        dragOverFolderId,
        isInternalDragging,
        isDragging,
        dropTargetFolder,
        dragFileCount,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleItemDragStart,
        handleItemDragEnd,
        handleItemDragOver,
        handleItemDragLeave,
        handleItemDrop,
    }
}
