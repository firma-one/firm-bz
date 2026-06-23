import { useState } from 'react'
import { DriveFile } from '@/lib/types'

interface UseEngagementDragDropOptions {
    canEdit: boolean
    processUploads: (fileList: FileList) => Promise<void>
    handleCopyMoveToFolder: (destinationFolderId: string, sourceFile?: DriveFile, action?: 'copy' | 'move') => Promise<void>
    addToast: (toast: { type: string; title: string; message: string }) => void
}

export function useEngagementDragDrop({
    canEdit,
    processUploads,
    handleCopyMoveToFolder,
    addToast,
}: UseEngagementDragDropOptions) {
    const [draggedItem, setDraggedItem] = useState<DriveFile | null>(null)
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
    const [isInternalDragging, setIsInternalDragging] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        // Only show external upload overlay if dragging actual files from OS
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        // Detect if any dropped item is a folder via the FileSystemEntry API
        const items = Array.from(e.dataTransfer.items)
        const hasFolder = items.some(item => {
            const entry = item.webkitGetAsEntry?.()
            return entry?.isDirectory
        })
        if (hasFolder) {
            addToast({
                type: 'info',
                title: 'Folder drag-drop not supported',
                message: 'Use the "Upload folder" button instead.',
            })
            return
        }

        const fileList = e.dataTransfer.files
        if (!fileList || fileList.length === 0) return
        await processUploads(fileList)
    }

    // Internal Item Drag Handlers
    const handleItemDragStart = (e: React.DragEvent, item: DriveFile) => {
        if (!canEdit) return
        setDraggedItem(item)
        setIsInternalDragging(true)
        e.dataTransfer.setData('application/x-pockett-item', item.id)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleItemDragEnd = () => {
        setDraggedItem(null)
        setDragOverFolderId(null)
        setIsInternalDragging(false)
    }

    const handleItemDragOver = (e: React.DragEvent, targetFolder: DriveFile) => {
        e.preventDefault()
        e.stopPropagation() // Prevent triggering the container's external upload handler

        if (!draggedItem || draggedItem.id === targetFolder.id) return

        const isFolder = targetFolder.mimeType === 'application/vnd.google-apps.folder'
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

        const targetId = targetFolder.id
        const item = draggedItem

        handleItemDragEnd()

        if (!item || item.id === targetId) return
        if (targetFolder.mimeType !== 'application/vnd.google-apps.folder') return

        // Reuse our existing move logic, but pass item explicitly to avoid race condition
        handleCopyMoveToFolder(targetId, item, 'move')
    }

    return {
        draggedItem,
        dragOverFolderId,
        isInternalDragging,
        isDragging,
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
