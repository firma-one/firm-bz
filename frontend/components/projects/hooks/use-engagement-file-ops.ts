import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { useState, useCallback, useRef } from 'react'
import { logger } from '@/lib/logger'
import { useToast } from '@/components/ui/toast'
import { useStageMove } from '@/components/files/use-stage-move'
import { DriveFile } from '@/lib/types'
import { ENGAGEMENT_ROOT_LABEL } from '@/lib/files/engagement-root'
import { describeOutcome, type NotDone } from '@/lib/files/partial-outcome'

/** An answer's JSON, or nothing when it has none. */
const bodyOf = async (res: Response): Promise<Record<string, any>> => (await res.json().catch(() => null)) ?? {}

/** Each review action's failure title, naming it (P2-01). */
const INTAKE_FAILED: Record<'approve' | 'reject' | 'withdraw' | 'approve-folder' | 'reject-folder' | 'withdraw-folder', string> = {
    'approve': 'Approve failed',
    'reject': 'Reject failed',
    'withdraw': 'Withdraw failed',
    'approve-folder': 'Approve failed',
    'reject-folder': 'Reject failed',
    'withdraw-folder': 'Withdraw failed',
}

/** The intake route's "not pending" answer, said as what to do about it (P1-53). */
function intakeRefusal(status: number, error: string | undefined): string {
    if (status === 409 && /not pending intake/i.test(error ?? '')) return "It's no longer waiting for review. Refresh the list."
    return error || `The server answered ${status}. Try again.`
}

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
    /** Called when an item leaves the current listing (e.g. moved elsewhere). */
    onItemRemoved?: (fileId: string) => void
    /** The provider's name for its trash, for the "Moved to trash" toast. */
    storageBinName?: string
    /** Whether "Moved to trash" offers Undo: the provider can take a file back out of its trash. */
    canUndoTrash?: boolean
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
    onItemRemoved,
    storageBinName = 'Google Drive trash',
    canUndoTrash = false,
}: UseEngagementFileOpsOptions) {
    const { addToast } = useToast()
    const { send: sendWithConfirmation, dialog: privacyConfirmDialog } = useStageMove()

    // Rename state
    const [renameModalOpen, setRenameModalOpen] = useState(false)
    const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null)
    const [renameNewName, setRenameNewName] = useState('')
    const [renameExtension, setRenameExtension] = useState('')
    const [renameSubmitting, setRenameSubmitting] = useState(false)

    // Trash state
    const [trashConfirmTarget, setTrashConfirmTarget] = useState<DriveFile | null>(null)
    const [trashConfirming, setTrashConfirming] = useState(false)
    const trashDialogOpenTime = useRef<number>(0)

    // Copy/Move state: what the picker acts on — one item from its row menu, or the selection bar's selection
    const [copyMoveModalOpen, setCopyMoveModalOpen] = useState(false)
    const [copyMoveTargets, setCopyMoveTargets] = useState<DriveFile[]>([])
    const copyMoveTarget = copyMoveTargets[0] ?? null
    const setCopyMoveTarget = useCallback((doc: DriveFile | null) => setCopyMoveTargets(doc ? [doc] : []), [])
    const [copyMoveAction, setCopyMoveAction] = useState<'copy' | 'move'>('copy')
    const [copyMoveKeepBoth, setCopyMoveKeepBoth] = useState(true)
    const [currentPath, setCurrentPath] = useState<{ id: string; name: string }[]>([])
    const [destinationFolders, setDestinationFolders] = useState<DriveFile[]>([])
    const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null)
    const [loadingDestinations, setLoadingDestinations] = useState(false)
    /** Why the picker's folder list didn't load: no "No subfolders here", and no Move here, until it does (EM-7). */
    const [destinationsError, setDestinationsError] = useState<string | null>(null)
    const [copyMoveSubmittingFolderId, setCopyMoveSubmittingFolderId] = useState<string | null>(null)
    const [emptyFolderIds, setEmptyFolderIds] = useState<Set<string>>(new Set())
    /** Picker folders known to have subfolders: only these show an arrow, so none appears and then vanishes. */
    const [subfolderIds, setSubfolderIds] = useState<Set<string>>(new Set())
    const [checkingFolderId, setCheckingFolderId] = useState<string | null>(null)

    // Cross-engagement state
    const [crossEngagementModalOpen, setCrossEngagementModalOpen] = useState(false)
    const [crossEngagementTarget, setCrossEngagementTarget] = useState<DriveFile | null>(null)
    const [crossEngagementFirmName, setCrossEngagementFirmName] = useState<string | null>(null)
    const [crossEngagementEngagements, setCrossEngagementEngagements] = useState<{ id: string; name: string; clientId: string; clientName: string }[]>([])
    const [crossEngagementLoading, setCrossEngagementLoading] = useState(false)
    /** Why the engagement list didn't load, in place of "No other engagements available" (P1-46). */
    const [crossEngagementError, setCrossEngagementError] = useState<string | null>(null)
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
        try {
            const gateRes = await fetch(`/api/billing/document-gate?projectId=${encodeURIComponent(projectId)}&count=1`)
            if (gateRes.ok) {
                const gate = await gateRes.json()
                if (!gate.allowed) {
                    addToast({ type: 'error', title: 'Document limit reached', message: `Your plan limit of ${gate.cap} files has been reached (${gate.current} used). Delete any unused file or upgrade to remove the limit.`, duration: 12000 })
                    return
                }
            }
        } catch { /* fail-open */ }
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
            if (!res.ok) throw await failureFrom(res)
            addToast({ type: 'success', title: 'Duplicated', message: `${doc.name} duplicated with a unique name` })
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: 'Duplicate failed', message: failureReason(e) })
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

    // Undo on the "Moved to trash" toast: takes the item back out of the trash. The cleanup that
    // follows a trash waits a minute for this, so it comes back with its ID and comments
    // (.claude/plans/undo-move-to-bin.md).
    const undoTrash = useCallback(async (doc: DriveFile) => {
        if (!sessionRef.current?.access_token) return
        try {
            const res = await fetch('/api/drive-action', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'restore', fileId: doc.id, connectorId: doc.connectorId, projectId, fileName: doc.name })
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || 'Couldn’t restore it')
            }
            addToast({ type: 'success', title: 'Restored', message: `${doc.name} is back` })
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: 'Couldn’t undo', message: failureReason(e) })
        }
    }, [sessionRef, projectId, currentFolderIdRef, fetchFiles, addToast])

    // Step 2: called from the confirm dialog
    const handleTrashConfirmed = useCallback(async () => {
        if (!trashConfirmTarget || trashConfirming || !sessionRef.current?.access_token) return

        // Safety guard: Don't allow confirmation if dialog was opened less than 400ms ago
        if (Date.now() - trashDialogOpenTime.current < 400) return

        const doc = trashConfirmTarget
        setTrashConfirming(true)
        startProcessing(doc.id)
        const isLink = doc.documentType === 'LINK'
        try {
            const res = isLink
                ? await fetch(`/api/projects/${projectId}/documents/${doc.projectDocumentId ?? doc.id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: { Authorization: `Bearer ${sessionRef.current.access_token}` },
                })
                : await fetch('/api/drive-action', {
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
            if (!res.ok) throw await failureFrom(res)
            addToast(
                isLink
                    ? { type: 'success', title: 'Deleted', message: `${doc.name} was deleted` }
                    : {
                        type: 'success',
                        title: 'Moved to trash',
                        message: `${doc.name} moved to ${storageBinName}`,
                        ...(canUndoTrash && { duration: 10_000, action: { label: 'Undo', onClick: () => void undoTrash(doc) } }),
                    }
            )
            setTrashConfirmTarget(null)
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: isLink ? 'Delete failed' : 'Move to trash failed', message: failureReason(e) })
            setTrashConfirmTarget(null)
        } finally {
            setTrashConfirming(false)
            stopProcessing(doc.id)
        }
    }, [trashConfirmTarget, trashConfirming, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing, projectId, storageBinName, canUndoTrash, undoTrash])

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
        // A failed list throws its reason rather than reading as "no subfolders", which hid the folder's arrow.
        if (!r.ok) throw await failureFrom(r)
        const data = await r.json()
        const list = (data.files || []) as DriveFile[]
        return list.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder')
    }, [projectId])

    /**
     * The Move/Copy picker's look-ahead: each listed folder's own subfolders, fetched in the
     * background as a level loads, so a folder with none shows no arrow before anyone clicks it
     * (it used to take a click and a "No subfolders" toast), and opening one is instant.
     * Cleared each time the picker opens.
     */
    const childFoldersRef = useRef<Map<string, DriveFile[]>>(new Map())

    const lookAheadFolders = useCallback((folders: DriveFile[]) => {
        const knownEmpty = folders.filter((f) => childFoldersRef.current.get(f.id)?.length === 0).map((f) => f.id)
        if (knownEmpty.length) setEmptyFolderIds((prev) => new Set(Array.from(prev).concat(knownEmpty)))
        const knownSome = folders.filter((f) => (childFoldersRef.current.get(f.id)?.length ?? 0) > 0).map((f) => f.id)
        if (knownSome.length) setSubfolderIds((prev) => new Set(Array.from(prev).concat(knownSome)))
        const queue = folders.filter((f) => !childFoldersRef.current.has(f.id))
        // Four at a time: each one is a list call to the storage provider.
        const next = async (): Promise<void> => {
            const folder = queue.shift()
            if (!folder) return
            try {
                const children = await fetchFolderChildrenResult(folder.id)
                childFoldersRef.current.set(folder.id, children)
                if (children.length === 0) setEmptyFolderIds((prev) => new Set(prev).add(folder.id))
                else setSubfolderIds((prev) => new Set(prev).add(folder.id))
            } catch {
                // Unknown: the folder keeps its arrow and is checked when clicked.
            }
            return next()
        }
        for (let i = 0; i < 4; i++) void next()
    }, [fetchFolderChildrenResult])

    const fetchFolderChildren = useCallback((folderId: string) => {
        if (!sessionRef.current?.access_token) return
        const cached = childFoldersRef.current.get(folderId)
        if (cached) {
            setDestinationFolders(cached)
            lookAheadFolders(cached)
            return
        }
        setLoadingDestinations(true)
        setDestinationsError(null)
        fetchFolderChildrenResult(folderId)
            .then((folders) => {
                childFoldersRef.current.set(folderId, folders)
                setDestinationFolders(folders)
                lookAheadFolders(folders)
            })
            .catch((e) => {
                setDestinationFolders([])
                setDestinationsError(failureReason(e))
            })
            .finally(() => setLoadingDestinations(false))
    }, [fetchFolderChildrenResult, lookAheadFolders])

    /** The picker's Try again: the folder on screen, loaded afresh. */
    const retryDestinations = useCallback(() => {
        const segment = currentPath[currentPath.length - 1]
        if (!segment) return
        childFoldersRef.current.delete(segment.id)
        fetchFolderChildren(segment.id)
    }, [currentPath, fetchFolderChildren])

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
        const cached = childFoldersRef.current.get(folder.id)
        if (!cached) setCheckingFolderId(folder.id)
        try {
            const folders = cached ?? await fetchFolderChildrenResult(folder.id)
            childFoldersRef.current.set(folder.id, folders)
            if (folders.length === 0) {
                // Only when clicked before the look-ahead got to it.
                addToast({ type: 'info', title: 'No subfolders', message: 'This folder has no subfolders' })
                setEmptyFolderIds(prev => new Set(prev).add(folder.id))
                return
            }
            setSubfolderIds(prev => new Set(prev).add(folder.id))
            setSelectedDestinationId(folder.id)
            setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }])
            setDestinationsError(null)
            setDestinationFolders(folders)
            lookAheadFolders(folders)
        } catch (e) {
            addToast({ type: 'error', title: `Couldn't open ${folder.name}`, message: failureReason(e) })
        } finally {
            setCheckingFolderId(null)
        }
    }, [fetchFolderChildrenResult, lookAheadFolders, addToast])

    const handleCopyMoveToFolder = useCallback(async (destinationFolderId: string, sourceFileOverride?: DriveFile, actionOverride?: 'copy' | 'move') => {
        const targets = sourceFileOverride ? [sourceFileOverride] : copyMoveTargets
        const action = actionOverride || copyMoveAction

        const accessToken = sessionRef.current?.access_token
        if (!targets.length || !accessToken) return

        // Moving into the folder they're already in would change nothing, yet drop them from this list
        if (action === 'move' && destinationFolderId === currentFolderIdRef.current) {
            addToast({ type: 'info', title: 'Already here', message: targets.length === 1 ? `${targets[0].name} is already in this folder` : `These ${targets.length} items are already in this folder` })
            return
        }

        if (action === 'copy') {
            try {
                const gateRes = await fetch(`/api/billing/document-gate?projectId=${encodeURIComponent(projectId)}&count=${targets.length}`)
                if (gateRes.ok) {
                    const gate = await gateRes.json()
                    if (!gate.allowed) {
                        addToast({ type: 'error', title: 'Document limit reached', message: `Your plan limit of ${gate.cap} files has been reached (${gate.current} used). Delete any unused file or upgrade to remove the limit.`, duration: 12000 })
                        return
                    }
                }
            } catch { /* fail-open */ }
        }

        setCopyMoveSubmittingFolderId(destinationFolderId)
        targets.forEach((t) => startProcessing(t.id))
        const failed: { name: string; error: string }[] = []
        const copyOrMove = async (target: DriveFile) => {
            try {
                const res = await fetch('/api/connectors/google-drive/linked-files', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
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
                if (!res.ok) throw await failureFrom(res)
                if (action === 'move') onItemRemoved?.(target.id)
            } catch (e) {
                failed.push({ name: target.name, error: failureReason(e) })
            } finally {
                stopProcessing(target.id)
            }
        }
        // Three at a time: each one is a call to the storage provider
        const queue = [...targets]
        const work = async (): Promise<void> => {
            const next = queue.shift()
            if (!next) return
            await copyOrMove(next)
            return work()
        }
        await Promise.all(Array.from({ length: Math.min(3, targets.length) }, work))
        setCopyMoveSubmittingFolderId(null)

        const done = targets.length - failed.length
        const title = action === 'copy' ? 'Copied' : 'Moved'
        const verb = action === 'copy' ? 'copied' : 'moved'
        if (failed.length === 0) {
            addToast({ type: 'success', title, message: targets.length === 1 ? `${targets[0].name} ${verb} successfully` : `${targets.length} items ${verb}` })
        } else if (targets.length === 1) {
            addToast({ type: 'error', title: action === 'copy' ? 'Copy failed' : 'Move failed', message: failed[0].error })
        } else {
            addToast({ type: 'error', title: `${done} of ${targets.length} ${verb}`, message: `Couldn’t ${action} ${failed.map((f) => f.name).join(', ')}: ${failed[0].error}` })
        }
        // Nothing went: the picker stays open to try again or pick another folder
        if (done === 0) return
        setCopyMoveModalOpen(false)
        setCopyMoveTargets([])
        const currentFolderId = currentFolderIdRef.current
        if (currentFolderId) fetchFiles(currentFolderId, true)
    }, [copyMoveTargets, copyMoveAction, copyMoveKeepBoth, projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing, onItemRemoved])

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
            if (!res.ok) throw await failureFrom(res)
            const label = targetRoot === 'general' ? 'Restored to General' : targetRoot === 'confidential' ? 'Restricted to Confidential' : 'Promoted to General'
            addToast({ type: 'success', title: label, message: `${doc.name} moved successfully` })
            onItemRemoved?.(doc.id)
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: 'Move failed', message: failureReason(e) })
        } finally {
            stopProcessing(doc.id)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing, onItemRemoved])

    const openRenameModal = useCallback((doc: DriveFile) => {
        const hasNoExtension = doc.mimeType === 'application/vnd.google-apps.folder' || doc.documentType === 'LINK'
        const fullName = doc.name ?? ''
        setRenameTarget(doc)
        if (hasNoExtension) {
            setRenameNewName(fullName)
            setRenameExtension('')
        } else {
            const lastDot = fullName.lastIndexOf('.')
            if (lastDot > 0) {
                setRenameNewName(fullName.slice(0, lastDot))
                setRenameExtension(fullName.slice(lastDot))
            } else {
                setRenameNewName(fullName)
                setRenameExtension('')
            }
        }
        setRenameModalOpen(true)
    }, [])

    const handleConfirmRename = useCallback(() => {
        if (!renameTarget || !renameNewName.trim() || !sessionRef.current?.access_token) return
        const fileId = renameTarget.id
        const previousName = renameTarget.name ?? ''
        const newName = `${renameNewName.trim()}${renameExtension}`

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
            .then(async (res) => {
                if (!res.ok) throw await failureFrom(res)
                addToast({ type: 'success', title: 'Renamed', message: `"${previousName}" renamed to "${newName}"` })
            })
            .catch((e: unknown) => {
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: previousName } : f))
                addToast({ type: 'error', title: 'Rename failed', message: failureReason(e) })
            })
            .finally(() => {
                stopProcessing(fileId)
            })
    }, [renameTarget, renameNewName, renameExtension, projectId, addToast, startProcessing, stopProcessing, setFiles])

    const handlePrivacy = useCallback(async (file: DriveFile, makePrivate: boolean) => {
        const docId = file.projectDocumentId ?? file.id
        // Internal only documents don't count toward a deliverable's stage, so this can move it: asks first.
        // The route answers `warning` when part of it couldn't be done (someone still has access in
        // storage): read from a copy of the answer, which the confirmation step reads too.
        let warning: string | undefined
        const result = await sendWithConfirmation(async (confirm) => {
            const res = await fetch(`/api/projects/${projectId}/documents/${docId}/privacy`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${sessionRef.current?.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ private: makePrivate, ...(confirm ? { confirm: true } : {}) }),
            })
            if (res.ok) warning = (await bodyOf(res.clone())).warning
            return res
        })
        if (!result.ok) {
            if (result.cancelled) return
            addToast({ type: 'error', title: makePrivate ? 'Couldn’t make it internal only' : 'Couldn’t remove internal only', message: result.error })
            return
        }
        addToast(warning
            ? { type: 'warning', title: makePrivate ? `${file.name} is internal only, with a problem` : `${file.name} is no longer internal only, with a problem`, message: warning, duration: 12000 }
            : { type: 'success', title: makePrivate ? `${file.name} is now internal only` : `${file.name} is no longer internal only` })
        refreshShareStateAndFiles()
    }, [projectId, addToast, refreshShareStateAndFiles, sendWithConfirmation])

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
            if (!res.ok) throw await failureFrom(res)
            const d = await bodyOf(res)
            // Storage refused to give someone their edit access back: it stays locked, and says why.
            if (d.unlocked === false) {
                addToast({ type: 'warning', title: 'Still locked', message: d.warning || 'It stays locked until edit access is back. Try Unlock again.', duration: 12000 })
            } else {
                addToast({ type: 'success', title: 'Returned to Draft', message: `"${file.name}" is now editable.` })
            }
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: 'Return to draft failed', message: failureReason(e) })
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
            if (!res.ok) throw await failureFrom(res)
            const d = await bodyOf(res)
            addToast(d.warning
                ? { type: 'warning', title: 'Unshared, with a problem', message: d.warning, duration: 12000 }
                : { type: 'success', title: 'Unshared', message: `"${file.name}" is no longer shared outside the firm.` })
            const currentFolderId = currentFolderIdRef.current
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e) {
            addToast({ type: 'error', title: "Couldn't revoke access", message: failureReason(e) })
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
            // "Has been removed" only once it has: a trash the storage refused keeps the row (decision 6).
            if (res.ok) {
                addToast({ type: 'success', title: action === 'approve' ? 'File approved' : action === 'reject' ? 'File rejected' : 'Upload withdrawn', message: `"${file.name}" ${action === 'approve' ? 'is now available to all.' : 'has been removed.'}` })
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            } else {
                const d = await bodyOf(res)
                addToast({ type: 'error', title: INTAKE_FAILED[action], message: intakeRefusal(res.status, d.error) })
            }
        } catch (e) {
            addToast({ type: 'error', title: INTAKE_FAILED[action], message: failureReason(e) })
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
                const d = await bodyOf(res)
                addToast({ type: 'error', title: INTAKE_FAILED[action], message: intakeRefusal(res.status, d.error) })
            }
        } catch (e) {
            addToast({ type: 'error', title: INTAKE_FAILED[action], message: failureReason(e) })
        } finally {
            stopProcessing(file.id)
        }
    }, [projectId, currentFolderIdRef, fetchFiles, addToast, startProcessing, stopProcessing])

    /** Opens the Move/Copy picker for one item (its row menu) or several (the selection bar). */
    const openCopyMoveModal = useCallback((doc: DriveFile | DriveFile[], action: 'copy' | 'move') => {
        setCopyMoveTargets(Array.isArray(doc) ? doc : [doc])
        setCopyMoveAction(action)
        setCopyMoveKeepBoth(true)
        setDestinationsError(null)
        setEmptyFolderIds(new Set())
        setSubfolderIds(new Set())
        setCheckingFolderId(null)
        childFoldersRef.current = new Map()

        const rootId = currentFolderType === 'general' ? generalFolderId :
            currentFolderType === 'confidential' ? confidentialFolderId : stagingFolderId
        // The engagement's own top folder is "general" in Drive; users know it as the engagement root.
        const rootName = currentFolderType === 'general' ? ENGAGEMENT_ROOT_LABEL : currentFolderType.charAt(0).toUpperCase() + currentFolderType.slice(1)

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
        if (!sessionRef.current?.access_token) {
            setDestinationsError('Your session has ended. Sign in again, then retry.')
            return
        }
        // A failed root list says why, with Try again, instead of "No subfolders here" (EM-7).
        fetchFolderChildren(rootId)
    }, [generalFolderId, confidentialFolderId, stagingFolderId, currentFolderType, fetchFolderChildren])

    const openCrossEngagementModal = useCallback(async (doc: DriveFile) => {
        setCrossEngagementTarget(doc)
        setCrossEngagementSelectedId(null)
        setCrossEngagementFirmName(null)
        setCrossEngagementModalOpen(true)
        setCrossEngagementLoading(true)
        setCrossEngagementError(null)
        try {
            const res = await fetch(`/api/projects/${projectId}/engagements`, { credentials: 'include' })
            if (!res.ok) throw await failureFrom(res)
            const data = await res.json()
            setCrossEngagementFirmName(data.firmName ?? null)
            setCrossEngagementEngagements(
                ((data.engagements ?? []) as { id: string; name: string; clientId: string; clientName: string }[]).filter((e) => e.id !== projectId)
            )
        } catch (e) {
            // Never "No other engagements available" for a list that didn't load (P1-46).
            setCrossEngagementEngagements([])
            setCrossEngagementError(failureReason(e))
        } finally {
            setCrossEngagementLoading(false)
        }
    }, [projectId])

    const handleCrossEngagementSubmit = useCallback(async () => {
        if (!crossEngagementTarget || !crossEngagementSelectedId || !sessionRef.current?.access_token) return

        // Check cap on the target engagement (where the file will land)
        try {
            const gateRes = await fetch(`/api/billing/document-gate?projectId=${encodeURIComponent(crossEngagementSelectedId)}&count=1`)
            if (gateRes.ok) {
                const gate = await gateRes.json()
                if (!gate.allowed) {
                    addToast({ type: 'error', title: 'Document limit reached', message: `Your plan limit of ${gate.cap} files has been reached (${gate.current} used). Delete any unused file or upgrade to remove the limit.`, duration: 12000 })
                    return
                }
            }
        } catch { /* fail-open */ }

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
            const target = crossEngagementEngagements.find((e) => e.id === crossEngagementSelectedId)
            const where = target ? `to ${target.name}` : 'to the other engagement'
            const d = await bodyOf(res)
            if (!res.ok) {
                // OneDrive still copying after 30 seconds isn't a failure: its words say to look again.
                if (d.code === 'timed_out') {
                    addToast({ type: 'info', title: 'Copy still running', message: d.error, duration: 12000 })
                    setCrossEngagementModalOpen(false)
                    return
                }
                throw new Error(d.error || `The server answered ${res.status}. Try again.`)
            }
            // A folder: what copied, out of how many, and what didn't with why (FI-4, decision 1).
            const failed: NotDone[] = Array.isArray(d.failed) ? d.failed : []
            if (typeof d.filesTotal === 'number' && failed.length > 0) {
                addToast({
                    type: 'warning',
                    title: `Copied ${d.filesCopied} of ${d.filesTotal}`,
                    message: describeOutcome({ done: d.filesCopied, total: d.filesTotal, verb: 'Copied', noun: 'file', where, notDone: failed, notDoneLabel: 'Not copied' }),
                    duration: 15000,
                })
            } else {
                addToast({ type: 'success', title: 'Copied', message: `${crossEngagementTarget.name} copied ${where}.` })
            }
            setCrossEngagementModalOpen(false)
        } catch (e) {
            addToast({ type: 'error', title: 'Copy failed', message: failureReason(e) })
        } finally {
            setCrossEngagementSubmitting(false)
            stopProcessing(crossEngagementTarget.id)
        }
    }, [crossEngagementTarget, crossEngagementSelectedId, crossEngagementEngagements, projectId, addToast, startProcessing, stopProcessing])

    return {
        // Rename state
        renameModalOpen,
        setRenameModalOpen,
        renameTarget,
        setRenameTarget,
        renameNewName,
        setRenameNewName,
        renameExtension,
        setRenameExtension,
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
        copyMoveTargets,
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
        destinationsError,
        retryDestinations,
        copyMoveSubmittingFolderId,
        emptyFolderIds,
        subfolderIds,
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
        crossEngagementError,
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
        privacyConfirmDialog,
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
