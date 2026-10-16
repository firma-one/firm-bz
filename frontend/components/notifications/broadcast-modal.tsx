"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Megaphone } from "lucide-react"
import { supabase } from "@/lib/supabase"

type BroadcastScope = 'org' | 'client' | 'project'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  broadcastScopes: BroadcastScope[]
  onSent: () => void
}

export function BroadcastModal({ open, onOpenChange, broadcastScopes, onSent }: Props) {
  const [scope, setScope] = useState<BroadcastScope>('org')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep default scope in sync with available scopes
  useEffect(() => {
    if (!broadcastScopes.length) return
    if (broadcastScopes.includes(scope)) return
    if (broadcastScopes.includes('org')) { setScope('org'); return }
    if (broadcastScopes.includes('client')) { setScope('client'); return }
    setScope('project')
  }, [broadcastScopes]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    if (sending) return
    setTitle('')
    setMessage('')
    setError(null)
    onOpenChange(false)
  }

  async function handleSend() {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Session expired. Please refresh.'); return }
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: title.trim() || undefined, message: message.trim(), scope }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Failed to send broadcast.')
        return
      }
      window.dispatchEvent(new CustomEvent('pockett-notifications-updated'))
      onSent()
      handleClose()
    } finally {
      setSending(false)
    }
  }

  const SCOPE_LABELS: Record<BroadcastScope, string> = {
    org: 'Firm Members',
    client: 'Client Partners & Stakeholders',
    project: 'Engagement Members',
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0">
        <VisuallyHidden><DialogTitle>New Broadcast</DialogTitle></VisuallyHidden>

        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start gap-3">
          <div className="mt-0.5 h-7 w-7 rounded bg-surface-muted flex items-center justify-center shrink-0">
            <Megaphone className="h-3.5 w-3.5 text-fg-muted" />
          </div>
          <div>
            <p className="text-sm font-semibold text-fg leading-tight">New Broadcast</p>
            <p className="text-xs text-fg-muted mt-0.5">Send a notification to your team.</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-tag-red-bg border border-tag-red-bg text-tag-red-fg text-xs px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* Scope */}
          <div>
            <p className="text-small font-medium text-fg-muted mb-2">
              Scope <span className="normal-case tracking-normal font-sans text-fg-subtle font-normal">— choose who receives this broadcast</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['org', 'client', 'project'] as const).map((s) => {
                const enabled = broadcastScopes.includes(s)
                const isActive = scope === s
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!enabled}
                    onClick={() => enabled && setScope(s)}
                    className={`h-9 rounded border px-2 text-xs font-semibold transition-colors ${
                      !enabled
                        ? 'border-line bg-surface-subtle text-fg-muted cursor-not-allowed opacity-40'
                        : isActive
                          ? 'border-primary bg-surface-muted text-fg-muted'
                          : 'border-line bg-surface text-fg hover:border-primary/50 hover:bg-surface-hover'
                    }`}
                  >
                    {SCOPE_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-small font-medium text-fg-muted block mb-1">
              Title <span className="normal-case tracking-normal font-sans text-fg-subtle font-normal">(optional)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. System maintenance tonight"
              className="w-full h-9 rounded border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-action/30 focus:border-action"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-small font-medium text-fg-muted block mb-1">
              Message <span className="text-danger normal-case tracking-normal font-sans font-normal">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              placeholder="Broadcast message (max 1000 chars)…"
              rows={5}
              className="w-full rounded border border-line bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-action/30 focus:border-action resize-none"
            />
            <p className="text-caption text-[#9ca3af] mt-1 text-right">{message.length}/1000</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            className="h-9 px-4 rounded border border-line bg-surface text-sm text-fg-muted hover:bg-[#f3f4f6] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending || message.trim().length === 0}
            onClick={handleSend}
            className="h-9 px-4 rounded bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
