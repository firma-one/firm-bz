import { WorkspaceLoader } from '@/components/app/workspace-loader'

/**
 * Non-dismissible full-viewport blocker shown while `/d` resolves where a signed-in user
 * lands (route redirect, or first-time silent Group+Firm auto-provisioning). No close
 * control, no backdrop-click/Escape dismissal — it disappears only when the caller
 * navigates away after resolution completes. Drawn by the shared WorkspaceLoader, which
 * stays fully opaque so the real AppSidebar/DLayoutClient tree mounting behind it (d/layout.tsx
 * isn't gated by the Suspense boundary this is a fallback for) can't bleed through.
 */
export function LandingBlockerModal({ message }: { message: string }) {
    return <WorkspaceLoader message={message} />
}
