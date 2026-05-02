import { getFirmHierarchy } from "@/lib/actions/hierarchy"
import { prisma } from "@/lib/prisma"
import { FirmClientsView } from "@/components/projects/firm-clients-view"

export default async function FirmPage({ params }: { params: Promise<{ slug: string }> }) {
    // Await params as required in Next.js 15+
    const { slug } = await params

    // Fetch clients and organization
    const clients = await getFirmHierarchy(slug)
    const organization = await prisma.firm.findUnique({
        where: { slug },
        select: { id: true, sandboxOnly: true }
    })

    return (
        <div className="h-full flex flex-col">
            <FirmClientsView
                clients={clients}
                orgSlug={slug}
                orgId={organization?.id}
                firmSandboxOnly={organization?.sandboxOnly ?? false}
            />
        </div>
    )
}
