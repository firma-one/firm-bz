'use client'

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CoffeeIcon, type CoffeeIconHandle } from "@/components/ui/coffee-icon"
import { SquarePlus, Upload, FolderUp, X, Folder, File as FileIcon, ArrowUp, ArrowDown, ChevronRight, Search, List as ListIcon, LayoutGrid, Filter, ChevronDown, User, FileText, FileSpreadsheet, Presentation, ListChecks, PenTool, Map as MapIcon, LayoutTemplate, FileCode, AlertCircle, ShieldCheck, Maximize2, Minimize2, CheckCircle2, XCircle, Trash2, Layout, Code, Laptop, RefreshCw, Info, Share2, Layers, Building2, Users, Briefcase, Lock, FolderLock, Inbox, Sparkles, Link2, MessageCircle, CircleChevronLeft, Download, MoreVertical, Clock } from 'lucide-react'
import Fuse from 'fuse.js'
import { config } from "@/lib/config"
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { DocumentPreviewPanelContent } from '@/components/files/document-edit-sheet'
import { DocumentBlobPreviewPane } from '@/components/files/document-blob-preview-pane'
import { DocumentDocCommentsPane } from '@/components/projects/document-doc-comments-pane'
import { formatFileSize } from '@/lib/utils'
import { DriveFile } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Input } from '@/components/ui/input'
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { logger } from '@/lib/logger'
import { useToast } from '@/components/ui/toast'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuCheckboxItem,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent
} from "@/components/ui/dropdown-menu"
import useDrivePicker from 'react-google-drive-picker'
import { GoogleDriveImportDialog } from './google-drive-import-dialog'
import { SANDBOX_OPERATION_MESSAGE } from '@/components/ui/sandbox-info-banner'
import { useViewAs } from '@/lib/view-as-context'
import { useRightPane } from '@/lib/right-pane-context'
import { useEngagementSearch, EngagementSearchProvider } from '@/components/projects/engagement-search-context'
import { EngagementSearchPanel, type EngagementSearchPanelActionMenuProps } from '@/components/projects/engagement-search-panel'
import { consumeDeeplinkHighlight, type BreadcrumbItem } from '@/lib/files-folder-session'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { SecureAccessModal } from '@/components/projects/shares/secure-access-modal'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { SandboxFilePreview } from '@/components/projects/sandbox-file-preview'
import { EngagementFileRow } from '@/components/projects/engagement-file-row'
import { useEngagementUpload } from '@/components/projects/hooks/use-engagement-upload'
import { useEngagementFileOps } from '@/components/projects/hooks/use-engagement-file-ops'
import { useEngagementDragDrop } from '@/components/projects/hooks/use-engagement-drag-drop'
import { provisionEngagementDriveFolder } from '@/lib/actions/project'

interface EngagementFileListProps {
    projectId: string
    connectorRootFolderId?: string | null
    rootFolderName?: string
    orgName?: string
    clientName?: string
    projectName?: string
    canEdit?: boolean
    canManage?: boolean
    isFirmAdmin?: boolean
    /** When true (e.g. user is eng_ext_collaborator or eng_viewer), only show files/folders that are shared to External Collaborator or Guest. */
    restrictToSharedOnly?: boolean
    /** Optional; used for secure-open modal thumbnail. */
    firmId?: string
    orgSlug?: string
    /** When true, firm is sandbox-only (restricts Add menu: no new folder / native Google types; upload + Drive import allowed). */
    firmSandboxOnly?: boolean
    /** Portal target for the New Document button in the workspace nav bar. */
    navSlot?: HTMLElement | null
    /** Client slug — used to build the Settings link in the "no connector" blocker. */
    clientSlug?: string
    /** Client-level connector ID — when set but connectorRootFolderId is null, offer "Set up Drive folder". */
    clientConnectorId?: string | null
    /** Workspace root location — when SHARED, folder provisioning requires the Migrate wizard. */
    workspaceRootLocation?: string | null
    /** Connector account email — passed to DocumentActionMenu for Google Drive authuser param. */
    connectorAccountEmail?: string | null
    /** Called whenever the file count changes (uploads, deletes, creates) so the tab badge stays live. */
    onFileCountChange?: (count: number) => void
}

type SortByOption = 'name' | 'modifiedTime' | 'modifiedTimeByMe' | 'viewedByMeTime'
type SortConfig = {
    sortBy: SortByOption
    direction: 'asc' | 'desc'
    foldersFirst: boolean
}

type CreateItemType = 'folder' | 'doc' | 'sheet' | 'slide' | 'form' | 'drawing' | 'map' | 'site' | 'script'

type ConflictItem = {
    file: File
    existingId: string
}


const VIEW_AS_SHARED_ONLY_PERSONAS = ['eng_ext_collaborator', 'eng_viewer']

export function EngagementFileList({ projectId, connectorRootFolderId, clientConnectorId, workspaceRootLocation, rootFolderName = 'Engagement Files', orgName, clientName, projectName, canEdit = false, canManage = false, isFirmAdmin = false, restrictToSharedOnly = false, firmId, orgSlug, firmSandboxOnly = false, navSlot, clientSlug, connectorAccountEmail, onFileCountChange }: EngagementFileListProps) {
    const { session } = useAuth()
    const sessionRef = useRef(session)
    const onFileCountChangeRef = useRef(onFileCountChange)
    useEffect(() => { onFileCountChangeRef.current = onFileCountChange }, [onFileCountChange])

    const refreshFileCount = useCallback((fileList: any[]) => {
        if (!onFileCountChangeRef.current) return
        const count = fileList.filter((f: any) => !f.mimeType?.includes('folder')).length
        onFileCountChangeRef.current(count)
    }, [])
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const { viewAsPersonaSlug } = useViewAs()
    const rightPane = useRightPane()
    const [activeCommentDocId, setActiveCommentDocId] = useState<string | null>(null)
    const [activeInfoDocId, setActiveInfoDocId] = useState<string | null>(null)
    const [activeActivityDocId, setActiveActivityDocId] = useState<string | null>(null)
    const [activeVersionDocId, setActiveVersionDocId] = useState<string | null>(null)
    const [activePreviewDocId, setActivePreviewDocId] = useState<string | null>(null)
    const [previewKey, setPreviewKey] = useState(0)
    const lastHandledDeeplinkHashRef = useRef<string>('')
    // Cache resolve-deeplink/file-info results per hash to avoid re-fetching on every effect re-run.
    const deeplinkResolvedCacheRef = useRef<Record<string, {
        externalId: string | null
        fileName: string | null
        isFolder?: boolean
        status?: number
        path?: { id: string; name: string }[]
        projectRootFolderId?: string | null
    }>>({})

    // Prevents concurrent resolve-deeplink fetches when multiple effect deps fire at once.
    const deeplinkFetchInProgressRef = useRef(false)

    // True from mount until the deeplink hash is resolved — suppresses the file list so the root folder never flashes.
    // Always start false (SSR-safe). useLayoutEffect sets it to true synchronously on the client
    // before first paint when a deeplink hash is present — avoids the hydration mismatch that
    // caused the "No engagement folders configured" flash on page load / browser refresh.
    const [deeplinkResolving, setDeeplinkResolving] = useState(false)
    const [provisioning, setProvisioning] = useState(false)
    useLayoutEffect(() => {
        const hash = window.location.hash.replace(/^#/, '')
        if (hash.startsWith('doc-file:') || hash.startsWith('doc-comment:')) {
            setDeeplinkResolving(true)
        }
    }, [])
    const { handleSecureOpen, secureModalOpen, secureModalData, setSecureModalOpen, isRegrantingId, isRegrantLoading, regrantError } = useSecureOpenDocument({
        projectId,
        firmId,
        logContext: 'EngagementFileList',
    })
    const [sharedExternalIds, setSharedExternalIds] = useState<Set<string>>(new Set())
    const [ancestorFolderIds, setAncestorFolderIds] = useState<Set<string>>(new Set())
    const [sharedExternalIdsForEC, setSharedExternalIdsForEC] = useState<Set<string>>(new Set())
    const [ancestorFolderIdsForEC, setAncestorFolderIdsForEC] = useState<Set<string>>(new Set())
    const [sharedExternalIdsForGuest, setSharedExternalIdsForGuest] = useState<Set<string>>(new Set())
    const [ancestorFolderIdsForGuest, setAncestorFolderIdsForGuest] = useState<Set<string>>(new Set())
    const [descendantIds, setDescendantIds] = useState<Set<string>>(new Set())
    const [descendantIdsForEC, setDescendantIdsForEC] = useState<Set<string>>(new Set())
    const [descendantIdsForGuest, setDescendantIdsForGuest] = useState<Set<string>>(new Set())
    const [sharedByMeExternalIds, setSharedByMeExternalIds] = useState<Set<string>>(new Set())
    const [filterShared, setFilterShared] = useState<'all' | 'by_me' | 'by_others' | 'with_collaborator' | 'with_viewer' | 'pending_intake'>('all')
    const [bookmarkIdByDocumentId, setBookmarkIdByDocumentId] = useState<Map<string, string>>(new Map())

    useEffect(() => {
        sessionRef.current = session
    }, [session])

    useEffect(() => {
        const fetchBookmarks = async () => {
            const token = sessionRef.current?.access_token
            if (!token) return
            try {
                const res = await fetch('/api/bookmarks', { headers: { Authorization: `Bearer ${token}` } })
                if (!res.ok) return
                const data = await res.json()
                const map = new Map<string, string>(
                    (data.bookmarks ?? [])
                        .filter((b: { documentId?: string; id: string }) => b.documentId)
                        .map((b: { documentId: string; id: string }) => [b.documentId, b.id])
                )
                setBookmarkIdByDocumentId(map)
            } catch {
                // non-critical; leave empty
            }
        }
        fetchBookmarks()
        const handler = () => fetchBookmarks()
        window.addEventListener('pockett-bookmarks-updated', handler)
        return () => window.removeEventListener('pockett-bookmarks-updated', handler)
    }, [])

    useEffect(() => {
        // Clear row highlight when the right pane closes or switches away from specific panes.
        // Title is "Comments" from the file list / hash; EngagementCommentsTab uses "Comment".
        const isCommentsPane =
            Boolean(rightPane.content) &&
            (rightPane.title === 'Comment' || rightPane.title === 'Comments')
        const isInfoPane = Boolean(rightPane.content) && rightPane.title === 'File information'
        const isActivityPane = Boolean(rightPane.content) && rightPane.title === 'Activity Stream'
        const isVersionPane = Boolean(rightPane.content) && rightPane.title === 'Version History'

        if (!isCommentsPane) setActiveCommentDocId(null)
        if (!isInfoPane) setActiveInfoDocId(null)
        if (!isActivityPane) setActiveActivityDocId(null)
        if (!isVersionPane) setActiveVersionDocId(null)
        if (!rightPane.content) setActivePreviewDocId(null)
    }, [rightPane.content, rightPane.title])

    /** Same behavior as DocumentActionMenu → Comment (direct right pane; no URL hash). */
    const openCommentsForFile = useCallback(
        (file: DriveFile) => {
            if (!rightPane.hasRightPane) return
            setActiveCommentDocId(file.id)
            const docIdForComments = file.projectDocumentId || file.id
            rightPane.setTitle('Comments')
            rightPane.setHeaderActions(null)
            rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
            rightPane.setHeaderSubtitle('Append-only. Visible to all project members.')
            rightPane.setContent(
                <DocumentDocCommentsPane
                    engagementId={projectId}
                    documentId={docIdForComments}
                    documentName={file.name}
                    documentMimeType={file.mimeType}
                    orgSlug={orgSlug}
                />
            )
            rightPane.setExpanded?.(false)
        },
        [rightPane, projectId]
    )

    const openPreviewForFile = useCallback(
        (fileId: string, file: DriveFile) => {
            if (!rightPane.hasRightPane) return
            setActivePreviewDocId(fileId)
            setPreviewKey(k => {
                const nextKey = k + 1
                rightPane.setTitle(file.name || 'Preview')
                rightPane.setHeaderActions(null)
                rightPane.setHeaderIcon(null)
                rightPane.setHeaderSubtitle('')
                rightPane.setPaneSize('medium')
                rightPane.setContent(<DocumentBlobPreviewPane key={nextKey} document={file} projectId={projectId} />)
                return nextKey
            })
        },
        [rightPane, projectId]
    )

    const fetchSharedIds = useCallback(() => {
        if (!projectId) return
        fetch(`/api/projects/${projectId}/sharing/ids`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const ids = Array.isArray(data?.sharedExternalIds) ? data.sharedExternalIds as string[] : []
                const ancestorIds = Array.isArray(data?.ancestorFolderIds) ? data.ancestorFolderIds as string[] : []
                const idsEC = Array.isArray(data?.sharedExternalIdsForEC) ? data.sharedExternalIdsForEC as string[] : []
                const ancestorEC = Array.isArray(data?.ancestorFolderIdsForEC) ? data.ancestorFolderIdsForEC as string[] : []
                const idsGuest = Array.isArray(data?.sharedExternalIdsForGuest) ? data.sharedExternalIdsForGuest as string[] : []
                const ancestorGuest = Array.isArray(data?.ancestorFolderIdsForGuest) ? data.ancestorFolderIdsForGuest as string[] : []
                const descIds = Array.isArray(data?.descendantIds) ? data.descendantIds as string[] : []
                const descIdsEC = Array.isArray(data?.descendantIdsForEC) ? data.descendantIdsForEC as string[] : []
                const descIdsGuest = Array.isArray(data?.descendantIdsForGuest) ? data.descendantIdsForGuest as string[] : []
                const idsByMe = Array.isArray(data?.sharedByMeExternalIds) ? data.sharedByMeExternalIds as string[] : []
                setSharedExternalIds(new Set(ids))
                setAncestorFolderIds(new Set(ancestorIds))
                setSharedExternalIdsForEC(new Set(idsEC))
                setAncestorFolderIdsForEC(new Set(ancestorEC))
                setSharedExternalIdsForGuest(new Set(idsGuest))
                setAncestorFolderIdsForGuest(new Set(ancestorGuest))
                setDescendantIds(new Set(descIds))
                setDescendantIdsForEC(new Set(descIdsEC))
                setDescendantIdsForGuest(new Set(descIdsGuest))
                setSharedByMeExternalIds(new Set(idsByMe))
            })
            .catch(() => {
                setSharedExternalIds(new Set())
                setAncestorFolderIds(new Set())
                setSharedExternalIdsForEC(new Set())
                setAncestorFolderIdsForEC(new Set())
                setSharedExternalIdsForGuest(new Set())
                setAncestorFolderIdsForGuest(new Set())
                setDescendantIds(new Set())
                setDescendantIdsForEC(new Set())
                setDescendantIdsForGuest(new Set())
                setSharedByMeExternalIds(new Set())
            })
    }, [projectId])

    // Folder IDs state
    const [generalFolderId, setGeneralFolderId] = useState<string | null>(null)
    const [confidentialFolderId, setConfidentialFolderId] = useState<string | null>(null)
    const [stagingFolderId, setStagingFolderId] = useState<string | null>(null)
    const [isProjectLead, setIsProjectLead] = useState(false)
    const [isLoadingFolders, setIsLoadingFolders] = useState(true)
    const [currentFolderType, setCurrentFolderType] = useState<'general' | 'confidential' | 'staging'>('general')
    // Tracks whether the current folder is an approved deliverable (locks write ops)
    const [currentFolderIsApprovedDeliverable, setCurrentFolderIsApprovedDeliverable] = useState(false)

    // Core State
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])

    // Close preview when the user navigates to a different folder (up via breadcrumb or down into a subfolder).
    // Skip on mount (isMountedRef is false until after first render).
    const isMountedRef = useRef(false)
    useEffect(() => {
        if (!isMountedRef.current) { isMountedRef.current = true; return }
        if (activePreviewDocId) {
            setActivePreviewDocId(null)
            rightPane.clearPane()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFolderId])

    // Load folder IDs and shared IDs in parallel on mount (both only need projectId)
    useEffect(() => {
        fetchSharedIds()
        const loadFolderIds = async () => {
            const { getProjectFolderIds } = await import('@/lib/actions/project')
            try {
                const folderData = await getProjectFolderIds(projectId)
                if (folderData) {
                    setGeneralFolderId(folderData.generalFolderId)
                    setConfidentialFolderId(folderData.confidentialFolderId)
                    setStagingFolderId(folderData.stagingFolderId ?? null)
                    setIsProjectLead(folderData.isProjectLead)

                    if (!folderData.generalFolderId && !folderData.confidentialFolderId && !folderData.stagingFolderId) {
                        console.warn('[EngagementFileList] No subfolders resolved for project', projectId)
                    }
                }

                const generalId = folderData.generalFolderId ?? null
                const confidentialId = folderData.confidentialFolderId ?? null
                const stagingId = folderData.stagingFolderId ?? null

                // Determine the default folder and type
                let defaultFolderId = generalId
                let defaultFolderName = 'general'
                let defaultFolderType: 'general' | 'confidential' | 'staging' = 'general'

                if (!defaultFolderId) {
                    if (folderData.isProjectLead && confidentialId) {
                        defaultFolderId = confidentialId
                        defaultFolderName = 'confidential'
                        defaultFolderType = 'confidential'
                    } else if (stagingId) {
                        defaultFolderId = stagingId
                        defaultFolderName = 'staging'
                        defaultFolderType = 'staging'
                    }
                }

                const defaultBreadcrumbs: BreadcrumbItem[] = defaultFolderId
                    ? [
                        { id: defaultFolderId, name: defaultFolderName, clickable: true, isEngagementRoot: true }
                    ]
                    : []

                // When a deeplink hash is present the deeplink handler owns navigation entirely.
                // Skip restoring saved/default folder so the file list never flashes General first.
                const hasDeeplinkHash = typeof window !== 'undefined'
                    && (window.location.hash.startsWith('#doc-file:') || window.location.hash.startsWith('#doc-comment:'))

                if (!hasDeeplinkHash) {
                    if (defaultFolderId) {
                        setCurrentFolderId(defaultFolderId)
                        setBreadcrumbs(defaultBreadcrumbs)
                        setCurrentFolderType(defaultFolderType)
                    }
                }
            } catch (error) {
                logger.error('Failed to load project folder IDs', error instanceof Error ? error : new Error(String(error)))
                setError('Failed to load engagement folders')
            } finally {
                setIsLoadingFolders(false)
            }
        }
        loadFolderIds()
    }, [projectId, connectorRootFolderId, orgName, clientName, projectName, rootFolderName, fetchSharedIds])

    // Data State
    const [files, setFiles] = useState<DriveFile[]>([])
    const [loading, setLoading] = useState(true) // Initial load
    const [error, setError] = useState<string | null>(null)
    const [pickerToken, setPickerToken] = useState<string | null>(null)

    // (deeplink handler effect is declared below, after navigateToItem is defined)

    const { addToast } = useToast()

    const handleProvisionDriveFolder = useCallback(async () => {
        setProvisioning(true)
        try {
            await provisionEngagementDriveFolder(projectId)
            window.location.reload()
        } catch (e) {
            addToast({ type: 'error', title: 'Setup failed', message: e instanceof Error ? e.message : 'Could not set up Drive folder. Try again.' })
            setProvisioning(false)
        }
    }, [projectId, addToast])

    const showSandboxPickerToast = useCallback(() => {
        addToast({
            type: 'error',
            title: 'Demo Firm',
            message: SANDBOX_OPERATION_MESSAGE,
            duration: 8000,
        })
    }, [addToast])
    const coffeeIconRef = useRef<CoffeeIconHandle>(null)

    // Intake action state
    const [intakeActionInProgress, setIntakeActionInProgress] = useState<string | null>(null)

    // Actions State
    const [isCreateItemOpen, setIsCreateItemOpen] = useState(false)
    const [createItemType, setCreateItemType] = useState<CreateItemType>('folder')
    const [newItemName, setNewItemName] = useState('')
    const isCreatingRef = useRef(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    // Picker State
    const [openPicker] = useDrivePicker();
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
    const [importedFiles, setImportedFiles] = useState<any[]>([])
    const [importLoading, setImportLoading] = useState(false)

    // UX State
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
    const [sortConfig, setSortConfig] = useState<SortConfig>({ sortBy: 'name', direction: 'asc', foldersFirst: true })
    const { searchQuery, setSearchQuery, isSearching } = useEngagementSearch()
    const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
    const [filterOwner, setFilterOwner] = useState<'any' | 'me' | 'not-me' | 'private-me'>('any')
    const [peopleFilterOpen, setPeopleFilterOpen] = useState(false)
    const [filterModified, setFilterModified] = useState<'any' | '7d' | '30d' | 'year'>('any')
    const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null)
    const [actionMenuOpenFileId, setActionMenuOpenFileId] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isFolderUploadModalOpen, setIsFolderUploadModalOpen] = useState(false)
    const [expandedAddSection, setExpandedAddSection] = useState<'computer' | 'drive' | 'newFile' | null>('computer')
    const fromComputerExpanded = expandedAddSection === 'computer'
    const fromDriveExpanded = expandedAddSection === 'drive'
    const newFileExpanded = expandedAddSection === 'newFile'
    const setFromComputerExpanded = (v: boolean) => setExpandedAddSection(v ? 'computer' : null)
    const setFromDriveExpanded = (v: boolean) => setExpandedAddSection(v ? 'drive' : null)
    const setNewFileExpanded = (v: boolean) => setExpandedAddSection(v ? 'newFile' : null)
    const [expandedIntakeBadgeId, setExpandedIntakeBadgeId] = useState<string | null>(null)

    // Bulk selection state
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())

    // Download queue (shown in bottom-right panel like upload queue)
    type DownloadQueueItem = { id: string; name: string; status: 'preparing' | 'done' | 'error'; error?: string }
    const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItem[]>([])
    const [isDownloadPanelOpen, setIsDownloadPanelOpen] = useState(true)

    // Bulk trash queue + confirmation
    type TrashQueueItem = { id: string; name: string; connectorId: string; status: 'pending' | 'done' | 'error'; error?: string }
    const [trashQueue, setTrashQueue] = useState<TrashQueueItem[]>([])
    const [isTrashPanelOpen, setIsTrashPanelOpen] = useState(true)
    const [bulkTrashConfirmOpen, setBulkTrashConfirmOpen] = useState(false)
    const [pendingBulkTrashIds, setPendingBulkTrashIds] = useState<Set<string>>(new Set())



    // Row-level processing state
    const [processingFileIds, setProcessingFileIds] = useState<Set<string>>(new Set())


    const handleBulkDownload = useCallback(async () => {
        if (!selectedFileIds.size) return
        const ids = Array.from(selectedFileIds)
        const label = ids.length === 1 ? '1 item' : `${ids.length} items`
        const queueItem: DownloadQueueItem = { id: `dl-${Date.now()}`, name: label, status: 'preparing' }
        setDownloadQueue(prev => [...prev, queueItem])
        setIsDownloadPanelOpen(true)
        setSelectedFileIds(new Set())
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/bulk-download`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ externalIds: ids }),
            })
            if (!res.ok) throw new Error('Failed to create ZIP')
            const blob = await res.blob()
            const filename = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'download.zip'
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
            setDownloadQueue(prev => prev.map(i => i.id === queueItem.id ? { ...i, status: 'done', name: filename } : i))
        } catch (e: any) {
            setDownloadQueue(prev => prev.map(i => i.id === queueItem.id ? { ...i, status: 'error', error: e?.message || 'Failed' } : i))
        }
    }, [selectedFileIds, projectId])

    const startProcessing = useCallback((id: string) => setProcessingFileIds(prev => new Set(prev).add(id)), [])
    const stopProcessing = useCallback((id: string) => setProcessingFileIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
    }), [])

    const navigateToItem = async (file: DriveFile) => {
        try {
            let path: { id: string; name: string }[] | undefined
            let apiRootId: string | null | undefined

            // 1. Try to resolve path to root via indexing hierarchy
            try {
                const res = await fetch(`/api/projects/${projectId}/resolve-path?fileId=${file.id}`, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
                if (res.ok) {
                    const json = await res.json() as { path?: { id: string; name: string }[]; projectRootFolderId?: string | null }
                    path = json.path
                    apiRootId = json.projectRootFolderId
                } else {
                    logger.warn('resolve-path request failed, falling back to parent-based navigation', { status: res.status })
                }
            } catch (err) {
                logger.warn('resolve-path threw, falling back to parent-based navigation', err as Error)
            }

            // 2. Use resolved path when available
            if (path && path.length > 0) {
                const rootIds = [generalFolderId, confidentialFolderId, stagingFolderId].filter(Boolean) as string[]
                const rootId = apiRootId && rootIds.includes(apiRootId) ? apiRootId : path.find((p: { id: string }) => rootIds.includes(p.id))?.id
                const rootIndex = rootId ? path.findIndex((p: { id: string }) => p.id === rootId) : -1
                const rootItem = rootIndex >= 0
                    ? path[rootIndex]
                    : (rootId
                        ? {
                            id: rootId,
                            name:
                                rootId === generalFolderId
                                    ? 'General'
                                    : rootId === confidentialFolderId
                                        ? 'Confidential'
                                        : 'Staging',
                        }
                        : path[path.length - 1])
                const type =
                    rootItem.id === generalFolderId
                        ? 'general'
                        : rootItem.id === confidentialFolderId
                            ? 'confidential'
                            : rootItem.id === stagingFolderId
                                ? 'staging'
                                : 'general'

                setCurrentFolderType(type as any)

                // Breadcrumb from known root down to the folder we're opening (e.g. Confidential > NDA)
                const breadcrumbStartIndex = rootIndex >= 0 ? rootIndex : 0
                const breadcrumbPath = rootIndex >= 0 ? path.slice(rootIndex) : (rootId ? [rootItem, ...path] : path)
                setBreadcrumbs([
                    ...breadcrumbPath.map((p: { id: string; name: string }, i: number) => ({ id: p.id, name: p.name, clickable: true, isEngagementRoot: i === 0 && rootIds.includes(p.id) })),
                ])

                // Open the direct parent folder so the clicked item is in the list and can be highlighted
                const directParentId = path[path.length - 1].id
                setCurrentFolderId(directParentId)
            } else {
                // 3. Fallback: use Drive parent relationship directly
                const parentId = file.parents && file.parents.length > 0 ? file.parents[0] : null
                if (parentId) {
                    const type =
                        parentId === generalFolderId
                            ? 'general'
                            : parentId === confidentialFolderId
                                ? 'confidential'
                                : parentId === stagingFolderId
                                    ? 'staging'
                                    : null

                    if (type) {
                        setCurrentFolderType(type as any)
                        setBreadcrumbs([{ id: parentId, name: type, clickable: true, isEngagementRoot: true }])
                        setCurrentFolderId(parentId)
                    }
                }
            }

            // 4. Trigger highlight (scroll + auto-clear run in an effect once the list is visible — not loading)
            setHighlightedFileId(file.id)
        } catch (e) {
            logger.error('Search navigation failed', e as Error)
            addToast({ type: 'error', title: 'Navigation failed', message: 'Could not find the file location.' })
        }
    }

    // Deeplink handler (doc-file/doc-comment) — declared after navigateToItem so it can reuse highlight+scroll logic.
    useEffect(() => {
        if (!projectId) return
        if (!rightPane.hasRightPane) return
        if (typeof window === 'undefined') return

        const openFromHash = async () => {
            const hash = window.location.hash.replace(/^#/, '')
            if (!hash) return
            // Only skip after a successful open (or confirmed denial). Setting this too early caused
            // "Link unavailable" when the first attempt ran before session/files were ready.
            if (hash === lastHandledDeeplinkHashRef.current) return

            const parts = hash.split(':')
            const kind = parts[0]
            const documentIdParam = parts[1]
            if (!kind || !documentIdParam) return

            if (kind !== 'doc-comment' && kind !== 'doc-file') return

            if (!session?.access_token) return

            // Single combined API call — auth once, returns externalId + path in one round-trip.
            // Cached per hash so re-runs (from files/loading/isLoadingFolders changes) don't re-fetch.
            const cached = deeplinkResolvedCacheRef.current[hash]
            let externalId: string | null = cached?.externalId ?? null
            let fileName: string | null = cached?.fileName ?? null
            let isFolder: boolean = cached?.isFolder ?? false
            let resolveStatus: number | undefined = cached?.status
            let resolvedPath: { id: string; name: string }[] | undefined = cached?.path
            let projectRootFolderId: string | null | undefined = cached?.projectRootFolderId

            if (!cached) {
                // Guard against concurrent fetches — when multiple deps fire simultaneously, only
                // one fetch should run. Others return and re-run once the cache is populated.
                if (deeplinkFetchInProgressRef.current) return
                deeplinkFetchInProgressRef.current = true
                try {
                    const viewAs = viewAsPersonaSlug ? `?viewAsPersonaSlug=${encodeURIComponent(viewAsPersonaSlug)}` : ''
                    const endpoint = kind === 'doc-file'
                        ? `/api/projects/${projectId}/documents/${documentIdParam}/resolve-deeplink${viewAs}`
                        : `/api/projects/${projectId}/documents/${documentIdParam}/file-info${viewAs}`
                    const res = await fetch(endpoint, { credentials: 'include' })
                    resolveStatus = res.status
                    if (res.ok) {
                        const json = await res.json() as {
                            externalId?: string; fileName?: string | null; isFolder?: boolean
                            path?: { id: string; name: string }[]; projectRootFolderId?: string | null
                        }
                        externalId = typeof json.externalId === 'string' ? json.externalId : null
                        fileName = typeof json.fileName === 'string' ? json.fileName : null
                        isFolder = json.isFolder ?? false
                        resolvedPath = Array.isArray(json.path) ? json.path : undefined
                        projectRootFolderId = json.projectRootFolderId ?? null
                    }
                } catch {
                    // network error — will retry on next re-run
                } finally {
                    deeplinkFetchInProgressRef.current = false
                }

                // Fallback: match already-loaded file list (covers older hash formats)
                if (!externalId) {
                    const maybe = files.find((f) => f.projectDocumentId === documentIdParam || f.id === documentIdParam)
                    if (maybe) { externalId = maybe.id; fileName = maybe.name ?? null; isFolder = maybe.mimeType === 'application/vnd.google-apps.folder' }
                }

                deeplinkResolvedCacheRef.current[hash] = { externalId, fileName, isFolder, status: resolveStatus, path: resolvedPath, projectRootFolderId }
            }

            if (!externalId) {
                const transient = loading || isLoadingFolders || resolveStatus === 401
                if (transient) return
                setDeeplinkResolving(false)
                addToast({ type: 'error', title: 'Link unavailable', message: 'You do not have access to this item.' })
                lastHandledDeeplinkHashRef.current = hash
                return
            }

            if (kind === 'doc-file') {
                // Wait for folder IDs — needed to classify breadcrumb roots.
                if (isLoadingFolders) return

                // Navigate directly using the path from resolve-deeplink (no second API call).
                if (resolvedPath && resolvedPath.length > 0) {
                    const rootIds = [generalFolderId, confidentialFolderId, stagingFolderId].filter(Boolean) as string[]
                    const rootId = projectRootFolderId && rootIds.includes(projectRootFolderId)
                        ? projectRootFolderId
                        : resolvedPath.find((p) => rootIds.includes(p.id))?.id ?? null
                    const rootIndex = rootId ? resolvedPath.findIndex((p) => p.id === rootId) : -1
                    const rootItem = rootIndex >= 0
                        ? resolvedPath[rootIndex]
                        : (rootId
                            ? { id: rootId, name: rootId === generalFolderId ? 'General' : rootId === confidentialFolderId ? 'Confidential' : 'Staging' }
                            : resolvedPath[resolvedPath.length - 1])
                    const type: 'general' | 'confidential' | 'staging' =
                        rootItem.id === generalFolderId ? 'general'
                            : rootItem.id === confidentialFolderId ? 'confidential'
                                : rootItem.id === stagingFolderId ? 'staging'
                                    : 'general'
                    const breadcrumbPath = rootIndex >= 0 ? resolvedPath.slice(rootIndex) : (rootId ? [rootItem, ...resolvedPath] : resolvedPath)
                    setCurrentFolderType(type)

                    if (isFolder) {
                        // Folder deeplink: path includes the folder itself — navigate into it.
                        setBreadcrumbs(breadcrumbPath.map((p, i) => ({ id: p.id, name: p.name, clickable: true, isEngagementRoot: i === 0 && rootIds.includes(p.id) })))
                        setCurrentFolderId(resolvedPath[resolvedPath.length - 1].id)
                        setDeeplinkResolving(false)
                        lastHandledDeeplinkHashRef.current = hash
                        return
                    }

                    setBreadcrumbs(breadcrumbPath.map((p, i) => ({ id: p.id, name: p.name, clickable: true, isEngagementRoot: i === 0 && rootIds.includes(p.id) })))
                    setCurrentFolderId(resolvedPath[resolvedPath.length - 1].id)
                } else {
                    // Path unavailable — fall back to navigateToItem which will try resolve-path separately
                    await navigateToItem({
                        id: externalId, name: fileName ?? 'Document',
                        mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream', webViewLink: '', iconLink: '',
                        modifiedTime: new Date().toISOString(),
                    } as DriveFile)
                }
                setHighlightedFileId(externalId)
                // deeplinkResolving cleared by effect once loading settles
                lastHandledDeeplinkHashRef.current = hash
                return
            }
            // Navigate to the file's folder so it's visible and highlighted in the list.
            // navigateToItem is awaited but the file list re-render it triggers is async,
            // so the comments pane below may open slightly before the row appears — intentional,
            // since the comment is the primary destination and the highlight is best-effort.
            if (!isLoadingFolders) {
                await navigateToItem({
                    id: externalId, name: fileName ?? 'Document',
                    mimeType: 'application/octet-stream', webViewLink: '', iconLink: '',
                    modifiedTime: new Date().toISOString(),
                } as DriveFile)
                setHighlightedFileId(externalId)
            }

            setDeeplinkResolving(false)

            setActiveCommentDocId(externalId)
            rightPane.setTitle('Comments')
            rightPane.setHeaderActions(null)
            rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
            rightPane.setHeaderSubtitle('Append-only. Visible to all engagement members.')
            rightPane.setContent(
                <DocumentDocCommentsPane
                    engagementId={projectId}
                    documentId={documentIdParam}
                    documentName={fileName ?? undefined}
                    orgSlug={orgSlug}
                />
            )
            rightPane.setExpanded?.(false)
            lastHandledDeeplinkHashRef.current = hash
        }

        void openFromHash()
        const handler = () => { void openFromHash() }
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [
        projectId,
        rightPane.hasRightPane,
        session?.access_token,
        isLoadingFolders,
        // navigateToItem / files / loading included only as fallback triggers — cache + in-progress
        // guard ensure the fetch only fires once even if these change concurrently.
        navigateToItem,
        loading,
        files,
        addToast,
        viewAsPersonaSlug,
    ])

    const searchPanelActionMenuRef = useRef<EngagementSearchPanelActionMenuProps | null>(null)

    const searchRootFolderId =
        currentFolderType === 'general'
            ? generalFolderId
            : currentFolderType === 'confidential'
                ? confidentialFolderId
                : stagingFolderId
    const searchRootLabel =
        searchRootFolderId && currentFolderType
            ? currentFolderType.charAt(0).toUpperCase() + currentFolderType.slice(1)
            : undefined

    useEffect(() => {
        rightPane.setSearchRoot({
            searchRootFolderId: searchRootFolderId ?? null,
            searchRootLabel: searchRootLabel ?? null,
        })
        // Intentionally omit rightPane from deps: setSearchRoot is stable; including rightPane
        // would re-run after every provider re-render (setSearchRoot updates context) and cause an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rightPane ref would cause infinite loop
    }, [searchRootFolderId, searchRootLabel])

    const openSearchPanel = useCallback(() => {
        rightPane.setTitle('Search')
        rightPane.setHeaderIcon(<Search className="h-4 w-4" />)
        rightPane.setHeaderActions(null)
        if (isSandboxFirm) {
            rightPane.setHeaderSubtitle('Sandbox preview')
            rightPane.setContent(
                <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                    <p className="text-xs text-[#45474c]">Search is available on real files. Upgrade to a paid plan to connect Google Drive and manage client files.</p>
                </div>
            )
            return
        }
        rightPane.setSearchRoot({
            searchRootFolderId: searchRootFolderId ?? null,
            searchRootLabel: searchRootLabel ?? null,
        })
        rightPane.setHeaderSubtitle('')
        rightPane.setContent(
            <EngagementSearchProvider
                projectId={projectId}
                viewAsPersonaSlug={viewAsPersonaSlug}
                searchRootFolderId={searchRootFolderId ?? undefined}
                searchRootLabel={searchRootLabel}
            >
                <EngagementSearchPanel
                    projectId={projectId}
                    generalFolderId={generalFolderId}
                    confidentialFolderId={confidentialFolderId}
                    stagingFolderId={stagingFolderId}
                    navigateToItem={navigateToItem}
                    onClose={() => {
                        rightPane.clearPane()
                        restoreSearchHeaderRef.current?.()
                    }}
                    actionMenuProps={firmId ? (searchPanelActionMenuRef.current ?? undefined) : undefined}
                />
            </EngagementSearchProvider>
        )
    }, [rightPane, projectId, viewAsPersonaSlug, currentFolderType, generalFolderId, confidentialFolderId, stagingFolderId, navigateToItem, firmId, searchRootFolderId, searchRootLabel, isSandboxFirm])

    // Register search icon in the right panel header (mount-only to avoid infinite loop: setHeaderActions updates context and would re-trigger this effect).
    const rightPaneRef = useRef(rightPane)
    rightPaneRef.current = rightPane
    const openSearchPanelRef = useRef(openSearchPanel)
    openSearchPanelRef.current = openSearchPanel
    const restoreSearchHeaderRef = useRef<() => void>(() => {})
    const searchHeaderAction = (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openSearchPanelRef.current()}
                    className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    aria-label="Search engagement files"
                >
                    <Search className="h-4 w-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
                Search engagement files
            </TooltipContent>
        </Tooltip>
    )
    useEffect(() => {
        const pane = rightPaneRef.current
        pane.setHeaderActions(searchHeaderAction)
        restoreSearchHeaderRef.current = () => rightPaneRef.current.setHeaderActions(searchHeaderAction)
        return () => {
            rightPaneRef.current.setHeaderActions(null)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; refs keep latest rightPane/openSearchPanel to avoid infinite re-renders from setHeaderActions
    }, [])

    const handleItemClick = (file: DriveFile) => {
        // Keep folder navigation; remove click-to-open for documents in FILES tab.
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            handleFolderClick(file)
        }
    }

    const fetchFiles = useCallback(async (folderId: string, silent = false) => {
        if (!sessionRef.current?.access_token) return
        if (!silent) setLoading(true)
        setError(null)
        try {
            const isSharedOnlyPersona = viewAsPersonaSlug === 'eng_ext_collaborator' || viewAsPersonaSlug === 'eng_viewer'
            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${sessionRef.current.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'list',
                    folderId,
                    projectId,
                    ...(isSharedOnlyPersona ? { viewAsPersonaSlug: viewAsPersonaSlug } : {})
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to fetch files')
            }
            const data = await res.json()
            const loadedFiles = data.files || []
            setFiles(loadedFiles)
            refreshFileCount(loadedFiles)
        } catch (err: any) {
            logger.error(err)
            setError(err.message)
        } finally {
            if (!silent) setLoading(false)
        }
    }, [projectId, viewAsPersonaSlug, refreshFileCount])

    // Stable ref to currentFolderId — used by hooks to avoid stale closures
    const currentFolderIdRef = useRef<string | null>(null)
    useEffect(() => {
        currentFolderIdRef.current = currentFolderId
    }, [currentFolderId])

    // Upload hook
    const {
        conflictItems,
        overwriteSelections,
        uploadProgress,
        uploadQueue,
        isUploading,
        isUploadInitiating,
        isUploadModalOpen,
        uploadOverlayDismissedRef,
        dismissUploadPanel,
        setShowFileLocationCallback,
        uploadFile,
        processUploads,
        handleBatchResolution,
        cancelBatchResolution,
        processFolderUpload,
        handleFileUpload: handleFileUploadFromHook,
        handleFolderUpload: handleFolderUploadFromHook,
        setConflictItems,
        setOverwriteSelections,
    } = useEngagementUpload({
        sessionRef,
        projectId,
        currentFolderIdRef,
        files,
        viewAsPersonaSlug,
        restrictToSharedOnly,
        isSandboxFirm,
        fetchFiles,
    })

    // File operations hook
    const {
        renameModalOpen, setRenameModalOpen,
        renameTarget, setRenameTarget,
        renameNewName, setRenameNewName,
        renameSubmitting, setRenameSubmitting,
        trashConfirmTarget, setTrashConfirmTarget,
        trashConfirming,
        copyMoveModalOpen, setCopyMoveModalOpen,
        copyMoveTarget, setCopyMoveTarget,
        copyMoveAction, setCopyMoveAction,
        copyMoveKeepBoth, setCopyMoveKeepBoth,
        currentPath, setCurrentPath,
        destinationFolders,
        selectedDestinationId, setSelectedDestinationId,
        loadingDestinations,
        copyMoveSubmittingFolderId,
        emptyFolderIds,
        checkingFolderId,
        crossEngagementModalOpen, setCrossEngagementModalOpen,
        crossEngagementTarget, setCrossEngagementTarget,
        crossEngagementFirmName, setCrossEngagementFirmName,
        crossEngagementEngagements,
        crossEngagementLoading,
        crossEngagementSubmitting,
        crossEngagementSelectedId, setCrossEngagementSelectedId,
        unlockConfirmFile, setUnlockConfirmFile,
        unlockInProgress,
        unshareConfirmFile, setUnshareConfirmFile,
        unshareInProgress,
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
    } = useEngagementFileOps({
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
    })

    const handleMarkAsDeliverable = useCallback(async (doc: any) => {
        const token = sessionRef.current?.access_token
        if (!token || !projectId) return
        const documentId = doc.projectDocumentId || doc.id
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAsDeliverable: true }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Failed', message: err.error ?? 'Could not mark as Deliverable.' })
                return
            }
            addToast({ type: 'success', title: 'Marked as Deliverable', message: `"${doc.name}" added to the Board.` })
            await refreshShareStateAndFiles()
        } catch {
            addToast({ type: 'error', title: 'Error', message: 'Could not mark as Deliverable.' })
        }
    }, [sessionRef, projectId, refreshShareStateAndFiles, addToast])

    const handleUntagAsDeliverable = useCallback(async (doc: any) => {
        const token = sessionRef.current?.access_token
        if (!token || !projectId) return
        const documentId = doc.projectDocumentId || doc.id
        try {
            const res = await fetch(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/sharing`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ untagAsDeliverable: true }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                addToast({ type: 'error', title: 'Failed', message: err.error ?? 'Could not untag Deliverable.' })
                return
            }
            addToast({ type: 'success', title: 'Untagged', message: `"${doc.name}" removed from the Board.` })
            await refreshShareStateAndFiles()
        } catch {
            addToast({ type: 'error', title: 'Error', message: 'Could not untag Deliverable.' })
        }
    }, [sessionRef, projectId, refreshShareStateAndFiles, addToast])

    const handleBulkTrashClick = useCallback(() => {
        if (!selectedFileIds.size) return
        const ids = Array.from(selectedFileIds)
        const selected = files.filter(f => ids.includes(f.id))
        // Block if any selected item is an approved deliverable or inside one
        const hasApproved = currentFolderIsApprovedDeliverable
            || selected.some(f => f.isDeliverable && (f as any).deliverableStatus === 'approved')
        if (hasApproved) {
            addToast({
                type: 'error',
                title: 'Cannot delete',
                message: 'One or more selected items are Approved Deliverables and cannot be moved to Bin.',
                duration: 6000,
            } as any)
            return
        }
        setPendingBulkTrashIds(new Set(selectedFileIds))
        setBulkTrashConfirmOpen(true)
    }, [selectedFileIds, files, currentFolderIsApprovedDeliverable, addToast])

    const handleBulkTrashConfirmed = useCallback(async () => {
        if (!pendingBulkTrashIds.size || !sessionRef.current?.access_token) return
        if (orgSandbox?.sandboxOnly) {
            addToast({ type: 'error', title: 'Sandbox', message: SANDBOX_OPERATION_MESSAGE, duration: 12000 } as any)
            setBulkTrashConfirmOpen(false)
            return
        }
        const ids = Array.from(pendingBulkTrashIds)
        const filesToTrash = files.filter(f => ids.includes(f.id))
        setBulkTrashConfirmOpen(false)
        setSelectedFileIds(new Set())
        setPendingBulkTrashIds(new Set())

        const queueItems: TrashQueueItem[] = filesToTrash.map(f => ({ id: f.id, name: f.name, connectorId: f.connectorId ?? '', status: 'pending' }))
        setTrashQueue(queueItems)
        setIsTrashPanelOpen(true)

        for (const item of queueItems) {
            try {
                const res = await fetch('/api/drive-action', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { Authorization: `Bearer ${sessionRef.current?.access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'trash', fileId: item.id, connectorId: item.connectorId, projectId, fileName: item.name }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err.error || 'Failed to move to bin')
                }
                setTrashQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done' } : i))
            } catch (e: any) {
                setTrashQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: e?.message || 'Failed' } : i))
            }
        }

        const currentFolderId = currentFolderIdRef.current
        if (currentFolderId) fetchFiles(currentFolderId, true)
    }, [pendingBulkTrashIds, sessionRef, orgSandbox, files, projectId, currentFolderIdRef, fetchFiles, addToast])

    // Drag & drop hook
    const {
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
    } = useEngagementDragDrop({
        canEdit,
        processUploads,
        handleCopyMoveToFolder,
        addToast,
    })

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => handleFileUploadFromHook(e, fileInputRef)
    const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => handleFolderUploadFromHook(e, folderInputRef)

    useEffect(() => {
        if (isUploading || isUploadInitiating) {
            coffeeIconRef.current?.startAnimation()
        } else {
            coffeeIconRef.current?.stopAnimation()
        }
    }, [isUploading, isUploadInitiating])

    const handleShowFileLocation = useCallback((fileName: string) => {
        const file = files.find(f => f.name === fileName)
        if (file) {
            setHighlightedFileId(file.id)
            setTimeout(() => {
                const el = document.querySelector(`[data-file-id="${file.id}"]`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 100)
        }
    }, [files])

    useEffect(() => {
        setShowFileLocationCallback(handleShowFileLocation)
        return () => setShowFileLocationCallback(null)
    }, [handleShowFileLocation, setShowFileLocationCallback])



    useEffect(() => {
        if (currentFolderId && session?.access_token) {
            fetchFiles(currentFolderId)
        }
    }, [currentFolderId, fetchFiles, session?.access_token])

    // After navigating to a new folder, pick up any pending deeplink highlight (set by Shares "Open" action).
    useEffect(() => {
        if (!currentFolderId || !projectId) return
        const pendingId = consumeDeeplinkHighlight(projectId)
        if (pendingId) setHighlightedFileId(pendingId)
    }, [currentFolderId, projectId])

    // Clear the deeplink skeleton once the destination folder has finished loading and the target is highlighted.
    // Clearing earlier (right after navigateToItem) causes a stale-files flash because fetchFiles hasn't run yet.
    // Also require currentFolderId — if navigation set highlightedFileId but fetchFiles hasn't batched loading=true yet,
    // this prevents a brief flash of the "no folders configured" empty state.
    // Once resolved, strip the hash from the URL so a later refresh doesn't re-trigger deeplink navigation.
    useEffect(() => {
        if (!deeplinkResolving) return
        if (!highlightedFileId) return
        if (!currentFolderId) return
        if (loading || isLoadingFolders) return
        setDeeplinkResolving(false)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }, [deeplinkResolving, highlightedFileId, currentFolderId, loading, isLoadingFolders])

    // When View As persona changes, refetch files so backend can filter by shared-only when EC/Guest (cookie is sent)
    useEffect(() => {
        if (!currentFolderId) return
        fetchFiles(currentFolderId, true)
    }, [viewAsPersonaSlug])

    // When folder load completes with no folder (e.g. reimport without doc subfolders), stop spinner.
    // Skip when a deeplink hash is present — openFromHash will set currentFolderId shortly after,
    // and clearing loading here would flash the "no folders configured" empty state.
    useEffect(() => {
        if (!isLoadingFolders && !currentFolderId && !deeplinkResolving) {
            setLoading(false)
        }
    }, [isLoadingFolders, currentFolderId, deeplinkResolving])

    // Scroll the highlighted row into view once the list is on screen (not during folder refetch spinner).
    // Highlight stays until the user navigates to another folder (see handleFolderClick / breadcrumb / root tabs).
    useEffect(() => {
        if (!highlightedFileId) return
        if (loading || isLoadingFolders) return
        const scrollToTarget = () => {
            const el = document.querySelector(`[data-file-id="${highlightedFileId}"]`)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        scrollToTarget()
        const raf = requestAnimationFrame(scrollToTarget)
        return () => cancelAnimationFrame(raf)
    }, [highlightedFileId, loading, isLoadingFolders])

const handleRefresh = async () => {
        if (!currentFolderId || isRefreshing) return
        setIsRefreshing(true)
        try {
            await fetchFiles(currentFolderId, true)
        } finally {
            setIsRefreshing(false)
        }
    }

    const openCreateDialog = (type: CreateItemType) => {
        if (isSandboxFirm) {
            showSandboxPickerToast()
            return
        }
        setCreateItemType(type)
        setNewItemName('')
        setIsCreateItemOpen(true)
    }

    const handleCreateItem = async () => {
        if (!newItemName.trim() || !session?.access_token) return
        if (isCreatingRef.current) return
        if (isSandboxFirm) {
            showSandboxPickerToast()
            return
        }
        isCreatingRef.current = true
        setLoading(true)
        try {
            let mimeType = 'application/vnd.google-apps.folder'
            switch (createItemType) {
                case 'doc': mimeType = 'application/vnd.google-apps.document'; break;
                case 'sheet': mimeType = 'application/vnd.google-apps.spreadsheet'; break;
                case 'slide': mimeType = 'application/vnd.google-apps.presentation'; break;
                case 'form': mimeType = 'application/vnd.google-apps.form'; break;
                case 'drawing': mimeType = 'application/vnd.google-apps.drawing'; break;
                case 'map': mimeType = 'application/vnd.google-apps.map'; break;
                case 'site': mimeType = 'application/vnd.google-apps.site'; break;
                case 'script': mimeType = 'application/vnd.google-apps.script'; break;
            }

            const CREATE_ITEM_EXTENSIONS: Record<string, string> = {
                doc: '.gdoc',
                sheet: '.gsheet',
                slide: '.gslide',
                form: '.gform',
                drawing: '.gdraw',
                script: '.gs'
            }
            const ext = CREATE_ITEM_EXTENSIONS[createItemType]
            const trimmed = newItemName.trim()
            const finalName = ext
                ? (trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? trimmed : `${trimmed}${ext}`)
                : trimmed

            const res = await fetch('/api/connectors/google-drive/linked-files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'create-folder',
                    folderId: currentFolderId || 'root',
                    name: finalName,
                    mimeType,
                    projectId
                })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                const msg = body?.error || `Create ${createItemType} failed`
                addToast({ type: 'error', title: 'Could not create file', message: msg })
                setIsCreateItemOpen(false)
                setNewItemName('')
                setLoading(false)
                isCreatingRef.current = false
                return
            }

            setIsCreateItemOpen(false)
            setNewItemName('')
            isCreatingRef.current = false
            if (currentFolderId) fetchFiles(currentFolderId)
        } catch (err: any) {
            logger.error(err)
            isCreatingRef.current = false
            addToast({ type: 'error', title: 'Could not create file', message: err.message })
            setLoading(false)
        }
    }

    const handleGoogleDrivePicker = async () => {
        if (!sessionRef.current?.access_token) return

        try {
            setImportLoading(true)
            const res = await fetch('/api/connectors/google-drive?action=token', {
                headers: { Authorization: `Bearer ${sessionRef.current.access_token}` }
            })

            if (!res.ok) throw new Error('Failed to get Google Access Token')

            const data = await res.json()
            const googleAccessToken = data.accessToken
            setPickerToken(googleAccessToken) // Store for import action

            if (!googleAccessToken) throw new Error('No Google Access Token returned')

            // Two tabs: "My Drive" (root + LIST) and "Shared Drives" (LIST); user can traverse and multi-select in both
            const win = typeof window !== 'undefined' ? window : null
            const pickerApi = win && (win as unknown as { google?: { picker?: unknown } }).google?.picker
            const customViews = pickerApi
                ? (() => {
                    const g = (win as unknown as {
                        google: {
                            picker: {
                                DocsView: new (id: string) => unknown
                                ViewId: { DOCS: string }
                                DocsViewMode: { LIST: string }
                            }
                        }
                    }).google.picker
                    type ViewLike = {
                        setParent?: (p: string) => ViewLike
                        setIncludeFolders: (v: boolean) => ViewLike
                        setMode: (m: string) => ViewLike
                        setLabel?: (l: string) => ViewLike
                        setEnableDrives?: (v: boolean) => ViewLike
                    }
                    const myDriveView = new g.DocsView(g.ViewId.DOCS) as ViewLike
                    myDriveView.setParent!('root')
                    myDriveView.setIncludeFolders(true)
                    myDriveView.setMode(g.DocsViewMode.LIST)
                    if (myDriveView.setLabel) myDriveView.setLabel('My Drive')

                    const sharedDrivesView = new g.DocsView(g.ViewId.DOCS) as ViewLike
                    sharedDrivesView.setIncludeFolders(true)
                    sharedDrivesView.setMode(g.DocsViewMode.LIST)
                    if (sharedDrivesView.setEnableDrives) sharedDrivesView.setEnableDrives(true)
                    if (sharedDrivesView.setLabel) sharedDrivesView.setLabel('Shared Drives')

                    return [myDriveView, sharedDrivesView]
                })()
                : undefined

            // @ts-ignore - Explicitly match onboarding config (empty key)
            openPicker({
                clientId: config.googleDrive.clientId || "",
                developerKey: "",
                appId: config.googleDrive.appId || "",
                viewId: "DOCS",
                token: googleAccessToken,
                showUploadView: false,
                setIncludeFolders: true,
                supportDrives: true,
                multiselect: true,
                disableDefaultView: !!customViews,
                customViews,
                setParentFolder: customViews ? undefined : 'root',
                callbackFunction: (data: { action: string; docs?: unknown[] }) => {
                    if (data.action === 'picked') {
                        setImportedFiles(data.docs ?? [])
                        setIsImportDialogOpen(true)
                    }
                },
            })
        } catch (error) {
            console.error('Failed to launch picker', error)
        } finally {
            setImportLoading(false)
        }
    }

    const handleImportConfirm = async (mode: 'copy' | 'shortcut') => {
        setImportLoading(true)
        try {
            logger.debug(`[Frontend] Import Confirm. FolderId: ${currentFolderId}`)

            // Pre-flight cap check before any Drive operations
            const gateRes = await fetch(`/api/billing/document-gate?projectId=${encodeURIComponent(projectId)}&count=${importedFiles.length}`)
            if (gateRes.ok) {
                const gate = await gateRes.json() as { allowed: boolean; cap: number | null; current: number | null; available: number }
                if (!gate.allowed) {
                    const { cap, current, available } = gate
                    const count = importedFiles.length
                    const msg = count === 1
                        ? `Your plan limit of ${cap} files has been reached (${current} used). Delete any unused file or upgrade to remove the limit.`
                        : `This import contains ${count} files, but your plan has a limit of ${cap}, with only ${available} slot${available !== 1 ? 's' : ''} left. Import fewer files, within the available limit or upgrade to remove the limit.`
                    setError(msg)
                    setImportLoading(false)
                    return
                }
            }

            // Fetch connection info
            const tokenRes = await fetch('/api/connectors/google-drive?action=token', {
                headers: { Authorization: `Bearer ${sessionRef.current?.access_token}` }
            })
            const tokenData = await tokenRes.json()
            const connectionId = tokenData.connectionId

            const res = await fetch('/api/connectors/google-drive/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionRef.current?.access_token}`
                },
                body: JSON.stringify({
                    connectionId,
                    fileIds: importedFiles.map(f => f.id),
                    mode,
                    parentId: currentFolderId || 'root',
                    userToken: pickerToken // Pass the user's token
                })
            })

            if (!res.ok) {
                const d = await res.json()
                throw new Error(d.error || 'Import failed')
            }

            // Success
            setIsImportDialogOpen(false)
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (err: any) {
            logger.error(err)
            setError(err.message)
        } finally {
            setImportLoading(false)
        }
    }

    const setSortBy = (sortBy: SortByOption) => setSortConfig(c => ({ ...c, sortBy }))
    const setSortDirection = (direction: 'asc' | 'desc') => setSortConfig(c => ({ ...c, direction }))
    const setFoldersFirst = (foldersFirst: boolean) => setSortConfig(c => ({ ...c, foldersFirst }))

    const handleFolderClick = (file: DriveFile) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            setHighlightedFileId(null)
            const isPending = !!file.isPendingApproval || breadcrumbs.some(c => c.isPendingApproval)
            setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name, projectDocumentId: file.projectDocumentId, clickable: true, isPendingApproval: isPending }])
            setCurrentFolderId(file.id)
            // Entering an approved deliverable folder OR navigating deeper inside one
            setCurrentFolderIsApprovedDeliverable(
                !!(file.isDeliverable && (file as any).deliverableStatus === 'approved')
                || currentFolderIsApprovedDeliverable
            )
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#doc-file:${file.projectDocumentId ?? file.id}`)
        }
    }

    const handleBreadcrumbClick = (index: number, id: string) => {
        const item = breadcrumbs[index]
        // Don't allow clicking on non-clickable items (org, client, project)
        if (item && item.clickable === false) {
            return
        }
        setHighlightedFileId(null)
        setBreadcrumbs(prev => prev.slice(0, index + 1))
        setCurrentFolderId(id)
        // When navigating up via breadcrumb, check if target folder is an approved deliverable
        const folderInList = files.find(f => f.id === id)
        setCurrentFolderIsApprovedDeliverable(
            !!(folderInList?.isDeliverable && (folderInList as any).deliverableStatus === 'approved')
        )
        const rootIds = [generalFolderId, confidentialFolderId, stagingFolderId].filter(Boolean)
        if (rootIds.includes(id)) {
            // Root folders are restored by default on load — no hash needed
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
        } else {
            const docId = item?.projectDocumentId ?? id
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#doc-file:${docId}`)
        }
    }

    const handleSwitchToRoot = (type: 'general' | 'confidential' | 'staging') => {
        const folderId = type === 'general' ? generalFolderId : type === 'confidential' ? confidentialFolderId : stagingFolderId
        if (!folderId) return
        setHighlightedFileId(null)
        setCurrentFolderId(folderId)
        setCurrentFolderType(type)
        setCurrentFolderIsApprovedDeliverable(false)
        setBreadcrumbs([{ id: folderId, name: type, clickable: true, isEngagementRoot: true }])
        // Root folders are restored by default on load — clear the hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    // Check if we're at project root level (not in general or confidential)
    const isAtProjectRoot = currentFolderId === connectorRootFolderId || (!currentFolderId && !generalFolderId && !confidentialFolderId)

    const toggleFilterType = (type: string) => {
        setFilterTypes(prev => {
            const next = new Set(prev)
            if (next.has(type)) {
                next.delete(type)
            } else {
                next.add(type)
            }
            return next
        })
    }

    // Filter Logic: search, type, owner, modified, sort. Shared-only filtering is done on the backend when View As EC/Guest.
    // Memoized so list re-renders stay fast. This component is only mounted when the Files tab is active (engagement-workspace conditional mount).
    const sortedFiles = useMemo(() => {
        // If any ancestor breadcrumb is a pending intake folder, all children inherit the pending treatment
        const insidePendingFolder = breadcrumbs.some(c => c.isPendingApproval)
        let result = insidePendingFolder
            ? files.map(f => f.isPendingApproval ? f : { ...f, isPendingApproval: true })
            : [...files]

        if (filterTypes.size > 0) {
            result = result.filter(f => {
                const mime = f.mimeType
                if (filterTypes.has('folder') && mime === 'application/vnd.google-apps.folder') return true
                if (filterTypes.has('document')) {
                    const isDoc = mime === 'application/vnd.google-apps.document' ||
                        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                        mime === 'application/msword'
                    if (isDoc) return true
                }
                if (filterTypes.has('spreadsheet') && mime === 'application/vnd.google-apps.spreadsheet') return true
                if (filterTypes.has('presentation') && mime === 'application/vnd.google-apps.presentation') return true
                if (filterTypes.has('image') && mime.startsWith('image/')) return true
                if (filterTypes.has('other')) {
                    const isKnown = mime === 'application/vnd.google-apps.folder' ||
                        mime === 'application/vnd.google-apps.document' ||
                        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                        mime === 'application/msword' ||
                        mime === 'application/vnd.google-apps.spreadsheet' ||
                        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                        mime === 'application/vnd.google-apps.presentation' ||
                        mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                        mime.startsWith('image/')
                    if (!isKnown) return true
                }
                return false
            })
        }

        if (filterOwner !== 'any' && session?.user?.email) {
            const myEmail = session.user.email.toLowerCase()
            result = result.filter(f => {
                const owner = (f.actorEmail || '').toLowerCase()
                if (filterOwner === 'me') return owner === myEmail || owner === '' || !owner
                if (filterOwner === 'not-me') return owner !== '' && owner !== myEmail
                if (filterOwner === 'private-me') {
                    const isOwner = owner === myEmail || owner === '' || !owner
                    const isShared = sharedExternalIds.has(f.id) || ancestorFolderIds.has(f.id)
                    return isOwner && !isShared
                }
                return true
            })
        }

        if (filterModified !== 'any') {
            const now = Date.now()
            const day = 24 * 60 * 60 * 1000
            result = result.filter(f => {
                const t = new Date(f.modifiedTime).getTime()
                if (filterModified === '7d') return now - t <= 7 * day
                if (filterModified === '30d') return now - t <= 30 * day
                if (filterModified === 'year') return new Date(f.modifiedTime).getFullYear() === new Date().getFullYear()
                return true
            })
        }

        const direction = sortConfig.direction === 'asc' ? 1 : -1
        const getSortValue = (f: DriveFile): string | number => {
            if (sortConfig.sortBy === 'name') return f.name
            if (sortConfig.sortBy === 'modifiedTime' || sortConfig.sortBy === 'modifiedTimeByMe') return new Date(f.modifiedTime).getTime()
            if (sortConfig.sortBy === 'viewedByMeTime') return new Date(f.viewedByMeTime || f.lastViewedTime || 0).getTime()
            return 0
        }
        const cmp = (a: DriveFile, b: DriveFile): number => {
            const va = getSortValue(a)
            const vb = getSortValue(b)
            if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * direction
            return ((Number(va) || 0) - (Number(vb) || 0)) * direction
        }
        if (filterShared !== 'all') {
            result = result.filter(f => {
                if (filterShared === 'by_me') return sharedByMeExternalIds.has(f.id)
                if (filterShared === 'by_others') {
                    const isShared = sharedExternalIds.has(f.id) || ancestorFolderIds.has(f.id)
                    return isShared && !sharedByMeExternalIds.has(f.id)
                }
                if (filterShared === 'with_collaborator') return sharedExternalIdsForEC.has(f.id) || ancestorFolderIdsForEC.has(f.id) || descendantIdsForEC.has(f.id)
                if (filterShared === 'with_viewer') return sharedExternalIdsForGuest.has(f.id) || ancestorFolderIdsForGuest.has(f.id) || descendantIdsForGuest.has(f.id)
                if (filterShared === 'pending_intake') return !!f.isPendingApproval
                return true
            })
        }
        if (sortConfig.foldersFirst) {
            const folders = result.filter(f => f.mimeType === 'application/vnd.google-apps.folder').sort(cmp)
            const rest = result.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').sort(cmp)
            return [...folders, ...rest]
        }
        return result.sort(cmp)
    }, [files, sortConfig, filterTypes, filterOwner, filterModified, filterShared, sharedByMeExternalIds, sharedExternalIds, sharedExternalIdsForEC, sharedExternalIdsForGuest, ancestorFolderIds, ancestorFolderIdsForEC, ancestorFolderIdsForGuest, descendantIdsForEC, descendantIdsForGuest, session?.user?.email, breadcrumbs])

    const TableHeader = ({ label }: { label: string }) => (
        <div className="flex items-center gap-1 text-[0.8125rem] font-medium text-[#45474c] select-none">
            {label}
        </div>
    )

    return (
        <div className="flex flex-col h-full overflow-hidden"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Top Bar: Breadcrumbs & Actions — renders on background, outside the content card */}
            <div className="px-0 pt-1 pb-2 flex flex-col gap-2.5 shrink-0 z-20">
                {/* Breadcrumbs: root always visible (as dropdown when canManage); truncate middle */}
                <div className="flex items-center text-xs font-medium text-slate-700 min-w-0">
                    <div className="flex items-center min-w-0 overflow-x-auto whitespace-nowrap custom-scrollbar">
                        {(() => {
                            const ROOT_INDEX = 0
                            const showAll = breadcrumbs.length <= 4
                            const displayItems: { item: BreadcrumbItem; index: number; isEllipsis: boolean; isRoot: boolean }[] = showAll
                                ? breadcrumbs.map((item, index) => ({ item, index, isEllipsis: false, isRoot: index === ROOT_INDEX }))
                                : (() => {
                                    const root = { item: breadcrumbs[ROOT_INDEX], index: ROOT_INDEX, isEllipsis: false, isRoot: true }
                                    if (breadcrumbs.length === 5) {
                                        return [root, { item: breadcrumbs[4], index: 4, isEllipsis: false, isRoot: false }]
                                    }
                                    const lastTwo = [
                                        { item: breadcrumbs[breadcrumbs.length - 2], index: breadcrumbs.length - 2, isEllipsis: breadcrumbs[breadcrumbs.length - 2].clickable === false, isRoot: false },
                                        { item: breadcrumbs[breadcrumbs.length - 1], index: breadcrumbs.length - 1, isEllipsis: false, isRoot: false }
                                    ]
                                    return [root, ...lastTwo]
                                })()
                            const rootOptions: { type: 'general' | 'confidential' | 'staging'; label: string }[] = [
                                ...(generalFolderId ? [{ type: 'general' as const, label: 'General' }] : []),
                            ]
                            const showRootDropdown = canManage && rootOptions.length > 1
                            const currentRootLabel = currentFolderType === 'general' ? 'General' : currentFolderType === 'confidential' ? 'Confidential' : 'Staging'
                            return (
                                <>
                                    {displayItems.map(({ item, index, isEllipsis, isRoot }, i) => (
                                        <div key={`breadcrumb-${i}`} className="flex items-center flex-shrink-0">
                                            {i > 0 && <ChevronRight className="h-3.5 w-3.5 mx-1 text-slate-400 flex-shrink-0" />}
                                            {isRoot && showRootDropdown ? (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className={cn(
                                                                "flex items-center hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[180px] border-0 bg-transparent cursor-pointer",
                                                                index === breadcrumbs.length - 1 ? "text-slate-900 bg-slate-50" : "hover:text-slate-900"
                                                            )}
                                                            title={`Switch root: ${currentRootLabel}`}
                                                        >
                                                            {currentFolderType === 'general' && <Folder className="h-3.5 w-3.5 mr-1.5 text-primary flex-shrink-0" />}
                                                            {currentFolderType === 'confidential' && <FolderLock className="h-3.5 w-3.5 mr-1.5 text-red-500 flex-shrink-0" />}
                                                            {currentFolderType === 'staging' && <Inbox className="h-3.5 w-3.5 mr-1.5 text-amber-500 flex-shrink-0" />}
                                                            {!currentFolderType && <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />}
                                                            <span className="truncate capitalize">{currentRootLabel}</span>
                                                            <ChevronDown className="h-3.5 w-3.5 ml-1 text-slate-400 flex-shrink-0" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" className="min-w-[140px]">
                                                        {rootOptions.map(({ type, label }) => (
                                                            <DropdownMenuItem
                                                                key={type}
                                                                onClick={() => handleSwitchToRoot(type)}
                                                                className={cn("capitalize", currentFolderType === type && "bg-slate-50")}
                                                            >
                                                                {type === 'general' && <Folder className="h-3.5 w-3.5 mr-2 text-primary" />}
                                                                {type === 'confidential' && <FolderLock className="h-3.5 w-3.5 mr-2 text-red-500" />}
                                                                {type === 'staging' && <Inbox className="h-3.5 w-3.5 mr-2 text-amber-500" />}
                                                                {label}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            ) : isRoot ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreadcrumbClick(index, item.id)}
                                                    className={cn(
                                                        "flex items-center hover:bg-slate-100 px-1.5 py-1 rounded transition-colors",
                                                        index === breadcrumbs.length - 1 ? "text-slate-900 bg-slate-50" : "hover:text-slate-900"
                                                    )}
                                                    title="Files root"
                                                >
                                                    <Briefcase className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                                </button>
                                            ) : isEllipsis ? (
                                                <button
                                                    type="button"
                                                    onClick={() => item.clickable !== false ? handleBreadcrumbClick(index, item.id) : handleBreadcrumbClick(ROOT_INDEX, breadcrumbs[ROOT_INDEX].id)}
                                                    className="flex items-center hover:bg-slate-100 px-2 py-1 rounded transition-colors text-slate-500 hover:text-slate-900"
                                                    title={`Go up to ${item.clickable !== false ? item.name : 'root'}`}
                                                >
                                                    <span className="text-slate-400">…</span>
                                                </button>
                                            ) : item.clickable === false ? (
                                                <div className="flex items-center px-2 py-1 text-slate-500 cursor-default">
                                                    {index === 0 && <Building2 className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />}
                                                    {index === 1 && <Users className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />}
                                                    {index === 2 && <Briefcase className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />}
                                                    {index > 2 && <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />}
                                                    <span className="truncate max-w-[140px]" title={item.name}>{item.name}</span>
                                                </div>
                                            ) : item.isEngagementRoot ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreadcrumbClick(index, item.id)}
                                                    className={cn(
                                                        "flex items-center hover:bg-slate-100 px-1.5 py-1 rounded transition-colors",
                                                        index === breadcrumbs.length - 1 ? "text-slate-900 bg-slate-50" : "hover:text-slate-900"
                                                    )}
                                                    title="Files root"
                                                >
                                                    <Briefcase className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreadcrumbClick(index, item.id)}
                                                    className={cn(
                                                        "flex items-center hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[180px]",
                                                        index === breadcrumbs.length - 1 ? "text-slate-900 bg-slate-50" : "hover:text-slate-900"
                                                    )}
                                                    title={item.name}
                                                >
                                                    <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                                                    <span className="truncate">{item.name}</span>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )
                        })()}
                    </div>
                </div>

                {/* New Document button portaled into the workspace nav bar slot */}
                {navSlot && createPortal(
                    (isSandboxFirm || (!isAtProjectRoot && !currentFolderIsApprovedDeliverable && (canEdit || (restrictToSharedOnly && currentFolderType === 'general')))) ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button data-demo-tour="engagement-upload-btn" disabled={loading || isLoadingFolders || isUploading || isUploadInitiating} className="h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5">
                                    <Upload className="h-3.5 w-3.5" />
                                    New File / Folder
                                </Button>
                            </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[280px] py-1 rounded-[2px]">
                                {isSandboxFirm && (
                                    <div className="absolute inset-0 z-10 rounded-[inherit] pointer-events-auto cursor-not-allowed bg-transparent" />
                                )}
                                    <DropdownMenuItem onClick={() => openCreateDialog('folder')} className="text-xs py-1.5">
                                        <Folder className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                        New folder
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />

                                    {/* From your computer (expandable) */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setFromComputerExpanded(!fromComputerExpanded)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFromComputerExpanded(!fromComputerExpanded) } }}
                                        className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-sm cursor-pointer select-none"
                                    >
                                        <span className="flex items-center gap-2">
                                            <Laptop className="h-3.5 w-3.5 text-slate-500" />
                                            From your computer
                                        </span>
                                        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", fromComputerExpanded && "rotate-180")} />
                                    </div>
                                    {fromComputerExpanded && (
                                        <>
                                            <DropdownMenuItem
                                                onClick={() => fileInputRef.current?.click()}
                                                className="text-xs py-1.5 pl-8"
                                            >
                                                <Upload className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                                Upload files
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setIsFolderUploadModalOpen(true)}
                                                className="text-xs py-1.5 pl-8"
                                            >
                                                <FolderUp className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                                Upload folder
                                            </DropdownMenuItem>
                                        </>
                                    )}

                                    {isFirmAdmin ? (
                                        <>
                                        <DropdownMenuSeparator />

                                        {/* Import from Google Drive (expandable) — firm admins only */}
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setFromDriveExpanded(!fromDriveExpanded)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFromDriveExpanded(!fromDriveExpanded) } }}
                                            className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-sm cursor-pointer select-none"
                                        >
                                            <span className="flex items-center gap-2">
                                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                                Import from Google Drive
                                            </span>
                                            <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", fromDriveExpanded && "rotate-180")} />
                                        </div>
                                        {fromDriveExpanded && (
                                            <>
                                                <DropdownMenuItem onClick={handleGoogleDrivePicker} className="text-xs py-1.5 pl-8">
                                                    <Upload className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                                    Upload files
                                                </DropdownMenuItem>
                                                <DropdownMenuItem disabled className="text-xs py-1.5 pl-8 text-slate-400">
                                                    <FolderUp className="mr-2 h-3.5 w-3.5 text-slate-400" />
                                                    Upload folder
                                                    <span className="ml-1 text-[10px]">(coming later)</span>
                                                </DropdownMenuItem>
                                            </>
                                        )}

                                        <DropdownMenuSeparator />
                                        </>
                                    ) : <DropdownMenuSeparator />}

                                    {/* New File Section Header (expandable) */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setNewFileExpanded(!newFileExpanded)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNewFileExpanded(!newFileExpanded) } }}
                                        className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-sm cursor-pointer select-none"
                                    >
                                        <span className="flex items-center gap-2">
                                            <SquarePlus className="h-3.5 w-3.5 text-slate-500" />
                                            New file
                                        </span>
                                        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", newFileExpanded && "rotate-180")} />
                                    </div>
                                    {newFileExpanded && (
                                        <>
                                            <DropdownMenuItem onClick={() => openCreateDialog('doc')} className="text-xs py-1.5 pl-8">
                                                <FileText className="mr-2 h-3.5 w-3.5 text-blue-500" />
                                                Google Doc
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => openCreateDialog('sheet')} className="text-xs py-1.5 pl-8">
                                                <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-green-500" />
                                                Google Sheet
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => openCreateDialog('slide')} className="text-xs py-1.5 pl-8">
                                                <Presentation className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                                                Google Slide
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => openCreateDialog('form')} className="text-xs py-1.5 pl-8">
                                                <ListChecks className="mr-2 h-3.5 w-3.5 text-purple-600" />
                                                Google Form
                                            </DropdownMenuItem>
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger className="text-xs py-1.5 pl-8">More</DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="w-[200px] py-1">
                                                    <DropdownMenuItem onClick={() => openCreateDialog('drawing')} className="text-xs py-1.5">
                                                        <PenTool className="mr-2 h-3.5 w-3.5 text-red-500" />
                                                        Google Drawing
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openCreateDialog('map')} className="text-xs py-1.5">
                                                        <MapIcon className="mr-2 h-3.5 w-3.5 text-orange-500" />
                                                        Google My Map
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openCreateDialog('site')} className="text-xs py-1.5">
                                                        <Layout className="mr-2 h-3.5 w-3.5 text-blue-600" />
                                                        Google Site
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openCreateDialog('script')} className="text-xs py-1.5">
                                                        <Code className="mr-2 h-3.5 w-3.5 text-slate-600" />
                                                        Google Apps Script
                                                    </DropdownMenuItem>
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        </>
                                    )}

                                {isSandboxFirm && (
                                    <div className="px-3 py-2 border-t border-[#e5e7eb] bg-[#f9f9fb]">
                                        <p className="text-[10px] text-[#9a9ba0] leading-snug">Actions are unavailable in demo projects.</p>
                                    </div>
                                )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                    ) : null,
                    navSlot
                )}

                {/* Toolbar: Filters + right-side actions */}
                <div className="flex items-center justify-between gap-4">
                    {/* Left: Filters */}
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                                    <Filter className="h-3 w-3 opacity-60" />
                                    Type
                                    {filterTypes.size > 0 && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">{filterTypes.size}</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs rounded-[2px]">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Type</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterTypes.size === 0 ? true : (filterTypes.size < 5 ? ('indeterminate' as const) : false)} onCheckedChange={() => setFilterTypes(new Set())} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Any type
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem checked={filterTypes.has('folder')} onCheckedChange={() => toggleFilterType('folder')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Folders
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterTypes.has('document')} onCheckedChange={() => toggleFilterType('document')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Documents
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterTypes.has('spreadsheet')} onCheckedChange={() => toggleFilterType('spreadsheet')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Spreadsheets
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterTypes.has('presentation')} onCheckedChange={() => toggleFilterType('presentation')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Presentations
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterTypes.has('image')} onCheckedChange={() => toggleFilterType('image')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Images
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterTypes.has('other')} onCheckedChange={() => toggleFilterType('other')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Other
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* ... Other Filters (unchanged) ... */}
                        <DropdownMenu open={peopleFilterOpen} onOpenChange={setPeopleFilterOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", (filterOwner !== 'any' || filterShared !== 'all') && "border-slate-400 ring-1 ring-slate-300")}>
                                    <Filter className="h-3 w-3 opacity-60" />
                                    People
                                    {(filterOwner !== 'any' || filterShared !== 'all') && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">{(filterOwner !== 'any' ? 1 : 0) + (filterShared !== 'all' ? 1 : 0)}</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs rounded-[2px]">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">People</DropdownMenuLabel>
                                    <DropdownMenuItem onSelect={() => setPeopleFilterOpen(false)} className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'any' && filterShared === 'all'} onCheckedChange={() => { setFilterOwner('any'); setFilterShared('all') }} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Anyone
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <div className="px-2 pt-1.5 pb-0.5">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Owner</DropdownMenuLabel>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'me'} onCheckedChange={() => setFilterOwner(filterOwner === 'me' ? 'any' : 'me')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Owned by me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'not-me'} onCheckedChange={() => setFilterOwner(filterOwner === 'not-me' ? 'any' : 'not-me')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Owned by others
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'private-me'} onCheckedChange={() => setFilterOwner(filterOwner === 'private-me' ? 'any' : 'private-me')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Private to me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <div className="px-2 pt-1.5 pb-0.5">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Shared</DropdownMenuLabel>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterShared === 'by_me'} onCheckedChange={() => setFilterShared(filterShared === 'by_me' ? 'all' : 'by_me')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Shared by me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterShared === 'by_others'} onCheckedChange={() => setFilterShared(filterShared === 'by_others' ? 'all' : 'by_others')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Shared by others
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterShared === 'with_collaborator'} onCheckedChange={() => setFilterShared(filterShared === 'with_collaborator' ? 'all' : 'with_collaborator')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Shared with Collaborator (External)
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterShared === 'with_viewer'} onCheckedChange={() => setFilterShared(filterShared === 'with_viewer' ? 'all' : 'with_viewer')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Shared with Reviewer
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <div className="px-2 pt-1.5 pb-0.5">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Intake</DropdownMenuLabel>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterShared === 'pending_intake'} onCheckedChange={() => setFilterShared(filterShared === 'pending_intake' ? 'all' : 'pending_intake')} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    Pending Review
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", filterModified !== 'any' && "border-slate-400 ring-1 ring-slate-300")}>
                                    <Filter className="h-3 w-3 opacity-60" />
                                    Modified
                                    {filterModified !== 'any' && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[180px] py-1 text-xs rounded-[2px]">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Modified</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-[2px] bg-slate-900 text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterModified === 'any'} onCheckedChange={() => setFilterModified('any')} className="text-xs py-1.5 pl-8">
                                    Any time
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterModified === '7d'} onCheckedChange={() => setFilterModified('7d')} className="text-xs py-1.5 pl-8">
                                    Last 7 days
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterModified === '30d'} onCheckedChange={() => setFilterModified('30d')} className="text-xs py-1.5 pl-8">
                                    Last 30 days
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterModified === 'year'} onCheckedChange={() => setFilterModified('year')} className="text-xs py-1.5 pl-8">
                                    This year
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded-[2px] border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="h-3.5 w-3.5">
                                        <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z" />
                                    </svg>
                                    Sort
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[220px] py-1 text-xs rounded-[2px]">
                                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400">Sort by</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.sortBy === 'name'} onCheckedChange={() => setSortBy('name')}>
                                    Name
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.sortBy === 'modifiedTime'} onCheckedChange={() => setSortBy('modifiedTime')}>
                                    Date modified
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.sortBy === 'modifiedTimeByMe'} onCheckedChange={() => setSortBy('modifiedTimeByMe')}>
                                    Date modified by me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.sortBy === 'viewedByMeTime'} onCheckedChange={() => setSortBy('viewedByMeTime')}>
                                    Date opened by me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400">Sort direction</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.direction === 'asc'} onCheckedChange={() => setSortDirection('asc')}>
                                    A to Z
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.direction === 'desc'} onCheckedChange={() => setSortDirection('desc')}>
                                    Z to A
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-slate-400">Folders</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem className="text-xs" checked={sortConfig.foldersFirst} onCheckedChange={(c) => c === true && setFoldersFirst(true)}>
                                    On top
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem className="text-xs" checked={!sortConfig.foldersFirst} onCheckedChange={(c) => c === true && setFoldersFirst(false)}>
                                    Mixed with files
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {(filterTypes.size > 0 || filterOwner !== 'any' || filterModified !== 'any' || filterShared !== 'all') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterTypes(new Set())
                                    setFilterOwner('any')
                                    setFilterModified('any')
                                    setFilterShared('all')
                                }}
                                className="h-8 px-2.5 text-xs rounded-[2px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>

                    {/* Right: Refresh & Search (search lives in right sidebar only) */}
                    <div className="flex items-center gap-2">
                        {!restrictToSharedOnly && (
                        <>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={selectedFileIds.size === 0}
                                    onClick={handleBulkDownload}
                                    className={cn(
                                        "h-9 w-9 p-0 rounded-full transition-colors",
                                        selectedFileIds.size > 0
                                            ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-700 hover:border-slate-700"
                                            : "border-slate-200 text-slate-400 bg-white disabled:opacity-40"
                                    )}
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {selectedFileIds.size > 0 ? `Download ${selectedFileIds.size} item${selectedFileIds.size > 1 ? 's' : ''} as ZIP` : 'Select files to download'}
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={selectedFileIds.size === 0}
                                    onClick={handleBulkTrashClick}
                                    className={cn(
                                        "h-9 w-9 p-0 rounded-full transition-colors",
                                        selectedFileIds.size > 0
                                            ? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
                                            : "border-slate-200 text-slate-400 bg-white disabled:opacity-40"
                                    )}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {selectedFileIds.size > 0 ? `Move ${selectedFileIds.size} item${selectedFileIds.size > 1 ? 's' : ''} to Bin` : 'Select files to move to Bin'}
                            </TooltipContent>
                        </Tooltip>
                        </>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={loading || isRefreshing}
                                    onClick={handleRefresh}
                                    className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : files.some(f => f.indexingStatus === 'PROCESSING') && "animate-pulse")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                Refresh list (e.g. after renaming in Google Docs)
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={openSearchPanel}
                                    className="h-9 w-9 p-0 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    aria-label="Search engagement files"
                                >
                                    <Search className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                Search engagement files
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div >

            {/* Content Area - Styled as a Card */}
            <div className="flex-1 overflow-hidden flex flex-col relative bg-white rounded border border-[#e5e7eb]">
                {/* Download Progress Panel — portaled to body, stacked above upload panel */}
                {downloadQueue.length > 0 && typeof document !== 'undefined' && document.body && createPortal(
                    <div className={cn(
                        "fixed right-4 bg-white rounded-lg shadow-xl border border-slate-200 z-[101] flex flex-col transition-all duration-300 w-[360px]",
                        isDownloadPanelOpen ? "h-auto max-h-[300px]" : "h-10"
                    )}
                    style={{ bottom: uploadQueue.length > 0 ? 'calc(1rem + 160px)' : '1rem' }}>
                        <div
                            className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 text-slate-900 rounded-t-lg cursor-pointer"
                            onClick={() => setIsDownloadPanelOpen(!isDownloadPanelOpen)}
                        >
                            <span className="text-[11px] font-medium">
                                {downloadQueue.some(i => i.status === 'preparing')
                                    ? 'Preparing download…'
                                    : `Download${downloadQueue.length > 1 ? 's' : ''} complete`
                                } {downloadQueue.filter(i => i.status === 'done').length}/{downloadQueue.length}
                            </span>
                            <div className="flex items-center gap-2 text-slate-500">
                                {isDownloadPanelOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDownloadQueue([]) }}
                                    className="hover:bg-slate-200 rounded p-0.5 transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {isDownloadPanelOpen && (
                            <div className="flex-1 overflow-y-auto p-0">
                                {downloadQueue.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
                                        <Download className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                        <p className="text-[11px] text-slate-700 truncate flex-1">{item.name}</p>
                                        {item.status === 'preparing' && (
                                            <svg className="animate-spin h-3.5 w-3.5 text-slate-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                        )}
                                        {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-slate-900 flex-shrink-0" />}
                                        {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>,
                    document.body
                )}

                {/* Bulk Trash Progress Panel — stacks above download panel if both visible */}
                {trashQueue.length > 0 && typeof document !== 'undefined' && document.body && createPortal(
                    <div className={cn(
                        "fixed right-4 bg-white rounded-lg shadow-xl border border-slate-200 z-[102] flex flex-col transition-all duration-300 w-[360px]",
                        isTrashPanelOpen ? "h-auto max-h-[300px]" : "h-10"
                    )}
                    style={{ bottom: downloadQueue.length > 0
                        ? uploadQueue.length > 0 ? 'calc(2rem + 160px + 44px)' : 'calc(2rem + 44px)'
                        : uploadQueue.length > 0 ? 'calc(1rem + 160px)' : '1rem'
                    }}>
                        <div
                            className="flex items-center justify-between px-3 py-2 bg-red-50 border-b border-red-100 text-slate-900 rounded-t-lg cursor-pointer"
                            onClick={() => setIsTrashPanelOpen(!isTrashPanelOpen)}
                        >
                            <span className="text-[11px] font-medium">
                                {trashQueue.some(i => i.status === 'pending')
                                    ? `Moving to Bin… ${trashQueue.filter(i => i.status === 'done').length}/${trashQueue.length}`
                                    : `Moved to Bin ${trashQueue.filter(i => i.status === 'done').length}/${trashQueue.length}`
                                }
                            </span>
                            <div className="flex items-center gap-2 text-slate-500">
                                {isTrashPanelOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setTrashQueue([]) }}
                                    className="hover:bg-red-100 rounded p-0.5 transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {isTrashPanelOpen && (
                            <div className="flex-1 overflow-y-auto p-0">
                                {trashQueue.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
                                        <Trash2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                        <p className="text-[11px] text-slate-700 truncate flex-1">{item.name}</p>
                                        {item.status === 'pending' && (
                                            <svg className="animate-spin h-3.5 w-3.5 text-slate-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                        )}
                                        {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-slate-900 flex-shrink-0" />}
                                        {item.status === 'error' && <span title={item.error}><XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" /></span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>,
                    document.body
                )}

                <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                />
                <input
                    type="file"
                    ref={folderInputRef}
                    className="hidden"
                    // @ts-expect-error webkitdirectory is supported in Chrome/Edge for folder picker
                    webkitdirectory=""
                    multiple
                    onChange={handleFolderUpload}
                />

                {/* Drag Drop Overlay (External Upload) */}
                {
                    isDragging && (
                        <div className="absolute inset-0 z-50 bg-slate-100/90 border-2 border-dashed border-slate-400 flex flex-col items-center justify-center pointer-events-none">
                            <Upload className="h-16 w-16 text-slate-500 mb-4" />
                            <h3 className="text-xl font-medium text-slate-700">Drop files to upload</h3>
                        </div>
                    )
                }

                {/* Internal Drag Guide Overlay */}
                {
                    isInternalDragging && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <Layers className="h-5 w-5 text-indigo-400" />
                            <div>
                                <p className="text-sm font-semibold">Moving "{draggedItem?.name}"</p>
                                <p className="text-[10px] text-slate-400 opacity-90">Drop on any folder to move it there</p>
                            </div>
                            <div className="ml-4 h-6 w-px bg-slate-700" />
                            <button
                                onClick={() => handleItemDragEnd()}
                                className="text-[10px] font-medium hover:text-indigo-300 transition-colors uppercase tracking-wider"
                            >
                                Cancel
                            </button>
                        </div>
                    )
                }

                {/* Item count */}
                {files.length > 0 && (
                    <div className="px-4 py-1.5 border-b border-[#f0f0f2] bg-[#fafafa]">
                        <span className="text-[10px] font-medium text-[#9a9ba0]">
                            Showing {files.length} {files.length === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                )}

                {/* Fixed Table Header (Compact) */}
                <div className="sticky top-0 bg-white border-b border-[#e5e7eb] pl-3 pr-2 py-2.5 shrink-0 z-10 group">
                    <div className="grid gap-4 items-center" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(124px, 10%) 10% 14% 12% 10% 8%' }}>
                        <div className="flex items-center gap-3">
                            {/* Select-all checkbox — visible on hover of header or when in selection mode */}
                            <div
                                className={cn(
                                    "flex-shrink-0 w-4 h-4 flex items-center justify-center cursor-pointer",
                                    selectedFileIds.size > 0 ? "flex" : "hidden group-hover:flex"
                                )}
                                onClick={() => {
                                    const allIds = files.filter(f => f.id).map(f => f.id)
                                    const allSelected = allIds.every(id => selectedFileIds.has(id))
                                    setSelectedFileIds(allSelected ? new Set() : new Set(allIds))
                                }}
                            >
                                <Checkbox
                                    checked={files.length > 0 && files.every(f => selectedFileIds.has(f.id))}
                                    className="h-4 w-4 pointer-events-none"
                                />
                            </div>
                            <TableHeader label="Name" />
                        </div>
                        <div className="col-span-2 flex items-center justify-center"><TableHeader label="Quick" /></div>
                        <div className="flex items-center"><TableHeader label="Owner" /></div>
                        <div className="flex items-center"><TableHeader label="Date modified" /></div>
                        <div className="flex items-center"><TableHeader label="Due date" /></div>
                        <div className="flex items-center"><TableHeader label="File size" /></div>
                    </div>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {deeplinkResolving ? (
                        <div className="divide-y divide-[#e5e7eb] animate-pulse">
                            {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '1fr 80px 120px 160px 80px 36px' }}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-4 w-4 rounded bg-slate-200 flex-shrink-0" />
                                        <div className={`h-3 rounded bg-slate-200`} style={{ width: `${40 + (i * 17) % 45}%` }} />
                                    </div>
                                    <div className="h-3 w-8 rounded bg-slate-100" />
                                    <div className="h-3 w-16 rounded bg-slate-100" />
                                    <div className="h-3 w-20 rounded bg-slate-100" />
                                    <div className="h-3 w-8 rounded bg-slate-100" />
                                    <div className="h-3 w-4 rounded bg-slate-100" />
                                </div>
                            ))}
                        </div>
                    ) : loading || isLoadingFolders ? (
                        <div className="flex h-64 items-center justify-center">
                            <LoadingSpinner size="md" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                            <p className="text-sm text-slate-600">{error}</p>
                            <Button variant="link" onClick={() => window.location.reload()} className="h-auto p-0 mt-2 text-slate-700 hover:text-slate-900 text-xs">Try Refreshing</Button>
                        </div>
                    ) : !connectorRootFolderId && !deeplinkResolving ? (
                        isSandboxFirm ? (
                            <SandboxFilePreview
                                projectName={projectName}
                                onOpenCommentPane={(docId) => {
                                    rightPane.setTitle('Comments')
                                    rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
                                    rightPane.setHeaderActions(null)
                                    rightPane.setHeaderSubtitle('Sandbox preview')
                                    rightPane.setContent(
                                        <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                                            <p className="text-xs text-[#45474c]">Comments are available on real files. Upgrade to a paid plan to connect Google Drive and manage client files.</p>
                                        </div>
                                    )
                                }}
                                onOpenSearch={openSearchPanel}
                            />
                        ) : clientConnectorId ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                            <div className="h-12 w-12 bg-[#f3f4f6] rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-6 w-6 text-[#9a9ba0]" />
                            </div>
                            <h3 className="text-[0.8125rem] font-semibold text-[#1b1b1d] mb-1">Drive folder not set up</h3>
                            {workspaceRootLocation === 'SHARED' ? (
                                <>
                                    <p className="text-xs text-[#45474c] max-w-[280px] mx-auto mb-4">
                                        This workspace uses a Shared Drive. Go to <strong>Client Settings → Document Storage</strong> and use <strong>Migrate</strong> to re-select your workspace folder and create the folder structure.
                                    </p>
                                    {orgSlug && clientSlug && (
                                        <a
                                            href={`/d/f/${orgSlug}/c/${clientSlug}?tab=settings`}
                                            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all"
                                        >
                                            Go to Client Settings
                                        </a>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-[#45474c] max-w-[260px] mx-auto mb-4">
                                        This engagement was created before Google Drive was connected. Set up the folder to start managing files.
                                    </p>
                                    <button
                                        type="button"
                                        disabled={provisioning}
                                        onClick={() => void handleProvisionDriveFolder()}
                                        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {provisioning ? 'Setting up…' : 'Set up Drive Folder'}
                                    </button>
                                </>
                            )}
                        </div>
                        ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                            <div className="h-12 w-12 bg-[#f3f4f6] rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-6 w-6 text-[#9a9ba0]" />
                            </div>
                            <h3 className="text-[0.8125rem] font-semibold text-[#1b1b1d] mb-1">No Google Drive connected</h3>
                            <p className="text-xs text-[#45474c] max-w-[260px] mx-auto mb-4">
                                Connect a Google Drive account to this client to start uploading and managing engagement files.
                            </p>
                            {orgSlug && (
                                <a
                                    href={`/d/f/${orgSlug}?tab=settings&section=storage`}
                                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all"
                                >
                                    Go to Settings
                                </a>
                            )}
                        </div>
                        )
                    ) : !currentFolderId && !deeplinkResolving ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-8 w-8 text-slate-300" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">Drive not connected</h3>
                            <p className="text-sm text-slate-500 max-w-[280px] mx-auto mb-3">
                                {canManage
                                    ? 'This client is not linked to a Drive connector. Go to Firm Settings → Document Storage to link this client.'
                                    : 'This client is not linked to a Drive connector. Contact your firm administrator to set up Document Storage.'}
                            </p>
                            {canManage && orgSlug && (
                                <a
                                    href={`/d/f/${orgSlug}?tab=settings&section=storage`}
                                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 transition-all"
                                >
                                    Go to Document Storage
                                </a>
                            )}
                        </div>
                    ) : sortedFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-8 w-8 text-slate-300" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">Folder is empty</h3>
                            <p className="text-sm text-slate-500 max-w-[280px] mx-auto">
                                Drop folders or files here from your computer.
                            </p>
                        </div>
                    ) : (
                        <div className={cn("divide-y divide-[#e5e7eb]", isUploading && "opacity-50 transition-opacity")}>
                            {sortedFiles.map((file) => (
                                <EngagementFileRow
                                    key={file.id}
                                    file={file}
                                    isSelected={selectedFileIds.has(file.id)}
                                    selectedFileIdsSize={selectedFileIds.size}
                                    onToggleSelect={(fileId) => setSelectedFileIds(prev => {
                                        const next = new Set(prev)
                                        if (next.has(fileId)) next.delete(fileId)
                                        else next.add(fileId)
                                        return next
                                    })}
                                    activeCommentDocId={activeCommentDocId}
                                    activeInfoDocId={activeInfoDocId}
                                    activeActivityDocId={activeActivityDocId}
                                    activeVersionDocId={activeVersionDocId}
                                    activePreviewDocId={activePreviewDocId}
                                    highlightedFileId={highlightedFileId}
                                    onClearHighlight={() => setHighlightedFileId(null)}
                                    draggedItem={draggedItem}
                                    dragOverFolderId={dragOverFolderId}
                                    canEdit={canEdit}
                                    loading={loading}
                                    onDragStart={handleItemDragStart}
                                    onDragEnd={handleItemDragEnd}
                                    onDragOver={handleItemDragOver}
                                    onDragLeave={handleItemDragLeave}
                                    onDrop={handleItemDrop}
                                    onItemClick={handleItemClick}
                                    isProjectLead={isProjectLead}
                                    restrictToSharedOnly={restrictToSharedOnly}
                                    viewAsPersonaSlug={viewAsPersonaSlug}
                                    canManage={canManage && !currentFolderIsApprovedDeliverable}
                                    isInsideApprovedDeliverable={currentFolderIsApprovedDeliverable}
                                    currentFolderType={currentFolderType}
                                    generalFolderId={generalFolderId}
                                    projectId={projectId}
                                    orgSlug={orgSlug}
                                    sessionUserEmail={session?.user?.email}
                                    sharedExternalIds={sharedExternalIds}
                                    ancestorFolderIds={ancestorFolderIds}
                                    sharedExternalIdsForEC={sharedExternalIdsForEC}
                                    ancestorFolderIdsForEC={ancestorFolderIdsForEC}
                                    sharedExternalIdsForGuest={sharedExternalIdsForGuest}
                                    ancestorFolderIdsForGuest={ancestorFolderIdsForGuest}
                                    descendantIds={descendantIds}
                                    descendantIdsForEC={descendantIdsForEC}
                                    descendantIdsForGuest={descendantIdsForGuest}
                                    isActionMenuOpen={actionMenuOpenFileId === file.id}
                                    onActionMenuOpenChange={(open) => setActionMenuOpenFileId(open ? file.id : null)}
                                    processingFileIds={processingFileIds}
                                    isRegrantingId={isRegrantingId}
                                    onOpenComments={openCommentsForFile}
                                    onOpenRename={openRenameModal}
                                    onDuplicate={handleDuplicate}
                                    onOpenCopyMove={openCopyMoveModal}
                                    onOpenCrossEngagement={openCrossEngagementModal}
                                    onTrash={handleTrash}
                                    onPrivacy={handlePrivacy}
                                    onShareSaved={refreshShareStateAndFiles}
                                    onMarkAsDeliverable={handleMarkAsDeliverable}
                                    onUntagAsDeliverable={handleUntagAsDeliverable}
                                    onUnlockConfirm={setUnlockConfirmFile}
                                    onOpenDocument={(doc) => {
                                        const docId = doc.id ?? file.id
                                        handleSecureOpen(
                                            {
                                                documentId: docId,
                                                fileName: doc.name ?? '',
                                                mimeType: doc.mimeType,
                                                externalId: docId,
                                                firmId,
                                                webViewLink: doc.webViewLink || `https://drive.google.com/file/d/${docId}/view`,
                                            },
                                            docId
                                        )
                                    }}
                                    onOpenCommentPane={(docId) => setActiveCommentDocId(docId)}
                                    onOpenInfoPane={(docId) => setActiveInfoDocId(docId)}
                                    onOpenActivityPane={(docId) => setActiveActivityDocId(docId)}
                                    onOpenVersionPane={(docId) => setActiveVersionDocId(docId)}
                                    onOpenPreviewPane={(docId) => openPreviewForFile(docId, file)}
                                    onAddToast={(toast) => addToast(toast as any)}
                                    connectorAccountEmail={connectorAccountEmail}
                                    bookmarkId={bookmarkIdByDocumentId.get(file.projectDocumentId ?? '')}
                                    hideBadges={rightPane.content != null && rightPane.paneSize === 'medium'}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Copy / Move destination picker (within General) */}
                <Dialog open={copyMoveModalOpen} onOpenChange={(open) => { setCopyMoveModalOpen(open); if (!open) setCopyMoveTarget(null) }}>
                    <DialogContent className="max-w-md gap-4 p-5 border-slate-200">
                        <DialogHeader>
                            <DialogTitle className="text-slate-900">
                                {copyMoveAction === 'copy' ? 'Copy to folder' : 'Move to folder'}
                            </DialogTitle>
                            <DialogDescription className="text-slate-600">
                                {copyMoveTarget?.name} will be {copyMoveAction === 'copy' ? 'copied' : 'moved'} to the selected folder within {currentPath[0]?.name || 'the project'}.
                            </DialogDescription>
                        </DialogHeader>
                        {(copyMoveAction === 'copy' || copyMoveAction === 'move') && (
                            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/50 p-3">
                                <p className="text-sm font-medium text-slate-700">When the same file exists in the destination</p>
                                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100/80">
                                    <button
                                        type="button"
                                        onClick={() => setCopyMoveKeepBoth(true)}
                                        className={cn(
                                            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                            copyMoveKeepBoth ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        )}
                                    >
                                        Keep both
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCopyMoveKeepBoth(false)}
                                        className={cn(
                                            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                            !copyMoveKeepBoth ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        )}
                                    >
                                        Replace
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500">
                                    {copyMoveKeepBoth ? 'A copy will be created with a unique name (suffix).' : 'The existing file in the destination will be replaced.'}
                                </p>
                            </div>
                        )}
                        {currentPath.length > 0 && (
                            <div className="flex items-center text-xs font-medium text-slate-700 min-w-0 flex-wrap gap-0">
                                {currentPath.map((seg, i) => (
                                    <div key={seg.id} className="flex items-center flex-shrink-0 gap-2">
                                        {i > 0 && <ChevronRight className="h-3.5 w-3.5 mx-1 text-slate-400 flex-shrink-0" />}
                                        <button
                                            type="button"
                                            onClick={() => handleCopyMoveBreadcrumbClick(i)}
                                            className={cn(
                                                'flex items-center hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[160px]',
                                                i === currentPath.length - 1 ? 'text-slate-900 bg-slate-50' : 'text-slate-600 hover:text-slate-900'
                                            )}
                                            title={seg.name}
                                        >
                                            <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                                            <span className="truncate">{seg.name}</span>
                                        </button>
                                        {/* Move/Copy pill — only shown at the designated root (General/Confidential/Staging) level */}
                                        {currentPath.length === 1 && i === 0 && (
                                            <Button
                                                size="sm"
                                                className="bg-slate-900 text-white hover:bg-slate-800 rounded-full h-7 px-3 text-xs"
                                                onClick={() => currentPath[0] && handleCopyMoveToFolder(currentPath[0].id)}
                                                disabled={!!copyMoveSubmittingFolderId}
                                            >
                                                {copyMoveSubmittingFolderId === (currentPath[0]?.id)
                                                    ? <LoadingSpinner className="h-4 w-4" />
                                                    : (copyMoveAction === 'copy' ? 'Copy' : 'Move')}
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-0.5">
                            {loadingDestinations ? (
                                <div className="flex items-center justify-center py-8">
                                    <LoadingSpinner className="h-6 w-6 text-slate-400" />
                                </div>
                            ) : destinationFolders.length === 0 ? (
                                <p className="text-sm text-slate-500 py-6 px-3 text-center">
                                    No subfolders here. Use the Copy/Move button on a folder to copy or move the file there, or use the breadcrumb to go back.
                                </p>
                            ) : (
                                destinationFolders.map((f) => {
                                    const isEmpty = emptyFolderIds.has(f.id)
                                    const isChecking = checkingFolderId === f.id
                                    return (
                                        <div
                                            key={f.id}
                                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-slate-50 group"
                                        >
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        onClick={() => !isEmpty && !isChecking && handleNavigateIntoFolder(f)}
                                                        className={cn(
                                                            'flex items-center gap-2 min-w-0 flex-1 text-left text-sm text-slate-700',
                                                            isEmpty || isChecking ? 'cursor-default opacity-60' : 'hover:text-slate-900 cursor-pointer'
                                                        )}
                                                        disabled={isChecking}
                                                    >
                                                        <Folder className="h-4 w-4 text-slate-500 flex-shrink-0" />
                                                        <span className="truncate">{f.name}</span>
                                                        {isChecking ? (
                                                            <LoadingSpinner className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                        ) : !isEmpty ? (
                                                            <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                                        ) : null}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                    {isEmpty ? 'No subfolders' : 'See Contents'}
                                                </TooltipContent>
                                            </Tooltip>
                                            <Button
                                                size="sm"
                                                className="bg-slate-900 text-white hover:bg-slate-800 flex-shrink-0 rounded-full h-7 px-3 text-xs"
                                                onClick={() => handleCopyMoveToFolder(f.id)}
                                                disabled={!!copyMoveSubmittingFolderId}
                                            >
                                                {copyMoveSubmittingFolderId === f.id ? <LoadingSpinner className="h-4 w-4" /> : (copyMoveAction === 'copy' ? 'Copy' : 'Move')}
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="flex justify-end">
                            <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setCopyMoveModalOpen(false)}>Cancel</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Cross-Engagement Copy Modal */}
                <Dialog open={crossEngagementModalOpen} onOpenChange={(open) => { setCrossEngagementModalOpen(open); if (!open) { setCrossEngagementTarget(null); setCrossEngagementFirmName(null) } }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Copy to another engagement</DialogTitle>
                            <DialogDescription className="text-xs text-slate-500">
                                Select the engagement to copy <strong>{crossEngagementTarget?.name}</strong> to. It will land in that engagement&apos;s General folder.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md p-2">
                            {crossEngagementLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <LoadingSpinner className="h-6 w-6 text-slate-400" />
                                </div>
                            ) : crossEngagementEngagements.length === 0 ? (
                                <p className="text-sm text-slate-500 py-6 px-3 text-center">No other engagements available.</p>
                            ) : (() => {
                                const groups = crossEngagementEngagements.reduce<Record<string, { clientName: string; engagements: typeof crossEngagementEngagements }>>((acc, e) => {
                                    if (!acc[e.clientId]) acc[e.clientId] = { clientName: e.clientName, engagements: [] }
                                    acc[e.clientId].engagements.push(e)
                                    return acc
                                }, {})
                                const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => a.clientName.localeCompare(b.clientName))
                                return (
                                    <div className="py-1">
                                        {/* Firm level */}
                                        {crossEngagementFirmName && (
                                            <div className="flex items-center gap-1.5 px-2 pb-1">
                                                <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{crossEngagementFirmName}</span>
                                            </div>
                                        )}
                                        {/* Client + Engagement tree */}
                                        <div className="ml-3.5 border-l border-slate-200">
                                            {sortedGroups.map(([clientId, group], gi) => {
                                                const isLastClient = gi === sortedGroups.length - 1
                                                const sortedEngagements = group.engagements.sort((a, b) => a.name.localeCompare(b.name))
                                                return (
                                                    <div key={clientId} className={isLastClient ? 'pb-0' : 'pb-1'}>
                                                        {/* Client row */}
                                                        <div className="flex items-center gap-1.5 relative pl-4 py-1">
                                                            <span className="absolute left-0 top-1/2 w-3 border-t border-slate-200" />
                                                            <Users className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.clientName}</span>
                                                        </div>
                                                        {/* Engagement rows */}
                                                        <div className="ml-4 border-l border-slate-100">
                                                            {sortedEngagements.map((e, ei) => (
                                                                <div key={e.id} className="relative">
                                                                    <span className="absolute left-0 top-1/2 w-3 border-t border-slate-100" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCrossEngagementSelectedId(e.id)}
                                                                        className={cn(
                                                                            'w-full flex items-center gap-2 text-left pl-4 pr-3 py-1.5 rounded-md text-sm transition-colors',
                                                                            crossEngagementSelectedId === e.id
                                                                                ? 'bg-slate-100 text-slate-900 font-medium'
                                                                                : 'hover:bg-slate-50 text-slate-700'
                                                                        )}
                                                                    >
                                                                        <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                                                        <span className="truncate">{e.name}</span>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCrossEngagementModalOpen(false)}>Cancel</Button>
                            <Button
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                                disabled={!crossEngagementSelectedId || crossEngagementSubmitting}
                                onClick={handleCrossEngagementSubmit}
                            >
                                {crossEngagementSubmitting ? <LoadingSpinner className="h-4 w-4" /> : 'Copy'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Rename file/folder in Google Drive */}
                <Dialog open={renameModalOpen} onOpenChange={(open) => { setRenameModalOpen(open); if (!open) setRenameTarget(null) }}>
                    <DialogContent className="max-w-md gap-4 p-5 border-slate-200">
                        <DialogHeader>
                            <DialogTitle className="text-slate-900">Rename</DialogTitle>
                            <DialogDescription className="text-slate-600">
                                Enter a new name for {renameTarget?.name ?? 'this item'} in Google Drive.
                            </DialogDescription>
                        </DialogHeader>
                        <Input
                            value={renameNewName}
                            onChange={(e) => setRenameNewName(e.target.value)}
                            placeholder="New name"
                            className="border-slate-200"
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleConfirmRename())}
                        />
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setRenameModalOpen(false)}>Cancel</Button>
                            <Button
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                onClick={handleConfirmRename}
                                disabled={!renameNewName.trim() || renameSubmitting}
                            >
                                {renameSubmitting ? <LoadingSpinner className="h-4 w-4" /> : 'Save'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Folder upload confirmation modal (in-app, avoids browser "trust this site" wording) */}
                <Dialog open={isFolderUploadModalOpen} onOpenChange={setIsFolderUploadModalOpen}>
                    <DialogContent className="max-w-lg gap-4 p-5 border-slate-200">
                        <DialogHeader className="space-y-3">
                            <DialogTitle className="text-slate-900">Upload a folder</DialogTitle>
                            <div className="text-xs text-slate-600 leading-relaxed">
                                <p className="mb-2">Choose a folder from your computer. All files inside will be:</p>
                                <ul className="list-disc list-inside space-y-1.5 pl-1">
                                    <li>Uploaded to this engagement folder in your Google Drive</li>
                                    <li>Folder structure preserved</li>
                                    <li>Sent directly to your Google Drive and never pass through our servers</li>
                                </ul>
                            </div>
                        </DialogHeader>
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2.5">
                            <Info className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" />
                            <p className="text-xs text-slate-700 font-medium leading-relaxed">
                                Your browser may prompt you to confirm the folder selection.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3 mt-3">
                            <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setIsFolderUploadModalOpen(false)}>Cancel</Button>
                            <Button
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                onClick={() => {
                                    setIsFolderUploadModalOpen(false)
                                    setTimeout(() => folderInputRef.current?.click(), 0)
                                }}
                            >
                                Choose folder
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Create Item Dialog */}
                <Dialog open={isCreateItemOpen} onOpenChange={(open) => { if (!loading) setIsCreateItemOpen(open) }}>
                    <DialogContent className="sm:max-w-[440px] border-[#e5e7eb] p-0 gap-0 rounded-[2px]">
                        <VisuallyHidden><DialogTitle>
                            {createItemType === 'folder' ? 'New Folder' : createItemType === 'doc' ? 'New Google Doc' : createItemType === 'sheet' ? 'New Google Sheet' : createItemType === 'slide' ? 'New Google Slide' : createItemType === 'form' ? 'New Google Form' : createItemType === 'drawing' ? 'New Google Drawing' : createItemType === 'map' ? 'New Google Map' : createItemType === 'site' ? 'New Google Site' : 'New Google Script'}
                        </DialogTitle></VisuallyHidden>
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                            <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                {createItemType === 'folder' ? <Folder className="h-3.5 w-3.5 text-primary" /> : createItemType === 'sheet' ? <FileSpreadsheet className="h-3.5 w-3.5 text-primary" /> : createItemType === 'slide' ? <Presentation className="h-3.5 w-3.5 text-primary" /> : createItemType === 'form' ? <ListChecks className="h-3.5 w-3.5 text-primary" /> : createItemType === 'drawing' ? <PenTool className="h-3.5 w-3.5 text-primary" /> : createItemType === 'map' ? <MapIcon className="h-3.5 w-3.5 text-primary" /> : createItemType === 'script' ? <FileCode className="h-3.5 w-3.5 text-primary" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">
                                    {createItemType === 'folder' ? 'New Folder' : createItemType === 'doc' ? 'New Google Doc' : createItemType === 'sheet' ? 'New Google Sheet' : createItemType === 'slide' ? 'New Google Slide' : createItemType === 'form' ? 'New Google Form' : createItemType === 'drawing' ? 'New Google Drawing' : createItemType === 'map' ? 'New Google Map' : createItemType === 'site' ? 'New Google Site' : 'New Google Script'}
                                </p>
                                <p className="text-xs text-[#45474c] mt-0.5">Enter a name to create this {createItemType === 'folder' ? 'folder' : 'file'} in the current location.</p>
                            </div>
                        </div>
                        {/* Body */}
                        <div className="px-5 py-4 bg-[#f9f9fb]">
                            <label className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1">
                                {createItemType === 'folder' ? 'Folder Name' : 'Document Name'}
                            </label>
                            <Input
                                autoFocus
                                placeholder={createItemType === 'folder' ? 'e.g. Q4 Deliverables' : 'e.g. Meeting Notes'}
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateItem() }}
                                className="border-[#e5e7eb] text-[#1b1b1d] text-xs font-normal placeholder:text-[#9a9ba0] rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                        </div>
                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" className="rounded-[2px] w-24 text-[10px] font-headline font-bold tracking-widest uppercase" onClick={() => setIsCreateItemOpen(false)} disabled={loading}>Cancel</Button>
                            <Button type="button" variant="greenCta" className="min-w-[7rem] text-[10px] font-headline font-bold tracking-widest uppercase" onClick={handleCreateItem} disabled={!newItemName.trim() || loading}>
                                {loading ? <><LoadingSpinner size="sm" className="h-4 w-4 mr-1.5" />Creating…</> : 'Create'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Batch Conflict Dialog */}
                <Dialog open={conflictItems.length > 0} onOpenChange={(open) => !open && cancelBatchResolution()}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Duplicate files found</DialogTitle>
                            <DialogDescription>
                                The following files already exist in this folder. Check the box to overwrite, or leave unchecked to keep both (rename).
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {/* Select All Header */}
                            <div className="flex items-center space-x-3 px-3 pb-2 border-b border-slate-100">
                                <Checkbox
                                    id="select-all-conflicts"
                                    checked={conflictItems.length > 0 && overwriteSelections.size === conflictItems.length}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setOverwriteSelections(new Set(conflictItems.map(i => i.file.name)))
                                        } else {
                                            setOverwriteSelections(new Set())
                                        }
                                    }}
                                />
                                <label htmlFor="select-all-conflicts" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                                    Select all / Unselect all
                                </label>
                            </div>

                            {conflictItems.map((item) => (
                                <div key={item.file.name} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                                    <Checkbox
                                        id={`overwrite-${item.file.name}`}
                                        checked={overwriteSelections.has(item.file.name)}
                                        onCheckedChange={(checked) => {
                                            setOverwriteSelections(prev => {
                                                const next = new Set(prev)
                                                if (checked) next.add(item.file.name)
                                                else next.delete(item.file.name)
                                                return next
                                            })
                                        }}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <label
                                            htmlFor={`overwrite-${item.file.name}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Rewrite "{item.file.name}"
                                        </label>
                                        <p className="text-xs text-slate-500">
                                            {overwriteSelections.has(item.file.name)
                                                ? "Existing file will be replaced."
                                                : "New file will be renamed."}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <DialogFooter className="gap-2 sm:justify-end">
                            <Button variant="outline" onClick={cancelBatchResolution}>
                                Cancel Upload
                            </Button>
                            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleBatchResolution}>
                                Confirm & Upload
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Move to Bin confirmation dialog */}
                <ConfirmDialog
                    open={!!trashConfirmTarget}
                    onOpenChange={(open) => { if (!open) setTrashConfirmTarget(null) }}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    iconVariant="red"
                    title="Move to Bin"
                    subtitle="This file will be moved to Google Drive Bin."
                    description={<><span className="font-semibold text-[#1b1b1d]">{trashConfirmTarget?.name}</span>{' '}will be moved to your Google Drive Bin. Items in the Bin are permanently deleted after 30 days.</>}
                    confirmLabel="Move to Bin"
                    confirmVariant="red"
                    onCancel={() => setTrashConfirmTarget(null)}
                    onConfirm={handleTrashConfirmed}
                    loading={trashConfirming}
                />

                {/* Bulk Move to Bin confirmation dialog */}
                <ConfirmDialog
                    open={bulkTrashConfirmOpen}
                    onOpenChange={(open) => { if (!open) { setBulkTrashConfirmOpen(false); setPendingBulkTrashIds(new Set()) } }}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    iconVariant="red"
                    title="Move to Bin"
                    subtitle={`${pendingBulkTrashIds.size} item${pendingBulkTrashIds.size > 1 ? 's' : ''} will be moved to Google Drive Bin.`}
                    description={<>{pendingBulkTrashIds.size} item{pendingBulkTrashIds.size > 1 ? 's' : ''} will be moved to your Google Drive Bin. Items in the Bin are permanently deleted after 30 days.</>}
                    confirmLabel="Move to Bin"
                    confirmVariant="red"
                    onCancel={() => { setBulkTrashConfirmOpen(false); setPendingBulkTrashIds(new Set()) }}
                    onConfirm={handleBulkTrashConfirmed}
                />

                {/* Return to Draft confirmation */}
                <ConfirmDialog
                    open={!!unlockConfirmFile}
                    onOpenChange={(open) => { if (!open) setUnlockConfirmFile(null) }}
                    icon={<FileText className="h-3.5 w-3.5" />}
                    iconVariant="primary"
                    title="Return to Draft"
                    subtitle="Unlock this document for further edits."
                    description={<><span className="font-semibold text-[#1b1b1d]">{unlockConfirmFile?.name}</span>{' '}will be unlocked. All collaborators will regain their prior access level based on their role and sharing settings.</>}
                    confirmLabel="Return to Draft"
                    confirmVariant="primary"
                    onCancel={() => setUnlockConfirmFile(null)}
                    onConfirm={() => unlockConfirmFile && handleUnlockFromBadge(unlockConfirmFile)}
                    loading={unlockInProgress}
                />

                {/* Revoke external access confirmation */}
                <Dialog open={!!unshareConfirmFile} onOpenChange={(open) => { if (!open) setUnshareConfirmFile(null) }}>
                    <DialogContent className="sm:max-w-sm border-[#e5e7eb] p-0 gap-0 rounded-[2px] bg-[#f9f9fb]">
                        <VisuallyHidden><DialogTitle>Revoke external access</DialogTitle></VisuallyHidden>
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-[#e5e7eb] bg-white flex items-start gap-3">
                            <div className="mt-0.5 h-7 w-7 rounded bg-red-50 ring-1 ring-red-200 flex items-center justify-center shrink-0">
                                <Link2 className="h-3.5 w-3.5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">Revoke external access</p>
                                <p className="text-xs text-[#45474c] mt-0.5">Remove sharing for all external collaborators.</p>
                            </div>
                        </div>
                        {/* Body */}
                        <div className="p-5">
                            <p className="text-xs text-[#45474c] leading-relaxed">
                                <span className="font-semibold text-[#1b1b1d]">{unshareConfirmFile?.name}</span>
                                {' '}will be unshared. All external collaborators and viewers will lose access, and any secure links sent by email will no longer work.
                            </p>
                        </div>
                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setUnshareConfirmFile(null)}
                                disabled={unshareInProgress}
                                className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => unshareConfirmFile && handleUnshare(unshareConfirmFile)}
                                disabled={unshareInProgress}
                                className="rounded-[2px] bg-red-600 hover:bg-red-700 text-white text-[10px] font-headline font-bold tracking-widest uppercase shadow-sm"
                            >
                                {unshareInProgress ? <LoadingSpinner className="h-3.5 w-3.5" /> : 'Revoke Access'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <SecureAccessModal
                    isOpen={secureModalOpen}
                    onClose={() => setSecureModalOpen(false)}
                    email={secureModalData.email}
                    fileName={secureModalData.fileName}
                    mimeType={secureModalData.mimeType}
                    externalId={secureModalData.externalId}
                    firmId={secureModalData.firmId}
                    isLoading={isRegrantLoading}
                    error={regrantError}
                />
            </div>

            <GoogleDriveImportDialog
                open={isImportDialogOpen}
                onOpenChange={setIsImportDialogOpen}
                selectedFiles={importedFiles}
                onConfirm={handleImportConfirm}
                loading={importLoading}
            />
        </div>
    )
}
