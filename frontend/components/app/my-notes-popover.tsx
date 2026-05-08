'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, RotateCcw, Trash2, Save, Loader2, NotebookPen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tip'

type Line = { raw: string; checked: boolean; text: string; prefix: string }

function parseChecklist(text: string): Line[] {
  return text.split('\n').map((raw) => {
    const m = raw.match(/^(\s*[-*]\s*)\[( |x|X)\]\s+(.*)$/)
    if (!m) return { raw, checked: false, text: raw, prefix: '' }
    return { raw, checked: m[2].toLowerCase() === 'x', text: m[3] ?? '', prefix: m[1] ?? '- ' }
  })
}

function serializeChecklist(lines: Line[]): string {
  return lines
    .map((l) => {
      // Preserve non-checklist lines as-is
      const m = l.raw.match(/^(\s*[-*]\s*)\[( |x|X)\]\s+(.*)$/)
      if (!m) return l.raw
      const prefix = l.prefix || m[1] || '- '
      return `${prefix}[${l.checked ? 'x' : ' '}] ${l.text}`
    })
    .join('\n')
}

export function MyNotesPopover() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [initialNotes, setInitialNotes] = useState('')
  const closeTimeoutRef = useRef<number | null>(null)

  const lines = useMemo(() => parseChecklist(notes), [notes])
  const checklistOnly = useMemo(() => lines.filter((l) => l.prefix !== ''), [lines])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      const res = await fetch('/api/notes', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to load notes')
      }
      const data = await res.json()
      setNotes(data.notes ?? '')
      setInitialNotes(data.notes ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (next: string) => {
    setSaving(true)
    setError(null)
    try {
      const { getSession } = await import('@/lib/supabase')
      const session = await getSession()
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ notes: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save notes')
      }
      setInitialNotes(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save notes')
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  // Autosave shortly after changes (lightweight, avoids aggressive writes)
  useEffect(() => {
    if (!open) return
    if (notes === initialNotes) return
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = window.setTimeout(() => {
      save(notes)
    }, 650)
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current)
    }
  }, [notes, initialNotes, open, save])

  const toggleLine = (idx: number) => {
    const nextLines = [...lines]
    const l = nextLines[idx]
    if (!l) return
    if (!l.prefix) {
      // Convert plain line into a checklist item
      nextLines[idx] = { ...l, prefix: '- ', checked: true, text: l.text.trim() || 'New item', raw: `- [x] ${l.text.trim() || 'New item'}` }
    } else {
      nextLines[idx] = { ...l, checked: !l.checked }
    }
    setNotes(serializeChecklist(nextLines))
  }

  const markAllDone = () => {
    const next = lines.map((l) => (l.prefix ? { ...l, checked: true } : l))
    setNotes(serializeChecklist(next))
  }

  const restartAll = () => {
    const next = lines.map((l) => (l.prefix ? { ...l, checked: false } : l))
    setNotes(serializeChecklist(next))
  }

  const clearAll = () => setNotes('')

  return (
    <div className="relative">
      <Tip label="My Notes" position="bottom">
      <button
        type="button"
        className="p-2 text-slate-600/80 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors relative"
        aria-label="My Notes"
        onClick={() => setOpen((v) => !v)}
      >
        <NotebookPen className="h-5 w-5 text-slate-700" />
        {checklistOnly.length > 0 ? (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-slate-600 text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
            {checklistOnly.length}
          </span>
        ) : notes.trim().length > 0 ? (
          <span className="absolute top-0.5 right-0.5 h-2 w-2 bg-slate-400 rounded-full border border-white" />
        ) : null}
      </button>
      </Tip>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-900 tracking-tight">My Notes</span>
                {checklistOnly.length > 0 ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-white">
                    {checklistOnly.length}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                {saving ? (
                  <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving</span>
                ) : notes === initialNotes ? (
                  <span className="inline-flex items-center gap-1"><Save className="h-3 w-3" />Saved</span>
                ) : (
                  <span>Edited</span>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                onClick={markAllDone}
                title="Mark all done"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark all done
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900"
                onClick={restartAll}
                title="Restart checklist"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restart
              </button>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-800"
                onClick={clearAll}
                title="Clear all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-100">
              {error}
            </div>
          ) : null}

          <div className="p-3 grid grid-cols-1 gap-3 max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="text-sm text-slate-500 px-1 py-8 text-center">Loading…</div>
            ) : (
              <>
                {/* Checklist view */}
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                    <span>Checklist</span>
                    <span className="text-slate-500">
                      {checklistOnly.filter((l) => l.checked).length}/{checklistOnly.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    {lines
                      .map((l, idx) => ({ l, idx }))
                      .filter(({ l }) => l.prefix !== '' && l.text.trim().length > 0)
                      .slice(0, 50)
                      .map(({ l, idx }) => (
                        <button
                          key={`${idx}-${l.text}`}
                          type="button"
                          className={cn(
                            'w-full text-left px-2 py-1.5 rounded-md border',
                            l.checked
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                          )}
                          onClick={() => toggleLine(idx)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className={cn('text-xs font-medium truncate', l.checked && 'line-through opacity-80')}>
                              {l.text}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500">
                              {l.checked ? 'Done' : 'Todo'}
                            </div>
                          </div>
                        </button>
                      ))}
                    {checklistOnly.length === 0 ? (
                      <div className="px-2 py-4 text-xs text-slate-500">
                        Add lines like <span className="font-mono">- [ ] follow up</span> below.
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Raw markdown editor */}
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 text-[11px] font-semibold text-slate-600">
                    Markdown
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="- [ ] Draft email\n- [ ] Review deck\n\nFreeform notes…"
                    rows={9}
                    className="w-full px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none resize-none"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

