import { EngagementWorkspace } from "@/components/projects/engagement-workspace"
import type { LwCrmEngagementStatus } from "@/lib/actions/project"
import { getFirmHierarchy, getFirmName, type HierarchyClient } from "@/lib/actions/hierarchy"
import { getProjectPersonas } from "@/lib/actions/personas"
import { canViewProject, canAccessRbacAdmin, getProjectPersona } from "@/lib/permission-helpers"
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

const BOARD_PATH_SEGMENTS: ProjectPathSegments = { tab: 'board', viewMode: 'list', wikiPageSlug: null }

interface PageProps {
  params: Promise<{ slug: string; clientSlug: string; engagementSlug: string }>
}

export default async function EngagementBoardPage({ params }: PageProps) {
  const { slug, clientSlug, engagementSlug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  let clients: HierarchyClient[]
  try {
    clients = await getFirmHierarchy(slug)
  } catch {
    notFound()
  }

  const orgName = await getFirmName(slug)
  const client = clients.find(c => c.slug === clientSlug)
  if (!client) notFound()

  const project = client.engagements.find(p => p.slug === engagementSlug)
  if (!project) notFound()

  const org = await prisma.firm.findUnique({
    where: { slug },
    select: { id: true, sandboxOnly: true, settings: true },
  })
  if (!org) notFound()

  const canView = await canViewProject(org.id, client.id, project.id)
  if (!canView) notFound()

  const enableBetaFeatures = (org.settings as Record<string, unknown> | null)?.enableBetaFeatures === true

  const viewAsSlug = await getViewAsPersonaFromCookie()
  const applyViewAs = viewAsSlug && (await canAccessRbacAdmin(user.id))
  const capabilities = applyViewAs
    ? await resolveProjectCapabilitiesForPersona(viewAsSlug)
    : await resolveProjectCapabilitiesForUser(org.id, client.id, project.id)

  const canViewInternalTabs = capabilities['project:can_view_internal'] ?? false
  const canViewSettings = capabilities['project:can_manage'] ?? false
  const canEdit = capabilities['project:can_edit'] ?? false
  const canManage = canViewSettings

  if (!enableBetaFeatures || !canViewInternalTabs) {
    redirect(`/d/f/${slug}/c/${clientSlug}/e/${engagementSlug}/files`)
  }

  const projectRole = applyViewAs ? viewAsSlug : await getProjectPersona(org.id, client.id, project.id)
  const restrictToSharedOnly = projectRole ? !['eng_admin', 'eng_member'].includes(projectRole) : false

  const projectPersonas = await getProjectPersonas()
  const projectPersonaDisplayName =
    projectRole && typeof projectRole === 'string' && projectRole.startsWith('proj_')
      ? (projectPersonas as { slug: string; displayName: string }[]).find((p) => p.slug === projectRole)?.displayName ?? null
      : null

  const connectorMeta = client.connectorId
    ? await prisma.connector.findUnique({ where: { id: client.connectorId }, select: { workspaceRootLocation: true } })
    : null

  const [fileCount, sharesCount, commentsCount, engMemberCount, engInviteCount, auditCount, wikiPageCount] = await Promise.all([
    projectRole === 'eng_ext_collaborator' || projectRole === 'eng_viewer'
      ? getAccessibleFileCountForPersona(project.id, projectRole)
      : (basePrisma as any).engagementDocument.count({ where: { engagementId: project.id, isFolder: false } }),
    (basePrisma as any).engagementDocument.count({ where: { engagementId: project.id, sharingUsers: { some: { sharingPermissionStatus: { in: ['GRANTED', 'PENDING'] } } } } }),
    (basePrisma as any).docCommentMessage.count({ where: { engagementId: project.id } }),
    (basePrisma as any).engagementMember.count({ where: { engagementId: project.id } }),
    (basePrisma as any).engagementInvitation.count({ where: { engagementId: project.id, status: { not: 'JOINED' } } }),
    (basePrisma as any).platformAuditEvent.count({ where: { engagementId: project.id, scope: 'PROJECT' } }),
    (prisma as any).engagementWikiPage.count({ where: { engagementId: project.id } }),
  ])

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
          fileCount={fileCount}
          sharesCount={sharesCount}
          commentsCount={commentsCount}
          memberCount={engMemberCount + engInviteCount}
          auditCount={auditCount}
          wikiPageCount={wikiPageCount}
        />
      </ErrorBoundary>
    </div>
  )
}
