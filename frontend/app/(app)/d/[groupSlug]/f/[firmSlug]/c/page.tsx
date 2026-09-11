import { redirect } from "next/navigation"
import { getFirmHierarchy } from "@/lib/actions/hierarchy"
import { clientPath, firmPath } from "@/lib/navigation/firm-paths"

interface PageProps {
    params: Promise<{ groupSlug: string; firmSlug: string }>
}

export default async function ClientRedirectPage({ params }: PageProps) {
    const { groupSlug, firmSlug } = await params

    // Fetch clients
    const clients = await getFirmHierarchy(firmSlug)

    // If clients exist, redirect to first client
    if (clients.length > 0) {
        redirect(clientPath(groupSlug, firmSlug, clients[0].slug))
    }

    // If no clients exist, redirect back to organization page (no /c in URL)
    redirect(firmPath(groupSlug, firmSlug))
}
