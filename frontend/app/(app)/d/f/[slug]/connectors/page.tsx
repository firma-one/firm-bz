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
  Cloud,
  Zap,
  Building2,
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
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5 7.51-3.22-7.52-1.43c.01.69.01 3.52-.02 4.65z" />
          {/* Fallback Cloud Icon if path is complex */}
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      ),
      activeIcon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ),
      connected: false
    },
    {
      id: 'onedrive',
      name: 'OneDrive',
      description: 'Connect your Microsoft OneDrive',
      disabled: true,
      comingLater: true,
      activeIcon: <Cloud className="w-3.5 h-3.5 text-sky-600" />,
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
          { label: "Connectors", icon: <Settings className="h-4 w-4" /> },
        ]}
      />
      <PageHeader
        icon={<Settings className="h-6 w-6" />}
        title="Connectors"
        subtitle="Manage external data sources and file access."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[min(220px,100%)_1fr] gap-8 items-start">
        {isLoadingData ? (
          <>
            {/* Sidebar Skeleton */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-24">
              <div className="p-3 border-b border-gray-100">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="p-2 space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="min-h-[500px] space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm pb-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex gap-4">
                    <Skeleton className="h-14 w-14 rounded-2xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-32 rounded-lg" />
                </div>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-32 rounded-lg" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                  </div>
                  <Skeleton className="h-32 w-full rounded-xl" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Sidebar */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-24">
              <div className="p-3 bg-gray-50/50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                Sources
              </div>
              {connectors.map(connector => {
                const isSelected = !connector.disabled && selectedConnector === connector.id
                return (
                  <button
                    key={connector.id}
                    type="button"
                    disabled={connector.disabled}
                    onClick={() => {
                      if (!connector.disabled) setSelectedConnector(connector.id)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all border-l-2 ${connector.disabled
                      ? 'border-transparent opacity-50 cursor-not-allowed'
                      : isSelected
                        ? 'bg-gray-50 border-gray-900'
                        : 'border-transparent hover:bg-white hover:pl-4'
                      }`}
                  >
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-white shadow-sm ring-1 ring-gray-100' : 'bg-gray-100'
                      }`}>
                      {isSelected ? connector.activeIcon : (
                        <Cloud className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className={`text-xs font-medium block break-words ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                        {connector.name}
                      </span>
                      {connector.comingLater ? (
                        <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600">
                          Coming later
                        </span>
                      ) : null}
                      {connector.id === 'google-drive' && existingConnections.some(c => c.status === 'ACTIVE') && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          <span className="text-[10px] text-gray-400 font-medium">Connected</span>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Main Content */}
            <div className="min-h-[500px] space-y-6">
              {selectedConnector === 'google-drive' ? (
                <TooltipProvider delayDuration={300}>
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-5">
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-14 w-14 shrink-0 bg-white border border-gray-100 rounded-2xl flex items-center justify-center p-3 shadow-sm">
                            <svg className="h-8 w-8" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-xl font-bold text-gray-900">Google Drive</h2>
                            <p className="text-sm text-gray-500 mt-1">
                              Link one Google account. Your workspace uses a single Drive folder as root — point it to My Drive or a Shared Drive anytime.
                            </p>
                          </div>
                        </div>
                        {existingConnections.length === 0 && (
                          <Button
                            onClick={handleConnectGoogleDrive}
                            disabled={loading}
                            className="shrink-0 bg-gray-900 text-white hover:bg-gray-800 rounded-lg shadow-sm"
                          >
                            <SquarePlus className="w-4 h-4 mr-2" />
                            {loading ? 'Connecting...' : 'Connect Google Drive'}
                          </Button>
                        )}
                      </div>

                      <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {existingConnections.length > 1 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide w-full sm:w-auto">Accounts</span>
                            <div className="flex flex-wrap bg-gray-100/80 p-1 rounded-lg gap-1">
                              {existingConnections.map(c => {
                                const isActive = activeAccountId === c.id
                                const isConnected = c.status === 'ACTIVE'
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setActiveAccountId(c.id)}
                                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all ${isActive
                                      ? 'bg-white shadow-sm ring-1 ring-gray-200 text-gray-900'
                                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'
                                      }`}
                                  >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
                                    <span className="truncate max-w-[200px]">{c.email}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {activeConnection ? (
                          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
                            <div className="rounded-xl border-2 border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Connected account</p>
                                  <p className="mt-1 text-lg font-semibold text-gray-900 truncate">
                                    {activeConnection.name || activeConnection.email || 'Google account'}
                                  </p>
                                  {activeConnection.email ? (
                                    <p className="text-sm text-gray-600 truncate">{activeConnection.email}</p>
                                  ) : null}
                                  <div className="mt-3 flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${activeConnection.status === 'ACTIVE'
                                        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                                        : 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
                                        }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${activeConnection.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                      {activeConnection.status === 'ACTIVE' ? 'Connected' : 'Disconnected — reconnect to use Drive'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-2 lg:justify-end">
                                  {activeConnection.status === 'ACTIVE' ? (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="border-gray-300 bg-white justify-start sm:justify-center"
                                            onClick={() => handleTestConnection(activeConnection.id)}
                                            disabled={testingConnection === activeConnection.id}
                                          >
                                            {testingConnection === activeConnection.id ? (
                                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                              <Zap className="w-4 h-4 mr-2" />
                                            )}
                                            Test connection
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs">
                                          Verify that Google accepts the stored tokens for this account.
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="border-gray-300 bg-white text-gray-900 justify-start sm:justify-center"
                                            onClick={() => handleDisconnect(activeConnection.id)}
                                          >
                                            <Unlink className="w-4 h-4 mr-2" />
                                            Disconnect
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs">
                                          Revoke the live session. You can reconnect the same account later without removing the connector row.
                                        </TooltipContent>
                                      </Tooltip>
                                    </>
                                  ) : (
                                    <>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="default"
                                            size="sm"
                                            className="bg-gray-900 text-white hover:bg-gray-800 justify-start sm:justify-center"
                                            onClick={() => handleConnectGoogleDrive()}
                                          >
                                            <Link className="w-4 h-4 mr-2" />
                                            Reconnect
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-xs">
                                          Open Google sign-in again to restore access for this connector.
                                        </TooltipContent>
                                      </Tooltip>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {activeConnection.status === 'ACTIVE' ? (
                              <GoogleDriveWorkspaceRoot
                                connectionId={activeConnection.id}
                                accessToken={session?.access_token}
                                rootFolderId={driveRoot?.rootFolderId}
                                rootFolderName={driveRoot?.rootFolderName}
                                workspaceRootLocation={driveRoot?.workspaceRootLocation ?? null}
                                workspaceRootSharedDriveName={driveRoot?.workspaceRootSharedDriveName ?? null}
                                onUpdated={refreshDriveStatus}
                              />
                            ) : (
                              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-6 text-center text-sm text-amber-950/90">
                                <span className="font-medium">Reconnect</span> Google Drive above to view or change your workspace folder.
                              </div>
                            )}
                          </div>
                        ) : existingConnections.length === 0 ? (
                          <div className="text-center py-14 bg-gray-50 rounded-xl border border-dashed border-gray-200 px-4">
                            <p className="text-gray-700 text-sm font-medium">No Google account linked yet</p>
                            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
                              Use <span className="font-medium text-gray-700">Connect Google Drive</span> above to link an account and choose your workspace folder.
                            </p>
                          </div>
                        ) : (
                          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-gray-500 text-sm">Select an account above to view details</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TooltipProvider>
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] border border-dashed border-gray-200 rounded-xl bg-gray-50">
                  <div className="h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4">
                    <Settings className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-gray-900 font-medium">Coming Soon</h3>
                  <p className="text-gray-500 text-sm mt-1">This integration is under development.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConnectionTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        result={connectionTestResult}
        connectionName={activeConnection?.name || 'Google Drive'}
      />
    </div>
  )
}