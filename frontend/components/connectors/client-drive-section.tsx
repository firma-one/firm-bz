'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/ui/status-icon'
import { SquareCheck, Square, ExternalLink } from 'lucide-react'
import { GoogleDriveProductMark } from '@/components/ui/google-drive-icon'
import { OneDriveIcon } from '@/components/ui/onedrive-icon'
import { SharePointIcon } from '@/components/ui/sharepoint-icon'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { firmSettingsPath } from '@/lib/navigation/firm-paths'
import { failureFrom, failureReason } from '@/lib/files/action-failure'

type ClientDriveSectionProps = {
  connectorId: string | null
  clientId: string
  firmId: string
  groupSlug: string
  orgSlug: string
}

export function ClientDriveSection({
  connectorId,
  groupSlug,
  orgSlug,
}: ClientDriveSectionProps) {
  const router = useRouter()
  const { session } = useAuth()

  const [isLoadingData, setIsLoadingData] = useState(!!connectorId)
  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [isActive, setIsActive] = useState(false)
  const [provider, setProvider] = useState<'google_drive' | 'onedrive'>('google_drive')
  const [workspaceRootLocation, setWorkspaceRootLocation] = useState<string | null>(null)
  /** The check itself failed: never shown as a green, connected (or disconnected) row (P2-36). */
  const [checkFailed, setCheckFailed] = useState<string | null>(null)

  const hasLoadedRef = useRef(false)

  const loadConnectorData = useCallback(async () => {
    if (!connectorId || !session?.access_token) return
    setIsLoadingData(true)
    setCheckFailed(null)
    try {
      const headers = { Authorization: `Bearer ${session.access_token}` }
      const googleRes = await fetch(
        `/api/connectors/google-drive?action=status&connectionId=${encodeURIComponent(connectorId)}`,
        { headers }
      )
      if (!googleRes.ok) throw await failureFrom(googleRes)
      const googleData = await googleRes.json()
      if (googleData.connector) {
        setProvider('google_drive')
        setName(googleData.connector.name ?? '')
        setEmail(googleData.connector.email ?? '')
        setIsActive(!!googleData.isConnected)
        setIsLoadingData(false)
        return
      }
      // Not a Google Drive connector (or not found under this user) — try OneDrive.
      const oneDriveRes = await fetch(
        `/api/connectors/onedrive?action=status&connectionId=${encodeURIComponent(connectorId)}`,
        { headers }
      )
      if (!oneDriveRes.ok) throw await failureFrom(oneDriveRes)
      const data = await oneDriveRes.json()
      if (data.connector) {
        setProvider('onedrive')
        setName(data.connector.name ?? '')
        setEmail(data.connector.email ?? '')
        setIsActive(!!data.isConnected)
        setWorkspaceRootLocation(data.connector.workspaceRootLocation ?? null)
      } else {
        // Neither provider answered for it: the status routes only see connectors the signed-in
        // person owns, so this is "unknown", not "disconnected".
        setCheckFailed('It was connected by someone else. Open Firm Settings to see it.')
      }
    } catch (e) {
      setCheckFailed(failureReason(e))
    } finally {
      setIsLoadingData(false)
    }
  }, [connectorId, session?.access_token])

  useEffect(() => {
    if (!hasLoadedRef.current && connectorId && session?.access_token) {
      hasLoadedRef.current = true
      void loadConnectorData()
    }
    if (!connectorId) {
      setIsLoadingData(false)
    }
  }, [connectorId, session?.access_token, loadConnectorData])

  if (isLoadingData) {
    return (
      <div className="space-y-3 px-1 py-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {connectorId && checkFailed ? (
        <div role="alert" className="rounded border border-line bg-surface px-4 py-3 flex items-center gap-3">
          <StatusIcon stage="problem" size={13} />
          <p className="min-w-0 flex-1 text-xs text-fg-muted">
            Couldn&apos;t check the connection · {checkFailed}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg shrink-0 rounded"
            onClick={() => void loadConnectorData()}
          >
            Try again
          </Button>
        </div>
      ) : connectorId ? (
        <div className="rounded border border-line bg-surface px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 bg-surface border border-line rounded flex items-center justify-center p-1.5">
            {provider === 'onedrive'
              ? (workspaceRootLocation === 'SHARED' ? <SharePointIcon size={18} /> : <OneDriveIcon size={18} />)
              : <GoogleDriveProductMark width={18} height={18} />}
          </div>
          <SquareCheck className="w-4 h-4 shrink-0 text-tag-green-fg" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-fg truncate leading-snug">
              {name || email || (provider === 'onedrive' ? 'Microsoft account' : 'Google account')}
            </p>
            {/* Connection health in the status language: Done when connected, Needs fixing when not. */}
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
              <StatusIcon stage={isActive ? 'done' : 'problem'} size={13} />
              <span className="truncate">{isActive ? (email || 'Connected') : 'Disconnected · reconnect in Firm Settings'}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg gap-1 shrink-0 rounded"
            onClick={() => router.push(firmSettingsPath(groupSlug, orgSlug, 'storage'))}
          >
            <ExternalLink className="w-3 h-3" />
            Manage
          </Button>
        </div>
      ) : (
        <div className="rounded border border-line bg-surface px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 bg-surface border border-line rounded flex items-center justify-center p-1.5 opacity-40">
            <GoogleDriveProductMark width={18} height={18} />
          </div>
          <Square className="w-4 h-4 shrink-0 text-line-strong" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-fg-subtle leading-snug">No connector linked</p>
            <p className="text-xs text-fg-subtle mt-0.5">Set one up in Firm Settings → Document Storage</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg gap-1 shrink-0 rounded"
            onClick={() => router.push(firmSettingsPath(groupSlug, orgSlug, 'storage'))}
          >
            <ExternalLink className="w-3 h-3" />
            Manage
          </Button>
        </div>
      )}
    </div>
  )
}
