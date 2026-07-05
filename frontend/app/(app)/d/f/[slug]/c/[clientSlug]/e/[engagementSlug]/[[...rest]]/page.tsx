import { EngagementWorkspace } from "@/components/projects/engagement-workspace"
import type { LwCrmEngagementStatus } from "@/lib/actions/project"
import { getFirmHierarchy, getFirmName, type HierarchyClient } from "@/lib/actions/hierarchy"
import { getProjectPersonas } from "@/lib/actions/personas"
import { canViewProject, canAccessRbacAdmin, canManageOrganization, getProjectPersona } from "@/lib/permission-helpers"
import { getViewAsPersonaFromCookie } from "@/lib/view-as-server"
import {
  resolveProjectCapabilitiesForUser,
  resolveProjectCapabilitiesForPersona,
} from "@/lib/permissions/resolve"
import { createClient } from "@/utils/supabase/server"
import { prisma, basePrisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { ErrorBoundary } from "@/components/error-boundary"
import type { ProjectPathSegments } from "@/components/projects/engagement-workspace"
import { getAccessibleFileCountForPersona } from "@/lib/engagement-sharing-ids"

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
  params: Promise<{ slug: string; clientSlug: string; engagementSlug: string; rest?: string[] }>
}

/** Canonical engagement (project) page under /e/. */
export default async function EngagementPage({ params }: PageProps) {
  const { slug, clientSlug, engagementSlug, rest } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  let clients: HierarchyClient[]
  try {
    clients = await getFirmHierarchy(slug)
  } catch (e) {
    notFound()
  }
  const orgName = await getFirmName(slug)

  const client = clients.find(c => c.slug === clientSlug)
  if (!client) {
    notFound()
  }

  const project = client.engagements.find(p => p.slug === engagementSlug)
  if (!project) {
    notFound()
  }

  const org = await prisma.firm.findUnique({
    where: { slug: slug },
    select: { id: true, sandboxOnly: true, settings: true }
  })
  if (!org) {
    notFound()
  }

  const canView = await canViewProject(org.id, client.id, project.id)
  if (!canView) {
    notFound()
  }

  const viewAsSlug = await getViewAsPersonaFromCookie()
  const applyViewAs = viewAsSlug && (await canAccessRbacAdmin(user.id))
  const capabilities = applyViewAs
    ? await resolveProjectCapabilitiesForPersona(viewAsSlug)
    : await resolveProjectCapabilitiesForUser(org.id, client.id, project.id)

  const canViewSettings = capabilities['project:can_manage'] ?? false
  const canViewInternalTabs = capabilities['project:can_view_internal'] ?? false
  const canEdit = capabilities['project:can_edit'] ?? false
  const canManage = canViewSettings
  const isFirmAdmin = await canManageOrganization(org.id)
  const enableBetaFeatures = (org.settings as Record<string, unknown> | null)?.enableBetaFeatures === true

  const defaultTab = canViewInternalTabs ? 'analytics' : 'files'
  const pathSegments = parseRest(rest, defaultTab)

  const basePath = `/d/f/${slug}/c/${clientSlug}/e/${engagementSlug}`

  if (pathSegments.tab === 'settings' && !canViewSettings) {
    redirect(`${basePath}/files`)
  }
  if (pathSegments.tab === 'audit' && !canManage) {
    redirect(`${basePath}/files`)
  }
  if (['members', 'analytics', 'sources'].includes(pathSegments.tab) && !canViewInternalTabs) {
    redirect(`${basePath}/files`)
  }
  if (pathSegments.tab === 'wiki' && (!enableBetaFeatures || !canViewInternalTabs)) {
    redirect(`${basePath}/files`)
  }

  const projectRole = applyViewAs ? viewAsSlug : await getProjectPersona(org.id, client.id, project.id)
  const restrictToSharedOnly = projectRole ? !['eng_admin', 'eng_member'].includes(projectRole) : false

  const projectPersonas = await getProjectPersonas()
  const projectPersonaDisplayName =
    projectRole && typeof projectRole === 'string' && projectRole.startsWith('proj_')
      ? (projectPersonas as { slug: string; displayName: string }[]).find((p) => p.slug === projectRole)?.displayName ?? null
      : null

  const ecGuestPersona = (projectRole === 'eng_ext_collaborator' || projectRole === 'eng_viewer') ? projectRole : null

  const connectorMeta = client.connectorId
    ? await prisma.connector.findUnique({ where: { id: client.connectorId }, select: { workspaceRootLocation: true, settings: true } })
    : null
  const connectorAccountEmail = connectorMeta
    ? ((connectorMeta.settings as any)?.accountEmail as string | undefined) ?? null
    : null

  const [fileCount, sharesCount, commentsCount, engMemberCount, engInviteCount, auditCount, wikiPageCount] = await Promise.all([
    ecGuestPersona
      ? getAccessibleFileCountForPersona(project.id, ecGuestPersona)
      : (basePrisma as any).engagementDocument.count({ where: { engagementId: project.id, isFolder: false } }),
    (basePrisma as any).engagementDocument.count({ where: { engagementId: project.id, sharingUsers: { some: { sharingPermissionStatus: { in: ['GRANTED', 'PENDING'] } } } } }),
    (basePrisma as any).docCommentMessage.groupBy({ by: ['projectDocumentId'], where: { engagementId: project.id } }).then((r: any[]) => r.length),
    (basePrisma as any).engagementMember.count({ where: { engagementId: project.id } }),
    (basePrisma as any).engagementInvitation.count({ where: { engagementId: project.id, status: { in: ['PENDING', 'ACCEPTED'] } } }),
    (basePrisma as any).platformAuditEvent.count({ where: { engagementId: project.id, scope: 'PROJECT' } }),
    (prisma as any).engagementWikiPage.count({ where: { engagementId: project.id } }),
  ])
  const engagementMemberCount = engMemberCount + engInviteCount

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ErrorBoundary context="EngagementWorkspace">
        <EngagementWorkspace
          orgSlug={slug}
          clientSlug={client.slug}
          projectId={project.id}
          connectorRootFolderId={project.connectorRootFolderId}
          clientConnectorId={client.connectorId}
          workspaceRootLocation={connectorMeta?.workspaceRootLocation ?? null}
          connectorAccountEmail={connectorAccountEmail}
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
