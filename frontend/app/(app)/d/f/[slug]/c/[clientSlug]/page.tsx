import { getClientWithEngagements } from "@/lib/actions/hierarchy"
import { ClientProjectView } from "@/components/projects/client-project-view"
import { basePrisma } from "@/lib/prisma"

interface PageProps {
    params: Promise<{ slug: string; clientSlug: string }>
}

export default async function ClientProjectPage({ params }: PageProps) {
    const { slug, clientSlug } = await params

    const { client, firmId, firmName, firmSandboxOnly } = await getClientWithEngagements(slug, clientSlug)

    let contactCount = 0
    let memberCount = 0
    if (client?.id) {
        const clientId = client.id
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
                clients={client ? [client] : []}
                firmSlug={slug}
                firmName={firmName ?? 'Firm'}
                firmId={firmId ?? undefined}
                firmSandboxOnly={firmSandboxOnly}
                selectedClientSlug={clientSlug}
                contactCount={contactCount}
                memberCount={memberCount}
            />
        </div>
    )
}
