import { redirect } from 'next/navigation'
import { getActiveCampaign } from '@/app/actions/get-active-campaign'
import { PageGuides, PillLink } from '@/components/marketing/v2/primitives'

export default async function WaitlistRoot({
    searchParams,
}: {
    searchParams: Promise<Record<string, string>>
}) {
    const resolvedSearchParams = await searchParams
    const result = await getActiveCampaign()

    if (!result.success || !result.data) {
        return (
            <section className="mk-band mk-band--white flex min-h-[78vh] items-center pb-24 pt-32 md:pt-40">
                <PageGuides />
                <div className="mk-rail relative w-full text-center">
                    <h1 className="mk-page text-[var(--mk-ink)]">Coming soon</h1>
                    <p className="mk-lede mx-auto mt-5 max-w-md md:mt-6">The waitlist isn&apos;t open yet. Check back soon.</p>
                    <div className="mt-8 flex justify-center">
                        <PillLink href="/" block>
                            Back to home
                        </PillLink>
                    </div>
                </div>
            </section>
        )
    }

    const qs = new URLSearchParams(resolvedSearchParams).toString()
    redirect(`/waitlist/${result.data.id}${qs ? `?${qs}` : ''}`)
}
