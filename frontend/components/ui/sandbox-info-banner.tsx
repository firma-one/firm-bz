'use client'

import { Info } from 'lucide-react'

/** Same copy as {@link SandboxInfoBanner}; use for toast when no in-app surface exists (e.g. OS / Drive pickers). */
export const SANDBOX_OPERATION_MESSAGE = 'This operation is not permitted in the Demo firm.'

/**
 * Reusable banner for Sandbox restrictions. Use in modals/panes where the user
 * can see the form but cannot create or change data (e.g. Add Client, New Engagement,
 * Invite member, Comments, etc.).
 */
export function SandboxInfoBanner() {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-950"
    >
      <Info className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
      <p className="leading-snug">
        {SANDBOX_OPERATION_MESSAGE}
      </p>
    </div>
  )
}
