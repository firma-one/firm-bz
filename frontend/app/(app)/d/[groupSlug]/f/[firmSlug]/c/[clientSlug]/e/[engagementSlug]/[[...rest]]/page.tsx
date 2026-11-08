import { EngagementWorkspace } from "@/components/projects/engagement-workspace"
import type { LwCrmEngagementStatus } from "@/lib/actions/project"
import { getFirmHierarchy, getFirmName } from "@/lib/actions/hierarchy"
import { getProjectPersonas } from "@/lib/actions/personas"
import { canAccessRbacAdmin, canManageOrganization, getProjectPersona } from "@/lib/permission-helpers"
import { getViewAsPersonaFromCookie } from "@/lib/view-as-server"
import {
  resolveProjectCapabilitiesForUser,
  resolveProjectCapabilitiesForPersona,
} from "@/lib/permissions/resolve"
import { getSessionUser } from "@/lib/auth/session-user"
import { getEngagementFolderIds } from "@/lib/actions/project"
import { prisma, basePrisma } from "@/lib/prisma"
import { notFound, redirect, unstable_rethrow } from "next/navigation"
import { EngagementLoadFailed } from "@/components/projects/engagement-load-failed"
import { ErrorBoundary } from "@/components/error-boundary"
import type { ProjectPathSegments } from "@/components/projects/engagement-workspace"
import { getAccessibleFileCountForPersona } from "@/lib/engagement-sharing-ids"
import { engagementPath } from "@/lib/navigation/firm-paths"
import { logger } from "@/lib/logger"
import { getLastEngagementTab } from "@/lib/recents"
import { countOpenDiscussions } from "@/lib/comments/discussions"

const VALID_TABS = new Set(['files', 'shares', 'comments', 'members', 'analytics', 'sources', 'audit', 'settings', 'wiki'])

function parseRest(rest: string[] | undefined, defaultTab: string): ProjectPathSegments {
  const tab = rest?.[0] && VALID_TABS.has(rest[0]) ? rest[0] : defaultTab
  if (tab === 'shares') {
    const viewMode = (rest?.[1] === 'board' ? 'board' : (rest?.[1] === 'list' ? 'list' : 'grid')) as 'list' | 'board' | 'grid'
    return { tab, viewMode, wikiPageSlug: null }
  }
  if (tab === 'wiki') {
    return { tab, viewMode: 'list', wikiPageSlug: rest?.[1] ?? null }
  }
  return { tab, viewMode: 'list', wikiPageSlug: null }
}

interface PageProps {
  params: Promise<{ groupSlug: string; firmSlug: string; clientSlug: string; engagementSlug: string; rest?: string[] }>
}

/** Canonical engagement (project) page under /e/. */
export default async function EngagementPage({ params }: PageProps) {
  const { groupSlug, firmSlug, clientSlug, engagementSlug, rest } = await params

  const user = await getSessionUser()

  // Each 404 branch logs its reason — notFound() is otherwise silent, which makes
  // "why is this engagement 404ing" undiagnosable from the server log.
  const notFoundCtx = { firmSlug, clientSlug, engagementSlug }

  if (!user) {
    logger.warn('[EngagementPage] 404: no authenticated user', notFoundCtx)
    notFound()
  }

  // Independent lookups, together. The hierarchy holds only engagements this user is a member of,
  // so it stays the gate for reaching the page at all. A lookup that failed on our side (a database
  // blip) is not a 404 (P1-69): it says so, with Try again. A redirect from them still happens.
  const loadLookups = () => Promise.all([
    getFirmHierarchy(firmSlug),
    getFirmName(firmSlug),
    prisma.firm.findUnique({
      where: { slug: firmSlug },
      select: { id: true, sandboxOnly: true, settings: true }
    }),
    getViewAsPersonaFromCookie(),
  ])
  let lookups: Awaited<ReturnType<typeof loadLookups>>
  try {
    lookups = await loadLookups()
  } catch (e) {
    unstable_rethrow(e)
    logger.error('[EngagementPage] lookup failed', e instanceof Error ? e : new Error(String(e)), 'EngagementPage', notFoundCtx)
    return <EngagementLoadFailed />
  }
  const [clients, orgName, org, viewAsSlug] = lookups

  const client = clients.find(c => c.slug === clientSlug)
  if (!client) {
    logger.warn('[EngagementPage] 404: client not in hierarchy', { ...notFoundCtx, clientSlugs: clients.map(c => c.slug) })
    notFound()
  }

  const project = client.engagements.find(p => p.slug === engagementSlug)
  if (!project) {
    logger.warn('[EngagementPage] 404: engagement not in hierarchy', { ...notFoundCtx, engagementSlugs: client.engagements.map(p => p.slug) })
    notFound()
  }

  if (!org) {
    logger.warn('[EngagementPage] 404: firm not found', notFoundCtx)
    notFound()
  }

  // The caller's rights on this engagement, all at once. Nothing below is shown unless can_view holds.
  const [userCapabilities, isRbacAdmin, isFirmAdmin, memberPersona, lastTab] = await Promise.all([
    resolveProjectCapabilitiesForUser(org.id, client.id, project.id),
    viewAsSlug ? canAccessRbacAdmin(user.id) : Promise.resolve(false),
    canManageOrganization(org.id),
    getProjectPersona(org.id, client.id, project.id),
    rest?.[0] ? Promise.resolve(null) : getLastEngagementTab(user.id, project.id),
  ])

  if (!userCapabilities['project:can_view']) {
    logger.warn('[EngagementPage] 404: canViewProject denied', { ...notFoundCtx, userId: user.id, projectId: project.id })
    notFound()
  }

  const applyViewAs = !!viewAsSlug && isRbacAdmin
  const capabilities = applyViewAs
    ? await resolveProjectCapabilitiesForPersona(viewAsSlug!)
    : userCapabilities

  const canViewSettings = capabilities['project:can_manage'] ?? false
  const canViewInternalTabs = capabilities['project:can_view_internal'] ?? false
  const canEdit = capabilities['project:can_edit'] ?? false
  const canManage = canViewSettings
  const enableBetaFeatures = ((org.settings as Record<string, unknown> | null)?.betaFeatures as Record<string, boolean> | undefined)?.dossier === true

  // The bare engagement URL reopens the tab the user was last on, else Files. An unknown tab
  // segment falls back to Overview.
  const defaultTab = rest?.[0] ? 'analytics' : (lastTab ?? 'files')
  // The Board has its own route (…/board), so a last visit there reopens it there.
  if (!rest?.[0] && defaultTab === 'board') {
    redirect(`${engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug)}/board`)
  }
  const pathSegments = parseRest(rest, defaultTab)

  const filesPath = engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug, { tab: 'files' })

  if (pathSegments.tab === 'settings' && !canViewSettings) {
    redirect(filesPath)
  }
  if (pathSegments.tab === 'audit' && !canManage) {
    redirect(filesPath)
  }
  if (['members', 'sources'].includes(pathSegments.tab) && !canViewInternalTabs) {
    redirect(filesPath)
  }
  if (pathSegments.tab === 'wiki' && (!enableBetaFeatures || !canViewInternalTabs)) {
    redirect(filesPath)
  }

  const projectRole = applyViewAs ? viewAsSlug : memberPersona
  const restrictToSharedOnly = projectRole ? !['eng_admin', 'eng_member'].includes(projectRole) : false

  const ecGuestPersona = (projectRole === 'eng_ext_collaborator' || projectRole === 'eng_viewer') ? projectRole : null

  const [projectPersonas, connectorMeta, initialFolderData, fileCount, sharesCount, commentsCount, engMemberCount, engInviteCount, auditCount, wikiPageCount] = await Promise.all([
    // Only legacy proj_* roles have a display name to look up.
    typeof projectRole === 'string' && projectRole.startsWith('proj_') ? getProjectPersonas() : Promise.resolve([]),
    client.connectorId
      ? prisma.connector.findUnique({ where: { id: client.connectorId }, select: { workspaceRootLocation: true, settings: true } })
      : Promise.resolve(null),
    // The Files tab's root folders, so its first listing needn't wait on a lookup from the browser.
    pathSegments.tab === 'files' && client.connectorId
      ? getEngagementFolderIds(project.id).catch((e: unknown) => {
        logger.warn('[EngagementPage] folder ids not resolved; the file list will ask', { projectId: project.id, error: e instanceof Error ? e.message : String(e) })
        return null
      })
      : Promise.resolve(null),
    ecGuestPersona
      ? getAccessibleFileCountForPersona(project.id, ecGuestPersona)
      : (basePrisma as any).engagementDocument.count({ where: { engagementId: project.id, isFolder: false } }),
    (basePrisma as any).$queryRawUnsafe(
      `SELECT COUNT(DISTINCT ed.id)::int AS count FROM platform.engagement_documents ed
       LEFT JOIN platform.engagement_document_sharing_users su
         ON su."projectDocumentId" = ed.id AND su."sharingPermissionStatus" IN ('GRANTED', 'PENDING')
       WHERE ed."engagementId" = $1::uuid AND ed."isFolder" = true
         AND ((ed.settings->'share'->>'createdAt') IS NOT NULL OR su.id IS NOT NULL)`,
      project.id
    ).then((r: any[]) => r[0]?.count ?? 0),
    // Discussions: open ones (not resolved) on documents this viewer may open, as the page lists them.
    countOpenDiscussions(project.id, projectRole),
    (basePrisma as any).engagementMember.count({ where: { engagementId: project.id } }),
    (basePrisma as any).engagementInvitation.count({ where: { engagementId: project.id, status: { in: ['PENDING', 'ACCEPTED'] } } }),
    (basePrisma as any).platformAuditEvent.count({ where: { engagementId: project.id, scope: 'PROJECT' } }),
    (prisma as any).engagementWikiPage.count({ where: { engagementId: project.id } }),
  ])
  const engagementMemberCount = engMemberCount + engInviteCount

  const projectPersonaDisplayName =
    projectRole && typeof projectRole === 'string' && projectRole.startsWith('proj_')
      ? (projectPersonas as { slug: string; displayName: string }[]).find((p) => p.slug === projectRole)?.displayName ?? null
      : null

  const connectorAccountEmail = connectorMeta
    ? ((connectorMeta.settings as any)?.accountEmail as string | undefined) ?? null
    : null

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ErrorBoundary context="EngagementWorkspace">
        <EngagementWorkspace
          groupSlug={groupSlug}
          orgSlug={firmSlug}
          clientSlug={client.slug}
          projectId={project.id}
          connectorRootFolderId={project.connectorRootFolderId}
          clientConnectorId={client.connectorId}
          clientConnectorType={client.connectorType}
          workspaceRootLocation={connectorMeta?.workspaceRootLocation ?? null}
          connectorAccountEmail={connectorAccountEmail}
          initialFolderData={initialFolderData}
          orgName={orgName}
          clientName={client.name}
          projectName={project.name}
          firmId={org.id}
          canViewSettings={canViewSettings}
          canViewInternalTabs={canViewInternalTabs}
          canEdit={canEdit}
          canManage={canManage}
          isFirmAdmin={isFirmAdmin}
          restrictToSharedOnly={restrictToSharedOnly}
          isExternalViewer={projectRole === 'eng_viewer'}
          roleSlug={projectRole ?? undefined}
          projectDescription={project.description ?? undefined}
          engagementKickoffDate={project.kickoffDate}
          engagementDueDate={project.dueDate}
          engagementFollowUpDate={(project as any).followUpDate ?? null}
          engagementStatus={(project.status as LwCrmEngagementStatus) ?? "ACTIVE"}
          clientStatus={client.status}
          engagementContractType={project.contractType ?? ""}
          engagementRateOrValue={project.rateOrValue}
          engagementTags={project.tags ?? []}
          engagementInternalMemo={(project.settings as Record<string, unknown>)?.internalMemo as string ?? null}
          pathSegments={pathSegments}
          projectPersonaDisplayName={projectPersonaDisplayName}
          engagementSlug={engagementSlug}
          firmSandboxOnly={org.sandboxOnly ?? false}
          enableBetaFeatures={enableBetaFeatures}
          fileCount={fileCount}
          sharesCount={sharesCount}
          commentsCount={commentsCount}
          memberCount={engagementMemberCount}
          auditCount={auditCount}
          wikiPageCount={wikiPageCount}
        />
      </ErrorBoundary>
    </div>
  )
}
