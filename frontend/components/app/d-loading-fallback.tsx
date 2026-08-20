import { AppShellSkeleton } from '@/components/app/app-shell-skeleton'
import { LandingBlockerModal } from '@/components/app/landing-blocker-modal'

/**
 * Shared fallback for the `/d` segment's loading states — used both by `loading.tsx`
 * (Suspense boundary around `page.tsx`) and by `layout.tsx`'s own inner `<Suspense>`
 * (around its uncached `getUserFirms()`/`auth.getUser()` calls, which would otherwise
 * block navigation entirely before `loading.tsx` ever gets a chance to render — see
 * https://nextjs.org/docs/app/api-reference/file-conventions/loading). One shared
 * component keeps both moments visually identical, so they read as one continuous
 * loading state rather than two different flashes.
 */
export function DLoadingFallback({ message = 'Loading your workspace...' }: { message?: string }) {
    return (
        <>
            <AppShellSkeleton />
            <LandingBlockerModal message={message} />
        </>
    )
}
