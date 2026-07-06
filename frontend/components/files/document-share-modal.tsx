'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Users, UserCircle, FileDown, Droplets, Info, Pencil, Eye, FileText } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { useToast } from '@/components/ui/toast'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { parseSettingsFromDb } from '@/lib/sharing-settings'
import { useProjectPersonaLabels } from '@/lib/hooks/use-project-persona-labels'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface DocumentShareSettings {
  externalCollaborator: boolean
  guest: boolean
  guestOptions: {
    sharePdfOnly: boolean
    allowDownload: boolean
    addWatermark: boolean
    publish: boolean
  }
  ecOptions: {
    allowDownload: boolean
  }
}

const defaultSettings: DocumentShareSettings = {
  externalCollaborator: false,
  guest: false,
  guestOptions: {
    sharePdfOnly: false,
    allowDownload: false,
    addWatermark: false,
    publish: false,
  },
  ecOptions: {
    allowDownload: false,
  },
}

function parseSettings(settings: unknown): DocumentShareSettings {
  if (!settings || typeof settings !== 'object') return defaultSettings
  const parsed = parseSettingsFromDb(settings)
  const share = parsed.share
  if (!share) return defaultSettings
  return {
    externalCollaborator: share.externalCollaborator?.enabled === true,
    guest: share.guest?.enabled === true,
    guestOptions: {
      sharePdfOnly: share.guest?.options?.sharePdfOnly === true,
      allowDownload: share.guest?.options?.allowDownload === true,
      addWatermark: share.guest?.options?.addWatermark === true,
      publish: share.guest?.options?.publish === true,
    },
    ecOptions: {
      allowDownload: share.externalCollaborator?.options?.allowDownload === true,
    },
  }
}

export interface DocumentShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: { id: string; name: string; mimeType?: string }
  projectId: string
  onSaved?: () => void
}

export function DocumentShareModal({
  open,
  onOpenChange,
  document: doc,
  projectId,
  onSaved,
}: DocumentShareModalProps) {
  const { addToast } = useToast()
  const orgSandbox = useOrgSandbox()
  const isSandboxFirm = Boolean(orgSandbox?.sandboxOnly)
  const { projExtCollaborator, projViewer } = useProjectPersonaLabels()
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<DocumentShareSettings>(defaultSettings)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [initialSettings, setInitialSettings] = useState<DocumentShareSettings>(defaultSettings)

  // When modal opens or document changes: reset to defaults, then load existing share settings
  useEffect(() => {
    if (!open || !projectId) return
    setSettings(defaultSettings)
    setInitialLoadDone(false)
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/documents/${encodeURIComponent(doc.id)}/sharing`
        )
        if (cancelled) return
        if (!res.ok) {
          if (!cancelled) {
            setInitialSettings(defaultSettings)
            setInitialLoadDone(true)
          }
          return
        }
        const data = await res.json()
        const hasExistingShare = data?.sharing != null
        if (!cancelled) {
          if (hasExistingShare) {
            const parsed = parseSettings(data.sharing.settings ?? {})
            setSettings(parsed)
            setInitialSettings(parsed)
          } else {
            setSettings(defaultSettings)
            setInitialSettings(defaultSettings)
          }
        }
      } catch {
        if (!cancelled) {
          setSettings(defaultSettings)
          setInitialSettings(defaultSettings)
        }
      } finally {
        if (!cancelled) setInitialLoadDone(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, projectId, doc.id])

  useEffect(() => {
    if (!open) setInitialLoadDone(false)
  }, [open])

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(initialSettings)

  const handleSave = async () => {
    if (isSandboxFirm) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${encodeURIComponent(doc.id)}/sharing`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalCollaborator: settings.externalCollaborator,
            guest: settings.guest,
            guestOptions: settings.guestOptions,
            ecOptions: settings.ecOptions,
            title: doc.name,
            mimeType: doc.mimeType || 'application/octet-stream',
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Failed to save')
      }
      addToast({ type: 'success', title: 'Saved', message: 'Share settings updated.' })
      onOpenChange(false)
      onSaved?.()
    } catch (e: unknown) {
      addToast({
        type: 'error',
        title: 'Could not save',
        message: e instanceof Error ? e.message : 'Something went wrong.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] border-[#e5e7eb] p-0 gap-0 rounded bg-[#f9f9fb]">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-[#e5e7eb] bg-white">
          <DialogTitle className="text-[11px] font-headline font-bold tracking-widest uppercase text-[#1b1b1d] leading-tight">Share document</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 truncate text-xs text-[#45474c] mt-0.5" title={doc.name}>
            <DocumentIcon mimeType={doc.mimeType} size={14} className="shrink-0" />
            {doc.name}
          </DialogDescription>
        </DialogHeader>

        {!initialLoadDone ? (
          <div className="p-5 space-y-3" aria-busy="true" aria-label="Loading share settings">
            <Skeleton className="h-[68px] w-full rounded" />
            <Skeleton className="h-[68px] w-full rounded" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {isSandboxFirm && <SandboxInfoBanner />}
            {/* External Collaborator (platform.personas.eng_ext_collaborator) */}
            <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Users className="h-4 w-4 text-[#45474c] shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor="share-ec" className={cn("text-xs font-semibold text-[#1b1b1d] cursor-pointer leading-tight", isSandboxFirm && "opacity-50")}>
                      {projExtCollaborator}
                    </Label>
                    <p className="text-[11px] text-[#45474c] mt-0.5">Contractors, consultants &amp; agency partners who co-create content</p>
                  </div>
                </div>
                <Switch
                  id="share-ec"
                  checked={settings.externalCollaborator}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, externalCollaborator: v }))}
                  disabled={isSandboxFirm}
                />
              </div>
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: settings.externalCollaborator ? '1fr' : '0fr' }}
                aria-hidden={!settings.externalCollaborator}
              >
                <div className="min-h-0 overflow-hidden"><div className="mx-4 border-t border-[#e5e7eb]" />
                  <div className="bg-white px-4 py-3 space-y-3">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Options</p>
                    <div className="space-y-3 pl-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-rose-600 flex items-center gap-2">
                          <Pencil className="h-3.5 w-3.5" /> Read-Write permission
                        </span>
                        <Switch checked disabled className="opacity-50 cursor-not-allowed !bg-rose-500" />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ec-download" className="text-xs text-[#45474c] flex items-center gap-2 cursor-pointer">
                          <FileDown className="h-3.5 w-3.5" /> Allow download
                        </Label>
                        <Switch
                          id="ec-download"
                          checked={settings.ecOptions.allowDownload}
                          onCheckedChange={(v) => setSettings((s) => ({ ...s, ecOptions: { ...s.ecOptions, allowDownload: v } }))}
                          disabled={isSandboxFirm}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Guest (platform.personas.eng_viewer): main toggle + options enclosed in one tile */}
            <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle className="h-4 w-4 text-[#45474c] shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor="share-guest" className="text-xs font-semibold text-[#1b1b1d] cursor-pointer leading-tight">
                      {projViewer}
                    </Label>
                    <p className="text-[11px] text-[#45474c] mt-0.5">Clients, sponsors &amp; stakeholders who review &amp; stay informed</p>
                  </div>
                </div>
                <Switch
                  id="share-guest"
                  checked={settings.guest}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, guest: v }))}
                  disabled={isSandboxFirm}
                />
              </div>
              {/* Guest options: collapsed until Guest toggle is on; expand with transition */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: settings.guest ? '1fr' : '0fr' }}
                aria-hidden={!settings.guest}
              >
                <div className="min-h-0 overflow-hidden"><div className="mx-4 border-t border-[#e5e7eb]" />
                  <div className="bg-white px-4 py-3 space-y-3">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">Options</p>
                    <div className="space-y-3 pl-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-primary flex items-center gap-2">
                          <Eye className="h-3.5 w-3.5" /> Read-Only permission
                        </span>
                        <Switch checked disabled className="opacity-50 cursor-not-allowed" />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="guest-pdf" className="text-xs text-[#45474c] flex items-center gap-2 cursor-pointer">
                          <FileText className="h-3.5 w-3.5" /> Share PDF version only
                        </Label>
                        <Switch
                          id="guest-pdf"
                          checked={settings.guestOptions.sharePdfOnly}
                          onCheckedChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              guestOptions: {
                                ...s.guestOptions,
                                sharePdfOnly: v,
                                // reset watermark when PDF-only is turned off
                                addWatermark: v ? s.guestOptions.addWatermark : false,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className={cn("flex items-center justify-between gap-3", !settings.guestOptions.sharePdfOnly && "opacity-40")}>
                        <Label
                          htmlFor="guest-watermark"
                          className={cn("text-xs text-[#45474c] flex items-center gap-2", settings.guestOptions.sharePdfOnly ? "cursor-pointer" : "cursor-not-allowed")}
                        >
                          <Droplets className="h-3.5 w-3.5" />
                          Add watermark
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-[#45474c] cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px] text-center">
                                Your firm name will be applied as a diagonal watermark on each page. Requires &ldquo;Share PDF version only&rdquo;.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </Label>
                        <Switch
                          id="guest-watermark"
                          checked={settings.guestOptions.addWatermark}
                          onCheckedChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              guestOptions: { ...s.guestOptions, addWatermark: v },
                            }))
                          }
                          disabled={isSandboxFirm || !settings.guestOptions.sharePdfOnly}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="guest-download" className="text-xs text-[#45474c] flex items-center gap-2 cursor-pointer">
                          <FileDown className="h-3.5 w-3.5" /> Allow download
                        </Label>
                        <Switch
                          id="guest-download"
                          checked={settings.guestOptions.allowDownload}
                          onCheckedChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              guestOptions: { ...s.guestOptions, allowDownload: v },
                            }))
                          }
                          disabled={isSandboxFirm}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e5e7eb] bg-white flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="rounded text-[10px] font-headline font-bold tracking-widest uppercase border-[#e5e7eb] text-[#45474c] hover:bg-[#f9f9fb]"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="greenCta"
            className="rounded text-[10px] font-headline font-bold tracking-widest uppercase"
            onClick={handleSave}
            disabled={isSandboxFirm || saving || !initialLoadDone || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
