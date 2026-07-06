'use client'

import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Clock, Maximize2, Minimize2, Loader2, X, LockOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { MaintenanceStatus } from '@/lib/hooks/use-firm-maintenance-status'

type Props = {
  status: MaintenanceStatus
  migrationStartedAt?: string | null
  onMigrationStartedAtClear?: () => void
  firmId?: string | null
  accessToken?: string | null
  onCancelled?: () => void
  onRefresh?: () => void
}

function BlockLoader() {
  const [active, setActive] = useState(0)
  const BLOCKS = 6
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % BLOCKS), 320)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: BLOCKS }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-3.5 h-3.5 border border-[#c2c4c8] transition-colors duration-300',
            i <= active ? 'bg-[#6b7280]' : 'bg-[#f3f4f6]'
          )}
        />
      ))}
    </div>
  )
}

function FileRow({ file }: { file: { fileId: string; fileName: string | null; status: string } }) {
  const name = file.fileName ?? file.fileId.slice(0, 12) + '…'
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 min-h-[32px] border-b border-slate-100 last:border-0">
      <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
        {file.status === 'moved' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        ) : file.status === 'failed' ? (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        )}
      </span>
      <span className="text-[11px] text-slate-700 truncate flex-1">{name}</span>
      <span className={cn(
        'text-[10px] shrink-0',
        file.status === 'moved' ? 'text-primary' :
        file.status === 'failed' ? 'text-red-500' :
        'text-[#45474c]'
      )}>
        {file.status === 'moved' ? 'Moved' : file.status === 'failed' ? 'Failed' : 'Moving…'}
      </span>
    </div>
  )
}

export function MigrationProgressPanel({ status, migrationStartedAt, onMigrationStartedAtClear, firmId, accessToken, onCancelled, onRefresh }: Props) {
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [graceExpired, setGraceExpired] = useState(false)
  const [countdownLabel, setCountdownLabel] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const handleCancel = async () => {
    if (!firmId || !accessToken || cancelling) return
    setCancelling(true)
    try {
      await fetch('/api/firm/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'cancel-migration', firmId }),
      })
      onRefresh?.()
      onCancelled?.()
    } catch { /* ignore */ } finally {
      setCancelling(false)
    }
  }

  const handleForceUnlock = async () => {
    if (!firmId || !accessToken || unlocking) return
    setUnlocking(true)
    try {
      await fetch('/api/firm/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'force-unlock', firmId }),
      })
      onCancelled?.()
    } catch { /* ignore */ } finally {
      setUnlocking(false)
    }
  }

  const isPending = !!status?.migrationPending && !status?.active
  const isActive = status?.active === true
  const terminalMigration = status?.latestMigrationStatus === 'completed' || status?.latestMigrationStatus === 'failed' || status?.latestMigrationStatus === 'failed_partial'
  const isStuck = (graceExpired && !isActive) || ((isActive || isPending) && terminalMigration)

  // DB-backed grace target (from real poll), or fall back to local migrationStartedAt
  const graceTarget: string | null = (() => {
    const initiatedAt = status?.migrationPending?.initiatedAt ?? migrationStartedAt
    const startMins = status?.migrationPending?.estimatedStartMinutes ?? 2
    if (!initiatedAt) return null
    return new Date(new Date(initiatedAt).getTime() + startMins * 60 * 1000).toISOString()
  })()

  // Countdown tick
  useEffect(() => {
    if (!graceTarget || isActive) return
    function tick() {
      const ms = new Date(graceTarget!).getTime() - Date.now()
      if (ms <= 0) {
        setCountdownLabel('0:00')
        setGraceExpired(true)
        return
      }
      setGraceExpired(false)
      const s = Math.ceil(ms / 1000)
      setCountdownLabel(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [graceTarget, isActive])

  // Reset grace state when no longer pending
  useEffect(() => {
    if (!isPending && !migrationStartedAt) setGraceExpired(false)
  }, [isPending, migrationStartedAt])

  // Once the real poll confirms migration is done, clear the local started state
  useEffect(() => {
    if (migrationStartedAt && status !== null && !status?.migrationPending && !status?.active) {
      onMigrationStartedAtClear?.()
    }
  }, [status, migrationStartedAt, onMigrationStartedAtClear])

  // When grace expires, poll every 2s; clear as soon as DB confirms nothing active
  const onRefreshRef = useRef(onRefresh)
  const onClearRef = useRef(onMigrationStartedAtClear)
  const statusRef = useRef(status)
  onRefreshRef.current = onRefresh
  onClearRef.current = onMigrationStartedAtClear
  statusRef.current = status
  useEffect(() => {
    if (!graceExpired || isActive || !migrationStartedAt) return
    const tick = () => {
      onRefreshRef.current?.()
      const s = statusRef.current
      if (s !== null && !s?.migrationPending && !s?.active) {
        onClearRef.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 2_000)
    return () => clearInterval(id)
  }, [graceExpired, isActive, migrationStartedAt])

  const showPanel = isPending || isActive || !!migrationStartedAt
  if (!mounted || !showPanel) return null
  if (typeof document === 'undefined' || !document.body) return null

  const files = status?.migrationFiles ?? []
  const total = status?.totalFileCount ?? files.length
  const moved = status?.movedFileCount ?? files.filter(f => f.status === 'moved').length
  const failed = status?.failedFileCount ?? 0
  const estimatedMins = status?.estimatedMinutes

  // Lock UI when actively migrating OR when grace countdown has expired
  const shouldBlock = isActive || graceExpired

  const headerLabel = isActive || graceExpired
    ? total > 0
      ? `Moving ${moved}/${total} items`
      : 'Workspace migration in progress'
    : 'Migration queued'

  const HeaderIcon = isActive || graceExpired ? Loader2 : (isStuck ? LockOpen : X)

  return createPortal(
    <>
      {/* Blocking overlay — active migration or grace period expired */}
      {shouldBlock && <div className="fixed inset-0 z-[99] bg-black/20 backdrop-blur-[1px]" />}

      {/* Panel */}
      <div className={cn(
        'fixed bottom-4 right-4 z-[100] w-[360px] rounded-lg shadow-xl border border-slate-200 bg-white flex flex-col transition-all duration-300',
        expanded ? 'h-auto max-h-[400px]' : 'h-10'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-primary/15 text-primary rounded-t-lg shrink-0">
          <div
            className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
            onClick={() => setExpanded(e => !e)}
          >
            <span className="text-[11px] font-medium flex items-center gap-1.5 min-w-0">
              <HeaderIcon className={cn('h-3.5 w-3.5 shrink-0 text-primary', isActive && 'animate-spin')} />
              <span className="truncate">{headerLabel}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {firmId && accessToken && (
              <>
                {/* Unlock: only when locked but migration complete, or actively migrating */}
                {(isStuck || isActive) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleForceUnlock() }}
                    disabled={unlocking}
                    title="Unlock workspace"
                    className="h-5 w-5 flex items-center justify-center rounded bg-rose-100 text-rose-600 hover:bg-rose-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {unlocking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LockOpen className="h-3 w-3" />}
                  </button>
                )}
                {/* Cancel: only during grace countdown — not once locking has started */}
                {(isPending || !!migrationStartedAt) && !isActive && !graceExpired && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCancel() }}
                    disabled={cancelling}
                    title="Cancel migration"
                    className="h-5 w-5 flex items-center justify-center rounded bg-rose-100 text-rose-600 hover:bg-rose-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                )}
              </>
            )}
            <div
              className="h-5 w-5 flex items-center justify-center rounded bg-primary/10 text-primary/60 hover:bg-primary/20 cursor-pointer transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </div>
          </div>
        </div>

        {/* Chrome-style indeterminate loading bar when active or waiting */}
        {(isActive || graceExpired) && (
          <div className="relative h-1 w-full overflow-hidden bg-primary/15 shrink-0">
            <div className="absolute inset-y-0 w-1/2 animate-[indeterminate-progress_1.5s_infinite_linear] rounded-full bg-primary" />
          </div>
        )}

        {expanded && (
          <div className="flex flex-col min-h-0 overflow-hidden rounded-b-lg">
            {/* Status summary */}
            <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
              {isStuck ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <BlockLoader />
                  <p className="text-[11px] text-[#45474c] text-center leading-relaxed">
                    Workspace is locked — migration started
                  </p>
                </div>
              ) : isActive ? (
                <>
                  <p className="text-[11px] text-[#45474c] leading-relaxed">
                    Files are moving to the new workspace folder. The workspace is locked during migration.
                  </p>
                  {estimatedMins != null && (
                    <p className="text-[11px] text-[#45474c] mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 inline shrink-0" />
                      Est. {estimatedMins} min remaining
                    </p>
                  )}
                  {/* Progress bar */}
                  {total > 0 ? (
                    <div className="mt-2 space-y-0.5">
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.round((moved / total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#45474c]">{moved} of {total} items moved{failed > 0 ? ` · ${failed} failed` : ''}</p>
                    </div>
                  ) : (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-primary animate-[migration-slide_1.8s_ease-in-out_infinite]" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[#45474c] leading-relaxed">
                    Save any open work — the workspace will lock in:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono tabular-nums font-bold text-primary text-sm">
                      {countdownLabel || '2:00'}
                    </span>
                    <span className="text-[11px] text-[#45474c]">remaining</span>
                  </div>
                </>
              )}
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="overflow-y-auto flex-1">
                {files.map(f => <FileRow key={f.fileId} file={f} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
