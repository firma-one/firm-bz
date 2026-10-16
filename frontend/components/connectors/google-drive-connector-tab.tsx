"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SquarePlus,
  Unlink,
  Link,
  Zap,
  Info,
  SwitchCamera,
  RefreshCw,
} from "lucide-react"
import { GoogleDriveConnection } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { GoogleDriveWorkspaceRoot } from "@/components/google-drive/google-drive-workspace-root"
import { GoogleDriveIcon, GoogleDriveProductMark } from "@/components/ui/google-drive-icon"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { TabsContent } from "@/components/ui/tabs"
import { SwitchAccountModal, type FirmAdmin } from "@/components/connectors/switch-account-modal"
import { initialsOf } from '@/lib/initials'

type DriveRoot = {
  rootFolderId?: string
  rootFolderName: string | null
  workspaceRootLocation: 'PERSONAL' | 'SHARED' | null
  workspaceRootSharedStorageName: string | null
} | null

type GoogleDriveConnectorTabProps = {
  isLoadingData: boolean
  existingConnections: GoogleDriveConnection[]
  activeAccountId: string | null
  activeConnection: GoogleDriveConnection | undefined
  driveRoot: DriveRoot
  organizationId: string | null
  migrationPending: boolean
  migrationActive: boolean
  latestMigrationStatus: string | null
  failedFileCount: number
  testingConnection: string | null
  loading: boolean
  session: { access_token?: string } | null | undefined
  switchModalOpen: boolean
  firmAdmins: FirmAdmin[]
  currentUserId: string | undefined
  onSetSwitchModalOpen: (open: boolean) => void
  onSetActiveAccountId: (id: string) => void
  onConnectGoogleDrive: () => void
  onSwitchAccount: (selectedEmail: string) => void
  onDisconnect: (connectionId: string) => void
  onTestConnection: (connectionId: string) => void
  onRefreshDriveStatus: () => void
  onMigrationStarted: () => void
  onSetMigrationPending: (pending: boolean) => void
  firmSlug: string
}

export function GoogleDriveConnectorTab({
  isLoadingData,
  existingConnections,
  activeAccountId,
  activeConnection,
  driveRoot,
  organizationId: _organizationId,
  migrationPending,
  migrationActive,
  latestMigrationStatus,
  failedFileCount,
  testingConnection,
  loading,
  session,
  switchModalOpen,
  firmAdmins,
  currentUserId,
  onSetSwitchModalOpen,
  onSetActiveAccountId,
  onConnectGoogleDrive,
  onSwitchAccount,
  onDisconnect,
  onTestConnection,
  onRefreshDriveStatus,
  onMigrationStarted,
  onSetMigrationPending: _onSetMigrationPending,
  firmSlug,
}: GoogleDriveConnectorTabProps) {
  const isPersonalDrive = driveRoot?.workspaceRootLocation !== 'SHARED'
  const isMigrationLocked = migrationPending || migrationActive

  return (
    <>
      <TabsContent value="google-drive" className="mt-0">
        {isLoadingData ? (
          <div className="rounded border border-line bg-surface shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-4 border-b border-line">
              <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
              <div className="space-y-2 flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-56" /></div>
            </div>
            <div className="px-5 py-4 border-b border-line space-y-3"><Skeleton className="h-3 w-14" /><Skeleton className="h-14 w-full rounded" /></div>
            <div className="px-5 py-4 space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-14 w-full rounded" /></div>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="rounded border border-line bg-surface shadow-sm overflow-hidden">

                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 bg-surface border border-line rounded flex items-center justify-center p-2 shadow-sm">
                      <GoogleDriveProductMark width={24} height={24} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[0.8125rem] font-bold text-fg leading-snug">Google Drive</h2>
                      <p className="text-xs text-fg-muted mt-0.5 leading-snug">Link a Google account and set a workspace folder as root.</p>
                    </div>
                  </div>
                  {existingConnections.length === 0 && (
                    <Button onClick={onConnectGoogleDrive} disabled={loading} className="shrink-0 h-auto px-4 py-1.5 rounded bg-primary text-white hover:bg-primary hover:text-white shadow-sm transition-all border-0 inline-flex items-center gap-1.5">
                      <SquarePlus className="w-3.5 h-3.5" />
                      {loading ? 'Connecting...' : 'Connect'}
                    </Button>
                  )}
                </div>

                {/* Multi-account switcher */}
                {existingConnections.length > 1 && (
                  <div className="border-t border-line px-5 py-3 bg-gray-50/50">
                    <div className="flex flex-wrap bg-surface-subtle border border-line p-1 rounded gap-1">
                      {existingConnections.map(c => {
                        const isActive = activeAccountId === c.id
                        const isConnected = c.status === 'ACTIVE'
                        return (
                          <button key={c.id} type="button" onClick={() => onSetActiveAccountId(c.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-all ${isActive ? 'bg-surface shadow-sm border border-line text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/60'}`}>
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
                    <div className="border-t border-line">
                      <div className="px-5 pt-3.5 pb-2">
                        <p className="text-small font-medium text-fg-muted">Account</p>
                      </div>
                      <div className={`mx-5 mb-4 rounded border border-line ${activeConnection.status !== 'ACTIVE' ? 'bg-amber-50/40' : 'bg-[#f9f9fb]/60'}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-9 w-9 shrink-0 rounded-full">
                              <AvatarFallback className="rounded-full bg-surface-muted text-small font-medium text-fg-muted select-none">
                                {initialsOf(activeConnection.name || activeConnection.email, 'G')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-[0.8125rem] font-bold text-fg truncate leading-snug">
                                {activeConnection.name || activeConnection.email || 'Google account'}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeConnection.status === 'ACTIVE' ? 'bg-primary' : 'bg-amber-400'}`} />
                                <p className={`text-xs ${activeConnection.status === 'ACTIVE' ? 'text-fg-muted' : 'text-tag-yellow-fg'}`}>
                                  {activeConnection.status === 'ACTIVE' ? (activeConnection.email || 'Connected') : 'Disconnected'}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {activeConnection.status === 'ACTIVE' ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="outline" size="sm"
                                      className="h-8 px-3 text-xs border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg rounded"
                                      onClick={() => onTestConnection(activeConnection.id)}
                                      disabled={testingConnection === activeConnection.id || isMigrationLocked}>
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
                                    <span tabIndex={isPersonalDrive ? 0 : undefined} className={isPersonalDrive ? 'cursor-not-allowed' : undefined}>
                                      <Button type="button" variant="outline" size="sm"
                                        className="h-8 px-3 text-xs border-line bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg rounded"
                                        onClick={() => onSetSwitchModalOpen(true)}
                                        disabled={loading || isPersonalDrive || isMigrationLocked}>
                                        <SwitchCamera className="w-3.5 h-3.5 mr-1.5" />Switch
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    {isPersonalDrive ? (
                                      <>
                                        Switching accounts on a personal Drive connection requires re-setting up your workspace. Use a Shared Drive to enable account switching, or contact{' '}
                                        <a
                                          href={`/d/support?firmSlug=${firmSlug}`}
                                          className="underline underline-offset-2 text-primary hover:text-primary/80 transition-colors font-medium"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Support
                                        </a>
                                        .
                                      </>
                                    ) : (
                                      "Switch to a different firm administrator's Google account."
                                    )}
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="outline" size="sm"
                                      className="h-8 px-3 text-xs border-line bg-surface text-tag-red-fg hover:bg-tag-red-bg hover:text-tag-red-fg hover:border-tag-red-bg rounded"
                                      onClick={() => onDisconnect(activeConnection.id)}
                                      disabled={isMigrationLocked}>
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
                                    className="h-8 px-3 text-xs bg-primary text-white hover:bg-primary hover:brightness-105 hover:text-white rounded border-0"
                                    onClick={() => onConnectGoogleDrive()}>
                                    <Link className="w-3.5 h-3.5 mr-1.5" />Reconnect
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">Open Google sign-in again to restore access.</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Workspace section */}
                    <div className="border-t border-line">
                      <div className="px-5 pt-3.5 pb-2">
                        <p className="text-small font-medium text-fg-muted">Workspace</p>
                      </div>
                      {activeConnection.status === 'ACTIVE' ? (
                        <div className="mx-5 mb-4">
                          <GoogleDriveWorkspaceRoot
                            connectionId={activeConnection.id}
                            accessToken={session?.access_token}
                            connectedEmail={activeConnection.email}
                            rootFolderId={driveRoot?.rootFolderId}
                            rootFolderName={driveRoot?.rootFolderName}
                            workspaceRootLocation={driveRoot?.workspaceRootLocation ?? null}
                            workspaceRootSharedStorageName={driveRoot?.workspaceRootSharedStorageName ?? null}
                            migrateDisabled={isMigrationLocked}
                            onUpdated={onRefreshDriveStatus}
                            onMigrationStarted={onMigrationStarted}
                            firmSlug={firmSlug}
                          />
                        </div>
                      ) : (
                        <div className="mx-5 mb-5 rounded border border-dashed border-tag-yellow-bg bg-amber-50/40 px-4 py-5 text-center text-sm text-amber-950/90">
                          <span className="font-medium">Reconnect</span> Google Drive above to view or change your workspace folder.
                        </div>
                      )}
                    </div>

                    {/* Failed migration files warning */}
                    {latestMigrationStatus === 'failed_partial' && failedFileCount > 0 && (
                      <div className="border-t border-tag-yellow-bg bg-amber-50/50 px-5 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-900">
                            {failedFileCount} {failedFileCount === 1 ? 'file' : 'files'} could not be migrated
                          </p>
                          <p className="text-xs text-tag-yellow-fg mt-0.5">
                            Some files failed to move during the last workspace migration.{' '}
                            <a
                              href="mailto:info@firmaone.com?subject=Workspace%20migration%20failed%20files"
                              className="underline underline-offset-2 font-medium hover:text-amber-900"
                            >
                              Contact support
                            </a>{' '}
                            to resolve this.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Google Workspace tip — shown at bottom once connected */}
                    <div className="border-t border-line px-5 py-3">
                      <div className="flex gap-2.5 rounded border border-line bg-surface-subtle px-3.5 py-3 text-xs text-fg-muted">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-fg-muted" />
                        <p className="leading-relaxed">
                          <span className="font-semibold text-fg">Google Workspace?</span> We recommend a dedicated service account not tied to any individual — so Drive access isn&apos;t disrupted if someone leaves.{' '}
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
                  </div>
                ) : existingConnections.length === 0 ? (
                  <>
                    <div className="border-t border-line text-center py-14 px-4">
                      <div className="h-10 w-10 mx-auto mb-3 bg-surface rounded-xl border border-line shadow-sm flex items-center justify-center">
                        <GoogleDriveIcon size={20} />
                      </div>
                      <p className="text-fg text-[0.8125rem] font-bold">No account linked yet</p>
                      <p className="text-fg-muted text-xs mt-1 max-w-sm mx-auto">Connect Google Drive to link an account and set your workspace folder.</p>
                    </div>

                    {/* Google Workspace tip — shown before connecting too */}
                    <div className="border-t border-line px-5 py-3">
                      <div className="flex gap-2.5 rounded border border-primary/25 bg-primary/8 px-3.5 py-3 text-xs text-fg">
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
                  </>
                ) : (
                  <div className="border-t border-line text-center py-12">
                    <p className="text-fg-muted text-xs">Select an account above to view details</p>
                  </div>
                )}
              </div>
            </div>
          </TooltipProvider>
        )}
      </TabsContent>

      <SwitchAccountModal
        open={switchModalOpen}
        onClose={() => onSetSwitchModalOpen(false)}
        admins={firmAdmins}
        currentUserId={currentUserId}
        loading={loading}
        onConfirm={onSwitchAccount}
      />
    </>
  )
}
