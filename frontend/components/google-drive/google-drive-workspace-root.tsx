"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GooglePickerButton } from "@/components/google-drive/google-picker-button"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { GoogleSharedDriveIcon } from "@/components/ui/google-shared-drive-icon"
import { useToast } from "@/components/ui/toast"
import { generateWorkspaceFolderName, FIRMA_PARENT_FOLDER_NAME } from "@/lib/generate-unique-workspace-folder-name"
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderOpen,
  HardDrive,
  RefreshCw,
} from "lucide-react"

type GoogleDriveWorkspaceRootProps = {
  connectionId: string
  accessToken: string | null | undefined
  /** Email of the connected Google account — used to open My Drive in the right account context. */
  connectedEmail?: string | null
  rootFolderId?: string | null
  rootFolderName?: string | null
  /** Persisted workspace root location; null until backfilled from Drive API. */
  workspaceRootLocation?: "PERSONAL" | "SHARED" | null
  workspaceRootSharedStorageName?: string | null
  /** Disable the Migrate button when a migration is pending or active. */
  migrationLocked?: boolean
  onUpdated: () => void | Promise<void>
  onMigrationStarted?: () => void
  firmSlug?: string
  /** Firm ID — passed to update-root-folder so hierarchy can be provisioned even before clients are attached */
  firmId?: string | null
  /** Optional label shown inline to the right of the warehouse icon (e.g. "FOLDER") */
  sectionLabel?: string
  /** True for personal Gmail accounts (no `hd` claim on the OAuth id_token) — detected at
   * connect time (see app/api/connectors/google-drive/callback/route.ts). A personal Gmail
   * account can never have a Shared Drive, so (1) the workspace folder auto-creates in My
   * Drive on render with no user click/decision, and (2) the "Migrate" button is hidden
   * entirely once it exists — the root stays wherever it was auto-created, permanently, for
   * these accounts. Mirrors OneDriveWorkspaceRoot's isPersonalAccount handling. */
  isPersonalAccount?: boolean | null
  /** False when the underlying connector (Google OAuth session) is disconnected/revoked — as
   * opposed to `accessToken`, which is the user's own FirmaOne session token and stays truthy
   * regardless of this specific connector's state. When false, folder actions are disabled and
   * a reconnect hint is shown instead, but the last-known folder info still renders. Defaults
   * to true so existing callers that don't pass it keep today's behavior. */
  connectorActive?: boolean
}


const WORKSPACE_MIGRATE_DISABLED = false

/** Numbered progress dots — current step filled dark, future steps outlined, connected by lines. */
function StepProgress({ current, total, onStepClick }: { current: number; total: number; onStepClick?: (step: number) => void }) {
  return (
    <div className="flex items-center" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((step, i) => {
        const clickable = step < current && !!onStepClick
        const dotClassName = cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
          step < current
            ? "bg-[#9a9ba0] text-white"
            : step === current
              ? "bg-[#1b1b1d] text-white"
              : "border border-[#e5e7eb] bg-white text-[#9a9ba0]",
          clickable && "cursor-pointer hover:bg-[#1b1b1d]",
        )
        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div className={cn("h-0.5 w-6 shrink-0", step <= current ? "bg-[#1b1b1d]" : "bg-[#e5e7eb]")} />
            )}
            {clickable ? (
              <button type="button" onClick={() => onStepClick(step)} className={dotClassName} aria-label={`Back to step ${step}`}>
                {step}
              </button>
            ) : (
              <span className={dotClassName}>{step}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function GoogleDriveWorkspaceRoot({
  connectionId,
  accessToken,
  connectedEmail,
  rootFolderId,
  rootFolderName,
  workspaceRootLocation = null,
  workspaceRootSharedStorageName = null,
  migrationLocked = false,
  onUpdated,
  onMigrationStarted,
  firmSlug,
  firmId,
  sectionLabel,
  isPersonalAccount = null,
  connectorActive = true,
}: GoogleDriveWorkspaceRootProps) {
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewDrive, setPreviewDrive] = useState<"My Drive" | "Shared Drive" | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [hasOpenedDrive, setHasOpenedDrive] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 3>(1)
  const [pendingFolder, setPendingFolder] = useState<{ id: string; name: string } | null>(null)
  const [generatedFolderName, setGeneratedFolderName] = useState("")
  const [estimate, setEstimate] = useState<{ itemCount: number; estimatedMinutes: number } | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [fromBreadcrumb, setFromBreadcrumb] = useState<string[] | null>(null)
  const [toBreadcrumb, setToBreadcrumb] = useState<string[] | null>(null)
  const [knownFirmaFolders, setKnownFirmaFolders] = useState<{ sharedDriveId: string; driveName: string | null; firmaFolderId: string }[]>([])
  const [knownFoldersLoading, setKnownFoldersLoading] = useState(false)

  const displayName = rootFolderName?.trim() || "Workspace folder"
  const driveUrl = rootFolderId
    ? `https://drive.google.com/drive/folders/${rootFolderId}`
    : null

  /** First segment of workspace breadcrumb (e.g. My Drive or shared drive name). */
  const breadcrumbRootLabel =
    workspaceRootLocation === "PERSONAL"
      ? "My Drive"
      : workspaceRootLocation === "SHARED"
        ? workspaceRootSharedStorageName?.trim()
          ? `Shared drive · ${workspaceRootSharedStorageName.trim()}`
          : "Shared drive"
        : rootFolderId
          ? "Location unknown"
          : null

  const isShared = previewDrive === "Shared Drive"
  // Shared Drive now picks a PARENT the app creates `_firma` inside — query for that (spike 0.1
  // confirmed this matches cleanly with no _f_workspace_* bleed-through). My Drive's migration
  // flow is unchanged and still searches for the pre-generated target name.
  const pickerQuery = isShared ? FIRMA_PARENT_FOLDER_NAME : (generatedFolderName ?? "")
  const myDriveOpenUrl = connectedEmail
    ? `https://drive.google.com/drive/my-drive?authuser=${encodeURIComponent(connectedEmail)}`
    : "https://drive.google.com/drive/my-drive"
  const sharedDriveOpenUrl = connectedEmail
    ? `https://drive.google.com/drive/shared-drives?authuser=${encodeURIComponent(connectedEmail)}`
    : "https://drive.google.com/drive/shared-drives"
  const driveOpenUrl = isShared ? sharedDriveOpenUrl : myDriveOpenUrl

  const fetchEstimate = useCallback(async () => {
    if (!accessToken || !connectionId) return
    setEstimateLoading(true)
    try {
      const res = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'estimate-migration', connectionId }),
      })
      if (res.ok) setEstimate(await res.json())
    } catch { /* ignore */ } finally {
      setEstimateLoading(false)
    }
  }, [accessToken, connectionId])

  const fetchBreadcrumbs = useCallback(async (fromId: string, toId: string) => {
    if (!accessToken || !connectionId) return
    const call = async (folderId: string) => {
      try {
        const res = await fetch('/api/connectors/google-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'folder-breadcrumb', connectionId, folderId }),
        })
        if (res.ok) return (await res.json() as { path: string[] }).path
      } catch { /* ignore */ }
      return null
    }
    const [from, to] = await Promise.all([call(fromId), call(toId)])
    setFromBreadcrumb(from)
    setToBreadcrumb(to)
  }, [accessToken, connectionId])

  const resetFlow = useCallback(() => {
    setPreviewDrive(null)
    setPendingFolder(null)
    setHasCopied(false)
    setHasOpenedDrive(false)
    setPickerOpen(false)
    setWizardStep(1)
    setGeneratedFolderName("")
    setEstimate(null)
    setEstimateLoading(false)
    setFromBreadcrumb(null)
    setToBreadcrumb(null)
    setKnownFirmaFolders([])
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    resetFlow()
  }, [resetFlow])

  /**
   * Creates `_firma/<random workspace folder>` under `parentId` (idempotent — findOrCreateFolder
   * searches by name and parent, so re-running this against the same parent reuses the existing
   * `_firma` rather than duplicating it) and sets the new folder as the workspace root.
   * `parentId` defaults to My Drive's root; pass a picked Shared Drive folder id to nest there
   * instead. Returns the new root folder's id/name.
   */
  const createWorkspaceUnder = async (parentId: string | undefined, token: string): Promise<{ folderId: string; folderName: string }> => {
    const folderName = generateWorkspaceFolderName()
    // Step 1: find-or-create _firma parent under parentId (idempotent)
    const firmaRes = await fetch('/api/connectors/google-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'ensure-folder', connectionId, name: FIRMA_PARENT_FOLDER_NAME, ...(parentId && { parentId }) }),
    })
    if (!firmaRes.ok) {
      const err = await firmaRes.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || `Failed to ensure ${FIRMA_PARENT_FOLDER_NAME} folder`)
    }
    const { folderId: firmaFolderId } = await firmaRes.json()
    // Step 2: find-or-create workspace folder inside _firma (idempotent)
    const createRes = await fetch('/api/connectors/google-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'ensure-folder', connectionId, name: folderName, parentId: firmaFolderId }),
    })
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Failed to ensure workspace folder')
    }
    const { folderId } = await createRes.json()
    return { folderId, folderName }
  }

  /** Sets `newRootFolderId` as the workspace root and provisions the firm/client/engagement hierarchy. */
  const setWorkspaceRoot = async (newRootFolderId: string, token: string) => {
    const updateRes = await fetch('/api/connectors/google-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'update-root-folder', connectionId, rootFolderId: newRootFolderId, ...(firmId && { firmId }) }),
    })
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Failed to set workspace root')
    }
  }

  const autoCreateMyDriveFolder = async () => {
    if (!accessToken || saving) return
    setSaving(true)
    try {
      const { folderId, folderName } = await createWorkspaceUnder(undefined, accessToken)
      await setWorkspaceRoot(folderId, accessToken)
      addToast({ title: 'Folder created', message: `"${folderName}" set as your workspace root.`, type: 'success' })
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({ title: 'Could not create folder', message: e instanceof Error ? e.message : 'Try again.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const startMyDriveFlow = () => {
    // No existing folder — auto-create directly in My Drive root, skip wizard
    if (!rootFolderId) {
      void autoCreateMyDriveFolder()
      return
    }
    setPreviewDrive("My Drive")
    setGeneratedFolderName(generateWorkspaceFolderName())
    setWizardStep(1)
    setHasCopied(false)
    void fetchEstimate()
  }

  // Auto-complete Step 2 for personal Gmail accounts — no folder yet and no decision to make
  // (a personal Gmail account can never have a Shared Drive), so create the workspace folder
  // the moment this renders rather than making the user click "Choose folder" for a foregone
  // conclusion. Ref-guarded so this only ever fires once per connection, even across
  // re-renders (e.g. accessToken resolving async) — autoCreateMyDriveFolder itself also
  // no-ops while saving. Mirrors OneDriveWorkspaceRoot's equivalent effect.
  const autoPersonalRunRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isPersonalAccount || rootFolderId || !accessToken) return
    if (autoPersonalRunRef.current === connectionId) return
    autoPersonalRunRef.current = connectionId
    void autoCreateMyDriveFolder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersonalAccount, rootFolderId, accessToken, connectionId])

  const startSharedDriveFlow = () => {
    setPreviewDrive("Shared Drive")
    setWizardStep(1)
    void fetchEstimate()
    void fetchKnownFirmaFolders()
  }

  // Reuse: on a repeat Shared Drive setup for the same Google account, offer any _firma folders
  // already known from a prior connector's setup — skips the picker entirely.
  const fetchKnownFirmaFolders = useCallback(async () => {
    if (!accessToken || !connectionId) return
    setKnownFoldersLoading(true)
    try {
      const res = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'list-known-firma-folders', connectionId }),
      })
      if (res.ok) {
        const data = await res.json() as { knownFolders: { sharedDriveId: string; driveName: string | null; firmaFolderId: string }[] }
        setKnownFirmaFolders(data.knownFolders ?? [])
      }
    } catch { /* ignore — falls through to the picker */ } finally {
      setKnownFoldersLoading(false)
    }
  }, [accessToken, connectionId])

  const useKnownFirmaFolder = async (folder: { sharedDriveId: string; driveName: string | null; firmaFolderId: string }) => {
    if (!accessToken) return
    const oldRoot = rootFolderId?.trim() || ""
    const parent = { id: folder.firmaFolderId, name: folder.driveName ? `${FIRMA_PARENT_FOLDER_NAME} in ${folder.driveName}` : FIRMA_PARENT_FOLDER_NAME }
    if (oldRoot) {
      setPendingFolder(parent)
      setWizardStep(3)
      void fetchBreadcrumbs(oldRoot, folder.firmaFolderId)
      return
    }
    setSaving(true)
    try {
      // firmaFolderId is already the _firma folder itself — create the workspace folder directly
      // inside it rather than routing through createWorkspaceUnder (which would create a second,
      // redundant _firma nested inside this one).
      const folderName = generateWorkspaceFolderName()
      const createRes = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'ensure-folder', connectionId, name: folderName, parentId: folder.firmaFolderId }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to ensure workspace folder')
      }
      const { folderId } = await createRes.json()
      await setWorkspaceRoot(folderId, accessToken)
      addToast({ title: 'Folder created', message: `"${folderName}" set as your workspace root.`, type: 'success' })
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({ title: 'Could not create folder', message: e instanceof Error ? e.message : 'Try again.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // The picked item is now a PARENT location, not a pre-named target — Picker can't discover a
  // hand-made _firma folder under drive.file scope, so the app always creates it itself, inside
  // whatever the user picks. First-time setup creates immediately (nothing to migrate from);
  // migration defers creation until the user confirms (see confirmMigration below), so cancelling
  // at the confirm step never orphans an empty _f_workspace_* folder in Drive.
  const handleFolderPicked = async (items: { id: string; name: string }[]) => {
    const parent = items[0]
    if (!parent || !accessToken) {
      addToast({
        title: "Not signed in",
        message: "Sign in again, then retry.",
        type: "error",
      })
      return
    }
    const oldRoot = rootFolderId?.trim() || ""
    if (oldRoot) {
      // Migration — defer folder creation to confirmMigration, only resolve breadcrumbs now.
      setPendingFolder(parent)
      setWizardStep(3)
      void fetchBreadcrumbs(oldRoot, parent.id)
      return
    }
    setSaving(true)
    try {
      const { folderId, folderName } = await createWorkspaceUnder(parent.id, accessToken)
      await setWorkspaceRoot(folderId, accessToken)
      addToast({
        title: "Folder created",
        message: `"${folderName}" set as your workspace root.`,
        type: "success",
      })
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({
        title: "Could not complete",
        message: e instanceof Error ? e.message : "Try again.",
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  const confirmMigration = async (graceMinutes: 2 | 15) => {
    if (!pendingFolder || !accessToken) return
    setSaving(true)
    try {
      const oldRoot = rootFolderId?.trim() || ""
      // Create _firma/_f_workspace_* under the picked parent now — not before this point — so a
      // cancelled migration (closing the dialog without confirming) never leaves a folder behind.
      const { folderId: newRootFolderId } = await createWorkspaceUnder(pendingFolder.id, accessToken)
      const res = await fetch("/api/connectors/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          action: "migrate-and-update-root",
          connectionId,
          newRootFolderId,
          migrateFromRootFolderId: oldRoot,
          estimatedMinutes: estimate?.estimatedMinutes ?? 5,
          graceMinutes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as any).error || "Migration failed")
      onMigrationStarted?.()
      closeDialog()
      // Start fast-polling immediately so the panel appears as soon as
      // the DB write from setMigrationPending settles (typically < 1s).
      window.dispatchEvent(new Event('firma:migration-started'))
      await new Promise(r => setTimeout(r, 800))
      window.dispatchEvent(new Event('firma:refresh-maintenance'))
      await onUpdated()
    } catch (e) {
      addToast({
        title: "Could not complete",
        message: e instanceof Error ? e.message : "Try again.",
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  const copyGeneratedFolderName = async () => {
    try {
      await navigator.clipboard.writeText(generatedFolderName)
      setHasCopied(true)
      addToast({
        title: "Copied",
        message: isShared
          ? "Use this exact name when you create the folder in your shared drive."
          : "Use this exact name when you create the folder in My Drive.",
        type: "success",
      })
    } catch {
      addToast({ title: "Copy failed", message: "Select and copy the folder name manually.", type: "error" })
    }
  }

  // Flat step count — fixed at 2 (Location → Select) so the bar doesn't jump/reflow once a
  // location is chosen, matching OneDriveWorkspaceRoot's equivalent fix. +1 only when migrating
  // an existing root (adds the Confirm step).
  const totalSteps = 2 + (rootFolderId ? 1 : 0)
  const currentStep =
    previewDrive === null ? 1
      : wizardStep === 3 ? totalSteps
        : 2

  const dialogTitle = rootFolderId ? "Migrate workspace folder" : "Set up workspace folder"
  const dialogSubtitle =
    previewDrive === null
      ? rootFolderId
        ? "Choose where the new workspace folder should live."
        : "Choose where to create your workspace folder."
      : isShared
        ? rootFolderId
          ? "Unique name, create the folder in Google Drive, then select it — we migrate top-level items from your current root in the background."
          : "Create a folder in your Shared Drive, then select it here."
        : "Unique name, create the folder in My Drive, then select it — we migrate top-level items from your current root in the background."

  return (
    <div>
      <div>
        {rootFolderId ? (
          <TooltipProvider delayDuration={300}>
            {/* Single clean row */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Icon */}
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <HardDrive className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={2} />
              </div>

              {/* Label line + folder name + badge */}
              <div className="min-w-0 flex-1">
                {sectionLabel && (
                  <p className="text-[0.8125rem] font-bold text-[#1b1b1d] leading-snug">{sectionLabel}</p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-[#45474c] truncate" title={displayName}>{displayName}</span>
                  {breadcrumbRootLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-[#e5e7eb] bg-[#f9f9fb] px-1.5 py-0.5 text-[10px] font-medium text-[#45474c] shrink-0">
                      {workspaceRootLocation === "SHARED" ? (
                        <GoogleSharedDriveIcon size={11} className="shrink-0 opacity-80" aria-hidden />
                      ) : workspaceRootLocation === "PERSONAL" ? (
                        <GoogleDriveIcon size={11} className="shrink-0 opacity-80" aria-hidden />
                      ) : null}
                      {breadcrumbRootLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {driveUrl ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 w-[6.5rem] items-center justify-center gap-1.5 rounded text-xs font-medium text-[#45474c] bg-white border border-[#e5e7eb] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors"
                        aria-label="Open in Google Drive"
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top">Open in Google Drive</TooltipContent>
                  </Tooltip>
                ) : null}
                {isPersonalAccount === true ? null : (
                  // Migrate is hidden entirely for personal Gmail accounts — a personal Gmail
                  // account can never have a Shared Drive to migrate to, and the workspace
                  // folder was already auto-created with no user decision involved, so there's
                  // nothing meaningful to offer here (mirrors OneDriveWorkspaceRoot).
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-8 w-[6.5rem] items-center justify-center gap-1.5 rounded text-xs font-medium text-[#45474c] bg-white border border-[#e5e7eb] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors",
                          (!accessToken || !connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked) && "opacity-40 cursor-not-allowed",
                        )}
                        onClick={() => {
                          if (!connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked) return
                          resetFlow()
                          setDialogOpen(true)
                        }}
                        disabled={!accessToken || !connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked}
                        aria-label="Migrate workspace folder"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-firma" aria-hidden />
                        Migrate
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-sm text-left leading-snug space-y-1.5">
                      {WORKSPACE_MIGRATE_DISABLED ? (
                        "Workspace migration is temporarily disabled."
                      ) : (
                        <>
                          <p className="font-semibold text-[#1b1b1d]">How it works</p>
                          <ol className="list-decimal list-inside space-y-1 text-[#45474c]">
                            <li>We suggest a unique folder name for your new workspace root.</li>
                            <li>You create that folder in Google Drive (My Drive or a Shared Drive).</li>
                            <li>You select it here — we point the app at it.</li>
                            <li>Everything in your current workspace is automatically moved into the new folder.</li>
                          </ol>
                          {firmSlug && (
                            <p className="text-[#45474c] pt-0.5">
                              Need help?{' '}
                              <a
                                href={`/d/support?firmSlug=${firmSlug}`}
                                className="underline underline-offset-2 text-primary hover:text-primary/80 transition-colors font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Contact Support
                              </a>
                              .
                            </p>
                          )}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </TooltipProvider>
        ) : isPersonalAccount === true ? (
          // A personal Gmail account can never have a Shared Drive, so there's no real choice
          // to present — the workspace folder is created automatically (see the
          // autoPersonalRunRef effect above) as soon as this renders, no button/click needed.
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
              <RefreshCw className="h-4.5 w-4.5 text-[#45474c] animate-spin" strokeWidth={1.75} />
            </div>
            <p className="min-w-0 flex-1 text-[0.8125rem] text-[#45474c]">
              Setting up your workspace folder in My Drive…
            </p>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <FolderOpen className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={1.75} />
              </div>
              <p className="min-w-0 flex-1 text-[0.8125rem] text-[#45474c]">
                No workspace folder selected yet.
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all shrink-0",
                      (!accessToken || !connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked) && "opacity-40 cursor-not-allowed",
                    )}
                    onClick={() => {
                      if (!connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked) return
                      resetFlow()
                      setDialogOpen(true)
                    }}
                    disabled={!accessToken || !connectorActive || WORKSPACE_MIGRATE_DISABLED || migrationLocked}
                    aria-label="Choose storage location"
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Choose Location
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-xs text-left leading-snug">
                  {WORKSPACE_MIGRATE_DISABLED ? (
                    "Workspace migration is temporarily disabled."
                  ) : (
                    <>
                      Guided steps: create a uniquely named folder in Google Drive, then select it. If you already have
                      a workspace root, top-level items are moved into the new folder; otherwise we only point the app
                      at the folder you pick.
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
        {!accessToken ? (
          <p className="text-xs text-amber-800 mt-3">Sign in to migrate your workspace folder.</p>
        ) : !connectorActive ? (
          <p className="text-xs text-amber-800 mt-3">Reconnect this account to manage the workspace folder.</p>
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        modal={!pickerOpen}
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true)
          } else if (!pickerOpen) {
            closeDialog()
          }
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded"
          onInteractOutside={(e) => {
            // Block outside-click close on step 3 (confirmation) and while picker result is pending.
            if (wizardStep === 3 || pendingFolder !== null) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[0.9375rem] font-bold text-[#1b1b1d]">{dialogTitle}</DialogTitle>
            <DialogDescription className="text-left text-xs text-[#45474c]">{dialogSubtitle}</DialogDescription>
          </DialogHeader>

          <StepProgress
            current={currentStep}
            total={totalSteps}
            onStepClick={isShared ? (step) => { if (step === 1) resetFlow() } : undefined}
          />

          {!previewDrive ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Location</p>
              <p className="text-xs text-[#45474c] leading-relaxed">
                All documents in your workspace will be stored in the location you choose below.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={startMyDriveFlow}
                  disabled={saving}
                  className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
                    {saving ? <RefreshCw className="h-6 w-6 text-[#45474c] animate-spin" /> : <GoogleDriveIcon size={28} />}
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">{saving ? 'Creating folder…' : 'My Drive'}</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Personal storage tied to your Google account.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={startSharedDriveFlow}
                  disabled={saving}
                  className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
                    <GoogleSharedDriveIcon size={28} />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">Shared Drive</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Accessible to permitted users across your Google Workspace account.</p>
                  </div>
                </button>
              </div>
            </div>
          ) : wizardStep === 1 && isShared ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Shared Drive · Choose where Firma should work</p>

              <div className="space-y-3">
                <p className="text-xs text-[#45474c] leading-relaxed">
                  Pick a folder in your shared drive. We&rsquo;ll create a <code className="text-[11px] font-mono">{FIRMA_PARENT_FOLDER_NAME}</code> folder inside it and keep everything there.
                </p>
                <p className="text-[11px] text-[#45474c] leading-relaxed">
                  Google only lets apps see folders you explicitly select, so this step is manual. Microsoft doesn&rsquo;t have this restriction.
                </p>
                <p className="text-[11px] text-[#45474c] leading-relaxed">
                  No folders in your shared drive yet? Create one in Drive — any name works — then select it.
                </p>

                {knownFoldersLoading ? (
                  <p className="text-xs text-[#45474c]">Checking for shared drives you&rsquo;ve already set up…</p>
                ) : knownFirmaFolders.length > 0 ? (
                  <div className="space-y-2 rounded border border-[#e5e7eb] bg-[#f9f9fb] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#45474c]">Reuse an existing setup</p>
                    <div className="space-y-1.5">
                      {knownFirmaFolders.map((folder) => (
                        <button
                          key={folder.firmaFolderId}
                          type="button"
                          disabled={saving}
                          onClick={() => void useKnownFirmaFolder(folder)}
                          className="flex w-full items-center gap-2 rounded border border-[#e5e7eb] bg-white px-3 py-2 text-left text-xs text-[#1b1b1d] hover:border-[#1b1b1d] hover:bg-[#f9f9fb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <GoogleSharedDriveIcon size={14} className="shrink-0 opacity-80" aria-hidden />
                          <span className="truncate">
                            Use {FIRMA_PARENT_FOLDER_NAME} in <span className="font-semibold">{folder.driveName || "this shared drive"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#45474c]">Or pick a different location below.</p>
                  </div>
                ) : null}

                {rootFolderId && estimateLoading && (
                  <p className="text-xs text-[#45474c]">Estimating migration time…</p>
                )}
                {rootFolderId && estimate && !estimateLoading && (
                  <p className="text-xs text-[#45474c]">
                    ~{estimate.estimatedMinutes} min maintenance window · {estimate.itemCount} items
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm"
                    className="flex-1 justify-center h-8 px-3 text-[11px] font-headline font-bold tracking-widest uppercase rounded border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                    onClick={resetFlow}>
                    <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" />Change location
                  </Button>
                  <a
                    href={driveOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative inline-flex flex-1 items-center justify-center gap-1.5 h-8 px-3 text-[11px] font-headline font-bold tracking-widest uppercase rounded border border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] transition-colors"
                  >
                    <GoogleDriveIcon size={14} className="shrink-0" aria-hidden />
                    Open Shared Drives<ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <GooglePickerButton
                    mode="select-folder"
                    connectionId={connectionId}
                    driveType="Shared Drive"
                    query={pickerQuery}
                    onPickerOpen={() => { setSaving(true); setPickerOpen(true) }}
                    onPickerCancel={() => { setSaving(false); setPickerOpen(false) }}
                    onImport={(items) => { setPickerOpen(false); void handleFolderPicked(items as { id: string; name: string }[]) }}
                  >
                    <Button type="button" variant="greenCta"
                      className="relative flex-1 justify-center h-8 text-[11px] font-headline font-bold tracking-widest uppercase rounded"
                      disabled={saving}>
                      {saving
                        ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 shrink-0 animate-spin" />Applying…</>
                        : <><FolderOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />Select Folder</>}
                    </Button>
                  </GooglePickerButton>
                </div>
              </div>
            </div>
          ) : wizardStep === 1 ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">My Drive · Setup</p>

              <div className="space-y-3">
                {/* Generated name box */}
                <div className="flex items-center justify-between gap-2 rounded border border-[#e5e7eb] bg-[#f9f9fb] px-3 py-2.5">
                  <code className="min-w-0 break-all text-xs font-mono text-[#1b1b1d]">{generatedFolderName}</code>
                  <div className="flex shrink-0 gap-1.5">
                    <span className={cn("relative inline-flex rounded", !hasCopied && "p-[1.5px] overflow-hidden")}>
                      {!hasCopied && (
                        <span
                          className="animate-border-spin absolute inset-0"
                          style={{
                            background: "conic-gradient(from var(--border-angle), #4285F4 0%, #EA4335 12%, #FBBC05 24%, #34A853 36%, transparent 46%, transparent 100%)",
                          }}
                          aria-hidden
                        />
                      )}
                      <Button size="sm" variant="outline" className="relative h-7 px-2.5 text-[11px] font-headline font-bold tracking-widest uppercase rounded border-[#e5e7eb]" onClick={() => void copyGeneratedFolderName()}>
                        {hasCopied ? (
                          <><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />Copied</>
                        ) : (
                          <><Copy className="mr-1 h-3 w-3" />Copy</>
                        )}
                      </Button>
                    </span>
                  </div>
                </div>

                {/* Estimate — only relevant when migrating an existing folder */}
                {rootFolderId && estimateLoading && (
                  <p className="text-xs text-[#45474c]">Estimating migration time…</p>
                )}
                {rootFolderId && estimate && !estimateLoading && (
                  <p className="text-xs text-[#45474c]">
                    ~{estimate.estimatedMinutes} min maintenance window · {estimate.itemCount} items
                  </p>
                )}

                <ol className="space-y-1.5 pl-4 list-decimal text-xs text-[#45474c]">
                  <li>Copy the folder name above.</li>
                  <li>Open My Drive and create a <span className="font-semibold text-[#1b1b1d]">New folder</span> with that name.</li>
                  <li>Return here and click <span className="font-semibold text-[#1b1b1d]">Select Folder</span>.</li>
                </ol>

                {/* Progressive actions: Copy -> Open Drive -> Select Folder */}
                <div className="flex items-center gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm"
                    className="flex-1 justify-center h-8 px-3 text-[11px] font-headline font-bold tracking-widest uppercase rounded border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                    onClick={resetFlow}>
                    <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" />Change location
                  </Button>
                  <span className={cn("relative inline-flex flex-1 rounded", hasCopied && !hasOpenedDrive && "p-[1.5px] overflow-hidden")}>
                    {hasCopied && !hasOpenedDrive && (
                      <span
                        className="animate-border-spin absolute inset-0"
                        style={{
                          background: "conic-gradient(from var(--border-angle), #4285F4 0%, #EA4335 12%, #FBBC05 24%, #34A853 36%, transparent 46%, transparent 100%)",
                        }}
                        aria-hidden
                      />
                    )}
                    <a
                      href={driveOpenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setHasOpenedDrive(true)}
                      aria-disabled={!hasCopied}
                      className={cn(
                        "relative inline-flex w-full items-center justify-center gap-1.5 h-8 px-3 text-[11px] font-headline font-bold tracking-widest uppercase rounded border border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] transition-colors",
                        !hasCopied && "opacity-40 pointer-events-none",
                      )}
                    >
                      <GoogleDriveIcon size={14} className="shrink-0" aria-hidden />
                      Open My Drive<ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </span>
                  <span className={cn("relative inline-flex flex-1 rounded", hasOpenedDrive && !saving && "p-[1.5px] overflow-hidden")}>
                    {hasOpenedDrive && !saving && (
                      <span
                        className="animate-border-spin absolute inset-0"
                        style={{
                          background: "conic-gradient(from var(--border-angle), #4285F4 0%, #EA4335 12%, #FBBC05 24%, #34A853 36%, transparent 46%, transparent 100%)",
                        }}
                        aria-hidden
                      />
                    )}
                    <GooglePickerButton
                      mode="select-folder"
                      connectionId={connectionId}
                      driveType="My Drive"
                      query={pickerQuery}
                      onPickerOpen={() => { setSaving(true); setPickerOpen(true) }}
                      onPickerCancel={() => { setSaving(false); setPickerOpen(false) }}
                      onImport={(items) => { setPickerOpen(false); void handleFolderPicked(items as { id: string; name: string }[]) }}
                    >
                      <Button type="button" variant="greenCta"
                        className="relative w-full justify-center h-8 text-[11px] font-headline font-bold tracking-widest uppercase rounded"
                        disabled={saving || !hasOpenedDrive}>
                        {saving
                          ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 shrink-0 animate-spin" />Applying…</>
                          : <><FolderOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />Select Folder</>}
                      </Button>
                    </GooglePickerButton>
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          {previewDrive && wizardStep === 3 && pendingFolder ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">
                {isShared ? "Shared Drive" : "My Drive"} · Confirm
              </p>

              {/* Confirm migration */}
              <div className="space-y-3">
                {/* From → To */}
                <div className="rounded border border-[#e5e7eb] divide-y divide-[#e5e7eb] overflow-hidden">
                  <div className="px-4 py-3 flex items-start gap-3 bg-[#f9f9fb]/60">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#45474c] w-10 shrink-0 pt-0.5">From</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1b1b1d] truncate">{rootFolderName || "Current workspace"}</p>
                      <p className="text-[11px] text-[#45474c] mt-0.5 truncate">
                        {fromBreadcrumb
                          ? fromBreadcrumb.slice(0, -1).join(" › ") || fromBreadcrumb[0]
                          : breadcrumbRootLabel || (workspaceRootLocation === "PERSONAL" ? "My Drive" : workspaceRootLocation === "SHARED" ? "Shared Drive" : "Google Drive")}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#45474c] w-10 shrink-0 pt-0.5">To</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1b1b1d] truncate">
                        A new {FIRMA_PARENT_FOLDER_NAME} workspace inside &ldquo;{pendingFolder.name}&rdquo;
                      </p>
                      <p className="text-[11px] text-[#45474c] mt-0.5 truncate">
                        {toBreadcrumb
                          ? toBreadcrumb.join(" › ")
                          : isShared ? "Shared Drive" : "My Drive"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Maintenance warning */}
                <div className="rounded border border-[#e5e7eb] bg-[#f9f9fb] px-3.5 py-3 flex gap-3">
                  <div className="w-0.5 shrink-0 rounded-full bg-[#45474c]/30 self-stretch" />
                  <div>
                    <p className="text-xs font-semibold text-[#1b1b1d]">
                      {estimate ? `~${estimate.estimatedMinutes} min maintenance window` : "Maintenance window required"}
                    </p>
                    <p className="text-[11px] text-[#45474c] mt-0.5 leading-relaxed">
                      {estimate && estimate.itemCount > 0
                        ? `${estimate.itemCount} items will be moved. `
                        : ""}
                      All members will be emailed and signed out automatically once the lock begins.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm"
                    className="h-8 px-3 text-xs rounded border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                    onClick={() => { setPendingFolder(null); setWizardStep(1) }}>
                    <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" />Back
                  </Button>
                  <Button type="button" variant="outline" size="sm"
                    className="flex-1 h-8 text-xs font-headline font-bold tracking-widest rounded border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                    disabled={saving}
                    onClick={() => void confirmMigration(15)}>
                    {saving ? "Starting…" : "Notify & start in 15 min"}
                  </Button>
                  <Button type="button" variant="greenCta"
                    className="flex-1 h-8 text-xs font-headline font-bold tracking-widest uppercase rounded"
                    disabled={saving}
                    onClick={() => void confirmMigration(2)}>
                    {saving ? "Starting…" : "Start Now"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

        </DialogContent>
      </Dialog>
    </div>
  )
}
