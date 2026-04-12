'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SquarePlus, Upload, FolderUp, X, Folder, File as FileIcon, ArrowUp, ArrowDown, ChevronRight, Search, List as ListIcon, LayoutGrid, Filter, ChevronDown, User, FileText, FileSpreadsheet, Presentation, ListChecks, PenTool, Map as MapIcon, LayoutTemplate, FileCode, AlertCircle, ShieldCheck, Maximize2, Minimize2, CheckCircle2, XCircle, Trash2, Layout, Code, Laptop, RefreshCw, Info, Share2, Layers, Building2, Users, Briefcase, Lock, FolderLock, Inbox, Sparkles, Link2, MessageCircle, CircleChevronLeft } from 'lucide-react'
import Fuse from 'fuse.js'
import { config } from "@/lib/config"
import { DocumentIcon } from '@/components/ui/document-icon'
import { SharedFolderIcon } from '@/components/ui/folder-shared-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { DocumentPreviewPanelContent } from '@/components/files/document-edit-sheet'
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
import { useProjectSearch, ProjectSearchProvider } from '@/components/projects/project-search-context'
import { ProjectSearchPanel, type ProjectSearchPanelActionMenuProps } from '@/components/projects/project-search-panel'
import { getSavedFolderState, setSavedFolderState, type BreadcrumbItem } from '@/lib/files-folder-session'
import { useSecureOpenDocument } from '@/lib/use-secure-open-document'
import { SecureAccessModal } from '@/components/projects/shares/secure-access-modal'

interface ProjectFileListProps {
    projectId: string
    connectorRootFolderId?: string | null
    rootFolderName?: string
    orgName?: string
    clientName?: string
    projectName?: string
    canEdit?: boolean
    canManage?: boolean
    /** When true (e.g. user is eng_ext_collaborator or eng_viewer), only show files/folders that are shared to External Collaborator or Guest. */
    restrictToSharedOnly?: boolean
    /** Optional; used for secure-open modal thumbnail. */
    firmId?: string
    /** When true, firm is sandbox-only (restricts Add menu: no new folder / native Google types; upload + Drive import allowed). */
    firmSandboxOnly?: boolean
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

type UploadQueueItem = {
    id: string
    file: File
    progress: number
    status: 'pending' | 'uploading' | 'completed' | 'error'
    error?: string
    finalName?: string
}

const VIEW_AS_SHARED_ONLY_PERSONAS = ['eng_ext_collaborator', 'eng_viewer']

export function ProjectFileList({ projectId, connectorRootFolderId, rootFolderName = 'Engagement Files', orgName, clientName, projectName, canEdit = false, canManage = false, restrictToSharedOnly = false, firmId, firmSandboxOnly = false }: ProjectFileListProps) {
    const { session } = useAuth()
    const sessionRef = useRef(session)
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
    const { viewAsPersonaSlug } = useViewAs()
    const rightPane = useRightPane()
    const [activeCommentDocId, setActiveCommentDocId] = useState<string | null>(null)
    const lastHandledDeeplinkHashRef = useRef<string>('')
    const { handleSecureOpen, secureModalOpen, secureModalData, setSecureModalOpen, isRegrantingId } = useSecureOpenDocument({
        projectId,
        firmId,
        logContext: 'ProjectFileList',
        onRegrantFailed: (doc) => {
            const link = doc.webViewLink || (doc.externalId ? `https://drive.google.com/file/d/${doc.externalId}/view` : null)
            if (link && typeof window !== 'undefined') window.open(link, '_blank')
        },
    })
    const [sharedExternalIds, setSharedExternalIds] = useState<Set<string>>(new Set())
    const [ancestorFolderIds, setAncestorFolderIds] = useState<Set<string>>(new Set())
    const [sharedExternalIdsForEC, setSharedExternalIdsForEC] = useState<Set<string>>(new Set())
    const [ancestorFolderIdsForEC, setAncestorFolderIdsForEC] = useState<Set<string>>(new Set())
    const [sharedExternalIdsForGuest, setSharedExternalIdsForGuest] = useState<Set<string>>(new Set())
    const [ancestorFolderIdsForGuest, setAncestorFolderIdsForGuest] = useState<Set<string>>(new Set())

    useEffect(() => {
        sessionRef.current = session
    }, [session])

    useEffect(() => {
        // Clear row highlight when the right pane closes or switches away from Comments.
        // Title is "Comments" from the file list / hash; ProjectCommentsTab uses "Comment".
        const isCommentsPane =
            Boolean(rightPane.content) &&
            (rightPane.title === 'Comment' || rightPane.title === 'Comments')
        if (!isCommentsPane) {
            setActiveCommentDocId(null)
        }
    }, [rightPane.content, rightPane.title])

    /** Same behavior as DocumentActionMenu → Comment (direct right pane; no URL hash). */
    const openCommentsForFile = useCallback(
        (file: DriveFile) => {
            if (!rightPane.hasRightPane || !file.projectDocumentId) return
            setActiveCommentDocId(file.id)
            const docIdForComments = file.projectDocumentId || file.id
            rightPane.setTitle('Comments')
            rightPane.setHeaderActions(null)
            rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
            rightPane.setHeaderSubtitle('Append-only. Visible to all project members.')
            rightPane.setContent(
                <DocumentDocCommentsPane
                    projectId={projectId}
                    documentId={docIdForComments}
                    documentName={file.name}
                />
            )
            rightPane.setExpanded?.(false)
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
                setSharedExternalIds(new Set(ids))
                setAncestorFolderIds(new Set(ancestorIds))
                setSharedExternalIdsForEC(new Set(idsEC))
                setAncestorFolderIdsForEC(new Set(ancestorEC))
                setSharedExternalIdsForGuest(new Set(idsGuest))
                setAncestorFolderIdsForGuest(new Set(ancestorGuest))
            })
            .catch(() => {
                setSharedExternalIds(new Set())
                setAncestorFolderIds(new Set())
                setSharedExternalIdsForEC(new Set())
                setAncestorFolderIdsForEC(new Set())
                setSharedExternalIdsForGuest(new Set())
                setAncestorFolderIdsForGuest(new Set())
            })
    }, [projectId])

    // Folder IDs state
    const [generalFolderId, setGeneralFolderId] = useState<string | null>(null)
    const [confidentialFolderId, setConfidentialFolderId] = useState<string | null>(null)
    const [stagingFolderId, setStagingFolderId] = useState<string | null>(null)
    const [isProjectLead, setIsProjectLead] = useState(false)
    const [isLoadingFolders, setIsLoadingFolders] = useState(true)
    const [currentFolderType, setCurrentFolderType] = useState<'general' | 'confidential' | 'staging'>('general')

    // Core State
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])

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
                        console.warn('[ProjectFileList] No subfolders resolved for project', projectId)
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
                        { id: 'org', name: orgName || 'Organization', clickable: false },
                        { id: 'client', name: clientName || 'Client', clickable: false },
                        { id: connectorRootFolderId || 'project', name: projectName || rootFolderName, clickable: false },
                        { id: defaultFolderId, name: defaultFolderName, clickable: true }
                    ]
                    : []

                const saved = getSavedFolderState(projectId)
                if (saved.folderId && saved.breadcrumbs.length >= 4) {
                    setCurrentFolderId(saved.folderId)
                    setBreadcrumbs(saved.breadcrumbs)
                    // Sync folder type based on ID
                    if (saved.folderId === generalId) setCurrentFolderType('general')
                    else if (saved.folderId === confidentialId) setCurrentFolderType('confidential')
                    else if (saved.folderId === stagingId) setCurrentFolderType('staging')
                    else {
                        const rootName = saved.breadcrumbs[3]?.name
                        if (rootName === 'confidential') setCurrentFolderType('confidential')
                        else if (rootName === 'staging') setCurrentFolderType('staging')
                        else setCurrentFolderType('general')
                    }
                } else if (defaultFolderId) {
                    setCurrentFolderId(defaultFolderId)
                    setBreadcrumbs(defaultBreadcrumbs)
                    setCurrentFolderType(defaultFolderType)
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

    // Persist current folder and breadcrumbs to session (memory for reload / navigate back to Files)
    useEffect(() => {
        if (!projectId || !currentFolderId) return
        setSavedFolderState(projectId, currentFolderId, breadcrumbs)
    }, [projectId, currentFolderId, breadcrumbs])

    // Data State
    const [files, setFiles] = useState<DriveFile[]>([])
    const [loading, setLoading] = useState(true) // Initial load
    const [error, setError] = useState<string | null>(null)
    const [pickerToken, setPickerToken] = useState<string | null>(null)

    // (deeplink handler effect is declared below, after navigateToItem is defined)

    // Upload & Conflict State
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(true)
    const uploadOverlayDismissedRef = useRef(false)
    const { addToast } = useToast()
    const showSandboxPickerToast = useCallback(() => {
        addToast({
            type: 'error',
            title: 'Sandbox',
            message: SANDBOX_OPERATION_MESSAGE,
            duration: 8000,
        })
    }, [addToast])
    const [conflictItems, setConflictItems] = useState<ConflictItem[]>([])
    const [overwriteSelections, setOverwriteSelections] = useState<Set<string>>(new Set())
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)

    // Actions State
    const [isCreateItemOpen, setIsCreateItemOpen] = useState(false)
    const [createItemType, setCreateItemType] = useState<CreateItemType>('folder')
    const [newItemName, setNewItemName] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Picker State
    const [openPicker] = useDrivePicker();
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
    const [importedFiles, setImportedFiles] = useState<any[]>([])
    const [importLoading, setImportLoading] = useState(false)

    // UX State
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
    const [sortConfig, setSortConfig] = useState<SortConfig>({ sortBy: 'name', direction: 'asc', foldersFirst: true })
    const { searchQuery, setSearchQuery, isSearching } = useProjectSearch()
    const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
    const [filterOwner, setFilterOwner] = useState<'any' | 'me' | 'not-me'>('any')
    const [filterModified, setFilterModified] = useState<'any' | '7d' | '30d' | 'year'>('any')
    const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null)
    const [actionMenuOpenFileId, setActionMenuOpenFileId] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isFolderUploadModalOpen, setIsFolderUploadModalOpen] = useState(false)
    const [fromComputerExpanded, setFromComputerExpanded] = useState(false)
    const [fromDriveExpanded, setFromDriveExpanded] = useState(false)
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
    const [renameModalOpen, setRenameModalOpen] = useState(false)
    const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null)
    const [renameNewName, setRenameNewName] = useState('')
    const [renameSubmitting, setRenameSubmitting] = useState(false)
    const [trashConfirmTarget, setTrashConfirmTarget] = useState<DriveFile | null>(null)
    const [trashConfirming, setTrashConfirming] = useState(false)
    const trashDialogOpenTime = useRef<number>(0)

    // Internal Drag & Drop State
    const [draggedItem, setDraggedItem] = useState<DriveFile | null>(null)
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
    const [isInternalDragging, setIsInternalDragging] = useState(false)

    // Row-level processing state
    const [processingFileIds, setProcessingFileIds] = useState<Set<string>>(new Set())


    const startProcessing = useCallback((id: string) => setProcessingFileIds(prev => new Set(prev).add(id)), [])
    const stopProcessing = useCallback((id: string) => setProcessingFileIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
    }), [])

    const handleShowFileLocation = (fileName: string) => {
        const file = files.find(f => f.name === fileName)
        if (file) {
            setHighlightedFileId(file.id)
            setTimeout(() => {
                const el = document.querySelector(`[data-file-id="${file.id}"]`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 100)
        }
    }

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
                    ...baseBreadcrumbPrefix,
                    ...breadcrumbPath.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name, clickable: true })),
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
                        setBreadcrumbs([...baseBreadcrumbPrefix, { id: parentId, name: type, clickable: true }])
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

            // Resolve internal project document id -> Drive externalId (and name) with access control.
            let externalId: string | null = null
            let fileName: string | null = null
            let fileInfoStatus: number | undefined
            try {
                const viewAs = viewAsPersonaSlug ? `?viewAsPersonaSlug=${encodeURIComponent(viewAsPersonaSlug)}` : ''
                const res = await fetch(`/api/projects/${projectId}/documents/${documentIdParam}/file-info${viewAs}`, {
                    credentials: 'include',
                })
                fileInfoStatus = res.status
                if (res.ok) {
                    const json = await res.json() as { externalId?: string; fileName?: string | null }
                    externalId = typeof json.externalId === 'string' ? json.externalId : null
                    fileName = typeof json.fileName === 'string' ? json.fileName : null
                }
            } catch {
                // ignore and fall back below
            }

            // Fallback: match loaded list by internal projectDocumentId or Drive id (older hashes).
            if (!externalId) {
                const maybe = files.find(
                    (f) => f.projectDocumentId === documentIdParam || f.id === documentIdParam
                )
                if (maybe) {
                    externalId = maybe.id
                    fileName = maybe.name ?? null
                }
            }

            if (!externalId) {
                const transient =
                    !session?.access_token ||
                    loading ||
                    isLoadingFolders ||
                    fileInfoStatus === 401
                if (transient) return
                addToast({ type: 'error', title: 'Link unavailable', message: 'You do not have access to this item.' })
                lastHandledDeeplinkHashRef.current = hash
                return
            }

            if (kind === 'doc-file') {
                await navigateToItem({
                    id: externalId,
                    name: fileName ?? 'Document',
                    mimeType: 'application/octet-stream',
                    webViewLink: '',
                    iconLink: '',
                    modifiedTime: new Date().toISOString(),
                } as DriveFile)
                lastHandledDeeplinkHashRef.current = hash
                return
            }

            setActiveCommentDocId(externalId)
            rightPane.setTitle('Comments')
            rightPane.setHeaderActions(null)
            rightPane.setHeaderIcon(<MessageCircle className="h-4 w-4" />)
            rightPane.setHeaderSubtitle('Append-only. Visible to all engagement members.')
            rightPane.setContent(
                <DocumentDocCommentsPane
                    projectId={projectId}
                    documentId={documentIdParam}
                    documentName={fileName ?? undefined}
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
        files,
        navigateToItem,
        addToast,
        viewAsPersonaSlug,
        session?.access_token,
        loading,
        isLoadingFolders,
    ])

    const searchPanelActionMenuRef = useRef<ProjectSearchPanelActionMenuProps | null>(null)

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
        rightPane.setSearchRoot({
            searchRootFolderId: searchRootFolderId ?? null,
            searchRootLabel: searchRootLabel ?? null,
        })
        rightPane.setTitle('Search')
        rightPane.setHeaderActions(null)
        rightPane.setHeaderIcon(<Search className="h-4 w-4" />)
        rightPane.setHeaderSubtitle('')
        rightPane.setContent(
            <ProjectSearchProvider
                projectId={projectId}
                viewAsPersonaSlug={viewAsPersonaSlug}
                searchRootFolderId={searchRootFolderId ?? undefined}
                searchRootLabel={searchRootLabel}
            >
                <ProjectSearchPanel
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
            </ProjectSearchProvider>
        )
    }, [rightPane, projectId, viewAsPersonaSlug, currentFolderType, generalFolderId, confidentialFolderId, stagingFolderId, navigateToItem, firmId, searchRootFolderId, searchRootLabel])

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
            setFiles(data.files || [])
        } catch (err: any) {
            logger.error(err)
            setError(err.message)
        } finally {
            if (!silent) setLoading(false)
        }
    }, [projectId, viewAsPersonaSlug])

    const refreshShareStateAndFiles = useCallback(() => {
        fetchSharedIds()
        if (currentFolderId) void fetchFiles(currentFolderId, true)
    }, [fetchSharedIds, currentFolderId, fetchFiles])

    useEffect(() => {
        if (currentFolderId && session?.access_token) {
            fetchFiles(currentFolderId)
        }
    }, [currentFolderId, fetchFiles, session?.access_token])

    // When View As persona changes, refetch files so backend can filter by shared-only when EC/Guest (cookie is sent)
    useEffect(() => {
        if (!currentFolderId) return
        fetchFiles(currentFolderId, true)
    }, [viewAsPersonaSlug])

    // When folder load completes with no folder (e.g. reimport without doc subfolders), stop spinner
    useEffect(() => {
        if (!isLoadingFolders && !currentFolderId) {
            setLoading(false)
        }
    }, [isLoadingFolders, currentFolderId])

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

    // Core Upload Function (Direct to Drive)
    const uploadFile = async (
        file: File,
        fileIdToOverwrite?: string,
        rename = false,
        onProgress?: (p: number) => void,
        parentFolderId?: string,
        triggerIndexing = true
    ): Promise<{ success: boolean, error?: string, finalFile?: { name: string, id: string } }> => {
        // Use ref to avoid stale closure during batch processing
        const token = sessionRef.current?.access_token
        if (!token) return { success: false, error: 'No access token' }

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
                    fileId: fileIdToOverwrite
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

                            // Trigger background indexing
                            if (triggerIndexing) {
                                fetch(`/api/projects/${projectId}/index-file`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        externalId: finalFile.id,
                                        fileName: finalFile.name
                                    })
                                }).catch(e => logger.error('Failed to trigger indexing', e))
                            }

                            resolve({ success: true, finalFile })
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

    // Helper to update queue item
    const updateQueueItem = (id: string, updates: Partial<UploadQueueItem>) => {
        setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
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

        setUploadQueue(prev => [...prev, ...newQueueItems])
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

        // Trigger batch indexing
        if (successfullyUploaded.length > 0) {
            fetch(`/api/projects/${projectId}/index-file`, {
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

        // Refresh
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
        setIsUploading(true)
        setIsUploadModalOpen(true)

        try {
            const uploads = Array.from(fileList)
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

            setUploadQueue(prev => [...prev, ...newQueueItems])

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
                    }
                }

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
            setError(e.message) // Global error fallback
            setIsUploading(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0) return
        await processUploads(fileList)
        if (fileInputRef.current) fileInputRef.current.value = ''
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
        if (!sessionRef.current?.access_token || !currentFolderId) return
        const token = sessionRef.current.access_token
        const rootId = currentFolderId
        const pathToFolderId = new Map<string, string>()
        pathToFolderId.set('', rootId)

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
                setError(errorMessage)
                return
            }
            const data = await res.json()
            pathToFolderId.set(path, data.id)
        }

        const files = Array.from(fileList).filter(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
            const parts = rel.split('/')
            return parts.length >= 1 && parts[parts.length - 1] !== '' // has a file name (not directory-only)
        })
        const fileEntries = files.map(f => {
            const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
            const parts = rel.split('/')
            const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
            return { file: f, dirPath }
        })

        setIsUploading(true)
        setIsUploadModalOpen(true)
        const newQueueItems: UploadQueueItem[] = fileEntries.map(({ file }) => ({
            id: `upload-${Date.now()}-${Math.random()}`,
            file,
            progress: 0,
            status: 'pending'
        }))
        setUploadQueue(prev => [...prev, ...newQueueItems])
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

        // Trigger batch indexing for all successfully uploaded files
        if (successfullyUploaded.length > 0) {
            logger.debug(`Triggering batch indexing for ${successfullyUploaded.length} files...`)
            fetch(`/api/projects/${projectId}/index-file`, {
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
        if (currentFolderId) fetchFiles(currentFolderId, true)
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

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0) return
        await processFolderUpload(fileList)
        if (folderInputRef.current) folderInputRef.current.value = ''
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
        if (isSandboxFirm) {
            showSandboxPickerToast()
            return
        }
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
            if (!res.ok) throw new Error(`Create ${createItemType} failed`)

            setIsCreateItemOpen(false)
            setNewItemName('')
            if (currentFolderId) fetchFiles(currentFolderId)
        } catch (err: any) {
            logger.error(err)
            setError(err.message)
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

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        // Only show external upload overlay if dragging actual files from OS
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true)
        }
    }
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false)
    }
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
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

        // Use a ghost image if needed, but default is fine for now
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

    const setSortBy = (sortBy: SortByOption) => setSortConfig(c => ({ ...c, sortBy }))
    const setSortDirection = (direction: 'asc' | 'desc') => setSortConfig(c => ({ ...c, direction }))
    const setFoldersFirst = (foldersFirst: boolean) => setSortConfig(c => ({ ...c, foldersFirst }))

    const handleFolderClick = (file: DriveFile) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            setHighlightedFileId(null)
            setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name, clickable: true }])
            setCurrentFolderId(file.id)
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
    }

    const baseBreadcrumbPrefix: BreadcrumbItem[] = [
        { id: 'org', name: orgName || 'Organization', clickable: false },
        { id: 'client', name: clientName || 'Client', clickable: false },
        { id: connectorRootFolderId || 'project', name: projectName || rootFolderName, clickable: false }
    ]

    const handleSwitchToRoot = (type: 'general' | 'confidential' | 'staging') => {
        const folderId = type === 'general' ? generalFolderId : type === 'confidential' ? confidentialFolderId : stagingFolderId
        if (!folderId) return
        setHighlightedFileId(null)
        setCurrentFolderId(folderId)
        setCurrentFolderType(type)
        setBreadcrumbs([...baseBreadcrumbPrefix, { id: folderId, name: type, clickable: true }])
    }

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
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            stopProcessing(doc.id)
        }
    }, [projectId, currentFolderId, fetchFiles, addToast, startProcessing, stopProcessing])

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
            })
            setTrashConfirmTarget(null)
            return
        }

        // Safety guard: Don't allow confirmation if dialog was opened less than 400ms ago
        // This prevents accidental double-clicks or event bubbling from triggering the action immediately.
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
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
            // Close dialog on error too, so it doesn't stay stuck
            setTrashConfirmTarget(null)
        } finally {
            setTrashConfirming(false)
            stopProcessing(doc.id)
        }
    }, [trashConfirmTarget, trashConfirming, currentFolderId, fetchFiles, addToast, startProcessing, stopProcessing, projectId])

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
        // Don't set loadingDestinations here to avoid flicker
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
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            setCopyMoveSubmittingFolderId(null)
            stopProcessing(target.id)
        }
    }, [copyMoveTarget, copyMoveAction, copyMoveKeepBoth, projectId, currentFolderId, fetchFiles, addToast, startProcessing, stopProcessing])

    const handleMoveTree = useCallback(async (doc: DriveFile, targetRoot: 'general' | 'confidential' | 'staging') => {
        // Moves the document to the root of the target folder (General, Confidential, or Staging). Does not preserve the current subfolder path.
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
            if (currentFolderId) fetchFiles(currentFolderId, true)
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', message: e?.message || 'Something went wrong' })
        } finally {
            stopProcessing(doc.id)
        }
    }, [projectId, currentFolderId, fetchFiles, addToast, startProcessing, stopProcessing])

    const openRenameModal = useCallback((doc: DriveFile) => {
        setRenameTarget(doc)
        setRenameNewName(doc.name ?? '')
        setRenameModalOpen(true)
    }, [])

    // Keep search panel action menu ref updated so openSearchPanel (defined earlier) can read latest handlers
    useEffect(() => {
        if (!firmId) {
            searchPanelActionMenuRef.current = null
            return
        }
        searchPanelActionMenuRef.current = {
            canEdit,
            canManage,
            currentFolderType: currentFolderType ?? 'general',
            firmId,
            isProjectLead,
            onOpenDocument: (doc) => handleSecureOpen(
                {
                    documentId: doc.id,
                    fileName: doc.name ?? '',
                    mimeType: doc.mimeType,
                    externalId: doc.id,
                    firmId,
                    webViewLink: doc.webViewLink || `https://drive.google.com/file/d/${doc.id}/view`,
                },
                doc.id
            ),
            onDuplicateDocument: canEdit ? (doc) => handleDuplicate(doc) : undefined,
            onCopyDocument: generalFolderId && canEdit ? (doc) => openCopyMoveModal(doc, 'copy') : undefined,
            onMoveDocument: generalFolderId && canEdit ? (doc) => openCopyMoveModal(doc, 'move') : undefined,
            onDeleteDocument: canEdit ? (doc) => handleTrash(doc) : undefined,
            onRenameDocument: canEdit ? (doc) => openRenameModal(doc) : undefined,
            onRestrictToConfidential: canManage && confidentialFolderId ? (doc) => handleMoveTree(doc, 'confidential') : undefined,
            onRestoreToGeneral: canManage && generalFolderId ? (doc) => handleMoveTree(doc, 'general') : undefined,
            onPromoteToGeneral: canManage && generalFolderId ? (doc) => handleMoveTree(doc, 'general') : undefined,
            onShareSaved: refreshShareStateAndFiles,
        }
    }, [firmId, canEdit, canManage, currentFolderType, generalFolderId, confidentialFolderId, isProjectLead, handleSecureOpen, handleDuplicate, openCopyMoveModal, handleTrash, openRenameModal, handleMoveTree, refreshShareStateAndFiles])

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
    }, [renameTarget, renameNewName, projectId, addToast, startProcessing, stopProcessing])

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
    // Memoized so list re-renders stay fast. This component is only mounted when the Files tab is active (project-workspace conditional mount).
    const sortedFiles = useMemo(() => {
        let result = [...files]

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
                return false
            })
        }

        if (filterOwner !== 'any' && session?.user?.email) {
            const myEmail = session.user.email.toLowerCase()
            result = result.filter(f => {
                const owner = (f.actorEmail || '').toLowerCase()
                if (filterOwner === 'me') return owner === myEmail || owner === '' || !owner
                if (filterOwner === 'not-me') return owner !== '' && owner !== myEmail
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
        if (sortConfig.foldersFirst) {
            const folders = result.filter(f => f.mimeType === 'application/vnd.google-apps.folder').sort(cmp)
            const rest = result.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').sort(cmp)
            return [...folders, ...rest]
        }
        return result.sort(cmp)
    }, [files, sortConfig, filterTypes, filterOwner, filterModified, session?.user?.email])

    const TableHeader = ({ label }: { label: string }) => (
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500 tracking-wider select-none">
            {label}
        </div>
    )

    return (
        <div className="flex flex-col h-full bg-white"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Top Bar: Breadcrumbs & Actions */}
            <div className="px-0 py-0 border-b border-transparent bg-white flex flex-col gap-4 sticky top-0 z-20">
                {/* Breadcrumbs: root always visible (as dropdown when canManage); truncate middle */}
                <div className="flex items-center text-xs font-medium text-slate-700 min-w-0">
                    <div className="flex items-center min-w-0 overflow-x-auto whitespace-nowrap custom-scrollbar">
                        {(() => {
                            const ROOT_INDEX = 3
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
                                ...(canManage && confidentialFolderId ? [{ type: 'confidential' as const, label: 'Confidential' }] : []),
                                ...(canManage && stagingFolderId ? [{ type: 'staging' as const, label: 'Staging' }] : [])
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
                                                            {currentFolderType === 'general' && <Folder className="h-3.5 w-3.5 mr-1.5 text-green-600 flex-shrink-0" />}
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
                                                                {type === 'general' && <Folder className="h-3.5 w-3.5 mr-2 text-green-600" />}
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
                                                        "flex items-center hover:bg-slate-100 px-2 py-1 rounded transition-colors max-w-[180px]",
                                                        index === breadcrumbs.length - 1 ? "text-slate-900 bg-slate-50" : "hover:text-slate-900"
                                                    )}
                                                    title={item.name}
                                                >
                                                    <Folder className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                                                    <span className="truncate capitalize">{item.name}</span>
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

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-4">
                    {/* Left: Filters */}
                    <div className="flex items-center gap-2">
                        {/* Hide Add button when at project root level or if user can't edit */}
                        {!isAtProjectRoot && canEdit && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={loading || isLoadingFolders} className="h-8 gap-2 bg-slate-100 text-slate-900 hover:bg-slate-200 border-slate-200 border rounded-md shadow-sm">
                                        <SquarePlus className="h-4 w-4" />
                                        Add
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[280px] py-1">
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

                                    <DropdownMenuSeparator />

                                    {/* Import from Google Drive (expandable) */}
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

                                    {/* New File Section Header */}
                                    <div className="px-2 py-1 bg-slate-50 border-b border-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-500 select-none">
                                        <SquarePlus className="h-3.5 w-3.5" />
                                        New file
                                    </div>

                                    <DropdownMenuItem onClick={() => openCreateDialog('doc')} className="text-xs py-1.5">
                                        <FileText className="mr-2 h-3.5 w-3.5 text-blue-500" />
                                        Google Doc
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openCreateDialog('sheet')} className="text-xs py-1.5">
                                        <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-green-500" />
                                        Google Sheet
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openCreateDialog('slide')} className="text-xs py-1.5">
                                        <Presentation className="mr-2 h-3.5 w-3.5 text-yellow-500" />
                                        Google Slide
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openCreateDialog('form')} className="text-xs py-1.5">
                                        <ListChecks className="mr-2 h-3.5 w-3.5 text-purple-600" />
                                        Google Form
                                    </DropdownMenuItem>

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="text-xs py-1.5">More</DropdownMenuSubTrigger>
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

                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {!isAtProjectRoot && <div className="h-6 w-px bg-slate-200 mx-2" />}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                                    Type
                                    {filterTypes.size > 0 && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">{filterTypes.size}</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Type</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 focus:bg-slate-800 p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterTypes.size === 0 ? true : (filterTypes.size < 5 ? ('indeterminate' as const) : false)} onCheckedChange={() => setFilterTypes(new Set())} onSelect={(e) => e.preventDefault()} className="text-xs py-1.5 pl-8">
                                    All types
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
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* ... Other Filters (unchanged) ... */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", filterOwner !== 'any' && "border-slate-400 ring-1 ring-slate-300")}>
                                    People
                                    {filterOwner !== 'any' && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[200px] py-1 text-xs">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Owner</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 focus:bg-slate-800 p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'any'} onCheckedChange={() => setFilterOwner('any')} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Any owners
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'me'} onCheckedChange={() => setFilterOwner('me')} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Owned by me
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem checked={filterOwner === 'not-me'} onCheckedChange={() => setFilterOwner('not-me')} className="text-xs py-1.5 pl-8">
                                    <User className="h-3.5 w-3.5 mr-2" />
                                    Not owned by me
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={loading} variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors", filterModified !== 'any' && "border-slate-400 ring-1 ring-slate-300")}>
                                    Modified
                                    {filterModified !== 'any' && <span className="ml-0.5 bg-slate-200 text-slate-800 px-1.5 rounded-full text-[10px] font-medium">1</span>}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[180px] py-1 text-xs">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Modified</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 focus:bg-slate-800 p-1.5 px-2 cursor-pointer">
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
                                <Button disabled={loading} variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-white rounded-md border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                                    Source
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[180px] py-1 text-xs">
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 p-0 font-medium">Source</DropdownMenuLabel>
                                    <DropdownMenuItem className="text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 focus:bg-slate-800 p-1.5 px-2 cursor-pointer">
                                        Done
                                    </DropdownMenuItem>
                                </div>
                                <DropdownMenuItem className="text-xs py-1.5">All sources</DropdownMenuItem>
                                <DropdownMenuItem className="text-xs py-1.5">Uploaded</DropdownMenuItem>
                                <DropdownMenuItem className="text-xs py-1.5">Shared with me</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Right: Refresh & Search (search lives in right sidebar only) */}
                    <div className="flex items-center gap-2">
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
                                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
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
            < div className="flex-1 overflow-hidden flex flex-col relative my-4 bg-white rounded-xl border border-slate-200 shadow-sm" >
                {/* Google Drive Style Upload Progress Modal - portaled to body so fixed positioning is viewport-relative and not clipped by overflow-hidden */}
                {uploadQueue.length > 0 && typeof document !== 'undefined' && document.body && createPortal(
                    <div className={cn(
                        "fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border border-slate-200 z-[100] flex flex-col transition-all duration-300 w-[360px]",
                        isUploadModalOpen ? "h-auto max-h-[400px]" : "h-10"
                    )}>
                        {/* Modal Header */}
                        <div
                            className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 text-slate-900 rounded-t-lg cursor-pointer"
                            onClick={() => setIsUploadModalOpen(!isUploadModalOpen)}
                        >
                            <span className="text-[11px] font-medium">
                                {isUploading ? 'Uploading' : 'Uploads complete'} {uploadQueue.filter(i => i.status === 'completed').length}/{uploadQueue.length}
                            </span>
                            <div className="flex items-center gap-2 text-slate-500">
                                {isUploadModalOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        uploadOverlayDismissedRef.current = true
                                        setUploadQueue([])
                                        setIsUploading(false)
                                    }}
                                    className="hover:bg-slate-200 rounded p-0.5 transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        {isUploadModalOpen && (
                            <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 custom-scrollbar">
                                {uploadQueue.map((item) => (
                                    <div key={item.id} className="flex flex-col gap-1 px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 group">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-shrink-0">
                                                <DocumentIcon mimeType={item.file.type} className="h-3.5 w-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-slate-700 truncate font-medium" title={item.finalName || item.file.name}>{item.finalName || item.file.name}</p>
                                                {item.status === 'error' && (
                                                    <p className="text-[10px] text-red-500 truncate">{item.error || 'Upload failed'}</p>
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 flex items-center gap-2">
                                                {(item.status === 'completed' || item.status === 'uploading') && (
                                                    <TooltipProvider>
                                                        <Tooltip delayDuration={300}>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleShowFileLocation(item.finalName || item.file.name)
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded text-slate-500 transition-opacity"
                                                                >
                                                                    <Folder className="h-3.5 w-3.5" />
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Show file location</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}

                                                {item.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-slate-900" />}
                                                {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                                            </div>
                                        </div>
                                        {item.status === 'uploading' && (
                                            <div className="flex items-center gap-2 pl-6">
                                                <Progress value={item.progress} className="h-1 flex-1 bg-slate-100" />
                                                <span className="text-[10px] text-slate-400 tabular-nums">{Math.round(item.progress)}%</span>
                                            </div>
                                        )}
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

                {/* Fixed Table Header (Compact) */}
                <div className="sticky top-0 bg-slate-50 border-b border-slate-200 pl-3 pr-2 py-2 shrink-0 z-10 font-medium text-slate-500">
                    <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4 flex items-center"><TableHeader label="Name" /></div>
                        <div className="col-span-1 flex items-center"><TableHeader label="Quick" /></div>
                        <div className="col-span-2 flex items-center"><TableHeader label="Owner" /></div>
                        <div className="col-span-2 flex items-center"><TableHeader label="Date modified" /></div>
                        <div className="col-span-2 flex items-center text-left"><TableHeader label="File size" /></div>
                        <div className="col-span-1 flex justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={loading} variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" className="h-3.5 w-3.5">
                                            <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z" />
                                        </svg>
                                        Sort
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[220px] py-1 text-xs">
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
                        </div>
                    </div>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {loading || isLoadingFolders ? (
                        <div className="flex h-64 items-center justify-center">
                            <LoadingSpinner size="md" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                            <p className="text-sm text-slate-600">{error}</p>
                            <Button variant="link" onClick={() => window.location.reload()} className="h-auto p-0 mt-2 text-slate-700 hover:text-slate-900 text-xs">Try Refreshing</Button>
                        </div>
                    ) : !currentFolderId ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center px-3">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-8 w-8 text-slate-300" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">No engagement folders configured</h3>
                            <p className="text-sm text-slate-500 max-w-[280px] mx-auto">
                                This engagement has no Drive folders set up yet. Complete Google Drive setup in Connectors, or re-import a structure that includes general/confidential folders.
                            </p>
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
                        <div className={cn("divide-y divide-slate-100", isUploading && "opacity-50 transition-opacity")}>
                            {sortedFiles.map((file) => {
                                const isDeeplinkHighlight = file.id === highlightedFileId
                                const isFolder = (file.mimeType ?? (file as { type?: string }).type) === 'application/vnd.google-apps.folder'
                                // Same condition as the Shared badge: used to show folder_shared icon for folders and badge for files
                                const isEC = viewAsPersonaSlug === 'eng_ext_collaborator'
                                const isGuest = viewAsPersonaSlug === 'eng_viewer'
                                const showBadge = isGuest
                                    ? (sharedExternalIdsForGuest.has(file.id) || ancestorFolderIdsForGuest.has(file.id))
                                    : isEC
                                        ? (sharedExternalIdsForEC.has(file.id) || ancestorFolderIdsForEC.has(file.id))
                                        : (sharedExternalIds.has(file.id) || ancestorFolderIds.has(file.id))
                                const directShared = isGuest ? sharedExternalIdsForGuest.has(file.id) : isEC ? sharedExternalIdsForEC.has(file.id) : sharedExternalIds.has(file.id)
                                const ancestorOnly = isGuest ? ancestorFolderIdsForGuest.has(file.id) : isEC ? ancestorFolderIdsForEC.has(file.id) : ancestorFolderIds.has(file.id)

                                return (
                                    <div
                                        key={file.id}
                                        id={`file-row-${file.id}`}
                                        data-file-id={file.id}
                                        draggable={canEdit && !loading}
                                        onDragStart={(e) => handleItemDragStart(e, file)}
                                        onDragEnd={handleItemDragEnd}
                                        onDragOver={(e) => handleItemDragOver(e, file)}
                                        onDragLeave={handleItemDragLeave}
                                        onDrop={(e) => handleItemDrop(e, file)}
                                        className={cn(
                                            "group grid grid-cols-12 gap-4 py-2 pl-3 pr-2 transition-all items-center cursor-default relative",
                                            isFolder && "cursor-pointer",
                                            "hover:bg-slate-50",
                                            file.id === actionMenuOpenFileId && "bg-slate-50",
                                            file.id === activeCommentDocId && "bg-slate-50",
                                            draggedItem?.id === file.id && "opacity-40 grayscale",
                                            dragOverFolderId === file.id && "bg-slate-100 ring-2 ring-inset ring-slate-300/60 shadow-sm z-[1]"
                                        )}
                                        onMouseEnter={() => {
                                            if (isDeeplinkHighlight) setHighlightedFileId(null)
                                        }}
                                        onDoubleClick={() => handleItemClick(file)}
                                        onClick={() => handleItemClick(file)}
                                    >
                                        {/* Name Column: icon and name (deeplink = skewed pastel marker on file name only) */}
                                        <div className="col-span-4 flex items-center gap-3 min-w-0">
                                            <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                                {isFolder && showBadge ? (
                                                    <SharedFolderIcon
                                                        fillLevel={directShared ? 1 : 0.5}
                                                        tooltip={directShared ? 'shared' : 'contains-shared'}
                                                    />
                                                ) : isFolder ? (
                                                    <Folder className="h-4 w-4 text-purple-600 fill-purple-200 flex-shrink-0" />
                                                ) : (
                                                    <DocumentIcon mimeType={file.mimeType} className="h-4 w-4" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 flex items-center gap-2">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                            <div className="flex min-w-0 w-full flex-col">
                                                            {isDeeplinkHighlight ? (
                                                                <div className="flex w-full min-w-0 items-center gap-3">
                                                                    <mark
                                                                        className={cn(
                                                                            "file-deeplink-highlight block w-max max-w-[calc(100%-2rem)] min-w-0 text-xs font-medium text-left",
                                                                            isFolder
                                                                                ? "text-slate-800 hover:text-slate-600 cursor-pointer"
                                                                                : "text-slate-700"
                                                                        )}
                                                                    >
                                                                        <span className="block min-w-0 break-words">
                                                                            {file.name}
                                                                        </span>
                                                                    </mark>
                                                                    <CircleChevronLeft
                                                                        className="h-3.5 w-3.5 shrink-0 text-black animate-deeplink-icon-pulse"
                                                                        aria-hidden
                                                                        strokeWidth={2}
                                                                    />
                                                                </div>
                                                            ) : file.id === activeCommentDocId && !isFolder ? (
                                                                <div className="flex w-full min-w-0 items-center gap-3">
                                                                    <span
                                                                        className={cn(
                                                                            "text-xs font-medium truncate min-w-0 flex-1",
                                                                            "text-slate-700"
                                                                        )}
                                                                    >
                                                                        {file.name}
                                                                    </span>
                                                                    <CircleChevronLeft
                                                                        className="h-3.5 w-3.5 shrink-0 text-black animate-deeplink-icon-pulse"
                                                                        aria-label="Comments open for this file"
                                                                        strokeWidth={2}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span
                                                                    className={cn(
                                                                        "text-xs font-medium truncate",
                                                                        isFolder
                                                                            ? "text-slate-800 hover:text-slate-600 cursor-pointer"
                                                                            : "text-slate-700"
                                                                    )}
                                                                >
                                                                    {file.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[320px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-all">
                                                        {file.name}
                                                    </TooltipContent>
                                                </Tooltip>
                                                {showBadge && !isFolder ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                                                                <Share2 className="h-3 w-3" />
                                                                Shared
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            {isGuest ? 'Shared with Guest' : isEC ? 'Shared with External Collaborator' : 'Shared with External Collaborator or Guest'}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Quick actions */}
                                        <div className="col-span-1 flex items-center">
                                            {isFolder ? (
                                                <span className="text-xs text-slate-300">—</span>
                                            ) : (
                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className={cn(
                                                                    'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500',
                                                                    file.id === highlightedFileId
                                                                        ? 'text-slate-700 bg-slate-100'
                                                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                                                )}
                                                                aria-label="Copy link"
                                                                aria-pressed={file.id === highlightedFileId}
                                                                disabled={!file.projectDocumentId}
                                                                onClick={async () => {
                                                                    if (!file.projectDocumentId) return
                                                                    const base = typeof window !== 'undefined' ? window.location.href.replace(/#.*$/, '') : ''
                                                                    const url = base ? `${base}#doc-file:${file.projectDocumentId}` : ''
                                                                    if (!url) return
                                                                    await navigator.clipboard.writeText(url)
                                                                    addToast({ type: 'success', title: 'Link copied', message: 'Document link copied to clipboard.' })
                                                                }}
                                                            >
                                                                <Link2 className="h-4 w-4" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="text-xs">
                                                            {file.projectDocumentId ? 'Copy link' : 'Unavailable until indexed'}
                                                        </TooltipContent>
                                                    </Tooltip>

                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className={cn(
                                                                    'h-7 w-7 rounded-md inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500',
                                                                    file.id === activeCommentDocId
                                                                        ? 'text-slate-700 bg-slate-100'
                                                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                                                )}
                                                                aria-label="Open comments"
                                                                aria-pressed={file.id === activeCommentDocId}
                                                                disabled={!file.projectDocumentId}
                                                                onClick={() => openCommentsForFile(file)}
                                                            >
                                                                <MessageCircle className="h-4 w-4" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="text-xs">
                                                            {file.projectDocumentId ? 'Comments' : 'Unavailable until indexed'}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            )}
                                        </div>

                                        {/* Owner Column */}
                                        <div className="col-span-2 min-w-0">
                                            <span className="text-xs text-slate-500 truncate block" title={file.actorEmail || 'me'}>
                                                {file.actorEmail || 'me'}
                                            </span>
                                        </div>

                                        {/* Date Modified Column */}
                                        <div className="col-span-2">
                                            <RelativeDateTime
                                                date={file.modifiedTime}
                                                textClassName="text-xs text-slate-500"
                                                iconClassName="text-slate-300 hover:text-slate-500"
                                                tooltipSide="top"
                                            />
                                        </div>

                                        {/* File Size Column */}
                                        <div className="col-span-2 text-left">
                                            {isFolder ? (
                                                <span className="text-xs text-slate-300">—</span>
                                            ) : file.size ? (
                                                <span className="text-xs text-slate-500 font-mono">
                                                    {formatFileSize(Number(file.size))}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-300">—</span>
                                            )}
                                        </div>

                                        {/* Action Column - always visible, aligned with Sort header */}
                                        <div className="col-span-1 flex justify-end">
                                            <div onClick={(e) => e.stopPropagation()}>
                                                {(() => {
                                                    const locked = !!file.versionLocked
                                                    const canMutateFile = canEdit && !locked
                                                    const canOrganizeTree = canManage && !locked
                                                    return (
                                                        <DocumentActionMenu
                                                    document={file}
                                                    showShareModal={isProjectLead}
                                                    isEngagementLead={isProjectLead}
                                                    projectId={projectId}
                                                    onShareSaved={refreshShareStateAndFiles}
                                                    canManage={canOrganizeTree}
                                                    currentFolderType={currentFolderType}
                                                    onOpenCommentPane={(docId) => setActiveCommentDocId(docId)}
                                                    onRenameDocument={canMutateFile ? (doc) => openRenameModal(doc as DriveFile) : undefined}
                                                    onDuplicateDocument={canMutateFile ? (doc) => handleDuplicate(doc as DriveFile) : undefined}
                                                    onCopyDocument={generalFolderId && canMutateFile ? (doc) => openCopyMoveModal(doc as DriveFile, 'copy') : undefined}
                                                    onMoveDocument={generalFolderId && canMutateFile ? (doc) => openCopyMoveModal(doc as DriveFile, 'move') : undefined}
                                                    onDeleteDocument={canMutateFile ? (doc) => handleTrash(doc as DriveFile) : undefined}
                                                    onRestrictToConfidential={canOrganizeTree && confidentialFolderId ? (doc) => handleMoveTree(doc as DriveFile, 'confidential') : undefined}
                                                    onRestoreToGeneral={canOrganizeTree && generalFolderId ? (doc) => handleMoveTree(doc as DriveFile, 'general') : undefined}
                                                    onPromoteToGeneral={canOrganizeTree && generalFolderId ? (doc) => handleMoveTree(doc as DriveFile, 'general') : undefined}
                                                    onOpenChange={(open) => setActionMenuOpenFileId(open ? file.id : null)}
                                                    onOpenDocument={(doc) => {
                                                        const d = doc as DriveFile
                                                        const docId = d.id ?? file.id
                                                        handleSecureOpen(
                                                            {
                                                                documentId: docId,
                                                                fileName: d.name ?? '',
                                                                mimeType: d.mimeType,
                                                                externalId: docId,
                                                                firmId,
                                                                webViewLink: d.webViewLink || `https://drive.google.com/file/d/${docId}/view`,
                                                            },
                                                            docId
                                                        )
                                                    }}
                                                        />
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                        {(processingFileIds.has(file.id) || isRegrantingId === file.id) && (
                                            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
                                                <div className="h-[2px] w-full bg-indigo-100 overflow-hidden">
                                                    <div className="h-full bg-indigo-500 animate-indeterminate-progress" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                <Dialog open={isCreateItemOpen} onOpenChange={setIsCreateItemOpen}>
                    <DialogContent className="border-slate-200">
                        <DialogHeader>
                            <DialogTitle className="text-slate-900">
                                {createItemType === 'folder' ? 'New Folder' :
                                    createItemType === 'doc' ? 'New Google Doc' :
                                        createItemType === 'sheet' ? 'New Google Sheet' :
                                            createItemType === 'slide' ? 'New Google Slide' :
                                                createItemType === 'form' ? 'New Google Form' :
                                                    createItemType === 'drawing' ? 'New Google Drawing' :
                                                        createItemType === 'map' ? 'New Google Map' :
                                                            createItemType === 'site' ? 'New Google Site' :
                                                                'New Google Script'}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <Input
                                id="name"
                                placeholder={createItemType === 'folder' ? "Folder Name" : "Document Name"}
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateItem()
                                }}
                                className="border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-400"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setIsCreateItemOpen(false)}>Cancel</Button>
                            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleCreateItem} disabled={!newItemName.trim()}>Create</Button>
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
                <Dialog open={!!trashConfirmTarget} onOpenChange={(open) => { if (!open) setTrashConfirmTarget(null) }}>
                    <DialogContent className="max-w-sm gap-4 p-5 border-slate-200">
                        <DialogHeader>
                            <DialogTitle className="text-slate-900 flex items-center gap-2">
                                <Trash2 className="h-4 w-4 text-red-500" />
                                Move to Bin?
                            </DialogTitle>
                            <DialogDescription className="text-slate-600 pt-1">
                                <span className="font-medium text-slate-800">{trashConfirmTarget?.name}</span> will be moved to your Google Drive Bin.
                                Items in the Bin are permanently deleted after 30 days.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTrashConfirmTarget(null)}
                                disabled={trashConfirming}
                                className="border-slate-200 text-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleTrashConfirmed}
                                disabled={trashConfirming}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {trashConfirming ? <LoadingSpinner className="h-4 w-4" /> : 'Move to Bin'}
                            </Button>
                        </DialogFooter>
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
