import { EngagementWorkspace } from "@/components/projects/engagement-workspace"
import type { LwCrmEngagementStatus } from "@/lib/actions/project"
import { getFirmHierarchy, getFirmName } from "@/lib/actions/hierarchy"
import { getProjectPersonas } from "@/lib/actions/personas"
import { canAccessRbacAdmin, getProjectPersona } from "@/lib/permission-helpers"
import { getViewAsPersonaFromCookie } from "@/lib/view-as-server"
import {
  resolveProjectCapabilitiesForUser,
  resolveProjectCapabilitiesForPersona,
} from "@/lib/permissions/resolve"
import { getSessionUser } from "@/lib/auth/session-user"
import { prisma, basePrisma } from "@/lib/prisma"
import { notFound, redirect, unstable_rethrow } from "next/navigation"
import { EngagementLoadFailed } from "@/components/projects/engagement-load-failed"
import { logger } from "@/lib/logger"
import { ErrorBoundary } from "@/components/error-boundary"
import type { ProjectPathSegments } from "@/components/projects/engagement-workspace"
import { getAccessibleFileCountForPersona } from "@/lib/engagement-sharing-ids"
import { countOpenDiscussions } from "@/lib/comments/discussions"

const BOARD_PATH_SEGMENTS: ProjectPathSegments = { tab: 'board', viewMode: 'list', wikiPageSlug: null }

interface PageProps {
  params: Promise<{ groupSlug: string; firmSlug: string; clientSlug: string; engagementSlug: string }>
}

export default async function EngagementBoardPage({ params }: PageProps) {
  const { groupSlug, firmSlug, clientSlug, engagementSlug } = await params

  const user = await getSessionUser()
  if (!user) notFound()

  // Independent lookups, together. The hierarchy holds only engagements this user is a member of,
  // so it stays the gate for reaching the page at all.
  // A lookup that failed on our side (a database blip) is not a 404 (P1-69). A redirect still happens.
  const loadLookups = () => Promise.all([
    getFirmHierarchy(firmSlug),
    getFirmName(firmSlug),
    prisma.firm.findUnique({
      where: { slug: firmSlug },
      select: { id: true, sandboxOnly: true, settings: true },
    }),
    getViewAsPersonaFromCookie(),
  ])
  let lookups: Awaited<ReturnType<typeof loadLookups>>
  try {
    lookups = await loadLookups()
  } catch (e) {
    unstable_rethrow(e)
    logger.error('[EngagementBoardPage] lookup failed', e instanceof Error ? e : new Error(String(e)), 'EngagementBoardPage', { firmSlug, clientSlug, engagementSlug })
    return <EngagementLoadFailed />
  }
  const [clients, orgName, org, viewAsSlug] = lookups

  const client = clients.find(c => c.slug === clientSlug)
  if (!client) notFound()

  const project = client.engagements.find(p => p.slug === engagementSlug)
  if (!project) notFound()

  if (!org) notFound()

  // The caller's rights on this engagement, all at once. Nothing below is shown unless can_view holds.
  const [userCapabilities, isRbacAdmin, memberPersona] = await Promise.all([
    resolveProjectCapabilitiesForUser(org.id, client.id, project.id),
    viewAsSlug ? canAccessRbacAdmin(user.id) : Promise.resolve(false),
    getProjectPersona(org.id, client.id, project.id),
  ])
  if (!userCapabilities['project:can_view']) notFound()

  const enableBetaFeatures = ((org.settings as Record<string, unknown> | null)?.betaFeatures as Record<string, boolean> | undefined)?.dossier === true

  const applyViewAs = !!viewAsSlug && isRbacAdmin
  const capabilities = applyViewAs
    ? await resolveProjectCapabilitiesForPersona(viewAsSlug!)
    : userCapabilities

  const canViewInternalTabs = capabilities['project:can_view_internal'] ?? false
  const canViewSettings = capabilities['project:can_manage'] ?? false
  const canEdit = capabilities['project:can_edit'] ?? false
  const canManage = canViewSettings

  const projectRole = applyViewAs ? viewAsSlug : memberPersona
  const restrictToSharedOnly = projectRole ? !['eng_admin', 'eng_member'].includes(projectRole) : false

  // The tab row's numbers, loaded but not waited for — see the engagement page for why.
  const badgeCountsPromise = Promise.all([
    projectRole === 'eng_ext_collaborator' || projectRole === 'eng_viewer'
      ? getAccessibleFileCountForPersona(project.id, projectRole)
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
    (basePrisma as any).engagementInvitation.count({ where: { engagementId: project.id, status: { not: 'JOINED' } } }),
    (basePrisma as any).platformAuditEvent.count({ where: { engagementId: project.id, scope: 'PROJECT' } }),
    (prisma as any).engagementWikiPage.count({ where: { engagementId: project.id } }),
  ])
    .then(([fileCount, sharesCount, commentsCount, engMemberCount, engInviteCount, auditCount, wikiPageCount]) => ({
      fileCount,
      sharesCount,
      commentsCount,
      memberCount: engMemberCount + engInviteCount,
      auditCount,
      wikiPageCount,
    }))
    .catch(() => null)

  const [projectPersonas, connectorMeta] = await Promise.all([
    // Only legacy proj_* roles have a display name to look up.
    typeof projectRole === 'string' && projectRole.startsWith('proj_') ? getProjectPersonas() : Promise.resolve([]),
    client.connectorId
      ? prisma.connector.findUnique({ where: { id: client.connectorId }, select: { workspaceRootLocation: true } })
      : Promise.resolve(null),
  ])

  const projectPersonaDisplayName =
    projectRole && typeof projectRole === 'string' && projectRole.startsWith('proj_')
      ? (projectPersonas as { slug: string; displayName: string }[]).find((p) => p.slug === projectRole)?.displayName ?? null
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
          orgName={orgName}
          clientName={client.name}
          projectName={project.name}
          firmId={org.id}
          canViewSettings={canViewSettings}
          canViewInternalTabs={canViewInternalTabs}
          canEdit={canEdit}
          canManage={canManage}
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
          pathSegments={BOARD_PATH_SEGMENTS}
          projectPersonaDisplayName={projectPersonaDisplayName}
          engagementSlug={engagementSlug}
          firmSandboxOnly={org.sandboxOnly ?? false}
          enableBetaFeatures={enableBetaFeatures}
          badgeCounts={badgeCountsPromise}
        />
      </ErrorBoundary>
    </div>
  )
}
