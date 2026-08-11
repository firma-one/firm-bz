'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SquareCheck, Square, ExternalLink } from 'lucide-react'
import { GoogleDriveProductMark } from '@/components/ui/google-drive-icon'
import { OneDriveIcon } from '@/components/ui/onedrive-icon'
import { SharePointIcon } from '@/components/ui/sharepoint-icon'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

type ClientDriveSectionProps = {
  connectorId: string | null
  clientId: string
  firmId: string
  orgSlug: string
  isSandboxFirm?: boolean
}

export function ClientDriveSection({
  connectorId,
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

  const hasLoadedRef = useRef(false)

  const loadConnectorData = useCallback(async () => {
    if (!connectorId || !session?.access_token) return
    setIsLoadingData(true)
    try {
      const headers = { Authorization: `Bearer ${session.access_token}` }
      const googleRes = await fetch(
        `/api/connectors/google-drive?action=status&connectionId=${encodeURIComponent(connectorId)}`,
        { headers }
      )
      if (googleRes.ok) {
        const data = await googleRes.json()
        if (data.connector) {
          setProvider('google_drive')
          setName(data.connector.name ?? '')
          setEmail(data.connector.email ?? '')
          setIsActive(!!data.isConnected)
          setIsLoadingData(false)
          return
        }
      }
      // Not a Google Drive connector (or not found under this user) — try OneDrive.
      const oneDriveRes = await fetch(
        `/api/connectors/onedrive?action=status&connectionId=${encodeURIComponent(connectorId)}`,
        { headers }
      )
      if (oneDriveRes.ok) {
        const data = await oneDriveRes.json()
        if (data.connector) {
          setProvider('onedrive')
          setName(data.connector.name ?? '')
          setEmail(data.connector.email ?? '')
          setIsActive(!!data.isConnected)
          setWorkspaceRootLocation(data.connector.workspaceRootLocation ?? null)
        }
      }
    } catch {
      // non-fatal
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
      {connectorId ? (
        <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 bg-white border border-[#e5e7eb] rounded flex items-center justify-center p-1.5">
            {provider === 'onedrive'
              ? (workspaceRootLocation === 'SHARED' ? <SharePointIcon size={18} /> : <OneDriveIcon size={18} />)
              : <GoogleDriveProductMark width={18} height={18} />}
          </div>
          <SquareCheck className="w-4 h-4 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-[#1b1b1d] truncate leading-snug">
              {name || email || (provider === 'onedrive' ? 'Microsoft account' : 'Google account')}
            </p>
            <p className={`text-xs mt-0.5 ${isActive ? 'text-[#45474c]' : 'text-[#9a9ba0]'}`}>
              {isActive ? (email || 'Connected') : 'Disconnected — reconnect in Firm Settings'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] gap-1 shrink-0 rounded"
            onClick={() => router.push(`/d/f/${orgSlug}?tab=settings&section=storage`)}
          >
            <ExternalLink className="w-3 h-3" />
            Manage
          </Button>
        </div>
      ) : (
        <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 bg-white border border-[#e5e7eb] rounded flex items-center justify-center p-1.5 opacity-40">
            <GoogleDriveProductMark width={18} height={18} />
          </div>
          <Square className="w-4 h-4 shrink-0 text-[#d1d5db]" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-[#9a9ba0] leading-snug">No connector linked</p>
            <p className="text-xs text-[#9a9ba0] mt-0.5">Set one up in Firm Settings → Document Storage</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] gap-1 shrink-0 rounded"
            onClick={() => router.push(`/d/f/${orgSlug}?tab=settings&section=storage`)}
          >
            <ExternalLink className="w-3 h-3" />
            Manage
          </Button>
        </div>
      )}
    </div>
  )
}
