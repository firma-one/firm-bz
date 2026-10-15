import { getClients } from "@/lib/actions/hierarchy"
import { basePrisma } from "@/lib/prisma"
import { FirmClientsView } from "@/components/projects/firm-clients-view"
import { FirmHome } from "@/components/home/firm-home"
import { getUserUiPrefs } from "@/lib/ui-prefs"
import { createClient } from "@/utils/supabase/server"

export default async function FirmPage({
    params,
    searchParams,
}: {
    params: Promise<{ groupSlug: string; firmSlug: string }>
    searchParams: Promise<{ tab?: string }>
}) {
    const { groupSlug, firmSlug } = await params
    const { tab } = await searchParams

    // New UI: the bare firm URL is the user's Home. Every `?tab=` (clients, overview, calendar, …)
    // keeps rendering the existing firm view, which is also what v1 always renders.
    if (!tab) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user && (await getUserUiPrefs(user.id)).shell === 'v2') {
            return <FirmHome groupSlug={groupSlug} firmSlug={firmSlug} />
        }
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
