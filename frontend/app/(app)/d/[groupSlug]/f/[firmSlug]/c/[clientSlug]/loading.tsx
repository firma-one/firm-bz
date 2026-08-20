import { ListPageSkeleton } from '@/components/projects/list-page-skeleton'

export default function Loading() {
    return (
        <div className="h-full flex flex-col">
            <ListPageSkeleton />
        </div>
    )
}
