'use client'

import { useState, useEffect } from 'react'
import { Bug } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { DebugContextModal } from './debug-context-modal'
import { useSidebar } from '@/lib/sidebar-context'

export function DebugFloatingTrigger() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { isCollapsed } = useSidebar()
  const sidebarWidth = isCollapsed ? 64 : 256
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!user) {
      setEnabled(false)
      return
    }
    fetch('/api/debug/enabled', { credentials: 'include' })
      .then((res) => res.ok && res.json())
      .then((data) => setEnabled(data?.enabled === true))
      .catch(() => setEnabled(false))
  }, [user])

  if (!enabled || !user) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Debug context"
        /* Bottom-LEFT, raised clear of the Next.js dev indicator which owns that corner at
           bottom-4 and is about 40px tall. The right corner is spoken for by the Brio launcher,
           the toasts and the upload/download panels, so this is the only free anchor — and a
           developer tool should yield to product chrome rather than the other way round.
        
           Offset by the sidebar, which owns this edge: a viewport-relative `left` would put the
           button underneath it. */
        style={{ left: `${sidebarWidth + 16}px` }}
        className="fixed bottom-20 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        <Bug className="h-5 w-5 text-slate-600" />
      </button>
      <DebugContextModal open={open} onOpenChange={setOpen} />
    </>
  )
}
