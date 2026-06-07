"use client"

import { useState, useEffect, useCallback, useRef, use } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Settings,
  Building2,
  Plug,
} from "lucide-react"
import { GoogleDriveConnection } from "@/lib/types"
import type { WorkspaceRootLocation } from "@prisma/client"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "@/components/ui/toast"
import { ConnectionTestModal } from "@/components/ui/connection-test-modal"
import { createClient } from '@supabase/supabase-js'
import { sendEvent, ANALYTICS_EVENTS } from "@/lib/analytics"
import {
  initiateGoogleDriveOAuthPopup,
  startGoogleDriveOAuthPopup,
  googleDriveOAuthPopupFailureMessage,
} from "@/lib/google-drive-popup-oauth"
import { PageBreadcrumb } from "@/components/ui/page-breadcrumb"
import { PageHeader } from "@/components/ui/page-header"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { GoogleDriveConnectorTab } from "@/components/connectors/google-drive-connector-tab"
import type { FirmAdmin } from "@/components/connectors/switch-account-modal"

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
  const [migrationActive, setMigrationActive] = useState(false)
  const [failedFileCount, setFailedFileCount] = useState(0)
  const [latestMigrationStatus, setLatestMigrationStatus] = useState<string | null>(null)
  const [switchModalOpen, setSwitchModalOpen] = useState(false)
  const [firmAdmins, setFirmAdmins] = useState<FirmAdmin[]>([])
  const hasLoadedDataRef = useRef(false)
  /** Dedupe Google OAuth return handling (e.g. React Strict Mode double effect). */
  const oauthReturnHandledKeyRef = useRef<string | null>(null)
  const searchParams = useSearchParams()

  const activeConnection = existingConnections.find(c => c.id === activeAccountId)
  const { addToast } = useToast()
  const [driveRoot, setDriveRoot] = useState<{
    rootFolderId?: string
    rootFolderName: string | null
    workspaceRootLocation: WorkspaceRootLocation | null
    workspaceRootSharedStorageName: string | null
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
        workspaceRootSharedStorageName: d.connector.workspaceRootSharedStorageName ?? null,
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
          if (d.active) setMigrationActive(true)
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

  const handleOpenSwitchModal = useCallback(async () => {
    if (!organizationId || !session?.access_token) return
    try {
      const res = await fetch(`/api/firms/${organizationId}/admins`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setFirmAdmins(data.admins ?? [])
      }
    } catch {
      // Non-fatal — modal still opens with empty list
    }
    setSwitchModalOpen(true)
  }, [organizationId, session?.access_token])

  const handleSwitchAccount = useCallback(async (selectedEmail: string) => {
    if (!user?.id || !activeAccountId) return
    setSwitchModalOpen(false)
    setLoading(true)

    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    let authUrl: string
    let oauthNonce: string | undefined
    try {
      const resp = await fetch('/api/connectors/google-drive', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'initiate',
          userId: user.id,
          organizationId,
          next: `/d/f/${slug}/connectors`,
          flow: 'popup',
          email: selectedEmail,
          replaceConnectorId: activeAccountId,
        }),
      })
      if (!resp.ok) throw new Error('Failed to initiate switch OAuth')
      const data = await resp.json()
      authUrl = data.authUrl
      oauthNonce = data.nonce
    } catch (e) {
      setLoading(false)
      addToast({ type: 'error', title: 'Switch failed', message: e instanceof Error ? e.message : 'Could not start switch flow' })
      return
    }

    const getAccessToken = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      return s?.access_token ?? null
    }

    startGoogleDriveOAuthPopup(
      authUrl,
      oauthNonce,
      {
        getAccessToken,
        async onMessageSuccess({ connectionId, email }) {
          hasLoadedDataRef.current = false
          setIsLoadingData(false)
          await loadOrganizationAndConnections(true)
          if (connectionId) setActiveAccountId(connectionId)
          addToast({ type: 'success', title: 'Account switched', message: email ? `Now connected as ${email}` : 'Google account was switched successfully.' })
        },
        async onPollSuccess(connector) {
          hasLoadedDataRef.current = false
          setIsLoadingData(false)
          await loadOrganizationAndConnections(true)
          if (connector.id) setActiveAccountId(connector.id)
          addToast({ type: 'success', title: 'Account switched', message: connector.name ? `Now connected as ${connector.name}` : 'Google account was switched successfully.' })
        },
        onMessageFailure(code) {
          addToast({ type: 'error', title: 'Switch failed', message: googleDriveOAuthPopupFailureMessage(code) })
        },
        onTimeout() {
          addToast({ type: 'error', title: 'Sign-in timed out', message: 'Timed out waiting for Google. Please try again.' })
        },
        onFlowEnd() { setLoading(false) },
      },
      { logLabel: 'connectors-switch' }
    )
  }, [user?.id, session?.access_token, activeAccountId, organizationId, slug, loadOrganizationAndConnections, addToast])

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

        {/* Google Drive tab — extracted component */}
        <GoogleDriveConnectorTab
          isLoadingData={isLoadingData}
          existingConnections={existingConnections}
          activeAccountId={activeAccountId}
          activeConnection={activeConnection}
          driveRoot={driveRoot}
          organizationId={organizationId}
          migrationPending={migrationPending}
          migrationActive={migrationActive}
          latestMigrationStatus={latestMigrationStatus}
          failedFileCount={failedFileCount}
          testingConnection={testingConnection}
          loading={loading}
          session={session}
          switchModalOpen={switchModalOpen}
          firmAdmins={firmAdmins}
          currentUserId={user?.id}
          onSetSwitchModalOpen={(open) => { if (open) handleOpenSwitchModal(); else setSwitchModalOpen(false) }}
          onSetActiveAccountId={setActiveAccountId}
          onConnectGoogleDrive={handleConnectGoogleDrive}
          onSwitchAccount={handleSwitchAccount}
          onDisconnect={handleDisconnect}
          onTestConnection={handleTestConnection}
          onRefreshDriveStatus={refreshDriveStatus}
          onMigrationStarted={() => {
            setMigrationPending(true)
          }}
          onSetMigrationPending={setMigrationPending}
          firmSlug={slug}
        />

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

    </div>
  )
}