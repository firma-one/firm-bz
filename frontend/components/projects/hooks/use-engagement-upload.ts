import { useState, useRef, useEffect } from 'react'
import { logger } from '@/lib/logger'
import { useUploadProgress, type UploadQueueItem } from '@/lib/upload-progress-context'
import { useToast } from '@/components/ui/toast'
import { DriveFile } from '@/lib/types'
import { reasonFor, storageFailure, type StorageProvider } from '@/lib/connectors/storage-failure'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { describeNotDone } from '@/lib/files/partial-outcome'
import { formatFileSize } from '@/lib/utils'
import { BRAND_NAME } from '@/config/brand'

const JUNK_FILE_NAMES = new Set(['.ds_store', 'desktop.ini', 'thumbs.db', '.trash', '.spotlight-v100', '.fseventsd'])
const isJunkFile = (name: string) => JUNK_FILE_NAMES.has(name.toLowerCase())

// Microsoft Graph upload-session limits (learn.microsoft.com/graph/api/driveitem-createuploadsession):
// each PUT must carry a Content-Range header (even a single PUT covering the whole file) and is
// capped at 60 MiB; chunk sizes should be a multiple of 320 KiB. No Authorization header on the
// PUT — the session URL itself is pre-authorized, same as Google's resumable session URL.
const ONEDRIVE_CHUNK_SIZE = 60 * 1024 * 1024 - (60 * 1024 * 1024 % (320 * 1024)) // largest 320 KiB multiple <= 60 MiB

// Waits before each automatic retry of a file whose upload failed for a passing reason (a dropped
// connection, a timeout, a 5xx or 429): three tries in all before the file shows as failed.
const RETRY_DELAYS_MS = [1500, 4000]

const CONNECTION_DROPPED_BEFORE = 'Connection dropped before the upload started.'
const CONNECTION_DROPPED_DURING = 'Connection dropped during the upload.'
const SIGNED_OUT = 'Your session has ended. Sign in again, then retry.'

/** Google Drive takes a file in one PUT, given this long. */
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000

/** A Google Drive upload that ran out of time: the size is the likely cause, and retrying hits the same limit. */
export function timedOutWords(size: number): string {
    return `Timed out after 5 minutes · At ${formatFileSize(size)} it may be too large for this connection. Try again on a faster one, or upload it in Google Drive itself.`
}

/**
 * The storage's refusal of an upload, in words: "OneDrive has this locked…", "…out of storage
 * space…", not "Upload failed: 423" (P1-49). Graph answers `{ error: { code, message } }`; Drive,
 * `{ error: { message, errors: [{ reason }] } }`.
 */
export function uploadRefusal(status: number, body: string, provider: StorageProvider): string {
    let code: string | undefined
    let message: string | undefined
    try {
        const j = JSON.parse(body) as { error?: { code?: unknown; message?: string; errors?: { reason?: string }[] } }
        code = j.error?.errors?.[0]?.reason ?? (typeof j.error?.code === 'string' ? j.error.code : undefined)
        message = j.error?.message
    } catch { /* not JSON: the status says enough */ }
    return storageFailure(reasonFor(status, code, message), provider, message ?? `HTTP ${status}`).message
}

/** What Firma said about a file that reached storage: added (or sent for review), or why not. */
type IndexOutcome = { ok: true } | { ok: false; reason: string }

/** Firma's answer to an index or intake request, read: the server's words, or that it never got there. */
async function indexAnswer(res: Response): Promise<IndexOutcome> {
    if (res.ok) return { ok: true }
    const said = (await failureFrom(res)).message
    // index-file-intake answers its plan limit and its other failures as a bare 500.
    return { ok: false, reason: /^internal server error$/i.test(said) ? 'Something went wrong on our side. Try again.' : said }
}

/** A response worth trying again: the server or Drive was briefly unavailable or busy. */
const isTransientStatus = (status: number) => status >= 500 || status === 429

/**
 * fetch() rejects with a TypeError when no response arrives at all — the connection dropped.
 * Browsers word it differently: "Failed to fetch" (Chrome), "Load failed" (Safari),
 * "NetworkError when attempting to fetch resource." (Firefox).
 */
const isConnectionError = (e: unknown) =>
    e instanceof TypeError && /fetch|load failed|network/i.test(e.message)

type UploadResult = {
    success: boolean
    error?: string
    /** The failure may pass on its own, so the file is tried again before it shows as failed. */
    retryable?: boolean
    finalFile?: { name: string; id: string }
    /**
     * Firma's answer about the file, when this upload told Firma itself (one file at a time, or a
     * Limited Access contributor's or Reviewer's intake). The bytes being in storage isn't the file
     * being in Firma: until this answers ok, the row isn't done (FI-1, FI-2).
     */
    indexed?: Promise<IndexOutcome>
}

/**
 * Upload a file to a Microsoft Graph upload session in Content-Range-addressed chunks.
 * Returns the same shape uploadFile's Google-Drive XHR path returns, via onUploadResponse
 * for the final chunk's response body (a driveItem with {id, name} — same shape as
 * Google's response, so the shared indexing/intake side effects can be reused as-is).
 */
async function uploadFileToOneDriveSession(
    uploadUrl: string,
    file: File,
    onProgress: ((p: number) => void) | undefined,
    onUploadResponse: (rawResponseText: string) => UploadResult
): Promise<UploadResult> {
    const totalSize = file.size
    let offset = 0

    try {
        do {
            const chunkEnd = Math.min(offset + ONEDRIVE_CHUNK_SIZE, totalSize)
            const chunk = file.slice(offset, chunkEnd)
            const isFinalChunk = chunkEnd >= totalSize

            const res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Length': String(chunkEnd - offset),
                    'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${totalSize}`,
                },
                body: chunk,
            })

            if (!res.ok && res.status !== 202) {
                const text = await res.text().catch(() => '')
                logger.error('OneDrive chunk upload error', new Error(`Status: ${res.status}, Response: ${text}`))
                return { success: false, error: uploadRefusal(res.status, text, 'OneDrive'), retryable: isTransientStatus(res.status) }
            }

            offset = chunkEnd
            onProgress?.((offset / Math.max(totalSize, 1)) * 100)

            if (isFinalChunk) {
                const text = await res.text().catch(() => '')
                return onUploadResponse(text)
            }
            // 202 Accepted (intermediate chunk) — loop continues to the next chunk.
        } while (offset < totalSize)
        return { success: false, error: 'Upload did not complete' }
    } catch (e) {
        logger.error('Network Error during OneDrive upload', e instanceof Error ? e : new Error(String(e)))
        return { success: false, error: CONNECTION_DROPPED_DURING, retryable: true }
    }
}

type Session = {
    access_token?: string
    user?: { id?: string; email?: string }
} | null

type ConflictItem = {
    file: File
    existingId: string
    /** Set when the file was dropped on a folder row: the folder it uploads into, not the open one. */
    parentFolderId?: string
}

interface UseEngagementUploadOptions {
    sessionRef: React.RefObject<Session>
    projectId: string
    currentFolderIdRef: React.RefObject<string | null>
    files: DriveFile[]
    viewAsPersonaSlug: string | null | undefined
    restrictToSharedOnly: boolean
    fetchFiles: (folderId: string, silent?: boolean) => Promise<void>
}

export function useEngagementUpload({
    sessionRef,
    projectId,
    currentFolderIdRef,
    files,
    viewAsPersonaSlug,
    restrictToSharedOnly,
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
        setRetryCallback,
        dismiss: dismissUploadPanel,
    } = useUploadProgress()
    const { addToast } = useToast()

    // EC/EV submit through index-file-intake, which creates the EngagementDocument AND a PENDING
    // sharing row without enqueuing Inngest — their uploads stay invisible to the engagement
    // until an engagement lead approves the intake. So they must NOT call index-file, which
    // indexes immediately. eng_member is deliberately not external: contributors upload and
    // index straight away, no approval step. index-file also rejects external roles server-side;
    // this skip just avoids firing a request that is designed to fail.
    const isExternalPersona =
        restrictToSharedOnly || viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer'

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

    /** Telling Firma about files that reached storage: one request for one file or a batch. */
    const requestIndex = (files: { externalId: string; fileName: string }[]): Promise<IndexOutcome> =>
        fetch(`/api/projects/${projectId}/index-file`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionRef.current?.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(files.length === 1 ? files[0] : { files }),
        }).then(indexAnswer, (e) => {
            logger.error('Failed to trigger indexing', e)
            return { ok: false as const, reason: failureReason(e) }
        })

    /** A Limited Access contributor's or Reviewer's upload: into the Leads' review queue, not indexed yet. */
    const requestIntake = (externalId: string): Promise<IndexOutcome> =>
        fetch(`/api/projects/${projectId}/documents/${externalId}/index-file-intake`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionRef.current?.access_token}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        }).then(indexAnswer, (e) => {
            logger.error('Failed to trigger intake indexing', e)
            return { ok: false as const, reason: failureReason(e) }
        })

    // Core Upload Function (Direct to Drive)
    const uploadFile = async (
        file: File,
        fileIdToOverwrite?: string,
        rename = false,
        onProgress?: (p: number) => void,
        parentFolderId?: string,
        triggerIndexing = true
    ): Promise<UploadResult> => {
        // Use ref to avoid stale closure during batch processing
        const token = sessionRef.current?.access_token
        if (!token) return { success: false, error: SIGNED_OUT }

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
                // The route's words: the storage's reason for not starting, or ours (P2-14).
                const failure = await failureFrom(res)
                logger.error('Init Upload Error:', failure)
                return { success: false, error: failure.message, retryable: isTransientStatus(res.status) }
            }

            const { uploadUrl, provider } = await res.json()
            logger.debug('Got Resumable Upload URL:', uploadUrl)

            // Shared "upload finished" handling — same for both providers, since Google's
            // resumable-upload response and Graph's final-chunk response both return the
            // created/updated item's {id, name} directly in the response body.
            const onUploadResponse = (rawResponseText: string): UploadResult => {
                let finalFile: { name: string; id: string }
                try {
                    const data = JSON.parse(rawResponseText)
                    finalFile = { name: data.name, id: data.id }
                } catch (e) {
                    logger.warn('Failed to parse upload response', { error: e })
                    // In storage, but with no id Firma can't add it: not a success to show as one.
                    return {
                        success: true,
                        indexed: Promise.resolve({ ok: false, reason: "The storage didn't say what it saved. Refresh the list to see whether it's there." }),
                    }
                }

                // POST /index-file assigns the docId synchronously and enqueues the Inngest
                // indexing job (embeddings, summaries), then answers. Its answer is read: a 403
                // (plan limit), a 500 or a dropped connection leaves a file in storage that isn't
                // in Firma, which must show on its row with a Retry (FI-1). The Inngest job is
                // still not awaited, only the docId and the enqueue.
                // Limited Access contributors and Reviewers go through index-file-intake, which puts
                // the file in the Leads' review queue; its answer is read too (FI-2).
                let indexed: Promise<IndexOutcome> | undefined
                if (isExternalPersona && projectId) indexed = requestIntake(finalFile.id)
                else if (triggerIndexing) indexed = requestIndex([{ externalId: finalFile.id, fileName: finalFile.name }])

                return { success: true, finalFile, indexed }
            }

            if (provider === 'onedrive') {
                // 3a. Direct upload to Microsoft Graph — chunked PUTs with Content-Range,
                // required by Graph's upload-session protocol (unlike Google's single-body PUT;
                // see MS Learn "Upload large files with an upload session"). Each chunk is capped
                // at 60 MiB (Graph's hard per-request limit) and sized as a multiple of 320 KiB.
                return await uploadFileToOneDriveSession(uploadUrl, file, onProgress, onUploadResponse)
            }

            // 3b. Direct Upload to Google Drive (XHR for progress) — single whole-body PUT.
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', uploadUrl, true)
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
                xhr.timeout = UPLOAD_TIMEOUT_MS

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100
                        onProgress?.(percentComplete)
                    }
                }

                xhr.onload = () => {
                    if (xhr.status === 200 || xhr.status === 201) {
                        resolve(onUploadResponse(xhr.responseText))
                    } else {
                        logger.error('Drive Upload Error', new Error(`Status: ${xhr.status}, Response: ${xhr.responseText}`))
                        resolve({ success: false, error: uploadRefusal(xhr.status, xhr.responseText, 'Google Drive'), retryable: isTransientStatus(xhr.status) })
                    }
                }

                xhr.onerror = () => {
                    logger.error('Network Error during upload', new Error(xhr.statusText))
                    resolve({ success: false, error: CONNECTION_DROPPED_DURING, retryable: true })
                }

                xhr.ontimeout = () => {
                    logger.error('Upload timeout', new Error('Request timed out'))
                    // Trying again hits the same limit, so it isn't retried on its own; the size is why (P1-50).
                    resolve({ success: false, error: timedOutWords(file.size), retryable: false })
                }

                xhr.send(file)
            })

        } catch (err: any) {
            logger.error('Upload Exception:', err)
            // Asking our server for the upload link got no response at all.
            if (isConnectionError(err)) return { success: false, error: CONNECTION_DROPPED_BEFORE, retryable: true }
            return { success: false, error: failureReason(err) }
        }
    }

    /** One queue row's upload, tried again after a passing failure. Progress lands on the row. */
    const uploadWithRetry = async (item: UploadQueueItem, triggerIndexing: boolean): Promise<UploadResult> => {
        const { overwriteId, rename = false, parentFolderId } = item.target ?? {}
        const attempt = () => uploadFile(item.file, overwriteId, rename, (p) => updateQueueItem(item.id, { progress: p }), parentFolderId, triggerIndexing)
        let result = await attempt()
        for (let i = 0; !result.success && result.retryable && i < RETRY_DELAYS_MS.length; i++) {
            logger.warn(`Retrying upload "${item.file.name}" (attempt ${i + 2}/${RETRY_DELAYS_MS.length + 1}): ${result.error}`)
            updateQueueItem(item.id, { progress: 0 })
            await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]))
            result = await attempt()
        }
        return result
    }

    /**
     * Rows whose bytes reached storage but that Firma didn't take (index-file or index-file-intake
     * refused, or never answered): their Retry tells Firma again, rather than uploading a second copy.
     */
    const notIndexedRef = useRef(new Map<string, { externalId: string; fileName: string }>())

    /** The row's words when the file is in storage but not in Firma. */
    const notAddedWords = (reason: string) => isExternalPersona
        ? `Uploaded, but not sent for review · ${reason}`
        : `In storage, but not added to ${BRAND_NAME} · ${reason}`

    type IndexSettled = { item: UploadQueueItem; failed: UploadQueueItem | null }

    /** Marks a row by Firma's answer about its file: done, or failed with why (and remembered for Retry). */
    const settleIndexed = (item: UploadQueueItem, file: { externalId: string; fileName: string } | undefined, outcome: IndexOutcome): IndexSettled => {
        if (outcome.ok) {
            notIndexedRef.current.delete(item.id)
            updateQueueItem(item.id, { status: 'completed', progress: 100, error: undefined })
            return { item, failed: null }
        }
        if (file) notIndexedRef.current.set(item.id, file)
        const error = notAddedWords(outcome.reason)
        updateQueueItem(item.id, { status: 'error', error, progress: 100 })
        return { item, failed: { ...item, status: 'error', error } }
    }

    type QueueOutcome = {
        /** Every row in the run. */
        items: UploadQueueItem[]
        /** In storage, still to be told to Firma (runs that index in one batch at the end). */
        uploaded: { item: UploadQueueItem; externalId: string; fileName: string }[]
        /** Firma's answers about files told one at a time, each marking its row as it lands. */
        indexing: Promise<IndexSettled>[]
        failed: UploadQueueItem[]
    }

    /** Uploads queue rows one after another, marking each completed or failed. */
    const runQueue = async (items: UploadQueueItem[], triggerIndexing: boolean): Promise<QueueOutcome> => {
        const outcome: QueueOutcome = { items, uploaded: [], indexing: [], failed: [] }
        for (const item of items) {
            updateQueueItem(item.id, { status: 'uploading', error: undefined, progress: 0 })
            const result = await uploadWithRetry(item, triggerIndexing)
            if (!result.success) {
                updateQueueItem(item.id, { status: 'error', error: result.error })
                outcome.failed.push({ ...item, status: 'error', error: result.error })
                continue
            }
            const file = result.finalFile ? { externalId: result.finalFile.id, fileName: result.finalFile.name } : undefined
            if (result.indexed) {
                // Not done until Firma answers: the row keeps its spinner, and the next file starts.
                updateQueueItem(item.id, { progress: 100, ...(file ? { finalName: file.fileName } : {}) })
                outcome.indexing.push(result.indexed.then((answer) => settleIndexed(item, file, answer)))
                continue
            }
            if (file && !isExternalPersona) outcome.uploaded.push({ item, ...file })
            updateQueueItem(item.id, { status: 'completed', progress: 100 })
        }
        return outcome
    }

    /** Tells Firma again about rows already in storage (their Retry), as the run that uploaded them would have. */
    const reindex = (items: UploadQueueItem[]): QueueOutcome => {
        const entries = items.flatMap((item) => {
            const file = notIndexedRef.current.get(item.id)
            return file ? [{ item, file }] : []
        })
        entries.forEach(({ item }) => updateQueueItem(item.id, { status: 'uploading', error: undefined, progress: 100 }))
        let indexing: Promise<IndexSettled>[]
        if (isExternalPersona) {
            indexing = entries.map(({ item, file }) => requestIntake(file.externalId).then((answer) => settleIndexed(item, file, answer)))
        } else {
            const answer = entries.length > 0 ? requestIndex(entries.map(({ file }) => file)) : Promise.resolve<IndexOutcome>({ ok: true })
            indexing = entries.map(({ item, file }) => answer.then((a) => settleIndexed(item, file, a)))
        }
        return { items: entries.map((e) => e.item), uploaded: [], indexing, failed: [] }
    }

    /**
     * After a run: index what uploaded (one batch POST when the run didn't index per file), read
     * every answer, refresh the list, and report. A file is counted done only once Firma has it:
     * "Upload complete" shows only when it is. Failures keep the panel open; if it was closed, a
     * toast names the files and why, and offers Retry.
     */
    const finishRun = async (outcome: QueueOutcome, { batchIndex }: { batchIndex: boolean }) => {
        const failed = [...outcome.failed]
        // One batch POST for all files (not one per file) — server assigns every file's docId
        // synchronously (ensureDocIdEarly, fanned out via Promise.all) and enqueues one Inngest
        // batch-indexing event, then returns. Awaiting this response does NOT wait for the
        // Inngest job (embeddings/summaries) to run. Its answer is read: a refusal marks every
        // file in it as in storage but not in Firma.
        if (batchIndex && outcome.uploaded.length > 0 && !isExternalPersona) {
            const answer = await requestIndex(outcome.uploaded.map(({ externalId, fileName }) => ({ externalId, fileName })))
            if (!answer.ok) {
                for (const u of outcome.uploaded) {
                    const settled = settleIndexed(u.item, { externalId: u.externalId, fileName: u.fileName }, answer)
                    if (settled.failed) failed.push(settled.failed)
                }
            }
        }
        // Per-file runs: every answer, so the refetch shows the docIds. NOT a wait for search indexing.
        for (const settled of await Promise.all(outcome.indexing)) if (settled.failed) failed.push(settled.failed)

        const currentFolderId = currentFolderIdRef.current
        if (currentFolderId) fetchFiles(currentFolderId, true)
        setIsUploading(false)

        const total = outcome.items.length
        const errorCount = failed.length
        const completedCount = total - errorCount
        if (errorCount > 0) setIsUploadModalOpen(true)
        if (uploadOverlayDismissedRef.current && total > 0) {
            if (errorCount === 0) {
                addToast({ type: 'success', title: 'Upload complete', message: `${completedCount} file${completedCount !== 1 ? 's' : ''} added.` })
            } else {
                const notAdded = failed.every((i) => notIndexedRef.current.has(i.id))
                addToast({
                    type: 'error',
                    title: notAdded
                        ? `${errorCount} file${errorCount !== 1 ? 's' : ''} not added to ${BRAND_NAME}`
                        : `${errorCount} file${errorCount !== 1 ? 's' : ''} didn't upload`,
                    message: `${completedCount} of ${total} added. Not added: ${describeNotDone(failed.map((i) => ({ name: i.finalName || i.file.name, reason: i.error })))}`,
                    duration: 12000,
                    action: { label: 'Retry', onClick: () => { void retryRef.current(failed) } },
                })
            }
            uploadOverlayDismissedRef.current = false
        }
    }

    /**
     * Retries failed rows, to the same folder or file they were headed for. A row already in storage
     * (Firma refused or missed it) is told to Firma again; only the rest are uploaded again.
     */
    const retryUploads = async (items: UploadQueueItem[]) => {
        const failed = items.filter(i => i.status === 'error')
        if (failed.length === 0 || isUploading || isUploadInitiating) return
        // Rows still in the panel are reused in place; after the panel was closed they come back.
        const inQueue = new Set(uploadQueue.map(i => i.id))
        const missing = failed.filter(i => !inQueue.has(i.id))
        const retrying = failed.map(i => ({ ...i, status: 'pending' as const, error: undefined, progress: 0 }))
        if (missing.length) addToQueue(retrying.filter(i => !inQueue.has(i.id)))
        retrying.filter(i => inQueue.has(i.id)).forEach(i => updateQueueItem(i.id, { status: 'pending', error: undefined, progress: 0 }))

        uploadOverlayDismissedRef.current = false
        setIsUploading(true)
        setIsUploadModalOpen(true)
        try {
            const indexOnly = retrying.filter(i => notIndexedRef.current.has(i.id))
            const reupload = retrying.filter(i => !notIndexedRef.current.has(i.id))
            const told = reindex(indexOnly)
            const uploaded = await runQueue(reupload, false)
            await finishRun({
                items: [...told.items, ...uploaded.items],
                uploaded: uploaded.uploaded,
                indexing: [...told.indexing, ...uploaded.indexing],
                failed: uploaded.failed,
            }, { batchIndex: true })
        } catch (e: any) {
            logger.error(e)
            setIsUploading(false)
        }
    }

    // The panel's Retry (and the toast's) call through this ref, so they always run the current render's handler.
    const retryRef = useRef<(items: UploadQueueItem[]) => Promise<void>>(async () => {})
    useEffect(() => { retryRef.current = retryUploads })
    useEffect(() => {
        setRetryCallback((items) => { void retryRef.current(items) })
        return () => setRetryCallback(null)
    }, [setRetryCallback])

    // Batch Resolution Handler
    const handleBatchResolution = async () => {
        const remainingToProcess = [...conflictItems]
        setConflictItems([]) // Close dialog

        // Each row keeps its choice — replace the existing file, or save beside it under a
        // numbered name — so a retry does the same thing.
        const openFolderId = currentFolderIdRef.current ?? undefined
        const newQueueItems: UploadQueueItem[] = remainingToProcess.map(item => ({
            id: `upload-${Date.now()}-${Math.random()}`,
            file: item.file,
            progress: 0,
            status: 'pending',
            target: overwriteSelections.has(item.file.name)
                ? { overwriteId: item.existingId, parentFolderId: item.parentFolderId ?? openFolderId }
                : { rename: true, parentFolderId: item.parentFolderId ?? openFolderId },
        }))

        addToQueue(newQueueItems)
        setIsUploading(true)
        setIsUploadModalOpen(true)
        setOverwriteSelections(new Set())

        try {
            const outcome = await runQueue(newQueueItems, false)
            await finishRun(outcome, { batchIndex: true })
        } catch (e: any) {
            logger.error(e)
            setIsUploading(false)
        }
    }

    const cancelBatchResolution = () => {
        setConflictItems([])
        setOverwriteSelections(new Set())
        setIsUploading(false)
    }

    /**
     * A folder's files, for the duplicate-name check when uploading into a folder other than the open
     * one. A listing that fails says why, rather than reading as "nothing there" (P2-16).
     */
    const listFolderFiles = async (folderId: string): Promise<{ files: DriveFile[] } | { error: string }> => {
        const token = sessionRef.current?.access_token
        if (!token) return { error: SIGNED_OUT }
        const isSharedOnlyPersona = viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer'
        try {
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'list', folderId, projectId, ...(isSharedOnlyPersona ? { viewAsPersonaSlug } : {}) }),
            })
            if (!res.ok) return { error: (await failureFrom(res)).message }
            return { files: (await res.json()).files ?? [] }
        } catch (e) {
            return { error: failureReason(e) }
        }
    }

    // Queue Processor. `targetFolderId`: a folder row the files were dropped on; else the open folder.
    // `skipNameCheck`: the person chose to upload without the same-name check, after it couldn't run.
    const processUploads = async (fileList: FileList, targetFolderId?: string, { skipNameCheck = false }: { skipNameCheck?: boolean } = {}) => {
        const totalFiles = fileList.length
        const capAllowed = await checkDocumentCap(totalFiles)
        if (!capAllowed) return

        const intoFolder = targetFolderId && targetFolderId !== currentFolderIdRef.current ? targetFolderId : undefined

        // Names already there: the open folder's list, or the drop target's, loaded for the check.
        // When that listing fails, nothing goes up unasked: it could leave two files of one name.
        let existingFiles: DriveFile[] = files
        if (intoFolder && !skipNameCheck) {
            const listed = await listFolderFiles(intoFolder)
            if ('error' in listed) {
                // Held as an array: a drop's file list may not outlive the drop.
                const picked = Array.from(fileList)
                addToast({
                    type: 'error',
                    title: "Couldn't check for files with the same name",
                    message: `${listed.error} Nothing was uploaded, so the folder doesn't end up with two files of one name.`,
                    duration: 12000,
                    action: { label: 'Upload anyway', onClick: () => { void processUploads(picked as unknown as FileList, targetFolderId, { skipNameCheck: true }) } },
                })
                return
            }
            existingFiles = listed.files
        }

        setIsUploading(true)
        setIsUploadModalOpen(true)

        try {
            const uploads = Array.from(fileList).filter(f => !isJunkFile(f.name))
            const conflicts: ConflictItem[] = []
            const safeUploads: File[] = []

            // 1. Classify
            for (const file of uploads) {
                const existing = existingFiles.find(f => f.name === file.name && f.mimeType !== 'application/vnd.google-apps.folder')
                if (existing) {
                    conflicts.push({ file, existingId: existing.id, ...(intoFolder ? { parentFolderId: intoFolder } : {}) })
                } else {
                    safeUploads.push(file)
                }
            }

            // 2. Prepare Safe Uploads Queue
            const parentFolderId = intoFolder ?? currentFolderIdRef.current ?? undefined
            const newQueueItems: UploadQueueItem[] = safeUploads.map(file => ({
                id: `upload-${Date.now()}-${Math.random()}`,
                file: file,
                progress: 0,
                status: 'pending',
                target: { parentFolderId },
            }))

            addToQueue(newQueueItems)

            // If we have conflicts, show dialog — default every file to Replace.
            if (conflicts.length > 0) {
                setConflictItems(conflicts)
                setOverwriteSelections(new Set(conflicts.map(c => c.file.name)))
            }

            // 3. Process Safe Uploads — each file is told to Firma as it lands, and its answer read.
            if (safeUploads.length > 0) {
                const outcome = await runQueue(newQueueItems, true)
                await finishRun(outcome, { batchIndex: false })
            } else {
                setIsUploading(false)
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
        // Picking a folder used to do nothing at all here (P2-15).
        if (!sessionRef.current?.access_token) {
            addToast({ type: 'error', title: "Couldn't upload the folder", message: SIGNED_OUT })
            return
        }
        if (!currentFolderId) {
            addToast({ type: 'error', title: "Couldn't upload the folder", message: 'Open the folder it goes in first, then upload it there.' })
            return
        }
        const token = sessionRef.current.access_token
        const rootId = currentFolderId
        const pathToFolderId = new Map<string, string>()
        pathToFolderId.set('', rootId)

        setIsUploadInitiating(true)
        setIsUploadModalOpen(true)

        // Folders first, parents before children. A dropped connection here is retried like a file;
        // a folder that still can't be made stops the upload and says which one.
        const createFolder = async (name: string, parentId: string): Promise<{ id?: string; error?: string; retryable?: boolean }> => {
            try {
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
                if (!res.ok) return { error: (await failureFrom(res)).message, retryable: isTransientStatus(res.status) }
                const data = await res.json().catch(() => ({}))
                return { id: data.id }
            } catch (e) {
                return { error: failureReason(e), retryable: isConnectionError(e) }
            }
        }

        const folderPaths = getFolderPathsFromFileList(fileList)
        for (const path of folderPaths) {
            const parts = path.split('/')
            const name = parts[parts.length - 1]
            const parentPath = parts.length === 1 ? '' : parts.slice(0, -1).join('/')
            const parentId = pathToFolderId.get(parentPath)!
            let created = await createFolder(name, parentId)
            for (let i = 0; !created.id && created.retryable && i < RETRY_DELAYS_MS.length; i++) {
                await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]))
                created = await createFolder(name, parentId)
            }
            if (!created.id) {
                logger.error(`Folder upload: couldn't create "${path}"`, new Error(created.error))
                // Files only start once every folder exists, so none went up. The folders made so far
                // stay, empty: say how many, and show them (P1-51).
                const made = pathToFolderId.size - 1
                const left = made > 0 ? ` ${made} empty folder${made !== 1 ? 's were' : ' was'} created.` : ''
                addToast({
                    type: 'error',
                    title: 'Folder upload stopped',
                    message: `Couldn't create “${name}” · ${created.error} No files were uploaded.${left}`,
                    duration: 12000,
                })
                setIsUploadInitiating(false)
                if (made > 0) fetchFiles(rootId, true)
                return
            }
            pathToFolderId.set(path, created.id)
        }

        const fileItems = Array.from(fileList).filter(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
            const parts = rel.split('/')
            const fileName = parts[parts.length - 1]
            return parts.length >= 1 && fileName !== '' && !isJunkFile(fileName)
        })
        setIsUploading(true)
        setIsUploadInitiating(false)
        // Each file goes into its own subfolder, made above; a retry goes back to the same one.
        const newQueueItems: UploadQueueItem[] = fileItems.map(file => {
            const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
            const parts = rel.split('/')
            const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
            return {
                id: `upload-${Date.now()}-${Math.random()}`,
                file,
                progress: 0,
                status: 'pending',
                target: { parentFolderId: pathToFolderId.get(dirPath) ?? rootId },
            }
        })
        addToQueue(newQueueItems)

        uploadOverlayDismissedRef.current = false
        try {
            // One batch index POST at the end regardless of file count (a 100-file folder is
            // still a single request) — see finishRun.
            const outcome = await runQueue(newQueueItems, false)
            await finishRun(outcome, { batchIndex: true })
        } catch (e: any) {
            logger.error(e)
            setIsUploading(false)
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
