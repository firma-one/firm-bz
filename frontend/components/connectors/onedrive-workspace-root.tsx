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
import { OneDriveIcon } from "@/components/ui/onedrive-icon"
import { SharePointIcon } from "@/components/ui/sharepoint-icon"
import { useToast } from "@/components/ui/toast"
import { generateWorkspaceFolderName } from "@/lib/generate-unique-workspace-folder-name"
import {
  ArrowRightLeft,
  ArrowUpRight,
  FolderOpen,
  RefreshCw,
  Warehouse,
} from "lucide-react"

type OneDriveSite = { id: string; name: string; webUrl?: string }

type OneDriveWorkspaceRootProps = {
  connectionId: string
  accessToken: string | null | undefined
  rootFolderId?: string | null
  rootFolderName?: string | null
  workspaceRootLocation?: "PERSONAL" | "SHARED" | null
  workspaceRootSharedStorageName?: string | null
  migrationLocked?: boolean
  onUpdated: () => void | Promise<void>
  firmId?: string | null
  sectionLabel?: string
}

/**
 * OneDrive/SharePoint workspace root picker — mirrors GoogleDriveWorkspaceRoot's step 1/2/3
 * wizard shape (Location → Folder → Confirm), adapted for two real differences from Google:
 * (1) Graph has no drop-in JS folder-picker SDK, so Personal mode creates the folder directly
 * via the `ensure-folder` API action rather than asking the user to create+select it manually
 * in a separate tab; (2) Shared mode is a SharePoint *site* picker (this connector's own
 * /api/connectors/onedrive/sites route), not a folder picker inside an existing shared drive.
 */
export function OneDriveWorkspaceRoot({
  connectionId,
  accessToken,
  rootFolderId,
  rootFolderName,
  workspaceRootLocation = null,
  workspaceRootSharedStorageName = null,
  migrationLocked = false,
  onUpdated,
  firmId,
  sectionLabel,
}: OneDriveWorkspaceRootProps) {
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [location, setLocation] = useState<"Personal" | "Shared" | null>(null)
  const [siteQuery, setSiteQuery] = useState("")
  const [sites, setSites] = useState<OneDriveSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectingSiteId, setSelectingSiteId] = useState<string | null>(null)

  const displayName = rootFolderName?.trim() || "Workspace folder"
  const breadcrumbRootLabel =
    workspaceRootLocation === "PERSONAL"
      ? "OneDrive"
      : workspaceRootLocation === "SHARED"
        ? workspaceRootSharedStorageName?.trim()
          ? `SharePoint · ${workspaceRootSharedStorageName.trim()}`
          : "SharePoint"
        : rootFolderId
          ? "Location unknown"
          : null

  const resetFlow = useCallback(() => {
    setLocation(null)
    setSiteQuery("")
    setSites([])
    setSitesLoading(false)
    setSelectingSiteId(null)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    resetFlow()
  }, [resetFlow])

  const loadSites = useCallback(async (q?: string) => {
    if (!accessToken) return
    setSitesLoading(true)
    try {
      const params = new URLSearchParams({ connectionId })
      if (q) params.set('q', q)
      const res = await fetch(`/api/connectors/onedrive/sites?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) setSites((await res.json()).sites ?? [])
    } catch { /* ignore */ } finally {
      setSitesLoading(false)
    }
  }, [accessToken, connectionId])

  // Personal (OneDrive) auto-creates immediately on click — no intermediate review/confirm step,
  // per explicit instruction to not prompt a folder choice for Personal (unlike Google, which
  // requires the user to manually create+select the folder). Shared (SharePoint) still needs
  // the site picker, since that's an unavoidable choice.
  const startPersonalFlow = () => {
    setLocation("Personal")
    void createPersonalFolder()
  }

  const startSharedFlow = () => {
    setLocation("Shared")
    setSiteQuery("")
    void loadSites()
  }

  const createPersonalFolder = async () => {
    if (!accessToken || saving) return
    setSaving(true)
    try {
      const folderName = generateWorkspaceFolderName()
      const firmaRes = await fetch('/api/connectors/onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'ensure-folder', connectionId, name: '_firma' }),
      })
      if (!firmaRes.ok) {
        const err = await firmaRes.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to ensure _firma folder')
      }
      const { folderId: firmaFolderId } = await firmaRes.json()
      const createRes = await fetch('/api/connectors/onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'ensure-folder', connectionId, name: folderName, parentId: firmaFolderId }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to create workspace folder')
      }
      const { folderId } = await createRes.json()
      const updateRes = await fetch('/api/connectors/onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'update-root-folder', connectionId, rootFolderId: folderId, ...(firmId && { firmId }) }),
      })
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to set workspace root')
      }
      addToast({ title: 'Folder created', message: `"${folderName}" set as your workspace root.`, type: 'success' })
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({ title: 'Could not create folder', message: e instanceof Error ? e.message : 'Try again.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const selectSite = async (site: OneDriveSite) => {
    if (!accessToken) return
    setSelectingSiteId(site.id)
    try {
      const res = await fetch('/api/connectors/onedrive/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ connectionId, siteId: site.id, siteName: site.name, ...(firmId && { firmId }) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to select site')
      }
      addToast({ title: 'SharePoint site connected', message: `${site.name} is now linked.`, type: 'success' })
      await onUpdated()
      closeDialog()
    } catch (e) {
      addToast({ title: 'Site selection failed', message: e instanceof Error ? e.message : 'Try again.', type: 'error' })
    } finally {
      setSelectingSiteId(null)
    }
  }

  const dialogTitle = rootFolderId ? "Migrate workspace folder" : "Set up workspace folder"
  const dialogSubtitle =
    location === null
      ? rootFolderId
        ? "Choose where the new workspace folder should live."
        : "Choose where to create your workspace folder."
      : location === "Personal"
        ? "We'll create a uniquely named folder in your OneDrive."
        : "Pick the SharePoint site whose files should sync with this workspace."

  return (
    <div>
      <div>
        {rootFolderId ? (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <Warehouse className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                {sectionLabel && (
                  <p className="text-[0.8125rem] font-bold text-[#1b1b1d] leading-snug">{sectionLabel}</p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-[#45474c] truncate" title={displayName}>{displayName}</span>
                  {breadcrumbRootLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-[#e5e7eb] bg-[#f9f9fb] px-1.5 py-0.5 text-[10px] font-medium text-[#45474c] shrink-0">
                      {workspaceRootLocation === "SHARED" ? (
                        <SharePointIcon size={11} className="shrink-0 opacity-80" />
                      ) : workspaceRootLocation === "PERSONAL" ? (
                        <OneDriveIcon size={11} className="shrink-0 opacity-80" />
                      ) : null}
                      {breadcrumbRootLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all",
                        (!accessToken || migrationLocked) && "opacity-40 cursor-not-allowed",
                      )}
                      onClick={() => {
                        if (migrationLocked) return
                        resetFlow()
                        setDialogOpen(true)
                      }}
                      disabled={!accessToken || migrationLocked}
                      aria-label="Migrate workspace folder"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Migrate
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end" className="max-w-sm text-left leading-snug">
                    Change where this connector's workspace root lives — Personal OneDrive folder, or a SharePoint site.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <FolderOpen className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={1.75} />
              </div>
              <p className="min-w-0 flex-1 text-[0.8125rem] text-[#45474c]">
                No workspace folder selected yet.
              </p>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all shrink-0",
                  (!accessToken || migrationLocked) && "opacity-40 cursor-not-allowed",
                )}
                onClick={() => {
                  if (migrationLocked) return
                  resetFlow()
                  setDialogOpen(true)
                }}
                disabled={!accessToken || migrationLocked}
                aria-label="Choose workspace folder"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Choose folder
              </button>
            </div>
          </TooltipProvider>
        )}
        {!accessToken ? (
          <p className="text-xs text-amber-800 mt-3">Sign in to migrate your workspace folder.</p>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else closeDialog() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded">
          <DialogHeader>
            <DialogTitle className="text-[0.9375rem] font-bold text-[#1b1b1d]">{dialogTitle}</DialogTitle>
            <DialogDescription className="text-left text-xs text-[#45474c]">{dialogSubtitle}</DialogDescription>
          </DialogHeader>

          {!location ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Step 1 · Location</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={startPersonalFlow}
                  disabled={saving}
                  className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
                    <OneDriveIcon size={28} />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">Personal (OneDrive)</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Individual storage tied to your Microsoft account.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={startSharedFlow}
                  disabled={saving}
                  className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
                    <SharePointIcon size={28} />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">Shared (SharePoint)</p>
                    <p className="text-xs text-[#45474c] leading-relaxed mt-0.5">Team storage on a SharePoint site.</p>
                  </div>
                </button>
              </div>
            </div>
          ) : location === "Personal" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <RefreshCw className="h-6 w-6 text-[#45474c] animate-spin" />
              <p className="text-xs text-[#45474c]">Creating your workspace folder in OneDrive…</p>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Shared (SharePoint) · Step 2 of 2</p>
              <input
                type="text"
                value={siteQuery}
                onChange={(e) => setSiteQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void loadSites(siteQuery) }}
                placeholder="Search sites…"
                className="w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                {sitesLoading ? (
                  <p className="text-xs text-[#9a9ba0] px-1 py-2">Loading sites…</p>
                ) : sites.length === 0 ? (
                  <p className="text-xs text-[#9a9ba0] px-1 py-2">No sites found.</p>
                ) : (
                  sites.map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => void selectSite(site)}
                      disabled={selectingSiteId === site.id}
                      className="flex items-center justify-between gap-2 rounded px-2.5 py-2 text-left hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm text-[#1b1b1d] truncate">{site.name}</span>
                      {site.webUrl && (
                        <a href={site.webUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-[#9a9ba0] hover:text-primary shrink-0">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {selectingSiteId === site.id && <RefreshCw className="w-3.5 h-3.5 text-[#9a9ba0] animate-spin shrink-0" />}
                    </button>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-[#45474c] rounded" onClick={resetFlow}>
                  Change location
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
