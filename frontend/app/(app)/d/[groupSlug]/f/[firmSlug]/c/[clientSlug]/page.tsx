import { getClientWithEngagements } from "@/lib/actions/hierarchy"
import { ClientProjectView } from "@/components/projects/client-project-view"
import { basePrisma } from "@/lib/prisma"

interface PageProps {
    params: Promise<{ groupSlug: string; firmSlug: string; clientSlug: string }>
}

export default async function ClientProjectPage({ params }: PageProps) {
    const { groupSlug, firmSlug, clientSlug } = await params

    const { client, firmId, firmName } = await getClientWithEngagements(firmSlug, clientSlug)

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
                groupSlug={groupSlug}
                firmSlug={firmSlug}
                firmName={firmName ?? 'Firm'}
                firmId={firmId ?? undefined}
                selectedClientSlug={clientSlug}
                contactCount={contactCount}
                memberCount={memberCount}
            />
        </div>
    )
}
