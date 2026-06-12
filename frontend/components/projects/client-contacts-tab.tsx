'use client'

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { createClientContact, deleteClientContact, listClientContacts, setClientContactPrimary, updateClientContact, type ClientContactRecord } from '@/lib/actions/client'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { cn } from '@/lib/utils'
import { UserPlus, Trash2, Pencil, X, Save, Star, CornerDownLeft } from 'lucide-react'

type Draft = { name: string; email: string; phone: string; title: string; notes: string; tags: string }

function normalizeDraft(d: Draft) {
  return {
    name: d.name.trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
    title: d.title.trim(),
    notes: d.notes.trim(),
    tags: d.tags.trim() ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  }
}

export function ClientContactsTab({
  orgSlug,
  clientSlug,
  canManage,
  firmSandboxOnly = false,
}: {
  orgSlug: string
  clientSlug: string
  canManage: boolean
  firmSandboxOnly?: boolean
}) {
  const { addToast } = useToast()
  const orgSandbox = useOrgSandbox()
  const isSandboxFirm = Boolean(firmSandboxOnly || orgSandbox?.sandboxOnly)
  const [isPending, startTransition] = useTransition()
  const [contacts, setContacts] = useState<ClientContactRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const [newContactModalOpen, setNewContactModalOpen] = useState(false)
  const [newContactDraft, setNewContactDraft] = useState<Draft>({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
  const [newContactTags, setNewContactTags] = useState<string[]>([])
  const [newContactTagInput, setNewContactTagInput] = useState('')
  const newContactTagInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
  const [contactToDelete, setContactToDelete] = useState<ClientContactRecord | null>(null)

  const refresh = useMemo(
    () => async () => {
      setLoading(true)
      try {
        const rows = await listClientContacts(orgSlug, clientSlug)
        setContacts(rows)
      } catch (e) {
        addToast({ type: 'error', title: 'Failed to load', message: e instanceof Error ? e.message : 'Could not load contacts.' })
      } finally {
        setLoading(false)
      }
    },
    [orgSlug, clientSlug, addToast]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const hay = [c.name, c.email ?? '', c.phone ?? '', c.title ?? '', (c.tags ?? []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [contacts, query])

  const beginEdit = (c: ClientContactRecord) => {
    setEditingId(c.id)
    setEditDraft({
      name: c.name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      title: c.title ?? '',
      notes: c.notes ?? '',
      tags: (c.tags ?? []).join(', '),
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
  }

  const commitNewTag = (raw: string) => {
    const value = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (value && !newContactTags.includes(value)) setNewContactTags((prev) => [...prev, value])
    setNewContactTagInput('')
  }
  const handleNewTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitNewTag(newContactTagInput) }
    else if (e.key === ',') { e.preventDefault(); commitNewTag(newContactTagInput) }
    else if (e.key === 'Backspace' && newContactTagInput === '' && newContactTags.length > 0) setNewContactTags((prev) => prev.slice(0, -1))
  }
  const handleNewTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.endsWith(',')) commitNewTag(val.slice(0, -1))
    else setNewContactTagInput(val)
  }
  const resetNewContact = () => {
    setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
    setNewContactTags([])
    setNewContactTagInput('')
  }

  const fieldLabel = 'font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] block mb-1'
  const inputCls = 'border-[#e5e7eb] text-[#1b1b1d] text-sm placeholder:text-[#9a9ba0] rounded focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Client contacts</span>
            {!loading && (
              <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block w-[220px]">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts..."
                className="border-slate-200 h-8 text-xs"
              />
            </div>
            <div className="sm:hidden w-[160px]">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="border-slate-200 h-8 text-xs"
              />
            </div>
            <Button
              disabled={!canManage && !isSandboxFirm}
              variant="ghost"
              size="sm"
              className="h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
              onClick={() => {
                setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
                setNewContactModalOpen(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              New contact
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No contacts yet.</div>
        ) : (
          <div className="divide-y divide-[#e5e7eb]">
            {filtered.map((c) => {
              const isEditing = editingId === c.id
              return (
                <div key={c.id} className={cn('p-4 flex flex-col gap-3 hover:bg-[#f3f4f6] transition-colors', isEditing && 'bg-[#f3f4f6]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                        {c.isPrimary && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Primary
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 truncate">
                        {c.title ?? '—'}
                        {c.email ? <span className="text-slate-300"> · </span> : null}
                        {c.email ? <span className="text-slate-600">{c.email}</span> : null}
                        {c.phone ? <span className="text-slate-300"> · </span> : null}
                        {c.phone ? <span className="text-slate-600">{c.phone}</span> : null}
                      </div>
                      {(c.tags?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(c.tags ?? []).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{t}</span>
                          ))}
                        </div>
                      ) : null}
                      {c.projectName ? <div className="text-xs text-slate-400 mt-1">Engagement: {c.projectName}</div> : null}
                      {c.notes ? <div className="text-sm text-slate-600 mt-2">{c.notes}</div> : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <Button
                            variant="greenCta"
                            size="sm"
                            disabled={!canManage || isPending}
                            onClick={() => {
                              const clean = normalizeDraft(editDraft)
                              startTransition(async () => {
                                try {
                                  await updateClientContact(orgSlug, clientSlug, c.id, {
                                    name: clean.name,
                                    email: clean.email,
                                    phone: clean.phone,
                                    title: clean.title,
                                    notes: clean.notes,
                                    tags: clean.tags,
                                  })
                                  addToast({ type: 'success', title: 'Saved', message: 'Contact updated.' })
                                  cancelEdit()
                                  await refresh()
                                } catch (e) {
                                  addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not save contact.' })
                                }
                              })
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            disabled={isPending}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {!c.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-200 text-amber-700 hover:bg-amber-50"
                              disabled={!canManage || isPending}
                              onClick={() => {
                                startTransition(async () => {
                                  try {
                                    await setClientContactPrimary(orgSlug, clientSlug, c.id)
                                    await refresh()
                                  } catch (e) {
                                    addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not set primary contact.' })
                                  }
                                })
                              }}
                              title="Set as primary contact"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            disabled={!canManage}
                            onClick={() => beginEdit(c)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            disabled={!canManage || isPending}
                            onClick={() => setContactToDelete(c)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-slate-700">Name</Label>
                        <Input value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Email</Label>
                        <Input value={editDraft.email} onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))} className="border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Phone</Label>
                        <Input value={editDraft.phone} onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))} className="border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Title</Label>
                        <Input value={editDraft.title} onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))} className="border-slate-200" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-slate-700">Tags (comma-separated)</Label>
                        <Input value={editDraft.tags} onChange={(e) => setEditDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="e.g. billing, primary" className="border-slate-200" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-slate-700">Notes</Label>
                        <Input value={editDraft.notes} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} className="border-slate-200" />
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={newContactModalOpen} onOpenChange={(open) => {
        setNewContactModalOpen(open)
        if (!open) resetNewContact()
      }}>
        <DialogContent className="sm:max-w-[560px] border-[#e5e7eb] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[2px]">
          <VisuallyHidden><DialogTitle>New Client Contact</DialogTitle></VisuallyHidden>

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
            <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">New Client Contact</p>
              <p className="text-xs text-[#45474c] mt-0.5">Add a contact person for this client.</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {isSandboxFirm && <SandboxInfoBanner />}

            {/* Name */}
            <div>
              <label className={fieldLabel}>Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></label>
              <Input value={newContactDraft.name} onChange={(e) => setNewContactDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Full name" className={inputCls} disabled={isSandboxFirm} />
            </div>

            {/* Email + Phone — 2 col */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Email <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                <Input value={newContactDraft.email} onChange={(e) => setNewContactDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@company.com" type="email" className={inputCls} disabled={isSandboxFirm} />
              </div>
              <div>
                <label className={fieldLabel}>Phone <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                <Input value={newContactDraft.phone} onChange={(e) => setNewContactDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 (555) 000-0000" type="tel" className={inputCls} disabled={isSandboxFirm} />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className={fieldLabel}>Job title <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
              <Input value={newContactDraft.title} onChange={(e) => setNewContactDraft((d) => ({ ...d, title: e.target.value }))} placeholder="e.g. CFO, Legal Counsel" className={inputCls} disabled={isSandboxFirm} />
            </div>

            {/* Tags — pill control */}
            <div>
              <label className={fieldLabel}>Tags <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
              <div
                className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-sm transition-colors cursor-text
                  ${isSandboxFirm
                    ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed'
                    : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'
                  }`}
                onClick={() => newContactTagInputRef.current?.focus()}
              >
                {newContactTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                    {tag}
                    {!isSandboxFirm && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setNewContactTags((prev) => prev.filter((t) => t !== tag)); newContactTagInputRef.current?.focus() }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  ref={newContactTagInputRef}
                  value={newContactTagInput}
                  onChange={handleNewTagChange}
                  onKeyDown={handleNewTagKeyDown}
                  onBlur={() => { if (newContactTagInput.trim()) commitNewTag(newContactTagInput) }}
                  placeholder={newContactTags.length === 0 ? 'e.g. billing, primary…' : ''}
                  disabled={isSandboxFirm}
                  className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-[#9a9ba0] text-[#1b1b1d] text-xs disabled:cursor-not-allowed"
                />
                <CornerDownLeft className="h-3 w-3 text-primary shrink-0 self-center ml-1" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={fieldLabel}>Notes <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
              <textarea
                value={newContactDraft.notes}
                onChange={(e) => setNewContactDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Any notes about this contact"
                rows={2}
                disabled={isSandboxFirm}
                className="flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
            <Button variant="outline" className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase" disabled={isPending} onClick={() => { setNewContactModalOpen(false); resetNewContact() }}>
              Cancel
            </Button>
            <Button
              variant="greenCta"
              disabled={isSandboxFirm || !canManage || isPending || !newContactDraft.name.trim()}
              className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white"
              onClick={() => {
                if (isSandboxFirm) return
                const finalTags = newContactTagInput.trim()
                  ? [...newContactTags, newContactTagInput.trim().toLowerCase().replace(/\s+/g, '-')]
                  : newContactTags
                startTransition(async () => {
                  try {
                    await createClientContact(orgSlug, clientSlug, {
                      name: newContactDraft.name.trim(),
                      email: newContactDraft.email.trim() || undefined,
                      phone: newContactDraft.phone.trim() || undefined,
                      title: newContactDraft.title.trim() || undefined,
                      notes: newContactDraft.notes.trim() || undefined,
                      tags: finalTags.length ? finalTags : undefined,
                    })
                    addToast({ type: 'success', title: 'Added', message: 'Contact added.' })
                    setNewContactModalOpen(false)
                    resetNewContact()
                    await refresh()
                  } catch (e) {
                    addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not add contact.' })
                  }
                })
              }}
            >
              {isPending ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={contactToDelete !== null}
        onOpenChange={(open) => { if (!open) setContactToDelete(null) }}
        icon={<Trash2 className="h-3.5 w-3.5" />}
        iconVariant="red"
        title="Delete contact"
        subtitle="This action cannot be undone."
        description={contactToDelete ? <>This will permanently remove <span className="font-semibold text-[#1b1b1d]">{contactToDelete.name}</span> from this client. This cannot be undone.</> : ''}
        confirmLabel="Delete contact"
        confirmVariant="red"
        onCancel={() => setContactToDelete(null)}
        onConfirm={() => {
          if (!contactToDelete) return
          const id = contactToDelete.id
          startTransition(async () => {
            try {
              await deleteClientContact(orgSlug, clientSlug, id)
              addToast({ type: 'success', title: 'Deleted', message: 'Contact deleted.' })
              setContactToDelete(null)
              await refresh()
            } catch (e) {
              addToast({
                type: 'error',
                title: 'Failed',
                message: e instanceof Error ? e.message : 'Could not delete contact.',
              })
            }
          })
        }}
        loading={isPending}
      />
    </div>
  )
}

