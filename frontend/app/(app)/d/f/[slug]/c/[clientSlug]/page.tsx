import { getFirmHierarchy, getFirmName } from "@/lib/actions/hierarchy"
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

    let contactCount = 0
    let memberCount = 0
    if (selectedClient?.id) {
        const clientId = selectedClient.id
        const [contactCountRaw, clientMemberCount, clientInviteCount] = await Promise.all([
            (basePrisma as any).clientContact.count({ where: { clientId } }),
            (basePrisma as any).clientMember.count({ where: { clientId } }),
            (basePrisma as any).clientInvitation.count({ where: { clientId, status: { not: 'JOINED' } } }),
        ])
        contactCount = contactCountRaw
        memberCount = clientMemberCount + clientInviteCount
    }

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
            />
        </div>
    )
}
