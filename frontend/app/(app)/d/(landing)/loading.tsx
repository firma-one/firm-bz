import { DLoadingFallback } from '@/components/app/d-loading-fallback'

/**
 * Next's file-convention loading UI for the bare `/d` route — scoped to ONLY this route
 * because `page.tsx` lives in this `(landing)` route group, a sibling of `d/[groupSlug]`
 * rather than a child of it. See the long comment in `./page.tsx` for why this file-convention
 * boundary is used instead of a manual `<Suspense>` wrapped around the redirecting component.
 */
export default function Loading() {
    return <DLoadingFallback />
}
