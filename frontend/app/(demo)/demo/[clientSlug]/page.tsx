import { notFound } from 'next/navigation'
import { DemoClientDetail } from '@/components/demo/demo-client-detail'
import { DEMO_FIRM, getDemoClient } from '@/lib/demo/static-demo-data'

export function generateStaticParams() {
    return DEMO_FIRM.clients.map((client) => ({ clientSlug: client.slug }))
}

export default async function DemoClientPage({ params }: { params: Promise<{ clientSlug: string }> }) {
    const { clientSlug } = await params
    const client = getDemoClient(clientSlug)
    if (!client) notFound()
    return <DemoClientDetail client={client} />
}
