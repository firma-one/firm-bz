import { getFirmHierarchy, getFirmName, getIsOrgInternal } from "@/lib/actions/hierarchy"
import { getProjectMemberSummaries } from "@/lib/actions/members"
import { getFirmClientPermissions } from "@/lib/actions/permissions"
import { ClientProjectView } from "@/components/projects/client-project-view"
import { prisma, basePrisma } from "@/lib/prisma"

interface PageProps {
    params: Promise<{ slug: string; clientSlug: string }>
}

export default async function ClientProjectPage({ params }: PageProps) {
    const { slug, clientSlug } = await params

    const [clients, orgName, org] = await Promise.all([
        getFirmHierarchy(slug),
        getFirmName(slug),
        prisma.firm.findUnique({ where: { slug }, select: { id: true, sandboxOnly: true } }),
    ])

    const selectedClient = clients.find(c => c.slug === clientSlug)
    const projectIds = selectedClient?.projects?.map(p => p.id) ?? []

    const [
        contactCountRaw,
        clientMemberCount,
        clientInviteCount,
        isOrgInternal,
        memberSummaries,
        perms,
    ] = await Promise.all([
        selectedClient?.id
            ? (basePrisma as any).clientContact.count({ where: { clientId: selectedClient.id } })
            : Promise.resolve(0),
        selectedClient?.id
            ? (basePrisma as any).clientMember.count({ where: { clientId: selectedClient.id } })
            : Promise.resolve(0),
        selectedClient?.id
            ? (basePrisma as any).clientInvitation.count({ where: { clientId: selectedClient.id, status: { not: 'JOINED' } } })
            : Promise.resolve(0),
        getIsOrgInternal(slug),
        projectIds.length > 0 ? getProjectMemberSummaries(projectIds) : Promise.resolve({}),
        org?.id && selectedClient?.id
            ? getFirmClientPermissions(org.id, selectedClient.id)
            : Promise.resolve({ canManageClient: false }),
    ])

    const contactCount = contactCountRaw
    const memberCount = clientMemberCount + clientInviteCount

    return (
        <div className="h-full flex flex-col">
            <ClientProjectView
                clients={clients}
                orgSlug={slug}
                orgName={orgName}
                orgId={org?.id}
                firmSandboxOnly={org?.sandboxOnly ?? false}
                selectedClientSlug={clientSlug}
                contactCount={contactCount}
                memberCount={memberCount}
                isOrgInternal={isOrgInternal}
                memberSummaries={memberSummaries}
                canManageClient={perms.canManageClient}
            />
        </div>
    )
}
