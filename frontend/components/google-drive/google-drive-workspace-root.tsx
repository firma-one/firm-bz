"use client"

import { useState, useCallback } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GooglePickerButton } from "@/components/google-drive/google-picker-button"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { GoogleSharedDriveIcon } from "@/components/ui/google-shared-drive-icon"
import { useToast } from "@/components/ui/toast"
import { generateUniqueWorkspaceFolderName } from "@/lib/generate-unique-workspace-folder-name"
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  FolderOpen,
  RefreshCw,
  Warehouse,
  Settings,
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
}

/** Picker search string from folder name (spaces instead of underscores). */
function pickerQueryFromFolderName(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").trim()
}

/** Shared chip style for workspace row icon actions (open in Drive, migrate). */
const workspaceRootIconBtnClass = cn(
  "inline-flex shrink-0 rounded-md p-1.5",
  "bg-gray-100 text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.08)]",
  "ring-1 ring-black/[0.04]",
  "transition-all hover:bg-gray-200/95 hover:text-gray-950",
  "hover:shadow-[0_2px_4px_rgba(15,23,42,0.1),0_2px_8px_rgba(15,23,42,0.12)]",
  "disabled:pointer-events-none disabled:opacity-50",
)

const WORKSPACE_MIGRATE_DISABLED = false

function ExternalDriveLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </a>
  )
}

export function GoogleDriveWorkspaceRoot({
  connectionId,
  accessToken,
  rootFolderId,
  rootFolderName,
  workspaceRootLocation = null,
  workspaceRootSharedDriveName = null,
  onUpdated,
}: GoogleDriveWorkspaceRootProps) {
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewDrive, setPreviewDrive] = useState<"My Drive" | "Shared Drive" | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [generatedFolderName, setGeneratedFolderName] = useState("")
  const [confirmedFolderCreated, setConfirmedFolderCreated] = useState(false)

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
  const pickerQuery = generatedFolderName ? pickerQueryFromFolderName(generatedFolderName) : ""
  const myDriveOpenUrl = "https://drive.google.com/drive/my-drive"
  const sharedDrivesOpenUrl = "https://drive.google.com/drive/shared-drives"

  const resetFlow = useCallback(() => {
    setPreviewDrive(null)
    setHasCopied(false)
    setWizardStep(1)
    setGeneratedFolderName("")
    setConfirmedFolderCreated(false)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    resetFlow()
  }, [resetFlow])

  const startMyDriveFlow = () => {
    setPreviewDrive("My Drive")
    setGeneratedFolderName(generateUniqueWorkspaceFolderName("my-drive"))
    setWizardStep(1)
    setConfirmedFolderCreated(false)
    setHasCopied(false)
  }

  const startSharedDriveFlow = () => {
    setPreviewDrive("Shared Drive")
    setGeneratedFolderName(generateUniqueWorkspaceFolderName("shared-drive"))
    setWizardStep(1)
    setConfirmedFolderCreated(false)
    setHasCopied(false)
  }

  const regenerateFolderName = () => {
    if (!previewDrive) return
    setGeneratedFolderName(
      generateUniqueWorkspaceFolderName(isShared ? "shared-drive" : "my-drive"),
    )
    setHasCopied(false)
    setConfirmedFolderCreated(false)
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

  const handleFolderPicked = async (ids: string[]) => {
    const newId = ids[0]
    if (!newId || !accessToken) {
      addToast({
        title: "Not signed in",
        message: "Sign in again, then retry.",
        type: "error",
      })
      return
    }
    setSaving(true)
    try {
      const oldRoot = rootFolderId?.trim() || ""
      if (oldRoot && oldRoot !== newId) {
        const res = await fetch("/api/connectors/google-drive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: "migrate-and-update-root",
            connectionId,
            newRootFolderId: newId,
            migrateFromRootFolderId: oldRoot,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          errorDetail?: string
          moved?: number
          failures?: { id: string; error: string }[]
        }
        if (!res.ok) {
          const detail = typeof data.errorDetail === "string" ? data.errorDetail.trim() : ""
          const base = (data.error || "Migration failed").trim()
          const failuresBlob = JSON.stringify(data.failures || [])
          const combinedForHints = `${detail}\n${failuresBlob}`

          // Google Drive API: folders cannot be moved from My Drive into a shared drive (not a scope issue).
          if (/moving folders into shared drives is not supported/i.test(combinedForHints)) {
            throw new Error(
              `${base} Google Drive does not support moving folders from My Drive into a shared drive. Your connector was not updated. Try migrating to a workspace folder in My Drive, or copy/move folders inside drive.google.com first, then pick the shared-drive folder if it already contains the data you need.`,
            )
          }

          const msg = detail ? `${base} — ${detail}` : base
          const suggestReconnect =
            res.status === 422 &&
            /403|Insufficient|insufficientAuthenticationScopes|Permission|scope/i.test(combinedForHints)
          throw new Error(
            suggestReconnect
              ? `${msg} Disconnect Google Drive on this page and connect again so the app can move your files.`
              : msg,
          )
        }
        addToast({
          title: "Workspace migrated",
          message: `Moved ${data.moved ?? 0} top-level item(s) into the new folder and updated your workspace root.`,
          type: "success",
        })
      } else {
        await updateRootOnly(newId)
        addToast({
          title: "Workspace folder updated",
          message: "Your workspace root points to the selected folder.",
          type: "success",
        })
      }
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({
        title: "Could not complete",
        message: e instanceof Error ? e.message : "Try again or check Google Drive permissions.",
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
        ? "Unique name, create the folder in Google Drive, then select it—we migrate top-level items from your current root when needed."
        : "Unique name, create the folder in My Drive, then select it—we migrate top-level items from your current root when needed."

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex gap-4 p-5 sm:gap-5 sm:p-6">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-slate-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          aria-hidden
        >
          <FolderOpen className="h-6 w-6 text-gray-600" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Workspace root in Google Drive
          </p>
          {rootFolderId ? (
            <TooltipProvider delayDuration={300}>
              <div className="flex flex-wrap items-start gap-x-2 gap-y-2 pt-0.5 text-base leading-snug">
                {breadcrumbRootLabel ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 self-center text-gray-600">
                      {workspaceRootLocation === "SHARED_DRIVE" ? (
                        <GoogleSharedDriveIcon size={16} className="shrink-0 opacity-90" aria-hidden />
                      ) : workspaceRootLocation === "MY_DRIVE" ? (
                        <GoogleDriveIcon size={16} className="shrink-0 opacity-90" aria-hidden />
                      ) : (
                        <FolderOpen className="h-4 w-4 shrink-0 text-gray-500" strokeWidth={2} aria-hidden />
                      )}
                      <span className="font-medium">{breadcrumbRootLabel}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 self-center text-gray-400" aria-hidden />
                  </>
                ) : null}
                <div className="min-w-0 max-w-full flex-1 rounded-lg border border-gray-200/90 bg-gradient-to-b from-gray-50/95 to-gray-50/70 px-3 py-2.5 shadow-sm">
                  <div className="flex items-stretch gap-2 sm:gap-2.5">
                    <div
                      className="flex w-8 shrink-0 items-center justify-center sm:w-9"
                      aria-hidden
                    >
                      <Warehouse className="h-6 w-6 text-violet-600" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
                        <span
                          className="min-w-0 font-semibold tracking-tight text-gray-900 break-words"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        <div className="flex justify-end">
                          {driveUrl ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={driveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={workspaceRootIconBtnClass}
                                  aria-label="Open in Google Drive"
                                >
                                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent side="top">Open in Google Drive</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 border-t border-gray-200/70 pt-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="block min-w-0 cursor-help font-mono text-[11px] leading-snug text-gray-600 underline decoration-dotted decoration-gray-400/80 underline-offset-2 break-all"
                              tabIndex={0}
                            >
                              {rootFolderId}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-left leading-snug">
                            {
                              "This is Google Drive's unique ID for this folder (used in Drive URLs and the API)."
                            }
                          </TooltipContent>
                        </Tooltip>
                        <div className="flex justify-end self-start">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gray-400/80">
                                <button
                                  type="button"
                                  className={cn(
                                    workspaceRootIconBtnClass,
                                    (!accessToken || WORKSPACE_MIGRATE_DISABLED) && "cursor-not-allowed",
                                  )}
                                  onClick={() => {
                                    if (WORKSPACE_MIGRATE_DISABLED) return
                                    resetFlow()
                                    setDialogOpen(true)
                                  }}
                                  disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED}
                                  aria-label="Migrate workspace folder"
                                >
                                  <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
                                </button>
                              </span>
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
                    </div>
                  </div>
                </div>
              </div>
            </TooltipProvider>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <p className="min-w-0 flex-1 text-sm text-gray-500">
                  No workspace folder selected yet. Click the button to choose a folder in My Drive or a Shared Drive.
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gray-400/80">
                      <button
                        type="button"
                        className={cn(
                          workspaceRootIconBtnClass,
                          (!accessToken || WORKSPACE_MIGRATE_DISABLED) && "cursor-not-allowed",
                        )}
                        onClick={() => {
                          if (WORKSPACE_MIGRATE_DISABLED) return
                          resetFlow()
                          setDialogOpen(true)
                        }}
                        disabled={!accessToken || WORKSPACE_MIGRATE_DISABLED}
                        aria-label="Migrate workspace folder"
                      >
                        <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </span>
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
            <p className="text-xs text-amber-800">Sign in to migrate your workspace folder.</p>
          ) : null}
        </div>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Migrate workspace folder</DialogTitle>
            <DialogDescription className="text-left text-gray-600">{dialogSubtitle}</DialogDescription>
          </DialogHeader>

          {!previewDrive ? (
            <div className="space-y-3 py-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 1 · Location</p>
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {isShared ? "Shared drive" : "My Drive"} · Step {wizardStep} of 3
                </p>
                <button
                  type="button"
                  onClick={() => resetFlow()}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-900"
                >
                  Change location
                  <Settings className="h-3 w-3" />
                </button>
              </div>

              {wizardStep === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    {isShared ? (
                      <>
                        We generate a <span className="font-medium text-gray-900">unique</span> folder name so the picker search does not clash with another folder (for example the default workspace folder in My Drive). Copy it before you create the folder.
                      </>
                    ) : (
                      <>
                        We generate a <span className="font-medium text-gray-900">unique</span> folder name so it does not match your existing onboarding workspace folder. Copy it before you create the folder in My Drive.
                      </>
                    )}
                  </p>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <code className="break-all text-xs font-mono text-gray-900">{generatedFolderName}</code>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-gray-300 bg-white"
                        onClick={() => void copyGeneratedFolderName()}
                      >
                        {hasCopied ? (
                          <>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy name
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-gray-300 bg-white"
                        onClick={regenerateFolderName}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        New name
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-gray-900 text-white hover:bg-gray-800"
                    onClick={() => setWizardStep(2)}
                  >
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="space-y-4">
                  <ol className="list-decimal space-y-2 pl-4 text-sm text-gray-700">
                    <li>
                      Open{" "}
                      {isShared ? (
                        <ExternalDriveLink href={sharedDrivesOpenUrl}>Google Drive &gt; Shared drives</ExternalDriveLink>
                      ) : (
                        <ExternalDriveLink href={myDriveOpenUrl}>My Drive</ExternalDriveLink>
                      )}
                      {driveUrl ? (
                        <>
                          {" "}
                          <span className="text-gray-600">
                            (current workspace:{" "}
                            <ExternalDriveLink href={driveUrl}>open folder</ExternalDriveLink>)
                          </span>
                        </>
                      ) : null}
                      .
                    </li>
                    {isShared ? <li>Open the shared drive where the workspace should live.</li> : null}
                    <li>
                      Create a <span className="font-medium">new folder</span> and paste the exact name from step 1.
                    </li>
                    <li>Return here, confirm below, then open the picker to select that folder.</li>
                  </ol>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    <Checkbox
                      checked={confirmedFolderCreated}
                      onCheckedChange={(v) => setConfirmedFolderCreated(v === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      {isShared
                        ? "I created the folder with this exact name in a shared drive."
                        : "I created the folder with this exact name in My Drive."}
                    </span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="ghost" onClick={() => setWizardStep(1)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="bg-gray-900 text-white hover:bg-gray-800"
                      disabled={!confirmedFolderCreated}
                      onClick={() => setWizardStep(3)}
                    >
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Open the folder picker. Search is pre-filled with your unique name. After you select the folder, we move{" "}
                    <span className="font-medium">top-level items</span> from your current workspace root into it when you are replacing an existing root; otherwise we only update the root pointer.
                  </p>
                  <p className="text-xs text-amber-900/90">
                    If anything cannot be moved (permissions), we do not change the app root—your previous folder stays in use.
                  </p>
                  {pickerQuery ? (
                    <p className="text-xs text-gray-500">
                      Picker search: <span className="font-mono text-gray-800">&quot;{pickerQuery}&quot;</span>
                    </p>
                  ) : null}
                  <GooglePickerButton
                    mode="select-folder"
                    connectionId={connectionId}
                    driveType={isShared ? "Shared Drive" : "My Drive"}
                    query={pickerQuery}
                    onImport={(ids) => void handleFolderPicked(ids as string[])}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-gray-300 py-5 text-base font-medium"
                      disabled={saving}
                    >
                      Open Google folder picker
                    </Button>
                  </GooglePickerButton>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setWizardStep(2)}>
                    Back
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => closeDialog()}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
