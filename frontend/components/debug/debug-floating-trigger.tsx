'use client'

import { useState, useEffect } from 'react'
import { Bug } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { DebugContextModal } from './debug-context-modal'

export function DebugFloatingTrigger() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
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
        /* Bottom-LEFT over the sidebar, sitting above the Next.js dev indicator which owns the
           very corner. Both are developer tools and belong together, away from product chrome:
           the right corner is spoken for by the Brio launcher, the toasts and the progress
           panels. */
        className="fixed bottom-20 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        <Bug className="h-5 w-5 text-slate-600" />
      </button>
      <DebugContextModal open={open} onOpenChange={setOpen} />
    </>
  )
}
