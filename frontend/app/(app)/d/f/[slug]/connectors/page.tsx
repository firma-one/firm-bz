"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SquarePlus,
  Settings,
  RefreshCw,
  Unlink,
  Link,
  Zap,
  Building2,
  Plug,
  Info,
} from "lucide-react"
import { GoogleDriveConnection } from "@/lib/types"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/components/ui/toast"
import { ConnectionTestModal } from "@/components/ui/connection-test-modal"
import { GoogleDriveWorkspaceRoot } from "@/components/google-drive/google-drive-workspace-root"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from '@supabase/supabase-js'
import { sendEvent, ANALYTICS_EVENTS } from "@/lib/analytics"
import {
  initiateGoogleDriveOAuthPopup,
  startGoogleDriveOAuthPopup,
  googleDriveOAuthPopupFailureMessage,
} from "@/lib/google-drive-popup-oauth"
import { PageBreadcrumb } from "@/components/ui/page-breadcrumb"
import { PageHeader } from "@/components/ui/page-header"
import { GoogleDriveIcon, GoogleDriveProductMark } from "@/components/ui/google-drive-icon"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AppShellHintStrip } from "@/components/layout/app-shell-hint-strip"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ConnectorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const { user, session } = useAuth()

  const [selectedConnector, setSelectedConnector] = useState<string | null>('google-drive')
  const [existingConnections, setExistingConnections] = useState<GoogleDriveConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [connectionTestResult, setConnectionTestResult] = useState<any>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTestModalOpen, setIsTestModalOpen] = useState(false)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [failedFileCount, setFailedFileCount] = useState(0)
  const [latestMigrationStatus, setLatestMigrationStatus] = useState<string | null>(null)
  const hasLoadedDataRef = useRef(false)
  /** Dedupe Google OAuth return handling (e.g. React Strict Mode double effect). */
  const oauthReturnHandledKeyRef = useRef<string | null>(null)
  const searchParams = useSearchParams()

  const activeConnection = existingConnections.find(c => c.id === activeAccountId)
  const { addToast } = useToast()
  const [driveRoot, setDriveRoot] = useState<{
    rootFolderId?: string
    rootFolderName: string | null
    workspaceRootLocation: 'MY_DRIVE' | 'SHARED_DRIVE' | null
    workspaceRootSharedDriveName: string | null
  } | null>(null)

  const refreshDriveStatus = useCallback(async () => {
    if (!session?.access_token || !activeAccountId) return
    const ac = existingConnections.find(c => c.id === activeAccountId)
    if (!ac || ac.status !== 'ACTIVE') {
      setDriveRoot(null)
      return
    }
    const r = await fetch(
      `/api/connectors/google-drive?action=status&connectionId=${encodeURIComponent(activeAccountId)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    )
    if (!r.ok) return
    const d = await r.json()
    if (d.connector) {
      setDriveRoot({
        rootFolderId: d.connector.rootFolderId,
        rootFolderName: d.connector.rootFolderName ?? null,
        workspaceRootLocation: d.connector.workspaceRootLocation ?? null,
        workspaceRootSharedDriveName: d.connector.workspaceRootSharedDriveName ?? null,
      })
    } else {
      setDriveRoot(null)
    }
  }, [session?.access_token, activeAccountId, existingConnections])

  useEffect(() => {
    void refreshDriveStatus()
  }, [refreshDriveStatus])

  // Handle OAuth callback results

  const loadOrganizationAndConnections = useCallback(async (showToastOnError = true) => {
    // Prevent multiple loads
    if (isLoadingData || hasLoadedDataRef.current) return

    setIsLoadingData(true)
    hasLoadedDataRef.current = true

    try {
      const token = session?.access_token

      if (!token) {
        return
      }

      // Use the slug from URL params if available
      const orgUrl = slug ? `/api/firm?slug=${slug}` : '/api/firm'

      const orgResponse = await fetch(orgUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!orgResponse.ok) throw new Error('Failed to load organization')

      const data = await orgResponse.json()
      // GET /api/firm returns { firm }; keep organization fallback for older callers
      const organization = data.firm ?? data.organization
      if (!organization) throw new Error('Organization not found')

      if (!organization.id) throw new Error('Organization ID is missing')
      setOrganizationId(organization.id)
      setOrgName(organization.name ?? null)

      // Check DB for pending migration state and any failed files from last migration
      fetch(`/api/firm/maintenance?firmId=${organization.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return
          if (d.migrationPending) setMigrationPending(true)
          if (d.latestMigrationStatus) setLatestMigrationStatus(d.latestMigrationStatus)
          if (typeof d.failedFileCount === 'number') setFailedFileCount(d.failedFileCount)
        })
        .catch(() => {})

      const connUrl = `/api/connectors?organizationId=${organization.id}`

      const connResponse = await fetch(connUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!connResponse.ok) throw new Error('Failed to load connections')

      const connData = await connResponse.json()
      const connections = connData.data || []
      setExistingConnections(connections)
      if (connections.length > 0 && !activeAccountId) {
        setActiveAccountId(connections[0].id)
      }
    } catch (error) {
      if (showToastOnError) {
        addToast({ type: 'error', title: 'Loading Failed', message: 'Failed to load data' })
      }
    } finally {
      setIsLoadingData(false)
    }
  }, [addToast, isLoadingData, slug, session])

  const refreshConnections = useCallback(async () => {
    setIsRefreshing(true)
    hasLoadedDataRef.current = false
    setIsLoadingData(false)
    // Force reload by calling verify immediately
    try {
      await loadOrganizationAndConnections(true)
      addToast({ type: 'success', title: 'Refreshed', message: 'Connection status updated.' })
    } finally {
      setIsRefreshing(false)
    }
  }, [addToast, loadOrganizationAndConnections])

  useEffect(() => {
    if (!user) return

    const success = searchParams.get('success')
    if (success === 'google_drive_connected') {
      const dedupeKey = searchParams.toString()
      if (oauthReturnHandledKeyRef.current === dedupeKey) return
      oauthReturnHandledKeyRef.current = dedupeKey

      hasLoadedDataRef.current = false
      void (async () => {
        await loadOrganizationAndConnections(true)
        const email = searchParams.get('email')
        addToast({
          type: 'success',
          title: 'Google Drive connected',
          message: email
            ? `Connected as ${decodeURIComponent(email)}`
            : 'Your account was linked successfully.',
        })
        router.replace(`/d/f/${slug}/connectors`, { scroll: false })
      })()
      return
    }

    if (!hasLoadedDataRef.current) {
      loadOrganizationAndConnections()
    }
  }, [user, slug, router, searchParams, loadOrganizationAndConnections, addToast])

  const connectors = [
    {
      id: 'google-drive',
      name: 'Google Drive',
      description: 'Connect your Google Drive to access documents and folders',
      disabled: false,
      comingLater: false,
      icon: <GoogleDriveIcon size={20} />,
      activeIcon: <GoogleDriveIcon size={20} />,
      connected: false
    },
    {
      id: 'onedrive',
      name: 'OneDrive',
      description: 'Connect your Microsoft OneDrive',
      disabled: true,
      comingLater: true,
      activeIcon: <div className="h-4 w-4 bg-sky-100 text-sky-600 rounded flex items-center justify-center text-[9px] font-bold">O</div>,
      connected: false
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      description: 'Access your Dropbox files',
      disabled: true,
      comingLater: true,
      activeIcon: <div className="h-5 w-5 bg-blue-600/20 text-blue-600 rounded flex items-center justify-center text-[10px] font-bold">D</div>,
      connected: false
    },
    {
      id: 'box',
      name: 'Box',
      description: 'Connect to your Box account',
      disabled: true,
      comingLater: true,
      activeIcon: <div className="h-5 w-5 bg-blue-500/20 text-blue-500 rounded flex items-center justify-center text-[10px] font-bold">B</div>,
      connected: false
    }
  ]

  const handleConnectGoogleDrive = useCallback(async () => {
    if (!user?.id) {
      addToast({ type: 'error', title: 'Sign in required', message: 'Please sign in to connect Google Drive.' })
      return
    }

    sendEvent({
      action: ANALYTICS_EVENTS.ADD_CONNECTOR_START,
      category: 'Integration',
      label: 'Google Drive Start',
    })

    setLoading(true)

    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }

    let authUrl: string
    let oauthNonce: string | undefined
    try {
      const out = await initiateGoogleDriveOAuthPopup({
        userId: user.id,
        organizationId,
        next: `/d/f/${slug}/connectors`,
        headers,
      })
      authUrl = out.authUrl
      oauthNonce = out.nonce
    } catch (e) {
      setLoading(false)
      addToast({
        type: 'error',
        title: 'Connection Failed',
        message: e instanceof Error ? e.message : 'Failed to initiate connection',
      })
      return
    }

    const getAccessToken = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      return s?.access_token ?? null
    }

    const afterConnect = async (connectionId?: string | null, displayName?: string | null) => {
      hasLoadedDataRef.current = false
      setIsLoadingData(false)
      await loadOrganizationAndConnections(true)
      if (connectionId) setActiveAccountId(connectionId)
      addToast({
        type: 'success',
        title: 'Google Drive connected',
        message: displayName
          ? `Connected as ${displayName}`
          : 'Your account was linked successfully.',
      })
    }

    startGoogleDriveOAuthPopup(
      authUrl,
      oauthNonce,
      {
        getAccessToken,
        async onMessageSuccess({ connectionId, email }) {
          await afterConnect(connectionId ?? null, email ?? null)
        },
        async onPollSuccess(connector) {
          await afterConnect(connector.id, connector.name ?? null)
        },
        onMessageFailure(code) {
          addToast({
            type: 'error',
            title: 'Connection failed',
            message: googleDriveOAuthPopupFailureMessage(code),
          })
        },
        onTimeout() {
          addToast({
            type: 'error',
            title: 'Sign-in timed out',
            message: 'Timed out waiting for Google. Please try again.',
          })
        },
        onFlowEnd() {
          setLoading(false)
        },
      },
      { logLabel: 'connectors' }
    )
  }, [
    user?.id,
    session?.access_token,
    organizationId,
    slug,
    loadOrganizationAndConnections,
    addToast,
  ])

  const handleDisconnect = async (connectionId: string) => {
    try {
      if (!session?.access_token) return
      await fetch('/api/connectors', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId })
      })
      setExistingConnections(prev => prev.map(c => c.id === connectionId ? { ...c, status: 'REVOKED' as const } : c))
      addToast({ type: 'success', title: 'Disconnected', message: 'Account disconnected successfully' })
    } catch (error) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to disconnect' })
    }
  }

  const handleTestConnection = async (connectionId: string) => {
    setTestingConnection(connectionId)
    // Clear previous results
    setConnectionTestResult(null)

    try {
      const response = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', connectionId })
      })

      if (!response.ok) throw new Error('Test failed')
      const result = await response.json()
      setConnectionTestResult(result)
      setIsTestModalOpen(true)
    } catch (error) {
      addToast({ type: 'error', title: 'Test Failed', message: 'Could not verify connection.' })
    } finally {
      setTestingConnection(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageBreadcrumb
        items={[
          { label: orgName ?? 'Firm', href: `/d/f/${slug}`, icon: <Building2 className="h-4 w-4" /> },
          { label: "Connectors", icon: <Plug className="h-4 w-4" /> },
        ]}
      />
      <PageHeader
        icon={<Plug className="h-6 w-6" />}
        title="Connectors"
        subtitle="Manage external data sources and file access."
      />

      <Tabs value={selectedConnector ?? 'google-drive'} onValueChange={setSelectedConnector}>
        {/* Horizontal tab bar — matches project/engagement style */}
        <div className="mb-6 min-w-0 w-full overflow-x-auto">
          {isLoadingData ? (
            <div className="bg-white border border-[#e5e7eb] rounded h-14 flex items-center px-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-24 rounded-[2px]" />)}
            </div>
          ) : (
            <div className="bg-white border border-[#e5e7eb] rounded shrink-0">
              <div className="flex items-center h-14 min-w-0 overflow-x-auto">
                <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0 shrink-0">
                  {connectors.map(connector => (
                    <TabsTrigger
                      key={connector.id}
                      value={connector.id}
                      disabled={connector.disabled}
                      className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent transition-all shadow-none bg-transparent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <span className="flex items-center justify-center w-4 h-4 shrink-0">
                        {connector.icon ?? connector.activeIcon}
                      </span>
                      {connector.name}
                      {connector.comingLater && (
                        <span className="font-mono rounded-sm bg-[#e5e7eb] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#45474c] tabular-nums leading-none">
                          Soon
                        </span>
                      )}
                      {connector.id === 'google-drive' && existingConnections.some(c => c.status === 'ACTIVE') && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>
          )}
        </div>

        {/* Google Drive tab — single unified card with sections */}
        <TabsContent value="google-drive" className="mt-0">
          {isLoadingData ? (
            <div className="rounded-[2px] border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-[#e5e7eb]">
                <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
                <div className="space-y-2 flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-56" /></div>
              </div>
              <div className="px-5 py-4 border-b border-[#e5e7eb] space-y-3"><Skeleton className="h-3 w-14" /><Skeleton className="h-14 w-full rounded-[2px]" /></div>
              <div className="px-5 py-4 space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-14 w-full rounded-[2px]" /></div>
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="rounded-[2px] border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">

                  {/* Header */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 bg-white border border-[#e5e7eb] rounded-[2px] flex items-center justify-center p-2 shadow-sm">
                        <GoogleDriveProductMark width={24} height={24} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[0.8125rem] font-bold text-[#1b1b1d] leading-snug">Google Drive</h2>
                        <p className="text-xs text-[#45474c] mt-0.5 leading-snug">Link a Google account and set a workspace folder as root.</p>
                      </div>
                    </div>
                    {existingConnections.length === 0 && (
                      <Button onClick={handleConnectGoogleDrive} disabled={loading} className="shrink-0 h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5">
                        <SquarePlus className="w-3.5 h-3.5" />
                        {loading ? 'Connecting...' : 'Connect'}
                      </Button>
                    )}
                  </div>

                  {/* Google Workspace tip */}
                  <div className="border-t border-[#e5e7eb] px-5 py-3">
                    <div className="flex gap-2.5 rounded-[2px] border border-primary/25 bg-primary/8 px-3.5 py-3 text-xs text-[#1b1b1d]">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                      <p className="leading-relaxed">
                        <span className="font-bold text-primary">Google Workspace?</span> We recommend connecting with a dedicated service account not tied to any individual user — so your firm&apos;s Drive access isn&apos;t disrupted if someone leaves.{' '}
                        <a
                          href="https://support.google.com/a/answer/7378726"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-primary hover:text-primary/80 transition-colors font-medium"
                        >
                          How to create a service account →
                        </a>
                      </p>
                    </div>
                  </div>

                  {/* Multi-account switcher */}
                  {existingConnections.length > 1 && (
                    <div className="border-t border-[#e5e7eb] px-5 py-3 bg-gray-50/50">
                      <div className="flex flex-wrap bg-[#f9f9fb] border border-[#e5e7eb] p-1 rounded-[2px] gap-1">
                        {existingConnections.map(c => {
                          const isActive = activeAccountId === c.id
                          const isConnected = c.status === 'ACTIVE'
                          return (
                            <button key={c.id} type="button" onClick={() => setActiveAccountId(c.id)}
                              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[2px] transition-all ${isActive ? 'bg-white shadow-sm border border-[#e5e7eb] text-[#1b1b1d]' : 'text-[#45474c] hover:text-[#1b1b1d] hover:bg-white/60'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-primary' : 'bg-red-400'}`} />
                              <span className="truncate max-w-[200px]">{c.email}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {activeConnection ? (
                    <div className="animate-in fade-in zoom-in-95 duration-200">

                      {/* Account section */}
                      <div className="border-t border-[#e5e7eb]">
                        <div className="px-5 pt-4 pb-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Account</p>
                        </div>
                        <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 ${activeConnection.status !== 'ACTIVE' ? 'bg-amber-50/30' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-9 w-9 rounded-[2px] shrink-0">
                              <AvatarFallback className="rounded-[2px] bg-[#f9f9fb] border border-[#e5e7eb] text-sm font-bold text-[#45474c] uppercase select-none">
                                {(activeConnection.name || activeConnection.email || 'G').charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-[0.8125rem] font-bold text-[#1b1b1d] truncate leading-snug">
                                {activeConnection.name || activeConnection.email || 'Google account'}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeConnection.status === 'ACTIVE' ? 'bg-primary' : 'bg-amber-400'}`} />
                                <p className={`text-xs ${activeConnection.status === 'ACTIVE' ? 'text-[#45474c]' : 'text-amber-700'}`}>
                                  {activeConnection.status === 'ACTIVE' ? (activeConnection.email || 'Connected') : 'Disconnected'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {activeConnection.status === 'ACTIVE' ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="outline" size="sm"
                                      className="h-8 px-3 text-xs border-[#e5e7eb] bg-white text-[#45474c] hover:bg-[#f9f9fb] hover:text-[#1b1b1d] rounded-[2px]"
                                      onClick={() => handleTestConnection(activeConnection.id)}
                                      disabled={testingConnection === activeConnection.id}>
                                      {testingConnection === activeConnection.id
                                        ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                                      Test
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">Verify that Google accepts the stored tokens for this account.</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="outline" size="sm"
                                      className="h-8 px-3 text-xs bg-primary text-white border-primary hover:bg-primary hover:brightness-105 hover:text-white rounded-[2px]"
                                      onClick={() => handleDisconnect(activeConnection.id)}>
                                      <Unlink className="w-3.5 h-3.5 mr-1.5" />Disconnect
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">Revoke the live session. You can reconnect the same account later.</TooltipContent>
                                </Tooltip>
                              </>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" size="sm"
                                    className="h-8 px-3 text-xs bg-primary text-white hover:bg-primary hover:brightness-105 hover:text-white rounded-[2px] border-0"
                                    onClick={() => handleConnectGoogleDrive()}>
                                    <Link className="w-3.5 h-3.5 mr-1.5" />Reconnect
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">Open Google sign-in again to restore access.</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Workspace section */}
                      <div className="border-t border-[#e5e7eb]">
                        <div className="px-5 pt-4 pb-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45474c]">Workspace</p>
                        </div>
                        {activeConnection.status === 'ACTIVE' ? (
                          <div className="px-5 pb-5">
                            <GoogleDriveWorkspaceRoot
                              connectionId={activeConnection.id}
                              accessToken={session?.access_token}
                              rootFolderId={driveRoot?.rootFolderId}
                              rootFolderName={driveRoot?.rootFolderName}
                              workspaceRootLocation={driveRoot?.workspaceRootLocation ?? null}
                              workspaceRootSharedDriveName={driveRoot?.workspaceRootSharedDriveName ?? null}
                              onUpdated={refreshDriveStatus}
                              onMigrationStarted={() => {
                                setMigrationPending(true)
                                // Re-verify from DB shortly after API call persists
                                setTimeout(() => {
                                  if (!organizationId || !session?.access_token) return
                                  fetch(`/api/firm/maintenance?firmId=${organizationId}`, {
                                    headers: { Authorization: `Bearer ${session.access_token}` },
                                  })
                                    .then(r => r.ok ? r.json() : null)
                                    .then(d => { if (d?.migrationPending) setMigrationPending(true) })
                                    .catch(() => {})
                                }, 1500)
                              }}
                            />
                          </div>
                        ) : (
                          <div className="mx-5 mb-5 rounded-[2px] border border-dashed border-amber-200 bg-amber-50/40 px-4 py-5 text-center text-sm text-amber-950/90">
                            <span className="font-medium">Reconnect</span> Google Drive above to view or change your workspace folder.
                          </div>
                        )}
                      </div>
                      {/* Failed migration files warning */}
                      {latestMigrationStatus === 'failed_partial' && failedFileCount > 0 && (
                        <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-900">
                              {failedFileCount} {failedFileCount === 1 ? 'file' : 'files'} could not be migrated
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              Some files failed to move during the last workspace migration.{' '}
                              <a
                                href="mailto:support@pockett.app?subject=Workspace%20migration%20failed%20files"
                                className="underline underline-offset-2 font-medium hover:text-amber-900"
                              >
                                Contact support
                              </a>{' '}
                              to resolve this.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : existingConnections.length === 0 ? (
                    <div className="border-t border-[#e5e7eb] text-center py-14 px-4">
                      <div className="h-10 w-10 mx-auto mb-3 bg-white rounded-xl border border-[#e5e7eb] shadow-sm flex items-center justify-center">
                        <GoogleDriveIcon size={20} />
                      </div>
                      <p className="text-[#1b1b1d] text-[0.8125rem] font-bold">No account linked yet</p>
                      <p className="text-[#45474c] text-xs mt-1 max-w-sm mx-auto">Connect Google Drive to link an account and set your workspace folder.</p>
                    </div>
                  ) : (
                    <div className="border-t border-[#e5e7eb] text-center py-12">
                      <p className="text-[#45474c] text-xs">Select an account above to view details</p>
                    </div>
                  )}
                </div>
              </div>
            </TooltipProvider>
          )}
        </TabsContent>

        {/* Coming soon tabs */}
        {['onedrive', 'dropbox', 'box'].map(id => (
          <TabsContent key={id} value={id} className="mt-0">
            <div className="flex flex-col items-center justify-center h-[400px] border border-dashed border-[#e5e7eb] rounded-[2px] bg-[#f9f9fb]">
              <div className="h-12 w-12 bg-white rounded-xl border border-[#e5e7eb] shadow-sm flex items-center justify-center mb-4">
                <Settings className="h-6 w-6 text-[#45474c]" />
              </div>
              <h3 className="text-[#1b1b1d] font-bold text-[0.8125rem]">Coming Soon</h3>
              <p className="text-[#45474c] text-xs mt-1">This integration is under development.</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <ConnectionTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        result={connectionTestResult}
        connectionName={activeConnection?.name || 'Google Drive'}
      />

      {migrationPending && (
        <AppShellHintStrip
          accent="amber"
          title="Workspace maintenance starting in ~2 min"
          description="A grace period is active — save your work. The workspace will be locked while files are migrated to the new folder."
          actions={
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMigrationPending(false)}>
              Dismiss
            </Button>
          }
        />
      )}
    </div>
  )
}