import { getFirmHierarchy } from "@/lib/actions/hierarchy"
import { prisma, basePrisma } from "@/lib/prisma"
import { FirmClientsView } from "@/components/projects/firm-clients-view"

export default async function FirmPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    const [clients, organization] = await Promise.all([
        getFirmHierarchy(slug),
        prisma.firm.findUnique({ where: { slug }, select: { id: true, sandboxOnly: true } }),
    ])

    let memberCount = 0
    let auditCount = 0
    if (organization?.id) {
        const firmId = organization.id
        const [firmMemberCount, firmInviteCount, firmAuditCount] = await Promise.all([
            (basePrisma as any).firmMember.count({ where: { firmId } }),
            (basePrisma as any).firmInvitation.count({ where: { firmId, status: { not: 'JOINED' } } }),
            (basePrisma as any).platformAuditEvent.count({ where: { firmId, scope: 'PROJECT' } }),
        ])
        memberCount = firmMemberCount + firmInviteCount
        auditCount = firmAuditCount
    }

    return (
        <div className="h-full flex flex-col">
            <FirmClientsView
                clients={clients}
                orgSlug={slug}
                orgId={organization?.id}
                firmSandboxOnly={organization?.sandboxOnly ?? false}
                memberCount={memberCount}
                auditCount={auditCount}
            />
        </div>
    )
}
