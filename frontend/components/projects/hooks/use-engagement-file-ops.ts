import { useState, useCallback, useRef } from 'react'
import { logger } from '@/lib/logger'
import { useToast } from '@/components/ui/toast'
import { DriveFile } from '@/lib/types'
import { SANDBOX_OPERATION_MESSAGE } from '@/components/ui/sandbox-info-banner'

type Session = {
    access_token?: string
    user?: { id?: string; email?: string }
} | null

interface UseEngagementFileOpsOptions {
    sessionRef: React.RefObject<Session>
    projectId: string
    currentFolderIdRef: React.RefObject<string | null>
    currentFolderType: 'general' | 'confidential' | 'staging'
    generalFolderId: string | null
    confidentialFolderId: string | null
    stagingFolderId: string | null
    fetchFiles: (folderId: string, silent?: boolean) => Promise<void>
    fetchSharedIds: () => void
    startProcessing: (id: string) => void
    stopProcessing: (id: string) => void
    setFiles: React.Dispatch<React.SetStateAction<DriveFile[]>>
    orgSandbox?: { sandboxOnly?: boolean } | null
}

export function useEngagementFileOps({
    sessionRef,
    projectId,
    currentFolderIdRef,
    currentFolderType,
    generalFolderId,
    confidentialFolderId,
    stagingFolderId,
    fetchFiles,
    fetchSharedIds,
    startProcessing,
    stopProcessing,
    setFiles,
    orgSandbox,
}: UseEngagementFileOpsOptions) {
    const { addToast } = useToast()

    // Rename state
    const [renameModalOpen, setRenameModalOpen] = useState(false)
    const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null)
    const [renameNewName, setRenameNewName] = useState('')
    const [renameSubmitting, setRenameSubmitting] = useState(false)

    // Trash state
    const [trashConfirmTarget, setTrashConfirmTarget] = useState<DriveFile | null>(null)
    const [trashConfirming, setTrashConfirming] = useState(false)
    const trashDialogOpenTime = useRef<number>(0)

    // Copy/Move state
    const [copyMoveModalOpen, setCopyMoveModalOpen] = useState(false)
    const [copyMoveTarget, setCopyMoveTarget] = useState<DriveFile | null>(null)
    const [copyMoveAction, setCopyMoveAction] = useState<'copy' | 'move'>('copy')
    const [copyMoveKeepBoth, setCopyMoveKeepBoth] = useState(true)
    const [currentPath, setCurrentPath] = useState<{ id: string; name: string }[]>([])
    const [destinationFolders, setDestinationFolders] = useState<DriveFile[]>([])
    const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null)
    const [loadingDestinations, setLoadingDestinations] = useState(false)
    const [copyMoveSubmittingFolderId, setCopyMoveSubmittingFolderId] = useState<string | null>(null)
    const [emptyFolderIds, setEmptyFolderIds] = useState<Set<string>>(new Set())
    const [checkingFolderId, setCheckingFolderId] = useState<string | null>(null)

    // Cross-engagement state
    const [crossEngagementModalOpen, setCrossEngagementModalOpen] = useState(false)
    const [crossEngagementTarget, setCrossEngagementTarget] = useState<DriveFile | null>(null)
    const [crossEngagementFirmName, setCrossEngagementFirmName] = useState<string | null>(null)
    const [crossEngagementEngagements, setCrossEngagementEngagements] = useState<{ id: string; name: string; clientId: string; clientName: string }[]>([])
    const [crossEngagementLoading, setCrossEngagementLoading] = useState(false)
    const [crossEngagementSubmitting, setCrossEngagementSubmitting] = useState(false)
    const [crossEngagementSelectedId, setCrossEngagementSelectedId] = useState<string | null>(null)

    // Unlock/Unshare state
    const [unlockConfirmFile, setUnlockConfirmFile] = useState<DriveFile | null>(null)
    const [unlockInProgress, setUnlockInProgress] = useState(false)
    const [unshareConfirmFile, setUnshareConfirmFile] = useState<DriveFile | null>(null)
    const [unshareInProgress, setUnshareInProgress] = useState(false)

    const refreshShareStateAndFiles = useCallback(() => {
        fetchSharedIds()
        const currentFolderId = currentFolderIdRef.current
        if (currentFolderId) void fetchFiles(currentFolderId, true)
    }, [fetchSharedIds, currentFolderIdRef, fetchFiles])

    const handleDuplicate = useCallback(async (doc: DriveFile) => {
        if (!sessionRef.current?.access_token) return
        startProcessing(doc.id)
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'duplicate', projectId, fileId: doc.id })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to duplicate')
            }
            addToast({ type: 'success', title: 'Duplicated', message: `${doc.name} duplicated with a unique name` })
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            stopProcessing(doc.id)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing])

    // Step 1: open confirm dialog
    const handleTrash = useCallback((doc: DriveFile) => {
        // Small delay to ensure the menu click doesn't propagate into the dialog
        setTimeout(() => {
            setTrashConfirmTarget(doc)
            trashDialogOpenTime.current = Date.now()
        }, 200)
    }, [])

    // Step 2: called from the confirm dialog
    const handleTrashConfirmed = useCallback(async () => {
        if (!trashConfirmTarget || trashConfirming || !sessionRef.current?.access_token) return

        if (orgSandbox?.sandboxOnly) {
            addToast({
                type: 'error',
                title: 'Sandbox',
                message: SANDBOX_OPERATION_MESSAGE,
                duration: 8000,
            } as any)
            setTrashConfirmTarget(null)
            return
        }

        // Safety guard: Don't allow confirmation if dialog was opened less than 400ms ago
        if (Date.now() - trashDialogOpenTime.current < 400) return

        const doc = trashConfirmTarget
        setTrashConfirming(true)
        startProcessing(doc.id)
        try {
            const res = await fetch('/api/drive-action', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'trash',
                    fileId: doc.id,
                    connectorId: doc.connectorId,
                    projectId,
                    fileName: doc.name
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to move to bin')
            }
            addToast({ type: 'success', title: 'Moved to Bin', message: `${doc.name} moved to Google Drive Bin` })
            setTrashConfirmTarget(null)
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
            setTrashConfirmTarget(null)
        } finally {
            setTrashConfirming(false)
            stopProcessing(doc.id)
        }
    }, [trashConfirmTarget, trashConfirming, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing, projectId, orgSandbox])

    const fetchFolderChildrenResult = useCallback(async (folderId: string): Promise<DriveFile[]> => {
        if (!sessionRef.current?.access_token) return []
        const r = await fetch('/api/connectors/google-drive/linked-files', {
            method: 'POST',
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${sessionRef.current.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'list', folderId, projectId, pageSize: 500 })
        })
        const data = r.ok ? await r.json() : { files: [] }
        const list = (data.files || []) as DriveFile[]
        return list.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder')
    }, [projectId])

    const fetchFolderChildren = useCallback((folderId: string) => {
        if (!sessionRef.current?.access_token) return
        setLoadingDestinations(true)
        fetchFolderChildrenResult(folderId)
            .then((folders) => setDestinationFolders(folders))
            .catch(() => setDestinationFolders([]))
            .finally(() => setLoadingDestinations(false))
    }, [fetchFolderChildrenResult])

    const handleCopyMoveBreadcrumbClick = useCallback((index: number) => {
        setCurrentPath(prev => {
            const next = prev.slice(0, index + 1)
            const segment = next[next.length - 1]
            if (segment) {
                setTimeout(() => {
                    setSelectedDestinationId(segment.id)
                    fetchFolderChildren(segment.id)
                }, 0)
            }
            return next
        })
    }, [fetchFolderChildren])

    const handleNavigateIntoFolder = useCallback(async (folder: DriveFile) => {
        if (!sessionRef.current?.access_token) return
        setCheckingFolderId(folder.id)
        try {
            const folders = await fetchFolderChildrenResult(folder.id)
            if (folders.length === 0) {
                addToast({ type: 'info', title: 'No subfolders', message: 'This folder has no subfolders' })
                setEmptyFolderIds(prev => new Set(prev).add(folder.id))
                return
            }
            setSelectedDestinationId(folder.id)
            setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }])
            setDestinationFolders(folders)
        } catch {
            addToast({ type: 'error', title: 'Error', message: 'Could not load folder' })
        } finally {
            setCheckingFolderId(null)
        }
    }, [fetchFolderChildrenResult, addToast])

    const handleCopyMoveToFolder = useCallback(async (destinationFolderId: string, sourceFileOverride?: DriveFile, actionOverride?: 'copy' | 'move') => {
        const target = sourceFileOverride || copyMoveTarget
        const action = actionOverride || copyMoveAction

        if (!target || !sessionRef.current?.access_token) return
        setCopyMoveSubmittingFolderId(destinationFolderId)
        startProcessing(target.id)
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: action,
                    projectId,
                    fileId: target.id,
                    destinationFolderId,
                    keepBoth: copyMoveKeepBoth
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to ' + action)
            }
            addToast({ type: 'success', title: action === 'copy' ? 'Copied' : 'Moved', message: `${target.name} ${action === 'copy' ? 'copied' : 'moved'} successfully` })
            setCopyMoveModalOpen(false)
            setCopyMoveTarget(null)
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            setCopyMoveSubmittingFolderId(null)
            stopProcessing(target.id)
        }
    }, [copyMoveTarget, copyMoveAction, copyMoveKeepBoth, projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing])

    const handleMoveTree = useCallback(async (doc: DriveFile, targetRoot: 'general' | 'confidential' | 'staging') => {
        if (!sessionRef.current?.access_token) return
        startProcessing(doc.id)
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'move-tree',
                    projectId,
                    fileId: doc.id,
                    targetRoot
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to move')
            }
            const label = targetRoot === 'general' ? 'Restored to General' : targetRoot === 'confidential' ? 'Restricted to Confidential' : 'Promoted to General'
            addToast({ type: 'success', title: label, message: `${doc.name} moved successfully` })
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            stopProcessing(doc.id)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing])

    const openRenameModal = useCallback((doc: DriveFile) => {
        setRenameTarget(doc)
        setRenameNewName(doc.name ?? '')
        setRenameModalOpen(true)
    }, [])

    const handleConfirmRename = useCallback(() => {
        if (!renameTarget || !renameNewName.trim() || !sessionRef.current?.access_token) return
        const fileId = renameTarget.id
        const previousName = renameTarget.name ?? ''
        const newName = renameNewName.trim()

        // Optimistic update: show new name on screen immediately
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName } : f))
        setRenameModalOpen(false)
        setRenameTarget(null)
        startProcessing(fileId)

        // Drive API rename in background (non-blocking)
        fetch('/api/connectors/google-drive/linked-files', {
            method: 'POST',
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${sessionRef.current.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'rename',
                projectId,
                fileId,
                name: newName
            })
        })
            .then((res) => {
                if (!res.ok) return res.json().then((err: { error?: string }) => { throw new Error(err.error || 'Failed to rename') })
                addToast({ type: 'success', title: 'Renamed', message: `"${previousName}" renamed to "${newName}"` })
            })
            .catch((e: unknown) => {
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: previousName } : f))
                addToast({ type: 'error', title: 'Rename failed', message: e instanceof Error ? e.message : 'Could not rename in Google Drive' })
            })
            .finally(() => {
                stopProcessing(fileId)
            })
    }, [renameTarget, renameNewName, projectId, addToast, startProcessing, stopProcessing, setFiles])

    const handlePrivacy = useCallback(async (file: DriveFile, makePrivate: boolean) => {
        const docId = file.projectDocumentId ?? file.id
        const res = await fetch(`/api/projects/${projectId}/documents/${docId}/privacy`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${sessionRef.current?.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ private: makePrivate }),
        })
        if (!res.ok) {
            addToast({ type: 'error', title: 'Failed to update privacy', message: 'Could not update file privacy.' })
            return
        }
        addToast({
            type: 'success',
            title: makePrivate ? 'File marked Private' : 'File is now visible to all members',
        })
        refreshShareStateAndFiles()
    }, [projectId, addToast, refreshShareStateAndFiles])

    const handleUnlockFromBadge = useCallback(async (file: DriveFile) => {
        const docId = file.projectDocumentId ?? file.id
        if (!docId || !sessionRef.current?.access_token) return
        setUnlockInProgress(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/sharing/unlock`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${sessionRef.current.access_token}` },
                credentials: 'include',
            })
            if (res.ok) {
                addToast({ type: 'success', title: 'Returned to Draft', message: `"${file.name}" is now editable.` })
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            } else {
                const d = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Failed', message: d.error || 'Could not return to draft.' })
            }
        } catch {
            addToast({ type: 'error', title: 'Failed', message: 'Network error.' })
        } finally {
            setUnlockInProgress(false)
            setUnlockConfirmFile(null)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast])

    const handleUnshare = useCallback(async (file: DriveFile) => {
        const docId = file.projectDocumentId ?? file.id
        if (!docId || !sessionRef.current?.access_token) return
        setUnshareInProgress(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(docId)}/sharing`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${sessionRef.current.access_token}` },
                credentials: 'include',
            })
            if (res.ok) {
                addToast({ type: 'success', title: 'Unshared', message: `"${file.name}" is no longer shared externally.` })
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            } else {
                const d = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Failed', message: d.error || 'Could not revoke access.' })
            }
        } catch {
            addToast({ type: 'error', title: 'Failed', message: 'Network error.' })
        } finally {
            setUnshareInProgress(false)
            setUnshareConfirmFile(null)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast])

    const handleIntakeAction = useCallback(async (file: DriveFile, action: 'approve' | 'reject' | 'withdraw') => {
        const docId = file.projectDocumentId ?? file.id
        if (!docId || !sessionRef.current?.access_token) return
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${docId}/intake`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action }),
                credentials: 'include',
            })
            if (res.ok) {
                addToast({ type: 'success', title: action === 'approve' ? 'File approved' : action === 'reject' ? 'File rejected' : 'Upload withdrawn', message: `"${file.name}" ${action === 'approve' ? 'is now available to all.' : 'has been removed.'}` })
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            } else {
                const d = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Action failed', message: d.error || 'Something went wrong.' })
            }
        } catch (e) {
            addToast({ type: 'error', title: 'Action failed', message: 'Network error.' })
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast])

    const handleFolderIntakeAction = useCallback(async (file: DriveFile, action: 'approve-folder' | 'reject-folder' | 'withdraw-folder') => {
        if (!sessionRef.current?.access_token) return
        startProcessing(file.id)
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(file.id)}/intake`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action }),
                credentials: 'include',
            })
            if (res.ok) {
                const label = action === 'approve-folder' ? 'Folder approved' : action === 'reject-folder' ? 'Folder rejected' : 'Folder withdrawn'
                const detail = action === 'approve-folder'
                    ? `All files in "${file.name}" are now available.`
                    : `"${file.name}" and its contents have been removed.`
                addToast({ type: 'success', title: label, message: detail })
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            } else {
                const d = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Action failed', message: d.error || 'Something went wrong.' })
            }
        } catch (e) {
            addToast({ type: 'error', title: 'Action failed', message: 'Network error.' })
        } finally {
            stopProcessing(file.id)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing])

    const openCopyMoveModal = useCallback((doc: DriveFile, action: 'copy' | 'move') => {
        setCopyMoveTarget(doc)
        setCopyMoveAction(action)
        setCopyMoveKeepBoth(true)
        setEmptyFolderIds(new Set())
        setCheckingFolderId(null)

        const rootId = currentFolderType === 'general' ? generalFolderId :
            currentFolderType === 'confidential' ? confidentialFolderId : stagingFolderId
        const rootName = currentFolderType.charAt(0).toUpperCase() + currentFolderType.slice(1)

        if (!rootId) {
            setCopyMoveModalOpen(true)
            setDestinationFolders([])
            setSelectedDestinationId(null)
            setCurrentPath([])
            return
        }
        setCurrentPath([{ id: rootId, name: rootName }])
        setSelectedDestinationId(rootId)
        setCopyMoveModalOpen(true)
        setDestinationFolders([])
        setLoadingDestinations(true)
        if (!sessionRef.current?.access_token) {
            setLoadingDestinations(false)
            return
        }
        fetch('/api/connectors/google-drive/linked-files', {
            method: 'POST',
            credentials: 'include',
            headers: {
                Authorization: `Bearer ${sessionRef.current.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'list', folderId: rootId, projectId, pageSize: 500 })
        })
            .then((r) => (r.ok ? r.json() : { files: [] }))
            .then((data) => {
                const list = (data.files || []) as DriveFile[]
                const folders = list.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder')
                setDestinationFolders(folders)
            })
            .catch(() => setDestinationFolders([]))
            .finally(() => setLoadingDestinations(false))
    }, [generalFolderId, confidentialFolderId, stagingFolderId, currentFolderType, projectId])

    const openCrossEngagementModal = useCallback(async (doc: DriveFile) => {
        setCrossEngagementTarget(doc)
        setCrossEngagementSelectedId(null)
        setCrossEngagementFirmName(null)
        setCrossEngagementModalOpen(true)
        setCrossEngagementLoading(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/engagements`, { credentials: 'include' })
            if (res.ok) {
                const data = await res.json()
                setCrossEngagementFirmName(data.firmName ?? null)
                setCrossEngagementEngagements(
                    ((data.engagements ?? []) as { id: string; name: string; clientId: string; clientName: string }[]).filter((e) => e.id !== projectId)
                )
            }
        } catch {
            setCrossEngagementEngagements([])
        } finally {
            setCrossEngagementLoading(false)
        }
    }, [projectId])

    const handleCrossEngagementSubmit = useCallback(async () => {
        if (!crossEngagementTarget || !crossEngagementSelectedId || !sessionRef.current?.access_token) return
        setCrossEngagementSubmitting(true)
        startProcessing(crossEngagementTarget.id)
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'cross-engagement-copy',
                    projectId,
                    fileId: crossEngagementTarget.id,
                    targetEngagementId: crossEngagementSelectedId,
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to copy')
            }
            addToast({
                type: 'success',
                title: 'Copied',
                message: `${crossEngagementTarget.name} copied to the selected engagement.`,
            })
            setCrossEngagementModalOpen(false)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            setCrossEngagementSubmitting(false)
            stopProcessing(crossEngagementTarget.id)
        }
    }, [crossEngagementTarget, crossEngagementSelectedId, projectId, addToast, startProcessing, stopProcessing])

    return {
        // Rename state
        renameModalOpen,
        setRenameModalOpen,
        renameTarget,
        setRenameTarget,
        renameNewName,
        setRenameNewName,
        renameSubmitting,
        setRenameSubmitting,
        // Trash state
        trashConfirmTarget,
        setTrashConfirmTarget,
        trashConfirming,
        // Copy/Move state
        copyMoveModalOpen,
        setCopyMoveModalOpen,
        copyMoveTarget,
        setCopyMoveTarget,
        copyMoveAction,
        setCopyMoveAction,
        copyMoveKeepBoth,
        setCopyMoveKeepBoth,
        currentPath,
        setCurrentPath,
        destinationFolders,
        setDestinationFolders,
        selectedDestinationId,
        setSelectedDestinationId,
        loadingDestinations,
        copyMoveSubmittingFolderId,
        emptyFolderIds,
        checkingFolderId,
        // Cross-engagement state
        crossEngagementModalOpen,
        setCrossEngagementModalOpen,
        crossEngagementTarget,
        setCrossEngagementTarget,
        crossEngagementFirmName,
        setCrossEngagementFirmName,
        crossEngagementEngagements,
        crossEngagementLoading,
        crossEngagementSubmitting,
        crossEngagementSelectedId,
        setCrossEngagementSelectedId,
        // Unlock/Unshare state
        unlockConfirmFile,
        setUnlockConfirmFile,
        unlockInProgress,
        unshareConfirmFile,
        setUnshareConfirmFile,
        unshareInProgress,
        // Handlers
        refreshShareStateAndFiles,
        handleDuplicate,
        handleTrash,
        handleTrashConfirmed,
        handleCopyMoveToFolder,
        handleMoveTree,
        openRenameModal,
        handleConfirmRename,
        handlePrivacy,
        handleUnlockFromBadge,
        handleUnshare,
        handleIntakeAction,
        handleFolderIntakeAction,
        openCopyMoveModal,
        openCrossEngagementModal,
        handleCrossEngagementSubmit,
        handleCopyMoveBreadcrumbClick,
        handleNavigateIntoFolder,
    }
}
