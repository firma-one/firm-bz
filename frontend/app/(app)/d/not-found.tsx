"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MapPinOff, Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    const pathname = usePathname()
    const firmSlug = pathname?.match(/^\/d\/f\/([^/]+)/)?.[1]
    const dashboardHref = firmSlug ? `/d/f/${firmSlug}` : '/d'

    return (
        <div className="flex h-[80vh] flex-col items-center justify-center text-center px-4 w-full">
            <span className="inline-block mb-5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 tracking-widest">
                404
            </span>

            <div className="rounded-full bg-slate-100 p-5 mb-6">
                <MapPinOff className="h-10 w-10 text-slate-400" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight mb-2">
                Page not found
            </h1>

            <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                This page doesn&apos;t exist or you no longer have access. If you followed a link from a client or engagement, check that your access hasn&apos;t changed.
            </p>

            <div className="flex flex-row gap-3 justify-center">
                <Button
                    variant="outline"
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.back()
                        }
                    }}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go Back
                </Button>

                <Button asChild variant="blackCta">
                    <Link href={dashboardHref} className="flex items-center">
                        <Home className="mr-2 h-4 w-4" />
                        Go to Dashboard
                    </Link>
                </Button>
            </div>
        </div>
    )
}
