"use client"

import { useState, useCallback } from "react"
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
import { GoogleDriveMock } from "@/components/google-drive/google-drive-mock"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { GoogleSharedDriveIcon } from "@/components/ui/google-shared-drive-icon"
import { useToast } from "@/components/ui/toast"
import { generateWorkspaceFolderName } from "@/lib/generate-unique-workspace-folder-name"
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderOpen,
  RefreshCw,
  Warehouse,
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
}


const WORKSPACE_MIGRATE_DISABLED = false

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
}: GoogleDriveWorkspaceRootProps) {
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewDrive, setPreviewDrive] = useState<"My Drive" | "Shared Drive" | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [pendingFolder, setPendingFolder] = useState<{ id: string; name: string } | null>(null)
  const [generatedFolderName, setGeneratedFolderName] = useState("")
  const [estimate, setEstimate] = useState<{ itemCount: number; estimatedMinutes: number } | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [fromBreadcrumb, setFromBreadcrumb] = useState<string[] | null>(null)
  const [toBreadcrumb, setToBreadcrumb] = useState<string[] | null>(null)

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
  const pickerQuery = generatedFolderName ?? ""
  const myDriveOpenUrl = connectedEmail
    ? `https://drive.google.com/drive/my-drive?authuser=${encodeURIComponent(connectedEmail)}`
    : "https://drive.google.com/drive/my-drive"

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
    setWizardStep(1)
    setGeneratedFolderName("")
    setEstimate(null)
    setEstimateLoading(false)
    setFromBreadcrumb(null)
    setToBreadcrumb(null)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    resetFlow()
  }, [resetFlow])

  const startMyDriveFlow = () => {
    setPreviewDrive("My Drive")
    setGeneratedFolderName(generateWorkspaceFolderName())
    setWizardStep(1)
    setHasCopied(false)
    void fetchEstimate()
  }

  const startSharedDriveFlow = () => {
    setPreviewDrive("Shared Drive")
    setGeneratedFolderName(generateWorkspaceFolderName())
    setWizardStep(1)
    setHasCopied(false)
    void fetchEstimate()
  }

  const regenerateFolderName = () => {
    if (!previewDrive) return
    setGeneratedFolderName(generateWorkspaceFolderName())
    setHasCopied(false)
    setWizardStep(1)
  }

  const updateRootOnly = async (newId: string) => {
    if (!accessToken) return
    const res = await fetch("/api/connectors/google-drive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "update-root-folder",
        connectionId,
        rootFolderId: newId,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || "Request failed")
    }
  }

  const handleFolderPicked = async (items: { id: string; name: string }[]) => {
    const item = items[0]
    if (!item || !accessToken) {
      addToast({
        title: "Not signed in",
        message: "Sign in again, then retry.",
        type: "error",
      })
      return
    }
    const oldRoot = rootFolderId?.trim() || ""
    console.log('[handleFolderPicked]', { rootFolderId, oldRoot, pickedId: item.id, isSame: oldRoot === item.id, willMigrate: !!(oldRoot && oldRoot !== item.id) })
    if (oldRoot && oldRoot !== item.id) {
      // Go to confirmation step
      setPendingFolder(item)
      setWizardStep(3)
      void fetchBreadcrumbs(oldRoot, item.id)
      return
    }
    setSaving(true)
    try {
      await updateRootOnly(item.id)
      addToast({
        title: "Workspace folder updated",
        message: "Your workspace root points to the selected folder.",
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

  const confirmMigration = async () => {
    if (!pendingFolder || !accessToken) {
      console.error('[confirmMigration] early return', { hasPendingFolder: !!pendingFolder, hasAccessToken: !!accessToken })
      return
    }
    setSaving(true)
    try {
      const oldRoot = rootFolderId?.trim() || ""
      console.log('[confirmMigration] sending migrate-and-update-root', { connectionId, newRootFolderId: pendingFolder.id, oldRoot: rootFolderId?.trim() || '' })
      const res = await fetch("/api/connectors/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          action: "migrate-and-update-root",
          connectionId,
          newRootFolderId: pendingFolder.id,
          migrateFromRootFolderId: oldRoot,
          estimatedMinutes: estimate?.estimatedMinutes ?? 5,
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

  const dialogSubtitle =
    previewDrive === null
      ? "Choose where the new workspace folder should live."
      : isShared
        ? "Unique name, create the folder in Google Drive, then select it — we migrate top-level items from your current root in the background."
        : "Unique name, create the folder in My Drive, then select it — we migrate top-level items from your current root in the background."

  return (
    <div>
      <div>
        {rootFolderId ? (
          <TooltipProvider delayDuration={300}>
            {/* Single clean row */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Icon */}
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <Warehouse className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={2} />
              </div>

              {/* Folder name + location badge */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[0.8125rem] text-[#1b1b1d] truncate" title={displayName}>
                    {displayName}
                  </span>
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
                        className="inline-flex items-center gap-1.5 rounded-[2px] h-8 px-3 text-xs font-medium text-[#45474c] bg-white border border-[#e5e7eb] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors"
                        aria-label="Open in Google Drive"
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top">Open in Google Drive</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[2px] h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all",
                        (!accessToken || WORKSPACE_MIGRATE_DISABLED || migrationLocked) && "opacity-40 cursor-not-allowed",
                      )}
                      onClick={() => {
                        if (WORKSPACE_MIGRATE_DISABLED || migrationLocked) return
                        resetFlow()
                        setDialogOpen(true)
                      }}
                      disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED || migrationLocked}
                      aria-label="Migrate workspace folder"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
              </div>
            </div>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
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
                      "inline-flex items-center gap-1.5 rounded-[2px] h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all shrink-0",
                      (!accessToken || WORKSPACE_MIGRATE_DISABLED || migrationLocked) && "opacity-40 cursor-not-allowed",
                    )}
                    onClick={() => {
                      if (WORKSPACE_MIGRATE_DISABLED || migrationLocked) return
                      resetFlow()
                      setDialogOpen(true)
                    }}
                    disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED || migrationLocked}
                    aria-label="Choose workspace folder"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Choose folder
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
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        modal={wizardStep !== 2}
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true)
          } else if (wizardStep !== 2) {
            closeDialog()
          }
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2px]"
          onInteractOutside={(e) => {
            // Block outside-click close on step 3 (confirmation) and while picker result is pending.
            if (wizardStep === 3 || pendingFolder !== null) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[0.9375rem] font-bold text-[#1b1b1d]">Migrate workspace folder</DialogTitle>
            <DialogDescription className="text-left text-xs text-[#45474c]">{dialogSubtitle}</DialogDescription>
          </DialogHeader>

          {!previewDrive ? (
            <div className="space-y-3 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Step 1 · Location</p>
              <p className="text-sm text-gray-600">
                The next steps are the same for both: we suggest a unique folder name, you create it in Google Drive, then you select it here.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={startMyDriveFlow}
                  className="group flex flex-col items-start gap-3 border border-[#e5e7eb] bg-white p-5 text-left transition-all hover:border-[#1b1b1d] hover:shadow-lg active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-[#f9f9fb]">
                    <GoogleDriveIcon size={28} />
                  </div>
                  <div>
                    <p className="font-bold text-[#1b1b1d]">My Drive</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Personal storage tied to your Google account.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={startSharedDriveFlow}
                  className="group flex flex-col items-start gap-3 border border-[#e5e7eb] bg-white p-5 text-left transition-all hover:border-[#1b1b1d] hover:shadow-lg active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-[#f9f9fb]">
                    <GoogleSharedDriveIcon size={28} />
                  </div>
                  <div>
                    <p className="font-bold text-[#1b1b1d]">Shared Drive</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Team storage not tied to any individual account.</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {/* Step indicator */}
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">
                {isShared ? "Shared Drive" : "My Drive"} · Step {wizardStep} of {rootFolderId ? 3 : 2}
              </p>

              {/* Step 1 — copy folder name */}
              {wizardStep === 1 ? (
                <div className="space-y-3">
                  {/* Generated name box */}
                  <div className="flex items-center justify-between gap-2 rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb] px-3 py-2.5">
                    <code className="min-w-0 break-all text-xs font-mono text-[#1b1b1d]">{generatedFolderName}</code>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-[2px] border-[#e5e7eb]" onClick={() => void copyGeneratedFolderName()}>
                        {hasCopied ? (
                          <><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />Copied</>
                        ) : (
                          <><Copy className="mr-1 h-3 w-3" />Copy</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs rounded-[2px] border-[#e5e7eb]" onClick={regenerateFolderName}>
                        <RefreshCw className="mr-1 h-3 w-3" />New name
                      </Button>
                    </div>
                  </div>

                  {/* Estimate */}
                  {estimateLoading && (
                    <p className="text-xs text-[#45474c]">Estimating migration time…</p>
                  )}
                  {estimate && !estimateLoading && (
                    <p className="text-xs text-[#45474c]">
                      ~{estimate.estimatedMinutes} min maintenance window · {estimate.itemCount} items
                    </p>
                  )}

                  {/* Instructions */}
                  {isShared ? (
                    <GoogleDriveMock folderName={generatedFolderName} />
                  ) : (
                    <ol className="space-y-1.5 pl-4 list-decimal text-xs text-[#45474c]">
                      <li>
                        Open{" "}
                        <a href={myDriveOpenUrl} target="_blank" rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-0.5">
                          My Drive<ArrowUpRight className="h-3 w-3" />
                        </a>.
                      </li>
                      <li>Create a <span className="font-semibold text-[#1b1b1d]">New folder</span> and paste the name above.</li>
                      <li>Return here and click <span className="font-semibold text-[#1b1b1d]">Select Folder</span>.</li>
                    </ol>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-[#45474c] rounded-[2px]" onClick={resetFlow}>
                      Change location
                    </Button>
                    <Button variant="greenCta" size="sm" className="h-8 px-4 text-xs rounded-[2px]" onClick={() => setWizardStep(2)}>
                      Select Folder<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Step 2 — open picker */}
              {wizardStep === 2 ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#45474c] leading-relaxed">
                    Open the folder picker — search is pre-filled with your folder name. Select it and we'll start the migration.
                  </p>
                  {pickerQuery && (
                    <p className="text-xs text-[#45474c]">
                      Search: <span className="font-mono text-[#1b1b1d] bg-[#f9f9fb] border border-[#e5e7eb] rounded px-1 py-0.5">{pickerQuery}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm"
                      className="h-8 px-3 text-xs rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                      onClick={() => setWizardStep(1)}>
                      <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" />Back
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      className="h-8 px-3 text-xs rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                      onClick={() => resetFlow()}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Change
                    </Button>
                    <GooglePickerButton
                      mode="select-folder"
                      connectionId={connectionId}
                      driveType={isShared ? "Shared Drive" : "My Drive"}
                      query={pickerQuery}
                      onImport={(items) => void handleFolderPicked(items as { id: string; name: string }[])}
                    >
                      <Button type="button" variant="greenCta"
                        className="flex-1 h-8 text-xs font-headline font-bold tracking-widest uppercase rounded-[2px]"
                        disabled={saving}>
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                        Select Folder
                      </Button>
                    </GooglePickerButton>
                  </div>
                </div>
              ) : null}

              {/* Step 3 — confirm migration */}
              {wizardStep === 3 && pendingFolder ? (
                <div className="space-y-3">
                  {/* From → To */}
                  <div className="rounded-[2px] border border-[#e5e7eb] divide-y divide-[#e5e7eb] overflow-hidden">
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
                        <p className="text-xs font-semibold text-[#1b1b1d] truncate">{pendingFolder.name}</p>
                        <p className="text-[11px] text-[#45474c] mt-0.5 truncate">
                          {toBreadcrumb
                            ? toBreadcrumb.slice(0, -1).join(" › ") || toBreadcrumb[0]
                            : isShared ? "Shared Drive" : "My Drive"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Maintenance warning */}
                  <div className="rounded-[2px] border border-[#e5e7eb] bg-[#f9f9fb] px-3.5 py-3 flex gap-3">
                    <div className="w-0.5 shrink-0 rounded-full bg-[#45474c]/30 self-stretch" />
                    <div>
                      <p className="text-xs font-semibold text-[#1b1b1d]">
                        {estimate ? `~${estimate.estimatedMinutes} min maintenance window` : "Maintenance window required"}
                      </p>
                      <p className="text-[11px] text-[#45474c] mt-0.5 leading-relaxed">
                        {estimate && estimate.itemCount > 0
                          ? `${estimate.itemCount} items will be moved. `
                          : ""}
                        The workspace will be locked for all members during migration.
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm"
                      className="h-8 px-3 text-xs rounded-[2px] border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
                      onClick={() => setWizardStep(2)}>
                      <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" />Back
                    </Button>
                    <Button type="button" variant="greenCta"
                      className="flex-1 h-8 text-xs font-headline font-bold tracking-widest uppercase rounded-[2px]"
                      disabled={saving}
                      onClick={() => void confirmMigration()}>
                      {saving ? "Starting…" : "Start Migration"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

        </DialogContent>
      </Dialog>
    </div>
  )
}
