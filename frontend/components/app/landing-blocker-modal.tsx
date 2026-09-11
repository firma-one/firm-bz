import { LoadingSpinner } from '@/components/ui/loading-spinner'

/**
 * Non-dismissible full-viewport blocker shown while `/d` resolves where a signed-in user
 * lands (route redirect, or first-time silent Group+Firm auto-provisioning). No close
 * control, no backdrop-click/Escape dismissal — it disappears only when the caller
 * navigates away after resolution completes.
 */
export function LandingBlockerModal({ message }: { message: string }) {
    return (
        <div
            // Fully opaque, not translucent — the real AppSidebar/DLayoutClient tree mounts and
            // starts fetching behind this overlay concurrently (d/layout.tsx isn't gated by the
            // Suspense boundary this modal is a fallback for), so any transparency here lets that
            // tree's own loading->loaded transition bleed through and read as the loader itself
            // flickering/restarting. Uses the app's own main-content background color (not a dark
            // scrim) so the eventual swap to real content isn't a stark light<->dark cut.
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[#f9f9fb] animate-in fade-in duration-200"
            role="alertdialog"
            aria-modal="true"
            aria-live="polite"
        >
            <div className="w-full max-w-md rounded-lg border border-[#e5e7eb] bg-white px-10 py-8 shadow-xl mx-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex min-h-[160px] flex-col items-center justify-center">
                    <LoadingSpinner className="min-h-0 p-0" size="lg" message={message} />
                </div>
            </div>
        </div>
    )
}
