import { useState, useRef } from 'react'
import { logger } from '@/lib/logger'
import { useUploadProgress, type UploadQueueItem } from '@/lib/upload-progress-context'
import { useToast } from '@/components/ui/toast'
import { DriveFile } from '@/lib/types'

const JUNK_FILE_NAMES = new Set(['.ds_store', 'desktop.ini', 'thumbs.db', '.trash', '.spotlight-v100', '.fseventsd'])
const isJunkFile = (name: string) => JUNK_FILE_NAMES.has(name.toLowerCase())

type Session = {
    access_token?: string
    user?: { id?: string; email?: string }
} | null

type ConflictItem = {
    file: File
    existingId: string
}

interface UseEngagementUploadOptions {
    sessionRef: React.RefObject<Session>
    projectId: string
    currentFolderIdRef: React.RefObject<string | null>
    files: DriveFile[]
    viewAsPersonaSlug: string | null | undefined
    restrictToSharedOnly: boolean
    isSandboxFirm: boolean
    fetchFiles: (folderId: string, silent?: boolean) => Promise<void>
}

export function useEngagementUpload({
    sessionRef,
    projectId,
    currentFolderIdRef,
    files,
    viewAsPersonaSlug,
    restrictToSharedOnly,
    isSandboxFirm,
    fetchFiles,
}: UseEngagementUploadOptions) {
    const {
        uploadQueue,
        isUploading,
        isUploadInitiating,
        isUploadModalOpen,
        dismissedRef: uploadOverlayDismissedRef,
        addToQueue,
        updateQueueItem,
        setIsUploading,
        setIsUploadInitiating,
        setIsUploadModalOpen,
        setShowFileLocationCallback,
        dismiss: dismissUploadPanel,
    } = useUploadProgress()
    const { addToast } = useToast()

    const [conflictItems, setConflictItems] = useState<ConflictItem[]>([])
    const [overwriteSelections, setOverwriteSelections] = useState<Set<string>>(new Set())
    const [uploadProgress, setUploadProgress] = useState(0)

    // Pre-flight document cap check — runs before any upload starts
    const checkDocumentCap = async (count: number): Promise<boolean> => {
        try {
            const res = await fetch(`/api/billing/document-gate?projectId=${encodeURIComponent(projectId)}&count=${count}`)
            if (!res.ok) return true // fail open on unexpected errors
            const payload = await res.json() as { allowed: boolean; cap: number | null; current: number | null; available: number }
            if (!payload.allowed) {
                const { cap, current, available } = payload
                const msg = count === 1
                    ? `Your plan limit of ${cap} files has been reached (${current} used). Delete any unused file or upgrade to remove the limit.`
                    : `This upload contains ${count} files, but your plan has a limit of ${cap}, with only ${available} slot${available !== 1 ? 's' : ''} left. Upload fewer files, within the available limit or upgrade to remove the limit.`
                addToast({ type: 'error', title: 'File limit reached', message: msg, duration: 12000 })
                return false
            }
        } catch {
            // fail open — server will enforce the hard cap on indexing
        }
        return true
    }

    // Core Upload Function (Direct to Drive)
    const uploadFile = async (
        file: File,
        fileIdToOverwrite?: string,
        rename = false,
        onProgress?: (p: number) => void,
        parentFolderId?: string,
        triggerIndexing = true
    ): Promise<{ success: boolean, error?: string, finalFile?: { name: string, id: string }, docIdRequestSettled?: Promise<void> }> => {
        // Use ref to avoid stale closure during batch processing
        const token = sessionRef.current?.access_token
        if (!token) return { success: false, error: 'No access token' }

        const currentFolderId = currentFolderIdRef.current

        try {
            // 1. Prepare Metadata
            let fileName = file.name
            if (rename) {
                const part = file.name.split('.')
                const ext = part.length > 1 ? `.${part.pop()}` : ''
                const name = part.join('.')
                fileName = `${name}_${Date.now()}${ext}`
            }

            // 2. Get Resumable Upload URL from our API
            const isExternalPersona = restrictToSharedOnly || viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer'
            const res = await fetch('/api/connectors/google-drive/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: fileName,
                    mimeType: file.type || 'application/octet-stream',
                    parentId: parentFolderId ?? currentFolderId ?? 'root',
                    fileId: fileIdToOverwrite,
                    // Always send projectId so backend can resolve the client-level connector;
                    // EC/EV uploads also get parentId overridden to generalFolderId server-side
                    ...(projectId ? { projectId } : {}),
                })
            })

            if (!res.ok) {
                const text = await res.text()
                let errMsg = 'Failed to initiate upload'
                try {
                    const d = JSON.parse(text)
                    errMsg = d.error || errMsg
                } catch { }
                logger.error('Init Upload Error:', new Error(text))
                return { success: false, error: errMsg }
            }

            const { uploadUrl } = await res.json()
            logger.debug('Got Resumable Upload URL:', uploadUrl)

            // 3. Direct Upload to Google Drive (XHR for progress)
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', uploadUrl, true)
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
                xhr.timeout = 5 * 60 * 1000 // 5 minutes for large files

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100
                        onProgress?.(percentComplete)
                    }
                }

                xhr.onload = () => {
                    if (xhr.status === 200 || xhr.status === 201) {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            const finalFile = { name: data.name, id: data.id }

                            // POST /index-file does TWO separate things server-side, and only the
                            // FIRST is fast:
                            //   1. ensureDocIdEarly() — synchronous DB upsert + atomic counter
                            //      increment, assigns `docId` before this POST's response returns.
                            //   2. IndexingInterceptor.index{Single,Batch} — just enqueues an
                            //      Inngest event and returns immediately; it does NOT wait for the
                            //      Inngest job (Drive metadata fetch, PDF/Office text extraction,
                            //      embeddings) to actually run. That job can take seconds and must
                            //      stay fully async — never block the UI on it.
                            // So awaiting this fetch's response only waits on (1)+enqueue, which is
                            // cheap regardless of file count. `docIdRequestSettled` name is chosen
                            // deliberately over something like "indexingDone" — the Inngest indexing
                            // job is NOT done when this resolves, only the docId assignment is.
                            // Callers await this before their post-upload fetchFiles() so the Files
                            // list shows the real docId immediately instead of "—" until a manual
                            // refresh (see conversation/PR notes on the docId race fix).
                            let docIdRequestSettled: Promise<void> | undefined
                            if (triggerIndexing) {
                                docIdRequestSettled = fetch(`/api/projects/${projectId}/index-file`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        externalId: finalFile.id,
                                        fileName: finalFile.name
                                    })
                                }).then(() => undefined).catch(e => logger.error('Failed to trigger indexing', e))
                            }

                            // For EC/EV uploads: call index-file-intake to set PENDING lock and notify ELs
                            if (isExternalPersona && projectId) {
                                fetch(`/api/projects/${projectId}/documents/${finalFile.id}/index-file-intake`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json',
                                    },
                                    credentials: 'include',
                                }).catch(e => logger.error('Failed to trigger intake indexing', e))
                            }

                            resolve({ success: true, finalFile, docIdRequestSettled })
                        } catch (e) {
                            logger.warn('Failed to parse upload response', { error: e })
                            resolve({ success: true })
                        }
                    } else {
                        logger.error('Drive Upload Error', new Error(`Status: ${xhr.status}, Response: ${xhr.responseText}`))
                        resolve({ success: false, error: `Upload failed: ${xhr.status}` })
                    }
                }

                xhr.onerror = () => {
                    logger.error('Network Error during upload', new Error(xhr.statusText))
                    resolve({ success: false, error: 'Network interruption. Please check connection.' })
                }

                xhr.ontimeout = () => {
                    logger.error('Upload timeout', new Error('Request timed out'))
                    resolve({ success: false, error: 'Upload timed out. Try again or use a smaller batch.' })
                }

                xhr.send(file)
            })

        } catch (err: any) {
            logger.error('Upload Exception:', err)
            return { success: false, error: err.message }
        }
    }

    // Batch Resolution Handler
    const handleBatchResolution = async () => {
        const remainingToProcess = [...conflictItems]
        setConflictItems([]) // Close dialog

        // Add conflicting items to queue
        const newQueueItems: UploadQueueItem[] = remainingToProcess.map(item => ({
            id: `upload-${Date.now()}-${Math.random()}`,
            file: item.file,
            progress: 0,
            status: 'pending'
        }))

        // Map file to queue ID
        const fileToQueueId = new Map<File, string>()
        remainingToProcess.forEach((item, idx) => {
            fileToQueueId.set(item.file, newQueueItems[idx].id)
        })

        addToQueue(newQueueItems)
        setIsUploading(true)
        setIsUploadModalOpen(true)

        const isRetryableError = (err?: string) =>
            err && (err.includes('Network interruption') || err.includes('timed out'))
        const maxAttemptsPerFile = 2
        let completedCount = 0
        let errorCount = 0

        const successfullyUploaded: { externalId: string, fileName: string }[] = []
        for (const item of remainingToProcess) {
            const queueId = fileToQueueId.get(item.file)!
            updateQueueItem(queueId, { status: 'uploading' })

            const updateProgress = (p: number) => {
                updateQueueItem(queueId, { progress: p })
            }

            let result: { success: boolean; error?: string, finalFile?: { name: string, id: string } }
            if (overwriteSelections.has(item.file.name)) {
                result = await uploadFile(item.file, item.existingId, false, updateProgress, undefined, false)
            } else {
                result = await uploadFile(item.file, undefined, true, updateProgress, undefined, false)
            }
            let attempts = 1
            while (!result.success && isRetryableError(result.error) && attempts < maxAttemptsPerFile) {
                attempts++
                logger.warn(`Retrying upload "${item.file.name}" (attempt ${attempts}/${maxAttemptsPerFile})`)
                updateQueueItem(queueId, { progress: 0 })
                await new Promise(r => setTimeout(r, 1500))
                if (overwriteSelections.has(item.file.name)) {
                    result = await uploadFile(item.file, item.existingId, false, updateProgress, undefined, false)
                } else {
                    result = await uploadFile(item.file, undefined, true, updateProgress, undefined, false)
                }
            }

            if (!result.success) {
                updateQueueItem(queueId, { status: 'error', error: result.error })
                errorCount++
            } else {
                if (result.finalFile) {
                    successfullyUploaded.push({
                        externalId: result.finalFile.id,
                        fileName: result.finalFile.name
                    })
                }
                updateQueueItem(queueId, { status: 'completed', progress: 100 })
                completedCount++
            }
        }

        // One batch POST for all files (not one per file) — server assigns every file's docId
        // synchronously (ensureDocIdEarly, fanned out via Promise.all) and enqueues one Inngest
        // batch-indexing event, then returns. Awaiting this response does NOT wait for the
        // Inngest job (embeddings/summaries) to run — see docIdRequestSettled comment in
        // uploadFile above for the full explanation of why that split matters.
        if (successfullyUploaded.length > 0) {
            await fetch(`/api/projects/${projectId}/index-file`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionRef.current?.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: successfullyUploaded
                })
            }).catch(e => logger.error('Failed to trigger batch indexing', e))
        }

        // Reset selections
        setOverwriteSelections(new Set())

        // Refresh — safe to call now: every file above either has its docId already
        // (awaited above) or failed upload entirely (never got a docId to wait for).
        const currentFolderId = currentFolderIdRef.current
        if (currentFolderId) fetchFiles(currentFolderId, true)
        setIsUploading(false)
        if (uploadOverlayDismissedRef.current && (completedCount > 0 || errorCount > 0)) {
            const total = completedCount + errorCount
            if (errorCount === 0) {
                addToast({ type: 'success', title: 'Upload complete', message: `${completedCount} file${completedCount !== 1 ? 's' : ''} added.` })
            } else {
                addToast({ type: 'info', title: 'Upload finished', message: `${completedCount} of ${total} files added. ${errorCount} failed.` })
            }
            uploadOverlayDismissedRef.current = false
        }
    }

    const cancelBatchResolution = () => {
        setConflictItems([])
        setOverwriteSelections(new Set())
        setIsUploading(false)
    }

    // Queue Processor
    const processUploads = async (fileList: FileList) => {
        const totalFiles = fileList.length
        const capAllowed = await checkDocumentCap(totalFiles)
        if (!capAllowed) return

        setIsUploading(true)
        setIsUploadModalOpen(true)

        try {
            const uploads = Array.from(fileList).filter(f => !isJunkFile(f.name))
            const conflicts: ConflictItem[] = []
            const safeUploads: File[] = []

            // 1. Classify
            for (const file of uploads) {
                const existing = files.find(f => f.name === file.name && f.mimeType !== 'application/vnd.google-apps.folder')
                if (existing) {
                    conflicts.push({ file, existingId: existing.id })
                } else {
                    safeUploads.push(file)
                }
            }

            // 2. Prepare Safe Uploads Queue
            const newQueueItems: UploadQueueItem[] = safeUploads.map(file => ({
                id: `upload-${Date.now()}-${Math.random()}`,
                file: file,
                progress: 0,
                status: 'pending'
            }))

            addToQueue(newQueueItems)

            // If we have conflicts, show dialog
            if (conflicts.length > 0) {
                setConflictItems(conflicts)
            }

            // 3. Process Safe Uploads
            let completedCount = 0
            let errorCount = 0
            if (safeUploads.length > 0) {
                // Map file to queue ID
                const fileToQueueId = new Map<File, string>()
                safeUploads.forEach((file, idx) => {
                    fileToQueueId.set(file, newQueueItems[idx].id)
                })

                const isRetryableError = (err?: string) =>
                    err && (err.includes('Network interruption') || err.includes('timed out'))
                const maxAttemptsPerFile = 2
                // Collected per-file below, then awaited once before fetchFiles() so the Files
                // list's refetch sees every uploaded file's docId. NOT a wait for full search
                // indexing (embeddings/summaries) — see docIdRequestSettled comment in uploadFile.
                const pendingDocIdRequests: Promise<void>[] = []

                for (const file of safeUploads) {
                    const queueId = fileToQueueId.get(file)!
                    updateQueueItem(queueId, { status: 'uploading' })

                    let result = await uploadFile(file, undefined, false, (p) => {
                        updateQueueItem(queueId, { progress: p })
                    })
                    let attempts = 1

                    while (!result.success && isRetryableError(result.error) && attempts < maxAttemptsPerFile) {
                        attempts++
                        logger.warn(`Retrying upload "${file.name}" (attempt ${attempts}/${maxAttemptsPerFile})`)
                        updateQueueItem(queueId, { progress: 0 })
                        await new Promise(r => setTimeout(r, 1500))
                        result = await uploadFile(file, undefined, false, (p) => {
                            updateQueueItem(queueId, { progress: p })
                        })
                    }

                    if (!result.success) {
                        updateQueueItem(queueId, { status: 'error', error: result.error })
                        errorCount++
                    } else {
                        updateQueueItem(queueId, { status: 'completed', progress: 100 })
                        completedCount++
                        if (result.docIdRequestSettled) pendingDocIdRequests.push(result.docIdRequestSettled)
                    }
                }

                await Promise.all(pendingDocIdRequests)
                const currentFolderId = currentFolderIdRef.current
                if (currentFolderId) fetchFiles(currentFolderId, true)
            }
            setIsUploading(false)
            if (uploadOverlayDismissedRef.current && (completedCount > 0 || errorCount > 0)) {
                const total = completedCount + errorCount
                if (errorCount === 0) {
                    addToast({ type: 'success', title: 'Upload complete', message: `${completedCount} file${completedCount !== 1 ? 's' : ''} added.` })
                } else {
                    addToast({ type: 'info', title: 'Upload finished', message: `${completedCount} of ${total} files added. ${errorCount} failed.` })
                }
                uploadOverlayDismissedRef.current = false
            }

        } catch (e: any) {
            logger.error(e)
            setIsUploading(false)
        }
    }

    // Build folder path -> parent path for ordering. '' = root.
    const getFolderPathsFromFileList = (fileList: FileList): string[] => {
        const dirs = new Set<string>()
        for (let i = 0; i < fileList.length; i++) {
            const rel = (fileList[i] as File & { webkitRelativePath?: string }).webkitRelativePath || ''
            const parts = rel.split('/')
            for (let j = 1; j < parts.length; j++) {
                dirs.add(parts.slice(0, j).join('/'))
            }
        }
        return Array.from(dirs).sort((a, b) => {
            const ad = (a.match(/\//g) || []).length
            const bd = (b.match(/\//g) || []).length
            if (ad !== bd) return ad - bd
            return a.localeCompare(b)
        })
    }

    const processFolderUpload = async (fileList: FileList) => {
        // Count only actual files (entries with a filename), not directory entries
        const totalFiles = Array.from(fileList).filter(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
            const parts = rel.split('/')
            return parts[parts.length - 1] !== ''
        }).length
        const capAllowed = await checkDocumentCap(totalFiles)
        if (!capAllowed) return

        const currentFolderId = currentFolderIdRef.current
        if (!sessionRef.current?.access_token || !currentFolderId) return
        const token = sessionRef.current.access_token
        const rootId = currentFolderId
        const pathToFolderId = new Map<string, string>()
        pathToFolderId.set('', rootId)

        setIsUploadInitiating(true)
        setIsUploadModalOpen(true)

        const folderPaths = getFolderPathsFromFileList(fileList)
        for (const path of folderPaths) {
            const parts = path.split('/')
            const name = parts[parts.length - 1]
            const parentPath = parts.length === 1 ? '' : parts.slice(0, -1).join('/')
            const parentId = pathToFolderId.get(parentPath)!
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'create-folder',
                    folderId: parentId,
                    name,
                    mimeType: 'application/vnd.google-apps.folder',
                    projectId
                })
            })
            if (!res.ok) {
                const data = await res.json()
                const errorMessage = data.error || 'Failed to create folder'
                logger.error(errorMessage, new Error(errorMessage))
                setIsUploadInitiating(false)
                return
            }
            const data = await res.json()
            pathToFolderId.set(path, data.id)
        }

        const fileItems = Array.from(fileList).filter(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
            const parts = rel.split('/')
            const fileName = parts[parts.length - 1]
            return parts.length >= 1 && fileName !== '' && !isJunkFile(fileName)
        })
        const fileEntries = fileItems.map(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
            const parts = rel.split('/')
            const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
            return { file: f, dirPath }
        })

        setIsUploading(true)
        setIsUploadInitiating(false)
        const newQueueItems: UploadQueueItem[] = fileEntries.map(({ file }) => ({
            id: `upload-${Date.now()}-${Math.random()}`,
            file,
            progress: 0,
            status: 'pending'
        }))
        addToQueue(newQueueItems)
        const fileToQueueId = new Map<File, string>()
        fileEntries.forEach((_, idx) => fileToQueueId.set(fileEntries[idx].file, newQueueItems[idx].id))

        uploadOverlayDismissedRef.current = false
        const successfullyUploaded: { externalId: string, fileName: string }[] = []
        let completedCount = 0
        let errorCount = 0
        for (const { file, dirPath } of fileEntries) {
            const queueId = fileToQueueId.get(file)!
            const parentId = pathToFolderId.get(dirPath) ?? rootId
            updateQueueItem(queueId, { status: 'uploading' })
            const result = await uploadFile(file, undefined, false, (p) => updateQueueItem(queueId, { progress: p }), parentId, false)
            if (!result.success) {
                updateQueueItem(queueId, { status: 'error', error: result.error })
                errorCount++
            } else {
                if (result.finalFile) {
                    successfullyUploaded.push({
                        externalId: result.finalFile.id,
                        fileName: result.finalFile.name
                    })
                }
                updateQueueItem(queueId, { status: 'completed', progress: 100 })
                completedCount++
            }
        }

        // One batch POST regardless of file count (e.g. a 100-file folder upload is still a
        // single request here) — server assigns every file's docId synchronously and enqueues
        // one Inngest batch-indexing event, then returns; this does NOT wait for the Inngest
        // job itself. See docIdRequestSettled comment in uploadFile above for why that split
        // is what keeps this scalable to large folder uploads.
        if (successfullyUploaded.length > 0) {
            logger.debug(`Triggering batch indexing for ${successfullyUploaded.length} files...`)
            await fetch(`/api/projects/${projectId}/index-file`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: successfullyUploaded
                })
            }).catch(e => logger.error('Failed to trigger batch indexing', e))
        }
        // Safe to refetch now — every uploaded file's docId was assigned as part of the
        // batch POST above (awaited), independent of file count.
        const latestFolderId = currentFolderIdRef.current
        if (latestFolderId) fetchFiles(latestFolderId, true)
        setIsUploading(false)
        if (uploadOverlayDismissedRef.current) {
            const total = fileEntries.length
            if (errorCount === 0) {
                addToast({ type: 'success', title: 'Upload complete', message: `${completedCount} file${completedCount !== 1 ? 's' : ''} added.` })
            } else {
                addToast({ type: 'info', title: 'Upload finished', message: `${completedCount} of ${total} files added. ${errorCount} failed.` })
            }
            uploadOverlayDismissedRef.current = false
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileInputRef: React.RefObject<HTMLInputElement | null>) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0) return
        await processUploads(fileList)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>, folderInputRef: React.RefObject<HTMLInputElement | null>) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0) return
        await processFolderUpload(fileList)
        if (folderInputRef.current) folderInputRef.current.value = ''
    }

    return {
        // State
        conflictItems,
        overwriteSelections,
        uploadProgress,
        // Upload progress context
        uploadQueue,
        isUploading,
        isUploadInitiating,
        isUploadModalOpen,
        uploadOverlayDismissedRef,
        dismissUploadPanel,
        setShowFileLocationCallback,
        // Handlers
        uploadFile,
        processUploads,
        handleBatchResolution,
        cancelBatchResolution,
        processFolderUpload,
        handleFileUpload,
        handleFolderUpload,
        setConflictItems,
        setOverwriteSelections,
        setUploadProgress,
    }
}
