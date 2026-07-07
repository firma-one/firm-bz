"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { NotificationsTable } from "./notifications-table"
import { BroadcastModal } from "./broadcast-modal"
import { useTabRightSlot, useTabCount } from "../layout-context"
import { Megaphone } from "lucide-react"

type NotificationItem = {
  id: string
  createdAt: string
  type: string
  priority?: 'INFO' | 'WARNING' | 'CRITICAL' | null
  title: string
  body: string | null
  ctaUrl: string | null
  readAt: string | null
  clientId?: string | null
  projectId?: string | null
  documentId?: string | null
  metadata?: Record<string, unknown>
}

type BroadcastScope = 'org' | 'client' | 'project'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [mounted, setMounted] = useState(false)
  const [canBroadcast, setCanBroadcast] = useState(false)
  const [broadcastScopes, setBroadcastScopes] = useState<BroadcastScope[]>([])
  const [broadcastOpen, setBroadcastOpen] = useState(false)

  const { setSlot } = useTabRightSlot()
  const setTabCount = useTabCount()

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { setMounted(true); return }
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      const notifs: NotificationItem[] = data.notifications ?? []
      setNotifications(notifs)
      setTabCount('/d/u/notifications', notifs.filter((n) => !n.readAt).length)
      setCanBroadcast(Boolean(data.canBroadcast))
      setBroadcastScopes(
        (Array.isArray(data.broadcastScopes) ? data.broadcastScopes : []).filter(
          (s: string) => s === 'org' || s === 'client' || s === 'project'
        )
      )
    } catch { /* ignore */ }
    setMounted(true)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Inject "New Broadcast" button into the tab strip slot
  useEffect(() => {
    if (!mounted || !canBroadcast) { setSlot(null); return }
    setSlot(
      <button
        type="button"
        onClick={() => setBroadcastOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
      >
        <Megaphone className="h-3.5 w-3.5" />
        New Broadcast
      </button>
    )
    return () => setSlot(null)
  }, [mounted, canBroadcast, setSlot])

  if (!mounted) return null

  return (
    <>
      <NotificationsTable initialNotifications={notifications} onRefresh={load} />
      <BroadcastModal
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        broadcastScopes={broadcastScopes}
        onSent={load}
      />
    </>
  )
}
