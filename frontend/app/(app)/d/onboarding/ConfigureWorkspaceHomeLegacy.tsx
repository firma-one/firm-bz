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
import { Label } from "@/components/ui/label"
import {
  CheckCircle2,
  ArrowRight,
  Building2,
  Settings,
  Lock,
  Users,
  Briefcase,
  FolderOpen,
  Folder,
  Inbox,
  Copy,
  SquarePlus,
  Lock as LockIcon,
} from "lucide-react"
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
    <div className="space-y-4 text-left border-t border-slate-100 pt-4">
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
            <GoogleDriveIcon size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Google Drive Connected</p>
            {connectedEmail && <p className="text-xs text-slate-500">{connectedEmail}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100">
          <CheckCircle2 className="h-3 w-3" />
          Verified
        </div>
      </div>

      {!rootFolderId ? (
        <div className="space-y-5">
          {!previewDrive ? (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="text-center mb-4">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">
                  1. Select Storage Type
                </Label>
                <h2 className="text-xl font-bold text-slate-900">Where should Pockett organize?</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPreviewDrive("My Drive")}
                  className="group relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-100 bg-white hover:border-slate-900 hover:shadow-xl transition-all duration-300 active:scale-[0.98]"
                >
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 text-slate-400 group-hover:text-slate-900 transition-all duration-300">
                    <GoogleDriveIcon size={28} />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-900">My Drive</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Personal account</p>
                  </div>
                </button>
                <button
                  onClick={() => setPreviewDrive("Shared Drive")}
                  className="group relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-100 bg-white hover:border-slate-900 hover:shadow-xl transition-all duration-300 active:scale-[0.98]"
                >
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 text-slate-400 group-hover:text-slate-900 transition-all duration-300">
                    <GoogleSharedDriveIcon size={28} />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-900">Shared Drive</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Team workspace</p>
                    <p className="text-[11px] text-slate-500 font-bold mt-2 leading-tight max-w-[140px]">
                      Recommended for business domains
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                <button
                  onClick={() => {
                    setPreviewDrive(null)
                    setHasCopied(false)
                  }}
                  className="absolute top-6 right-8 text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest flex items-center gap-1 transition-colors"
                >
                  Change Storage
                  <Settings className="h-3 w-3" />
                </button>
                <div className="space-y-0 font-mono text-sm">
                  <div className="flex items-center gap-3 py-2 text-slate-400">
                    <FolderOpen className="h-5 w-5 opacity-40" />
                    <span className="font-bold uppercase tracking-tight">{previewDrive}</span>
                  </div>
                  <div className="relative pl-6">
                    <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                    <div className="absolute left-2 top-1/2 w-4 h-px bg-slate-200" />
                    <div
                      className={`mt-2 flex items-center justify-between p-4 rounded-2xl transition-all duration-500 ${hasCopied ? "bg-slate-50 border border-slate-100 opacity-60" : "bg-slate-900 text-white shadow-xl ring-8 ring-slate-900/5"}`}
                    >
                      <div className="flex items-center gap-3">
                        <Folder className={`h-5 w-5 ${hasCopied ? "text-slate-400" : "text-white"}`} />
                        <span className="font-black italic tracking-tight">Pockett Workspace</span>
                      </div>
                      {!hasCopied && (
                        <button
                          onClick={() => copyToClipboard("Pockett Workspace")}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl font-bold text-[10px] uppercase tracking-wide hover:bg-slate-100 active:scale-95 transition-all shadow-sm"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Name
                        </button>
                      )}
                      {hasCopied && <CheckCircle2 className="h-5 w-5 text-slate-900" />}
                    </div>
                  </div>
                  {hasCopied && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-1000">
                      <div className="pl-6 relative">
                        <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                        <div className="relative pl-6 py-3 mt-2">
                          <div className="absolute left-0 top-1/2 w-6 h-px bg-slate-200" />
                          <div className="flex items-center gap-3 text-slate-600">
                            <Building2 className="h-4 w-4" />
                            <span className="font-bold underline decoration-slate-200 underline-offset-4 tracking-tight">
                              Organization
                            </span>
                          </div>
                          <div className="relative pl-6 mt-4">
                            <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
                            <div className="absolute left-0 top-4 w-4 h-px bg-slate-200" />
                            <div className="flex items-center gap-3 text-slate-500">
                              <Users className="h-4 w-4" />
                              <span className="font-bold tracking-tight">Client</span>
                            </div>
                            <div className="relative pl-6 mt-4">
                              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
                              <div className="absolute left-0 top-4 w-4 h-px bg-slate-200" />
                              <div className="flex items-center gap-3 text-slate-400">
                                <Briefcase className="h-4 w-4" />
                                <span className="font-bold tracking-tight">Project</span>
                              </div>
                              <div className="relative pl-6 mt-4 space-y-4">
                                <div className="absolute left-0 top-0 bottom-8 w-px bg-slate-200" />
                                <div className="relative flex items-center gap-3 text-slate-300">
                                  <div className="absolute left-[-24px] top-1/2 w-6 h-px bg-slate-100" />
                                  <Folder className="h-3.5 w-3.5" />
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold">General</span>
                                    <span className="text-[9px] text-slate-400 italic font-medium -mt-1">
                                      (Public Documents)
                                    </span>
                                  </div>
                                </div>
                                <div className="relative flex items-center gap-3 text-slate-300">
                                  <div className="absolute left-[-24px] top-1/2 w-6 h-px bg-slate-100" />
                                  <LockIcon className="h-3.5 w-3.5" />
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold">Confidential</span>
                                    <span className="text-[9px] text-slate-400 italic font-medium -mt-1">
                                      (Restricted Sensitive Documents)
                                    </span>
                                  </div>
                                </div>
                                <div className="relative flex items-center gap-3 text-slate-300">
                                  <div className="absolute left-[-24px] top-1/2 w-6 h-px bg-slate-100" />
                                  <Inbox className="h-3.5 w-3.5" />
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold">Staging</span>
                                    <span className="text-[9px] text-slate-400 italic font-medium -mt-1">
                                      (Document Intake Holding Area)
                                    </span>
                                  </div>
                                </div>
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
                <div className="animate-in fade-in slide-in-from-top-6 duration-1000 space-y-4 mt-12">
                  <Button
                    variant="blackCta"
                    onClick={onOpenDrivePopup}
                    className="w-full p-6 rounded-2xl flex items-center justify-between group transition-all duration-300 active:scale-[0.98] shadow-xl shadow-slate-200"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <SquarePlus className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="font-black tracking-tight uppercase text-xs opacity-60">Step 3</p>
                        <p className="text-lg font-black tracking-tight">
                          {previewDrive === "My Drive"
                            ? "Automagically Create Workspace"
                            : `Create Workspace in ${previewDrive}`}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                          {previewDrive === "My Drive"
                            ? "One-click setup • Avoids picker"
                            : "Requires manual step in Google Drive"}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <div
                    className={`transition-all duration-500 ${hasOpenedPopup ? "opacity-100 scale-100" : "opacity-30 scale-[0.98] pointer-events-none"}`}
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
                          className="w-full bg-white border-2 border-slate-900 text-slate-900 p-6 rounded-2xl flex items-center justify-between group transition-all hover:bg-slate-50 active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                              {hasOpenedPopup ? <CheckCircle2 className="h-6 w-6" /> : <LockIcon className="h-6 w-6" />}
                            </div>
                            <div className="text-left">
                              <p className="font-black tracking-tight uppercase text-[10px] opacity-60">Final step</p>
                              <p className="text-lg font-black tracking-tight">Select Created Folder</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                Teleports you straight to &quot;Pockett Workspace&quot;
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                              PICKER
                            </span>
                            <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </button>
                      </GooglePickerButton>
                    ) : (
                      <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Waking up secure picker...
                        </span>
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
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Root Folder Selected</p>
                <p className="text-xs text-slate-500">Ready to organize your workspace</p>
              </div>
            </div>
            <GooglePickerButton
              connectionId={connectionDetails?.connectionId || ""}
              mode="select-folder"
              onImport={onRootFolderSelected}
            >
              <Button variant="ghost" size="sm" className="text-xs text-slate-600 hover:bg-slate-100 font-bold border border-slate-200">
                Change
              </Button>
            </GooglePickerButton>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => setStep(2)}
              className="w-full py-6 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98] cta-hover-arrow flex items-center justify-center gap-2"
            >
              Continue to Demo Firm Setup
              <ArrowRight className="h-5 w-5 animate-arrow" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
