import { redirect } from "next/navigation"
import { getClients } from "@/lib/actions/hierarchy"
import { basePrisma } from "@/lib/prisma"
import { FirmClientsView } from "@/components/projects/firm-clients-view"
import { firmPath } from "@/lib/navigation/firm-paths"

export default async function FirmPage({
    params,
    searchParams,
}: {
    params: Promise<{ groupSlug: string; firmSlug: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const { groupSlug, firmSlug } = await params
    const query = await searchParams

    // Home moved to /d/u/home, across firms (.claude/plans/cross-firm-home-inbox.md). The bare firm
    // URL — the workspace switcher's target — opens the firm's All clients; other params (the
    // one-time `?landed=` arrival overlay) carry over.
    if (!query.tab) {
        const next = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
            if (typeof value === "string") next.set(key, value)
        }
        next.set("tab", "clients")
        redirect(`${firmPath(groupSlug, firmSlug)}?${next.toString()}`)
    }

    const { clients, firmId, firmSandboxOnly, firmBetaFeatures } = await getClients(firmSlug)

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

    const microsoftConnectorEnabled = firmBetaFeatures.microsoftStorageConnector === true

    return (
        <div className="h-full flex flex-col">
            <FirmClientsView
                clients={clients}
                groupSlug={groupSlug}
                orgSlug={firmSlug}
                orgId={firmId ?? undefined}
                firmSandboxOnly={firmSandboxOnly}
                memberCount={memberCount}
                auditCount={auditCount}
                microsoftConnectorEnabled={microsoftConnectorEnabled}
            />
        </div>
    )
}
