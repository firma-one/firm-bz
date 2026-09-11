import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-36 rounded" />
            </nav>

            {/* Project Identity Header */}
            <div className="flex items-start justify-between gap-6 mb-6">
                <div className="flex items-center gap-6">
                    <Skeleton className="w-16 h-16 rounded shrink-0" />
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-9 w-56 rounded" />
                            <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-72 rounded" />
                            <Skeleton className="h-5 w-20 rounded" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab strip */}
            <div className="bg-white border border-[#e5e7eb] rounded mb-3 shrink-0 h-14 flex items-center px-4 gap-1">
                {[72, 56, 68, 80, 72, 60, 56].map((w, i) => (
                    <Skeleton key={i} className="h-5 rounded mx-1" style={{ width: w }} />
                ))}
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 bg-white border border-[#e5e7eb] rounded" />
        </div>
    )
}
