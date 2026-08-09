"use client"

import { useState, useCallback, useEffect, useRef } from "react"
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
import { MicrosoftIcon } from "@/components/ui/microsoft-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { generateWorkspaceFolderName } from "@/lib/generate-unique-workspace-folder-name"
import {
  ArrowRightLeft,
  ArrowUpRight,
  FolderOpen,
  HardDrive,
  RefreshCw,
} from "lucide-react"

type OneDriveSite = { id: string; name: string; webUrl?: string }

/** Numbered progress dots — completed steps gray-filled, active step dark-filled, pending steps outlined. Mirrors GoogleDriveWorkspaceRoot's StepProgress. */
function StepProgress({ current, total, onStepClick }: { current: number; total: number; onStepClick?: (step: number) => void }) {
  return (
    <div className="flex w-full items-center" aria-label={`Step ${current} of ${total}`}>
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
          <div key={step} className={cn("flex items-center", i > 0 && "flex-1")}>
            {i > 0 && (
              <div className={cn("h-0.5 flex-1", step <= current ? "bg-[#1b1b1d]" : "bg-[#e5e7eb]")} />
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

type OneDriveWorkspaceRootProps = {
  connectionId: string
  accessToken: string | null | undefined
  rootFolderId?: string | null
  rootFolderName?: string | null
  workspaceRootLocation?: "PERSONAL" | "SHARED" | null
  workspaceRootSharedStorageName?: string | null
  /** SharePoint site's Graph `webUrl`, captured at site-selection time — the only supported way
   * to get a browser-openable link for a SharePoint site (no reliable client-side construction
   * from the composite site id, unlike Personal OneDrive's onedrive.live.com/?id= pattern). Null
   * for Personal connectors and for Shared connectors selected before this field existed. */
  workspaceRootSharedStorageWebUrl?: string | null
  migrationLocked?: boolean
  onUpdated: () => void | Promise<void>
  firmId?: string | null
  sectionLabel?: string
  /** True for personal Microsoft accounts (MSA) — detected via the OAuth id_token's `tid` claim
   * at connect time (see app/api/connectors/onedrive/callback/route.ts). A personal account can
   * never have a SharePoint site, so (1) the workspace folder auto-creates on render with no
   * user click/decision, and (2) the "Migrate" button is hidden entirely once it exists — the
   * root stays wherever it was auto-created in OneDrive, permanently, for these accounts. */
  isPersonalAccount?: boolean | null
  /** False when the underlying connector (Microsoft OAuth session) is disconnected/revoked — as
   * opposed to `accessToken`, which is the user's own FirmaOne session token and stays truthy
   * regardless of this specific connector's state. When false, folder actions are disabled and
   * a reconnect hint is shown instead, but the last-known folder info still renders. Defaults
   * to true so existing callers that don't pass it keep today's behavior. */
  connectorActive?: boolean
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
  workspaceRootSharedStorageWebUrl = null,
  migrationLocked = false,
  onUpdated,
  firmId,
  sectionLabel,
  isPersonalAccount = null,
  connectorActive = true,
}: OneDriveWorkspaceRootProps) {
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [location, setLocation] = useState<"Personal" | "Shared" | null>(null)
  const [siteQuery, setSiteQuery] = useState("")
  const [sites, setSites] = useState<OneDriveSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectingSiteId, setSelectingSiteId] = useState<string | null>(null)

  // Sites load once (via loadSites()) when the Shared flow starts; the search box below then
  // filters that already-fetched list client-side rather than re-hitting Graph per keystroke.
  const filteredSites = siteQuery.trim()
    ? sites.filter(s => s.name.toLowerCase().includes(siteQuery.trim().toLowerCase()))
    : sites

  const displayName = rootFolderName?.trim() || "Workspace folder"
  // Personal OneDrive folders open reliably via this constructible URL pattern. SharePoint has no
  // equivalent — the site's webUrl (captured at site-selection time, see onedrive/sites/route.ts)
  // is used instead, linking to the site's document library home rather than the exact folder
  // (Graph's driveItem.webUrl would need a live API fetch to link the exact folder; the site-level
  // link is good enough for "open where my files live" and needs no extra request here).
  const driveUrl = rootFolderId && workspaceRootLocation === "PERSONAL"
    ? `https://onedrive.live.com/?id=${encodeURIComponent(rootFolderId)}`
    : workspaceRootLocation === "SHARED" && workspaceRootSharedStorageWebUrl
      ? workspaceRootSharedStorageWebUrl
      : null
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

  const loadSites = useCallback(async () => {
    if (!accessToken) return
    setSitesLoading(true)
    try {
      const params = new URLSearchParams({ connectionId })
      const res = await fetch(`/api/connectors/onedrive/sites?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSites(data.sites ?? [])
      } else {
        setSites([])
        addToast({
          title: 'Could not load sites',
          message: data.error === 'Failed to list SharePoint sites'
            ? 'Reconnect this account to grant SharePoint site access, then try again.'
            : (data.error || 'Try again.'),
          type: 'error',
        })
      }
    } catch {
      setSites([])
      addToast({ title: 'Could not load sites', message: 'Try again.', type: 'error' })
    } finally {
      setSitesLoading(false)
    }
  }, [accessToken, connectionId, addToast])

  // Personal (OneDrive) auto-creates immediately, no intermediate review/confirm step (unlike
  // Google, which requires the user to manually create+select the folder). For personal MSA
  // accounts this now fires automatically via the effect below; this function is only reached
  // manually via the dialog's Personal button for work/school accounts on the Migrate path.
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

  // Auto-complete Step 2 for personal Microsoft accounts — no folder yet and no decision to
  // make (a personal MSA can never have a SharePoint site), so create the workspace folder the
  // moment this renders rather than making the user click "Choose folder" for a foregone
  // conclusion. Ref-guarded so this only ever fires once per connection, even across re-renders
  // (e.g. accessToken resolving async) — createPersonalFolder itself also no-ops while saving.
  const autoPersonalRunRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isPersonalAccount || rootFolderId || !accessToken) return
    if (autoPersonalRunRef.current === connectionId) return
    autoPersonalRunRef.current = connectionId
    void createPersonalFolder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersonalAccount, rootFolderId, accessToken, connectionId])

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

  // Personal auto-creates with no visible steps; Shared is a 2-step flow (Location, then pick a
  // site). Total is always 2 so the bar doesn't jump/reflow once a location is chosen.
  const totalSteps = 2
  const currentStep = location === null ? 1 : 2

  const dialogTitle = rootFolderId ? "Migrate workspace folder" : "Set up workspace folder"
  const dialogSubtitle =
    location === null
      ? rootFolderId
        ? "Choose where the new workspace folder should live."
        : "Choose where to create your workspace folder."
      : location === "Personal"
        ? "We'll create a uniquely named folder in your OneDrive."
        : "Pick a SharePoint site — we'll create a dedicated workspace folder inside it."

  return (
    <div>
      <div>
        {rootFolderId ? (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <HardDrive className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={2} />
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
                {driveUrl ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 w-[6.5rem] items-center justify-center gap-1.5 rounded text-xs font-medium text-[#45474c] bg-white border border-[#e5e7eb] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors"
                        aria-label={workspaceRootLocation === "SHARED" ? "Open SharePoint site" : "Open in OneDrive"}
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {workspaceRootLocation === "SHARED" ? "Open SharePoint site" : "Open in OneDrive"}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {isPersonalAccount === true ? null : (
                  // Migrate is hidden entirely for personal Microsoft accounts — a personal MSA
                  // can never have a SharePoint site to migrate to, and the workspace folder was
                  // already auto-created with no user decision involved, so there's nothing
                  // meaningful to offer here (see item 9 in the plan doc's OPEN gaps note).
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-8 w-[6.5rem] items-center justify-center gap-1.5 rounded text-xs font-medium text-[#45474c] bg-white border border-[#e5e7eb] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] transition-colors",
                          (!accessToken || !connectorActive || migrationLocked) && "opacity-40 cursor-not-allowed",
                        )}
                        onClick={() => {
                          if (!connectorActive || migrationLocked) return
                          resetFlow()
                          setDialogOpen(true)
                        }}
                        disabled={!accessToken || !connectorActive || migrationLocked}
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
                )}
              </div>
            </div>
          </TooltipProvider>
        ) : isPersonalAccount === true ? (
          // A personal Microsoft account can never have a SharePoint site, so there's no real
          // choice to present — the workspace folder is created automatically (see the
          // autoPersonalRunRef effect above) as soon as this renders, no button/click needed.
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
              <RefreshCw className="h-4.5 w-4.5 text-[#45474c] animate-spin" strokeWidth={1.75} />
            </div>
            <p className="min-w-0 flex-1 text-[0.8125rem] text-[#45474c]">
              Setting up your workspace folder in OneDrive…
            </p>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]" aria-hidden>
                <HardDrive className="h-4.5 w-4.5 text-[#45474c]" strokeWidth={1.75} />
              </div>
              <p className="min-w-0 flex-1 text-[0.8125rem] text-[#45474c]">
                No storage location selected.
              </p>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded h-8 px-4 text-[10px] font-headline font-bold tracking-widest uppercase text-white bg-primary hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all shrink-0",
                  (!accessToken || !connectorActive || migrationLocked) && "opacity-40 cursor-not-allowed",
                )}
                onClick={() => {
                  if (!connectorActive || migrationLocked) return
                  resetFlow()
                  setDialogOpen(true)
                }}
                disabled={!accessToken || !connectorActive || migrationLocked}
                aria-label="Choose storage location"
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Choose Location
              </button>
            </div>
          </TooltipProvider>
        )}
        {!accessToken ? (
          <p className="text-xs text-amber-800 mt-3">Sign in to migrate your workspace folder.</p>
        ) : !connectorActive ? (
          <p className="text-xs text-amber-800 mt-3">Reconnect this account to manage the workspace folder.</p>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else closeDialog() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[0.9375rem] font-bold text-[#1b1b1d]">
              <MicrosoftIcon size={18} />
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="text-left text-xs text-[#45474c]">{dialogSubtitle}</DialogDescription>
          </DialogHeader>

          <StepProgress
            current={currentStep}
            total={totalSteps}
            onStepClick={(step) => { if (step === 1) resetFlow() }}
          />

          {!location ? (
            <div className="space-y-4 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Location</p>
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
              <div className="flex items-center gap-1.5">
                <SharePointIcon size={14} className="shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Shared (SharePoint) · Pick a site</p>
              </div>
              <input
                type="text"
                value={siteQuery}
                onChange={(e) => setSiteQuery(e.target.value)}
                placeholder="Search sites…"
                className="w-full rounded border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
              <div className="max-h-64 overflow-y-auto rounded border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
                {sitesLoading ? (
                  <div className="divide-y divide-[#e5e7eb]" aria-label="Loading SharePoint sites" role="status">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : filteredSites.length === 0 ? (
                  <p className="text-xs text-[#9a9ba0] px-3 py-3">
                    {sites.length === 0 ? "No sites found." : "No sites match your search."}
                  </p>
                ) : (
                  filteredSites.map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => void selectSite(site)}
                      disabled={selectingSiteId === site.id}
                      className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[#f9f9fb] transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm text-[#1b1b1d] truncate">{site.name}</span>
                      {selectingSiteId === site.id ? (
                        <RefreshCw className="w-3.5 h-3.5 text-[#9a9ba0] animate-spin shrink-0" />
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded border border-[#e5e7eb] bg-white px-2.5 py-1 text-[10px] font-headline font-bold tracking-widest uppercase text-[#45474c] opacity-0 transition-opacity group-hover:opacity-100">
                          <SharePointIcon size={12} className="shrink-0" />
                          Select Site
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
