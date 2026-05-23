import { redirect } from 'next/navigation'
import { getActiveCampaign } from '@/app/actions/get-active-campaign'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default async function WaitlistRoot({
    searchParams,
}: {
    searchParams: Promise<Record<string, string>>
}) {
    const resolvedSearchParams = await searchParams
    const result = await getActiveCampaign()

    if (!result.success || !result.data) {
        return (
            <div className="relative flex min-h-screen flex-col">
                <Header />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-[#1b1b1d] mb-2">Coming soon</h1>
                        <p className="text-[#45474c]">The waitlist isn&apos;t open yet. Check back soon.</p>
                    </div>
                </main>
                <Footer />
            </div>
        )
    }

    const qs = new URLSearchParams(resolvedSearchParams).toString()
    redirect(`/waitlist/${result.data.id}${qs ? `?${qs}` : ''}`)
}
