import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { BRAND_NAME } from '@/config/brand'
import { LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function SubscriptionLockedPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params

    const firm = await prisma.firm.findUnique({
        where: { slug },
        select: { name: true },
    })

    const firmName = firm?.name ?? 'This workspace'

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16 text-center">
            <div className="mx-auto max-w-md space-y-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 mx-auto">
                    <LockKeyhole className="h-7 w-7 text-slate-600" strokeWidth={1.75} />
                </div>
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{BRAND_NAME}</p>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscription ended</h1>
                    <p className="text-slate-500 leading-relaxed">
                        <span className="font-medium text-slate-700">{firmName}</span> is locked because the paid subscription has ended.
                        Your data is safe — reactivate to restore access immediately.
                    </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Nothing has been deleted. All documents, clients, and engagements are preserved.
                </div>
                <Button asChild className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded">
                    <Link href="/d/billing">Reactivate subscription</Link>
                </Button>
                <p className="text-xs text-slate-400">
                    Reactivation restores full access to all workspaces in your plan.
                </p>
            </div>
        </div>
    )
}
