'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Unplug,
  Plug,
  Zap,
  SwitchCamera,
  RefreshCw,
  Check,
  ArrowRight,
  Trash2,
  Pencil,
  XSquare,
  AlertTriangle,
  Link,
  Unlink,
  SquareCheck,
  Square,
  Users,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GoogleDriveWorkspaceRoot } from '@/components/google-drive/google-drive-workspace-root'
import { GoogleDriveProductMark } from '@/components/ui/google-drive-icon'
import { SwitchAccountModal, type FirmAdmin } from '@/components/connectors/switch-account-modal'
import { ConnectionTestModal } from '@/components/ui/connection-test-modal'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import type { FirmConnectorRecord, FirmClientRecord } from '@/lib/actions/firms'

type DriveRoot = {
  rootFolderId?: string
  rootFolderName: string | null
  workspaceRootLocation: string | null
  workspaceRootSharedStorageName: string | null
} | null

type FirmDriveSectionProps = {
  firmId: string
  orgSlug: string
  isSandboxFirm?: boolean
}

export function FirmDriveSection({ firmId, orgSlug, isSandboxFirm = false }: FirmDriveSectionProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const { user, session } = useAuth()

  const [isLoadingData, setIsLoadingData] = useState(true)
  const [connectors, setConnectors] = useState<FirmConnectorRecord[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, DriveRoot>>({})

  // "Connect new account" form
  const [friendlyName, setFriendlyName] = useState('')
  const [friendlyNameTouched, setFriendlyNameTouched] = useState(false)
  const [loading, setLoading] = useState(false)

  // Per-connector editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Disconnect confirm
  const [disconnectTarget, setDisconnectTarget] = useState<FirmConnectorRecord | null>(null)

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<FirmConnectorRecord | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [testResult, setTestResult] = useState<any>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [isTestModalOpen, setIsTestModalOpen] = useState(false)
  const [testModalName, setTestModalName] = useState('')

  // Switch account
  const [switchTarget, setSwitchTarget] = useState<FirmConnectorRecord | null>(null)
  const [firmAdmins, setFirmAdmins] = useState<FirmAdmin[]>([])
  const [switchModalOpen, setSwitchModalOpen] = useState(false)

  const [allClients, setAllClients] = useState<FirmClientRecord[]>([])
  const [attachingClientId, setAttachingClientId] = useState<string | null>(null)
  const [detachingClientId, setDetachingClientId] = useState<string | null>(null)

  const hasLoadedRef = useRef(false)

  const loadConnectors = useCallback(async () => {
    setIsLoadingData(true)
    try {
      const { getFirmConnectors, getFirmAllClients } = await import('@/lib/actions/firms')
      const [data, clients] = await Promise.all([getFirmConnectors(firmId), getFirmAllClients(firmId)])
      setConnectors(data)
      setAllClients(clients)
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to load connectors', message: 'Could not fetch storage connectors.' })
    } finally {
      setIsLoadingData(false)
    }
  }, [firmId, addToast])

  const loadConnectorsRef = useRef(loadConnectors)
  useEffect(() => { loadConnectorsRef.current = loadConnectors }, [loadConnectors])

  const loadStatus = useCallback(async (connectorId: string) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(
        `/api/connectors/google-drive?action=status&connectionId=${encodeURIComponent(connectorId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.connector) {
        setStatusMap(prev => ({
          ...prev,
          [connectorId]: {
            rootFolderId: data.connector.rootFolderId,
            rootFolderName: data.connector.rootFolderName ?? null,
            workspaceRootLocation: data.connector.workspaceRootLocation ?? null,
            workspaceRootSharedStorageName: data.connector.workspaceRootSharedStorageName ?? null,
          },
        }))
      }
    } catch {
      // non-fatal
    }
  }, [session?.access_token])

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      void loadConnectors()
    }
  }, [loadConnectors])

  useEffect(() => {
    for (const c of connectors) {
      if (c.status === 'ACTIVE' && !statusMap[c.id]) {
        void loadStatus(c.id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectors])

  const startOAuthFlow = useCallback(async (replaceConnectorId?: string, nameOverride?: string, loginHint?: string) => {
    if (!user?.id) return
    setLoading(true)
    // Snapshot all existing connector IDs before OAuth starts. The poll uses this to ignore
    // pre-existing active connectors and only fire onPollSuccess for a genuinely new one.
    const priorConnectorIds = connectors.map(c => c.id)
    try {
      const { startGoogleDriveOAuthPopup, googleDriveOAuthPopupFailureMessage } =
        await import('@/lib/google-drive-popup-oauth')

      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const resp = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'initiate',
          userId: user.id,
          organizationId: firmId,
          flow: 'popup',
          skipAutoFolder: true,
          ...(replaceConnectorId && { replaceConnectorId }),
          ...(nameOverride && { friendlyName: nameOverride }),
          ...(loginHint && { email: loginHint }),
        }),
      })
      if (!resp.ok) throw new Error('Failed to initiate Google sign-in')
      const { authUrl, nonce } = await resp.json()

      startGoogleDriveOAuthPopup(authUrl, nonce ?? null, {
        getAccessToken: async () => {
          const { supabase } = await import('@/lib/supabase')
          const { data } = await supabase.auth.getSession()
          return data.session?.access_token ?? null
        },
        onMessageSuccess: async () => {
          setFriendlyName('')
          setFriendlyNameTouched(false)
          await loadConnectorsRef.current()
        },
        onPollSuccess: async () => {
          setFriendlyName('')
          setFriendlyNameTouched(false)
          await loadConnectorsRef.current()
        },
        onMessageFailure: (code) => {
          addToast({ type: 'error', title: 'Connection failed', message: googleDriveOAuthPopupFailureMessage(code) })
        },
        onTimeout: () => {
          addToast({ type: 'error', title: 'Sign-in timed out', message: 'Timed out waiting for Google. Please try again.' })
        },
        onFlowEnd: () => { setLoading(false) },
      }, { priorConnectorIds })
    } catch (e) {
      setLoading(false)
      addToast({ type: 'error', title: 'Connection failed', message: e instanceof Error ? e.message : 'Could not start Google sign-in.' })
    }
  // loadConnectorsRef.current is used inside callbacks (not loadConnectors directly) so it's not a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, firmId, session?.access_token, addToast, connectors])

  const handleConnect = () => {
    setFriendlyNameTouched(true)
    if (friendlyName.trim()) void startOAuthFlow(undefined, friendlyName.trim())
  }

  const handleReconnect = (connector: FirmConnectorRecord) => {
    void startOAuthFlow(connector.id, connector.name || undefined, connector.email || undefined)
  }

  const handleDisconnect = async (connector: FirmConnectorRecord) => {
    try {
      const { disconnectFirmConnector } = await import('@/lib/actions/firms')
      await disconnectFirmConnector({ connectorId: connector.id, firmId })
      setConnectors(prev => prev.map(c => c.id === connector.id ? { ...c, status: 'REVOKED' } : c))
      addToast({ type: 'success', title: 'Disconnected', message: 'Google Drive disconnected. Reconnect or Remove below.' })
      router.refresh()
    } catch (e) {
      addToast({ type: 'error', title: 'Disconnect failed', message: e instanceof Error ? e.message : 'Could not disconnect.' })
    }
  }

  const handleRemove = async (connector: FirmConnectorRecord) => {
    try {
      const { removeFirmConnector } = await import('@/lib/actions/firms')
      await removeFirmConnector({ connectorId: connector.id, firmId })
      const removedClientIds = new Set(connector.attachedClients.map(c => c.id))
      setAllClients(prev => prev.map(c => removedClientIds.has(c.id) ? { ...c, connectorId: null } : c))
      setConnectors(prev => prev.filter(c => c.id !== connector.id))
      setStatusMap(prev => { const next = { ...prev }; delete next[connector.id]; return next })
      addToast({ type: 'success', title: 'Removed', message: 'Connector deleted.' })
      router.refresh()
    } catch (e) {
      addToast({ type: 'error', title: 'Remove failed', message: e instanceof Error ? e.message : 'Could not remove connector.' })
    }
  }

  const handleSaveName = async (connectorId: string) => {
    if (!editNameValue.trim()) return
    setSavingName(true)
    try {
      const { renameFirmConnector } = await import('@/lib/actions/firms')
      await renameFirmConnector({ connectorId, firmId, name: editNameValue.trim() })
      setConnectors(prev => prev.map(c => c.id === connectorId ? { ...c, name: editNameValue.trim() } : c))
      setEditingId(null)
    } catch (e) {
      addToast({ type: 'error', title: 'Rename failed', message: e instanceof Error ? e.message : 'Could not save name.' })
    } finally {
      setSavingName(false)
    }
  }

  const handleTestConnection = async (connector: FirmConnectorRecord) => {
    setTestingId(connector.id)
    setTestResult(null)
    setTestModalName(connector.name || 'Google Drive')
    try {
      const res = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', connectionId: connector.id }),
      })
      if (!res.ok) throw new Error('Test failed')
      setTestResult(await res.json())
      setIsTestModalOpen(true)
    } catch {
      addToast({ type: 'error', title: 'Test failed', message: 'Could not verify connection.' })
    } finally {
      setTestingId(null)
    }
  }

  const handleOpenSwitchModal = async (connector: FirmConnectorRecord) => {
    if (!session?.access_token) return
    setSwitchTarget(connector)
    try {
      const res = await fetch(`/api/firms/${firmId}/admins`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setFirmAdmins(data.admins ?? [])
      }
    } catch {
      // non-fatal — modal opens with empty list
    }
    setSwitchModalOpen(true)
  }

  const handleSwitchAccount = (selectedEmail: string) => {
    setSwitchModalOpen(false)
    if (switchTarget) void startOAuthFlow(switchTarget.id)
    void selectedEmail
  }

  const handleAttachClient = async (connectorId: string, clientId: string) => {
    setAttachingClientId(clientId)
    try {
      const { shareConnectorWithClient } = await import('@/lib/actions/client')
      await shareConnectorWithClient({ clientId, connectorId })
      setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, connectorId } : c))
      setConnectors(prev => prev.map(c => {
        if (c.id === connectorId) {
          const client = allClients.find(cl => cl.id === clientId)
          if (client && !c.attachedClients.find(ac => ac.id === clientId)) {
            return { ...c, attachedClients: [...c.attachedClients, { id: clientId, name: client.name }] }
          }
        }
        return c
      }))
      addToast({ type: 'success', title: 'Attached', message: 'Client linked to this connector.' })
    } catch (e) {
      addToast({ type: 'error', title: 'Attach failed', message: e instanceof Error ? e.message : 'Could not link client.' })
    } finally {
      setAttachingClientId(null)
    }
  }

  const handleDetachClient = async (connectorId: string, clientId: string) => {
    setDetachingClientId(clientId)
    try {
      const { detachConnectorFromClient } = await import('@/lib/actions/firms')
      await detachConnectorFromClient({ clientId, firmId })
      setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, connectorId: null } : c))
      setConnectors(prev => prev.map(c =>
        c.id === connectorId
          ? { ...c, attachedClients: c.attachedClients.filter(ac => ac.id !== clientId) }
          : c
      ))
      addToast({ type: 'success', title: 'Detached', message: 'Client unlinked from this connector.' })
    } catch (e) {
      addToast({ type: 'error', title: 'Detach failed', message: e instanceof Error ? e.message : 'Could not unlink client.' })
    } finally {
      setDetachingClientId(null)
    }
  }

  if (isLoadingData) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-[2px] shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-[2px]" />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Connector cards */}
        {connectors.length > 0 && (
          <div className="space-y-3">
            {connectors.map((connector, connectorIndex) => {
              const isEditing = editingId === connector.id
              const isTesting = testingId === connector.id
              const driveRoot = statusMap[connector.id] ?? null
              const isActive = connector.status === 'ACTIVE'
              const isPersonalDrive = driveRoot?.workspaceRootLocation === 'PERSONAL'

              return (
                <div key={connector.id} className="relative rounded-[2px] border border-[#e5e7eb] bg-white overflow-hidden">
                  {/* Watermark number */}
                  <span className="pointer-events-none select-none absolute -left-1 -bottom-6 text-[8rem] font-black leading-none text-[#e8eaed]/50 z-0 tracking-tighter">
                    {connectorIndex + 1}
                  </span>
                  {/* Account row */}
                  <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 bg-white border border-[#e5e7eb] rounded-[2px] flex items-center justify-center p-1.5">
                        <GoogleDriveProductMark width={20} height={20} />
                      </div>
                      <div className="min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="text"
                              value={editNameValue}
                              onChange={e => setEditNameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void handleSaveName(connector.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="rounded-[2px] border border-primary bg-white px-2 py-0.5 text-[0.8125rem] font-bold text-[#1b1b1d] focus:outline-none focus:ring-1 focus:ring-primary w-44"
                            />
                            <button type="button" onClick={() => setEditingId(null)}
                              className="text-[#9a9ba0] hover:text-[#45474c] transition-colors">
                              <XSquare className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-[0.8125rem] font-bold text-[#1b1b1d] truncate leading-snug">
                            {connector.name || connector.email || 'Google account'}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-[#9a9ba0]'}`} />
                          <p className={`text-xs ${isActive ? 'text-[#45474c]' : 'text-[#9a9ba0]'}`}>
                            {isActive ? (connector.email || 'Connected') : 'Disconnected — reconnect to restore access'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" variant="outline" size="sm"
                                className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] rounded-[2px]"
                                onClick={() => void handleTestConnection(connector)}
                                disabled={isTesting || isSandboxFirm}>
                                {isTesting
                                  ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                  : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                                Test
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">Verify that Google accepts the stored tokens for this account.</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={isPersonalDrive ? 0 : undefined} className={isPersonalDrive ? 'cursor-not-allowed' : undefined}>
                                <Button type="button" variant="outline" size="sm"
                                  className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] rounded-[2px]"
                                  onClick={() => void handleOpenSwitchModal(connector)}
                                  disabled={loading || isPersonalDrive || isSandboxFirm}>
                                  <SwitchCamera className="w-3.5 h-3.5 mr-1.5" />Switch
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              {isPersonalDrive
                                ? <>Switching accounts on a personal Drive connection requires re-setting up your workspace. Use a Shared Drive to enable account switching.</>
                                : "Switch to a different firm administrator's Google account."}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={connector.attachedClients.length > 0 ? 0 : undefined} className={connector.attachedClients.length > 0 ? 'cursor-not-allowed' : undefined}>
                                <Button type="button" variant="outline" size="sm"
                                  className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 rounded-[2px]"
                                  onClick={() => setDisconnectTarget(connector)}
                                  disabled={isSandboxFirm || connector.attachedClients.length > 0}>
                                  <Unplug className="w-3.5 h-3.5 mr-1.5" />Disconnect
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              {connector.attachedClients.length > 0
                                ? 'Detach all clients before disconnecting.'
                                : 'Revoke the live session. Reconnect the same account later.'}
                            </TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          {isEditing ? (
                            <Button type="button" variant="outline" size="sm"
                              className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] rounded-[2px]"
                              onClick={() => void handleSaveName(connector.id)}
                              disabled={savingName}>
                              {savingName ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                              Save
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" variant="outline" size="sm"
                                  className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] rounded-[2px]"
                                  onClick={() => { setEditNameValue(connector.name || ''); setEditingId(connector.id) }}
                                  disabled={isSandboxFirm}>
                                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">Rename this connection.</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" size="sm"
                                className="h-8 px-3 text-xs bg-primary text-white hover:bg-primary hover:brightness-105 hover:text-white rounded-[2px] border-0"
                                onClick={() => handleReconnect(connector)}
                                disabled={isSandboxFirm || loading}>
                                {loading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1.5" />}Reconnect
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">Open Google sign-in again to restore access.</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" variant="outline" size="sm"
                                className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 rounded-[2px]"
                                onClick={() => setRemoveTarget(connector)}
                                disabled={isSandboxFirm}>
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">Permanently delete this connector.</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Workspace root — only when active and status loaded */}
                  {isActive && driveRoot !== null && (
                    <div className="relative z-10 pl-12 pr-4 py-3 border-t border-[#e5e7eb]">
                      <GoogleDriveWorkspaceRoot
                        connectionId={connector.id}
                        accessToken={session?.access_token}
                        connectedEmail={connector.email}
                        rootFolderId={driveRoot?.rootFolderId}
                        rootFolderName={driveRoot?.rootFolderName}
                        workspaceRootLocation={(driveRoot?.workspaceRootLocation as 'PERSONAL' | 'SHARED' | null) ?? null}
                        workspaceRootSharedStorageName={driveRoot?.workspaceRootSharedStorageName ?? null}
                        migrationLocked={false}
                        onUpdated={() => void loadStatus(connector.id)}
                        onMigrationStarted={() => {}}
                        firmSlug={orgSlug}
                        firmId={firmId}
                        sectionLabel="Folder"
                      />
                    </div>
                  )}

                  {/* Client attachment management */}
                  <div className="relative z-10 border-t border-[#e5e7eb]">
                    {(() => {
                      // Only show clients attached here or not yet attached to any connector
                      const visibleClients = allClients.filter(c => !c.connectorId || c.connectorId === connector.id)
                      return (
                        <>
                          <div className="pl-12 pr-4 pt-3 pb-1 flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 bg-[#f9f9fb] border border-[#e5e7eb] rounded-[2px] flex items-center justify-center p-1.5">
                              <Users className="w-4 h-4 text-[#45474c]" strokeWidth={1.75} />
                            </div>
                            <div>
                              <p className="text-[0.8125rem] font-bold text-[#1b1b1d] leading-snug">Clients</p>
                              {visibleClients.length > 0 && (
                                <p className="text-xs text-[#9a9ba0] mt-0.5">
                                  {connector.attachedClients.length}/{visibleClients.length} attached
                                </p>
                              )}
                            </div>
                          </div>
                          {visibleClients.length === 0 ? (
                            <p className="pl-[4.75rem] pr-4 pb-3 text-xs text-[#9a9ba0]">No clients available to attach.</p>
                          ) : (
                            <div className="pl-[5.25rem] pr-3 pb-3 flex flex-col gap-0.5">
                              {visibleClients.map(client => {
                                const isAttachedHere = client.connectorId === connector.id
                                const isWorking = attachingClientId === client.id || detachingClientId === client.id
                                return (
                                  <div key={client.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[2px] hover:bg-[#f9f9fb] transition-colors">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {isAttachedHere
                                        ? <SquareCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                        : <Square className="w-3.5 h-3.5 shrink-0 text-[#d1d5db]" />
                                      }
                                      <span className={`text-xs truncate ${isAttachedHere ? 'font-medium text-[#1b1b1d]' : 'text-[#45474c]'}`}>
                                        {client.name}
                                      </span>
                                    </div>
                                    <div className="shrink-0">
                                      {isWorking ? (
                                        <RefreshCw className="w-3.5 h-3.5 text-[#9a9ba0] animate-spin" />
                                      ) : isAttachedHere ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={isSandboxFirm}
                                              onClick={() => void handleDetachClient(connector.id, client.id)}
                                              className="p-1 rounded-[2px] text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <Unlink className="w-3.5 h-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left">Detach from this connector</TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={isSandboxFirm || !driveRoot?.rootFolderId}
                                              onClick={() => void handleAttachClient(connector.id, client.id)}
                                              className="p-1 rounded-[2px] text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                              <Link className="w-3.5 h-3.5" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left">
                                            {!driveRoot?.rootFolderId ? 'Choose a workspace folder before attaching clients' : 'Attach to this connector'}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Connect new account */}
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c] mb-2">
            {connectors.length === 0 ? 'Connect storage account' : 'Add new connection'}
          </p>
          <div className="flex flex-col gap-0.5 border border-[#e5e7eb] rounded-[2px] p-1">
            <div className="flex items-start gap-2.5 px-2.5 py-2.5 rounded-[2px] hover:bg-slate-50 transition-colors">
              <div className="h-8 w-8 shrink-0 bg-white border border-[#e5e7eb] rounded-[2px] flex items-center justify-center p-1.5 mt-0.5">
                {loading ? <RefreshCw className="w-3.5 h-3.5 text-[#45474c] animate-spin" /> : <GoogleDriveProductMark width={18} height={18} />}
              </div>
              <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                <div>
                  <span className="text-[0.8125rem] font-semibold text-[#1b1b1d] leading-snug">{loading ? 'Connecting…' : 'Connect new account'}</span>
                  <span className="text-xs text-[#45474c] block">Sign in with Google Drive</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                    onBlur={() => setFriendlyNameTouched(true)}
                    placeholder='Connection name, e.g. "Acme Corp Drive"'
                    disabled={loading || isSandboxFirm}
                    className="flex-1 rounded-[2px] border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={loading || isSandboxFirm || !friendlyName.trim()}
                    onClick={handleConnect}
                    className="shrink-0 h-7 w-7 rounded-[2px] bg-primary text-white flex items-center justify-center hover:brightness-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  >
                    {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {friendlyNameTouched && !friendlyName.trim() && (
                  <p className="text-[10px] text-red-500">Enter a name before connecting.</p>
                )}
              </div>
            </div>
            <div className="h-px bg-[#f3f4f6] mx-2" />
            <div className="flex items-start gap-2.5 px-2.5 py-2.5 rounded-[2px] cursor-not-allowed opacity-50">
              <div className="h-8 w-8 shrink-0 bg-white border border-[#e5e7eb] rounded-[2px] flex items-center justify-center p-1.5 mt-0.5">
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.25 7.25A6.25 6.25 0 0 1 21.5 10a4.5 4.5 0 0 1-.5 8.996H5a4 4 0 0 1-.68-7.938A6.25 6.25 0 0 1 9.25 7.25Z" fill="#0078D4"/>
                </svg>
              </div>
              <div className="flex flex-col min-w-0 flex-1 gap-0.5 justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-[0.8125rem] font-semibold text-[#1b1b1d] leading-snug">Microsoft OneDrive</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#9a9ba0] border border-[#e5e7eb] rounded-[2px] px-1.5 py-0.5 leading-none">Coming Soon</span>
                </div>
                <span className="text-xs text-[#9a9ba0]">Connect your OneDrive or SharePoint</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        <SwitchAccountModal
          open={switchModalOpen}
          onClose={() => setSwitchModalOpen(false)}
          admins={firmAdmins}
          currentUserId={user?.id}
          loading={loading}
          onConfirm={handleSwitchAccount}
        />

        <ConnectionTestModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          result={testResult}
          connectionName={testModalName}
        />

        {/* Disconnect confirmation */}
        <ConfirmDialog
          open={!!disconnectTarget}
          onOpenChange={(open) => { if (!open) setDisconnectTarget(null) }}
          icon={<Unplug className="h-3.5 w-3.5" />}
          iconVariant="red"
          title="Disconnect Google Drive"
          subtitle="The live session will be revoked."
          description="This will revoke the live session. You can reconnect the same account afterwards."
          confirmLabel="Disconnect"
          confirmVariant="red"
          onCancel={() => setDisconnectTarget(null)}
          onConfirm={() => { const t = disconnectTarget; setDisconnectTarget(null); if (t) void handleDisconnect(t) }}
        />

        {/* Remove confirmation */}
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}
          icon={<Trash2 className="h-3.5 w-3.5" />}
          iconVariant="red"
          title="Remove connector"
          subtitle="This action cannot be undone."
          description="Permanently delete this Google Drive connection. This cannot be undone."
          extra={removeTarget && removeTarget.attachedClients.length > 0 ? (
            <div className="flex gap-2.5 rounded-[2px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>
                This connector is attached to{' '}
                <span className="font-semibold">{removeTarget.attachedClients.map(c => c.name).join(', ')}</span>.
                Removing it will detach all of these clients — they will need a new connector set up.
              </span>
            </div>
          ) : undefined}
          confirmLabel="Remove"
          confirmVariant="red"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => { const t = removeTarget; setRemoveTarget(null); if (t) void handleRemove(t) }}
        />
      </div>
    </TooltipProvider>
  )
}
