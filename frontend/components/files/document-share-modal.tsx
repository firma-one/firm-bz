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
import { Users, UserCircle, FileDown, Droplets, Info } from 'lucide-react'
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Share document</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 truncate" title={doc.name}>
            <DocumentIcon mimeType={doc.mimeType} size={14} className="shrink-0" />
            {doc.name}
          </DialogDescription>
        </DialogHeader>

        {!initialLoadDone ? (
          <div className="space-y-5 py-2" aria-busy="true" aria-label="Loading share settings">
            <Skeleton className="h-[72px] w-full rounded-lg" />
            <Skeleton className="h-[72px] w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {isSandboxFirm && <SandboxInfoBanner />}
            {/* External Collaborator (platform.personas.eng_ext_collaborator) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Users className="h-5 w-5 text-slate-600 shrink-0" />
                  <div>
                    <Label htmlFor="share-ec" className={cn("text-sm font-medium cursor-pointer", isSandboxFirm && "text-slate-500")}>
                      {projExtCollaborator}
                    </Label>
                    <p className="text-xs text-slate-500">Document visible in file list for external collaborators</p>
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
                <div className="min-h-0 overflow-hidden border-t border-slate-200">
                  <div className="bg-white px-4 py-3 space-y-3">
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">{projExtCollaborator} options</p>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="ec-download" className="text-sm text-slate-700 flex items-center gap-2 cursor-pointer">
                        <FileDown className="h-4 w-4" /> Allow download
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

            {/* Guest (platform.personas.eng_viewer): main toggle + options enclosed in one tile */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserCircle className="h-5 w-5 text-slate-600 shrink-0" />
                  <div>
                    <Label htmlFor="share-guest" className="text-sm font-medium text-slate-900 cursor-pointer">
                      {projViewer}
                    </Label>
                    <p className="text-xs text-slate-500">Share with guests; optional PDF-only, download, watermark</p>
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
                <div className="min-h-0 overflow-hidden border-t border-slate-200">
                  <div className="bg-white px-4 py-3 space-y-3">
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">{projViewer} options</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="guest-pdf" className="text-sm text-slate-700 cursor-pointer">Share PDF version only</Label>
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
                          className={cn("text-sm text-slate-700 flex items-center gap-2", settings.guestOptions.sharePdfOnly ? "cursor-pointer" : "cursor-not-allowed")}
                        >
                          <Droplets className="h-4 w-4" />
                          Add watermark
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
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
                        <Label htmlFor="guest-download" className="text-sm text-slate-700 flex items-center gap-2 cursor-pointer">
                          <FileDown className="h-4 w-4" /> Allow download
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

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="greenCta"
            className="rounded-[2px] w-32 text-[10px] font-headline font-bold tracking-widest uppercase"
            onClick={handleSave}
            disabled={isSandboxFirm || saving || !initialLoadDone || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
