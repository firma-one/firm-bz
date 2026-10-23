"use client"

/**
 * UNUSED: Reserved for future use.
 *
 * This component contained the "Configure Workspace Home" flow that let users choose
 * "My Drive" vs "Shared Drive" and pick/create a root folder. Onboarding now creates
 * the default root folder (_Pockett_Workspace_) in My Drive automatically and skips
 * this step.
 *
 * May be reused later to allow moving the root folder to a Shared Drive via
 * Connectors settings in the Dashboard.
 */

import { Button } from "@/components/ui/button"
import { Tag } from "@/components/ui/tag"
import {
  CheckCircle2,
  ArrowRight,
  Building2,
  Settings,
  Lock,
  Briefcase,
  FolderOpen,
  Folder,
  Inbox,
  Copy,
  SquarePlus,
  Lock as LockIcon,
} from "lucide-react"
import { ClientIcon } from "@/components/ui/client-icon"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { GoogleSharedDriveIcon } from "@/components/ui/google-shared-drive-icon"
import { GooglePickerButton } from "@/components/google-drive/google-picker-button"

export interface ConfigureWorkspaceHomeLegacyProps {
  connectedEmail: string | null
  rootFolderId: string
  setRootFolderId: (id: string) => void
  previewDrive: "My Drive" | "Shared Drive" | null
  setPreviewDrive: (d: "My Drive" | "Shared Drive" | null) => void
  hasCopied: boolean
  setHasCopied: (v: boolean) => void
  connectionDetails: { connectionId?: string } | null
  hasOpenedPopup: boolean
  onOpenDrivePopup: () => void
  onFinalStepClick: () => void
  onRootFolderSelected: (ids: string[]) => void
  setStep: (step: number) => void
  copyToClipboard: (text: string) => void
}

export function ConfigureWorkspaceHomeLegacy({
  connectedEmail,
  rootFolderId,
  setRootFolderId,
  previewDrive,
  setPreviewDrive,
  hasCopied,
  setHasCopied,
  connectionDetails,
  hasOpenedPopup,
  onOpenDrivePopup,
  onFinalStepClick,
  onRootFolderSelected,
  setStep,
  copyToClipboard,
}: ConfigureWorkspaceHomeLegacyProps) {
  return (
    <div className="space-y-6 border-t border-line pt-6 text-left">
      {/* Connected account */}
      <div className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-subtle">
            <GoogleDriveIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-ui font-medium text-fg">Google Drive connected</p>
            {connectedEmail && <p className="truncate text-small text-fg-muted">{connectedEmail}</p>}
          </div>
        </div>
        <Tag color="green" dot>
          Verified
        </Tag>
      </div>

      {!rootFolderId ? (
        <div className="space-y-5">
          {!previewDrive ? (
            <div className="animate-in fade-in duration-200">
              <div className="mb-4">
                <p className="text-caption text-fg-subtle">Step 1 · Storage type</p>
                <h2 className="mt-1 text-h2 text-fg">Where should Pockett organize?</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setPreviewDrive("My Drive")}
                  className="group flex flex-col items-start gap-2.5 rounded-card border border-line bg-surface p-4 text-left transition-colors duration-100 hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-control bg-surface-subtle">
                    <GoogleDriveIcon size={20} />
                  </span>
                  <div>
                    <p className="text-ui font-medium text-fg">My Drive</p>
                    <p className="text-small text-fg-muted">Personal account</p>
                  </div>
                </button>
                <button
                  onClick={() => setPreviewDrive("Shared Drive")}
                  className="group flex flex-col items-start gap-2.5 rounded-card border border-line bg-surface p-4 text-left transition-colors duration-100 hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-control bg-surface-subtle">
                    <GoogleSharedDriveIcon size={20} />
                  </span>
                  <div>
                    <p className="text-ui font-medium text-fg">Shared Drive</p>
                    <p className="text-small text-fg-muted">Team workspace</p>
                    <p className="mt-1.5 text-caption text-fg-subtle">Recommended for business domains</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-200">
              <div className="rounded-card border border-line p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-small text-fg-muted">
                    <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                    <span className="truncate">{previewDrive}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPreviewDrive(null)
                      setHasCopied(false)
                    }}
                  >
                    Change storage
                    <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </Button>
                </div>

                {/* Workspace root folder */}
                <div className="ml-2 border-l border-line pl-5">
                  <div
                    className={`flex items-center justify-between gap-3 rounded-control border px-3 py-2 transition-colors duration-200 ${hasCopied ? "border-line bg-surface-subtle" : "border-action bg-action/5"}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Folder className={`h-4 w-4 shrink-0 ${hasCopied ? "text-fg-subtle" : "text-action"}`} strokeWidth={1.75} />
                      <span className={`truncate text-ui font-medium ${hasCopied ? "text-fg-muted" : "text-fg"}`}>Pockett Workspace</span>
                    </div>
                    {!hasCopied && (
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard("Pockett Workspace")} className="shrink-0">
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Copy name
                      </Button>
                    )}
                    {hasCopied && <CheckCircle2 className="h-4 w-4 shrink-0 text-action" strokeWidth={1.75} />}
                  </div>

                  {hasCopied && (
                    <div className="animate-in fade-in duration-300 mt-3 space-y-2">
                      <div className="flex items-center gap-2.5 text-ui text-fg">
                        <Building2 className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                        <span>Organization</span>
                      </div>
                      <div className="ml-2 space-y-2 border-l border-line pl-5">
                        <div className="flex items-center gap-2.5 text-ui text-fg-muted">
                          <ClientIcon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                          <span>Client</span>
                        </div>
                        <div className="ml-2 space-y-2 border-l border-line pl-5">
                          <div className="flex items-center gap-2.5 text-ui text-fg-muted">
                            <Briefcase className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                            <span>Project</span>
                          </div>
                          <div className="ml-2 space-y-2 border-l border-line pl-5">
                            <div className="flex items-start gap-2.5">
                              <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                              <div className="flex flex-col">
                                <span className="text-small text-fg-muted">General</span>
                                <span className="text-caption text-fg-subtle">Public documents</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                              <div className="flex flex-col">
                                <span className="text-small text-fg-muted">Confidential</span>
                                <span className="text-caption text-fg-subtle">Restricted sensitive documents</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                              <div className="flex flex-col">
                                <span className="text-small text-fg-muted">Staging</span>
                                <span className="text-caption text-fg-subtle">Document intake holding area</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {hasCopied && (
                <div className="animate-in fade-in duration-300 mt-6 space-y-3">
                  <Button
                    variant="greenCta"
                    onClick={onOpenDrivePopup}
                    className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <SquarePlus className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span className="flex flex-col items-start">
                        <span className="text-caption opacity-80">Step 3</span>
                        <span className="text-ui font-medium">
                          {previewDrive === "My Drive"
                            ? "Automagically create workspace"
                            : `Create workspace in ${previewDrive}`}
                        </span>
                        <span className="text-caption opacity-80">
                          {previewDrive === "My Drive"
                            ? "One-click setup • Avoids picker"
                            : "Requires manual step in Google Drive"}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  </Button>
                  <div
                    className={`transition-opacity duration-200 ${hasOpenedPopup ? "opacity-100" : "pointer-events-none opacity-40"}`}
                  >
                    {connectionDetails?.connectionId ? (
                      <GooglePickerButton
                        connectionId={connectionDetails.connectionId}
                        mode="select-folder"
                        query="Pockett Workspace"
                        driveType={previewDrive || "My Drive"}
                        onImport={onRootFolderSelected}
                      >
                        <button
                          onClick={onFinalStepClick}
                          className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left transition-colors duration-100 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-muted text-fg-muted">
                              {hasOpenedPopup ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> : <LockIcon className="h-4 w-4" strokeWidth={1.75} />}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="text-caption text-fg-subtle">Final step</span>
                              <span className="text-ui font-medium text-fg">Select created folder</span>
                              <span className="text-caption text-fg-subtle">
                                Teleports you straight to &quot;Pockett Workspace&quot;
                              </span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Tag>Picker</Tag>
                            <ArrowRight className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
                          </span>
                        </button>
                      </GooglePickerButton>
                    ) : (
                      <div className="flex items-center justify-center rounded-card border border-dashed border-line-strong p-6">
                        <span className="text-small text-fg-muted">Waking up secure picker…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-tag-green-bg text-tag-green-fg">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-ui font-medium text-fg">Root folder selected</p>
                <p className="text-small text-fg-muted">Ready to organize your workspace</p>
              </div>
            </div>
            <GooglePickerButton
              connectionId={connectionDetails?.connectionId || ""}
              mode="select-folder"
              onImport={onRootFolderSelected}
            >
              <Button variant="outline" size="sm">
                Change
              </Button>
            </GooglePickerButton>
          </div>
          <Button variant="greenCta" size="lg" onClick={() => setStep(2)} className="w-full">
            Continue to Demo firm setup
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      )}
    </div>
  )
}
