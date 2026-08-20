import { Skeleton } from '@/components/ui/skeleton'

/**
 * Empty app-shell shape (sidebar rail + topbar + content skeleton) shown behind
 * `LandingBlockerModal` while `/d` resolves — no real firm/user data available yet,
 * so this is intentionally generic, not a data-shaped skeleton for any specific page.
 */
export function AppShellSkeleton() {
    return (
        <div className="flex h-full flex-col">
            <div
                className="flex shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-white px-4"
                style={{ height: 64 }}
            >
                <Skeleton className="h-6 w-24 rounded-md" />
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
                <div
                    className="flex shrink-0 flex-col gap-2 border-r border-[#e5e7eb] bg-white p-4"
                    style={{ width: 256 }}
                >
                    <Skeleton className="h-9 w-full rounded-md" />
                    <div className="mt-4 flex flex-col gap-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} className="h-8 w-full rounded-md" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 bg-[#f9f9fb] p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div
                                key={i}
                                className="flex h-48 flex-col rounded-xl border border-slate-200 bg-white p-5"
                            >
                                <Skeleton className="mb-3 h-10 w-10 shrink-0 rounded-lg" />
                                <Skeleton className="mb-2 h-4 w-3/4" />
                                <Skeleton className="mb-2 h-3 w-full" />
                                <Skeleton className="mt-auto h-3 w-28 pt-3" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
