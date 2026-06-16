import { getClients } from "@/lib/actions/hierarchy"
import { basePrisma } from "@/lib/prisma"
import { FirmClientsView } from "@/components/projects/firm-clients-view"

export default async function FirmPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    const { clients, firmId, firmSandboxOnly } = await getClients(slug)

    let memberCount = 0
    let auditCount = 0
    if (firmId) {
        const [firmMemberCount, firmAuditCount] = await Promise.all([
            (basePrisma as any).firmMember.count({ where: { firmId } }),
            (basePrisma as any).platformAuditEvent.count({ where: { firmId } }),
        ])
        memberCount = firmMemberCount
        auditCount = firmAuditCount
    }

    return (
        <div className="h-full flex flex-col">
            <FirmClientsView
                clients={clients}
                orgSlug={slug}
                orgId={firmId ?? undefined}
                firmSandboxOnly={firmSandboxOnly}
                memberCount={memberCount}
                auditCount={auditCount}
            />
        </div>
    )
}
