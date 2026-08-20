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
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
            role="alertdialog"
            aria-modal="true"
            aria-live="polite"
        >
            <div className="w-full max-w-2xl rounded-lg bg-white px-10 py-8 shadow-xl mx-4">
                <LoadingSpinner size="lg" message={message} />
            </div>
        </div>
    )
}
