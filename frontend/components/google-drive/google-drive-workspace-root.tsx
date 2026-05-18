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
  rootFolderId?: string | null
  rootFolderName?: string | null
  /** Persisted workspace root location; null until backfilled from Drive API. */
  workspaceRootLocation?: "MY_DRIVE" | "SHARED_DRIVE" | null
  workspaceRootSharedDriveName?: string | null
  onUpdated: () => void | Promise<void>
  onMigrationStarted?: () => void
}


const WORKSPACE_MIGRATE_DISABLED = false

export function GoogleDriveWorkspaceRoot({
  connectionId,
  accessToken,
  rootFolderId,
  rootFolderName,
  workspaceRootLocation = null,
  workspaceRootSharedDriveName = null,
  onUpdated,
  onMigrationStarted,
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

  const displayName = rootFolderName?.trim() || "Workspace folder"
  const driveUrl = rootFolderId
    ? `https://drive.google.com/drive/folders/${rootFolderId}`
    : null

  /** First segment of workspace breadcrumb (e.g. My Drive or shared drive name). */
  const breadcrumbRootLabel =
    workspaceRootLocation === "MY_DRIVE"
      ? "My Drive"
      : workspaceRootLocation === "SHARED_DRIVE"
        ? workspaceRootSharedDriveName?.trim()
          ? `Shared drive · ${workspaceRootSharedDriveName.trim()}`
          : "Shared drive"
        : rootFolderId
          ? "Location unknown"
          : null

  const isShared = previewDrive === "Shared Drive"
  const pickerQuery = generatedFolderName ?? ""
  const myDriveOpenUrl = "https://drive.google.com/drive/my-drive"
  const sharedDrivesOpenUrl = "https://drive.google.com/drive/shared-drives"

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

  const resetFlow = useCallback(() => {
    setPreviewDrive(null)
    setPendingFolder(null)
    setHasCopied(false)
    setWizardStep(1)
    setGeneratedFolderName("")
    setEstimate(null)
    setEstimateLoading(false)
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
    if (oldRoot && oldRoot !== item.id) {
      // Go to confirmation step
      setPendingFolder(item)
      setWizardStep(3)
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
    if (!pendingFolder || !accessToken) return
    setSaving(true)
    try {
      const oldRoot = rootFolderId?.trim() || ""
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
                      {workspaceRootLocation === "SHARED_DRIVE" ? (
                        <GoogleSharedDriveIcon size={11} className="shrink-0 opacity-80" aria-hidden />
                      ) : workspaceRootLocation === "MY_DRIVE" ? (
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
                        "inline-flex items-center gap-1.5 rounded-[2px] h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-[#069668] hover:bg-[#069668] hover:brightness-105 active:scale-95 transition-all shadow-sm",
                        (!accessToken || WORKSPACE_MIGRATE_DISABLED) && "opacity-40 cursor-not-allowed",
                      )}
                      onClick={() => {
                        if (WORKSPACE_MIGRATE_DISABLED) return
                        resetFlow()
                        setDialogOpen(true)
                      }}
                      disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED}
                      aria-label="Change workspace folder"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Change
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-xs text-left leading-snug">
                    {WORKSPACE_MIGRATE_DISABLED ? (
                      "Workspace migration is temporarily disabled."
                    ) : (
                      <>
                        Guided steps: create a uniquely named folder in Google Drive, then select it. If you
                        already have a workspace root, top-level items are moved into the new folder;
                        otherwise we only point the app at the folder you pick.
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
                      "inline-flex items-center gap-1.5 rounded-[2px] h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-[#069668] hover:bg-[#069668] hover:brightness-105 active:scale-95 transition-all shadow-sm shrink-0",
                      (!accessToken || WORKSPACE_MIGRATE_DISABLED) && "opacity-40 cursor-not-allowed",
                    )}
                    onClick={() => {
                      if (WORKSPACE_MIGRATE_DISABLED) return
                      resetFlow()
                      setDialogOpen(true)
                    }}
                    disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED}
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
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true)
          } else {
            closeDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Migrate workspace folder</DialogTitle>
            <DialogDescription className="text-left text-gray-600">{dialogSubtitle}</DialogDescription>
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
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-100 bg-white p-4 text-center transition-all hover:border-gray-900 hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50">
                    <GoogleDriveIcon size={28} />
                  </div>
                  <span className="font-semibold text-gray-900">My Drive</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Personal</span>
                </button>
                <button
                  type="button"
                  onClick={startSharedDriveFlow}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-100 bg-white p-4 text-center transition-all hover:border-gray-900 hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50">
                    <GoogleSharedDriveIcon size={28} />
                  </div>
                  <span className="font-semibold text-gray-900">Shared Drive</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Team</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">
                  {isShared ? "Shared drive" : "My Drive"} · Step {wizardStep} of {rootFolderId ? 3 : 2}
                </p>
              </div>

              {wizardStep === 1 && isShared ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <code className="min-w-0 break-all text-xs font-mono text-gray-900">{generatedFolderName}</code>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copyGeneratedFolderName()}>
                        {hasCopied ? (
                          <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />Copied</>
                        ) : (
                          <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={regenerateFolderName}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />New name
                      </Button>
                    </div>
                  </div>
                  {estimateLoading && <p className="text-xs text-gray-400">Estimating migration time…</p>}
                  {estimate && !estimateLoading && (
                    <p className="text-xs text-gray-500">~{estimate.estimatedMinutes} min maintenance window · {estimate.itemCount} top-level items</p>
                  )}
                  <GoogleDriveMock folderName={generatedFolderName} />
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={resetFlow}>Change location</Button>
                    <Button className="bg-[#069668] text-white hover:bg-[#069668] hover:brightness-105 rounded-[2px]" onClick={() => setWizardStep(2)}>
                      Select Folder<ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 1 && !isShared ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <code className="min-w-0 break-all text-xs font-mono text-gray-900">{generatedFolderName}</code>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copyGeneratedFolderName()}>
                        {hasCopied ? (
                          <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />Copied</>
                        ) : (
                          <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={regenerateFolderName}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />New name
                      </Button>
                    </div>
                  </div>
                  {estimateLoading && <p className="text-xs text-gray-400">Estimating migration time…</p>}
                  {estimate && !estimateLoading && (
                    <p className="text-xs text-gray-500">~{estimate.estimatedMinutes} min maintenance window · {estimate.itemCount} top-level items</p>
                  )}
                  <ol className="list-decimal space-y-2 pl-4 text-sm text-gray-700">
                    <li>
                      Open{" "}
                      <a href={myDriveOpenUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1">
                        My Drive<ArrowUpRight className="h-3.5 w-3.5" />
                      </a>.
                    </li>
                    <li>Create a <span className="font-medium">New folder</span> and paste the name above.</li>
                    <li>Return here and click <span className="font-medium">Select Folder</span>.</li>
                  </ol>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={resetFlow}>Change location</Button>
                    <Button className="bg-[#069668] text-white hover:bg-[#069668] hover:brightness-105 rounded-[2px]" onClick={() => setWizardStep(2)}>
                      Select Folder<ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Open the folder picker. Search is pre-filled with your unique name. After you select the folder, we move{" "}
                    <span className="font-medium">top-level items</span> from your current workspace root into it in the background.
                  </p>
                  {pickerQuery ? (
                    <p className="text-xs text-gray-500">
                      Picker search: <span className="font-mono text-gray-800">&quot;{pickerQuery}&quot;</span>
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-11 px-4 text-sm border-gray-200 text-gray-600 hover:bg-gray-50"
                      onClick={() => setWizardStep(1)}
                    >
                      <ArrowRight className="h-4 w-4 rotate-180 mr-1.5" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-11 px-4 text-sm border-gray-200 text-gray-600 hover:bg-gray-50"
                      onClick={() => resetFlow()}
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                      Change location
                    </Button>
                    <GooglePickerButton
                      mode="select-folder"
                      connectionId={connectionId}
                      driveType={isShared ? "Shared Drive" : "My Drive"}
                      query={pickerQuery}
                      onImport={(items) => void handleFolderPicked(items as { id: string; name: string }[])}
                    >
                      <Button
                        type="button"
                        className="flex-1 h-11 bg-[#069668] text-white hover:bg-[#069668] hover:brightness-105 text-sm font-medium rounded-[2px]"
                        disabled={saving}
                      >
                        <FolderOpen className="h-4 w-4 mr-2 shrink-0" />
                        Google Folder Picker
                      </Button>
                    </GooglePickerButton>
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 && pendingFolder ? (
                <div className="space-y-5">
                  {/* Source → Destination */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200 overflow-hidden">
                    <div className="px-4 py-3 flex items-start gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 w-16 shrink-0 pt-0.5">From</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{rootFolderName || "Current workspace"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{breadcrumbRootLabel || (workspaceRootLocation === "MY_DRIVE" ? "My Drive" : workspaceRootLocation === "SHARED_DRIVE" ? "Shared Drive" : "Google Drive")}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-start gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 w-16 shrink-0 pt-0.5">To</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{pendingFolder.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{isShared ? "Shared Drive" : "My Drive"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Estimated time — prominent */}
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-900">
                        {estimate ? `~${estimate.estimatedMinutes} min maintenance window` : "Maintenance window required"}
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        {estimate
                          ? `${estimate.itemCount} top-level items will be moved. The workspace will be locked for all members during migration.`
                          : "The workspace will be locked for all members during migration."}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-11 px-4 text-sm border-gray-200 text-gray-600 hover:bg-gray-50"
                      onClick={() => setWizardStep(2)}
                    >
                      <ArrowRight className="h-4 w-4 rotate-180 mr-1.5" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 h-11 bg-[#069668] text-white hover:bg-[#069668] hover:brightness-105 text-sm font-medium rounded-[2px]"
                      disabled={saving}
                      onClick={() => void confirmMigration()}
                    >
                      {saving ? "Starting…" : "Start migration"}
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
