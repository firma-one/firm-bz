'use client'

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { createClientContact, deleteClientContact, listClientContacts, setClientContactPrimary, updateClientContact, type ClientContactRecord } from '@/lib/actions/client'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserPlus, UserMinus, Pencil, X, Star, CornerDownLeft, RefreshCw } from 'lucide-react'

type Draft = { name: string; email: string; phone: string; title: string; notes: string }

const EMPTY_DRAFT: Draft = { name: '', email: '', phone: '', title: '', notes: '' }

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

  // Unified add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ClientContactRecord | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [contactToDelete, setContactToDelete] = useState<ClientContactRecord | null>(null)

  const isEditing = editingContact !== null

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

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const hay = [c.name, c.email ?? '', c.phone ?? '', c.title ?? '', (c.tags ?? []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [contacts, query])

  const openAdd = () => {
    setEditingContact(null)
    setDraft(EMPTY_DRAFT)
    setTags([])
    setTagInput('')
    setModalOpen(true)
  }

  const openEdit = (c: ClientContactRecord) => {
    setEditingContact(c)
    setDraft({ name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', title: c.title ?? '', notes: c.notes ?? '' })
    setTags(c.tags ?? [])
    setTagInput('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingContact(null)
    setDraft(EMPTY_DRAFT)
    setTags([])
    setTagInput('')
  }

  const commitTag = (raw: string) => {
    const value = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value])
    setTagInput('')
  }
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTag(tagInput) }
    else if (e.key === ',') { e.preventDefault(); commitTag(tagInput) }
    else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1))
  }
  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.endsWith(',')) commitTag(val.slice(0, -1))
    else setTagInput(val)
  }

  const finalTags = () => tagInput.trim()
    ? [...tags, tagInput.trim().toLowerCase().replace(/\s+/g, '-')]
    : tags

  const handleSubmit = () => {
    if (isSandboxFirm) return
    const ft = finalTags()
    startTransition(async () => {
      try {
        if (isEditing && editingContact) {
          await updateClientContact(orgSlug, clientSlug, editingContact.id, {
            name: draft.name.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            title: draft.title.trim(),
            notes: draft.notes.trim(),
            tags: ft,
          })
          setContacts((prev) => prev.map((x) => x.id === editingContact.id
            ? { ...x, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), title: draft.title.trim(), notes: draft.notes.trim(), tags: ft }
            : x
          ))
          addToast({ type: 'success', title: 'Saved', message: 'Contact updated.' })
        } else {
          await createClientContact(orgSlug, clientSlug, {
            name: draft.name.trim(),
            email: draft.email.trim() || undefined,
            phone: draft.phone.trim() || undefined,
            title: draft.title.trim() || undefined,
            notes: draft.notes.trim() || undefined,
            tags: ft.length ? ft : undefined,
          })
          addToast({ type: 'success', title: 'Added', message: 'Contact added.' })
          await refresh()
        }
        closeModal()
      } catch (e) {
        addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not save contact.' })
      }
    })
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refresh()}
              disabled={loading}
              className="h-7 w-7 text-slate-400 hover:text-slate-600"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="hidden sm:block w-[220px]">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts..." className="border-slate-200 h-8 text-xs" />
            </div>
            <div className="sm:hidden w-[160px]">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="border-slate-200 h-8 text-xs" />
            </div>
            <Button
              disabled={!canManage && !isSandboxFirm}
              variant="ghost"
              size="sm"
              data-demo-tour="client-add-contact-btn"
              className="h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 hover:text-white shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0 inline-flex items-center gap-1.5"
              onClick={openAdd}
            >
              <UserPlus className="h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No contacts yet.</div>
        ) : (
          <div className="divide-y divide-[#e5e7eb]">
            {filtered.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#f3f4f6] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900 text-sm truncate">{c.name}</div>
                    {c.isPrimary && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Primary
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {c.title ?? '—'}
                    {c.email ? <><span className="text-slate-300"> · </span><span className="text-slate-600">{c.email}</span></> : null}
                    {c.phone ? <><span className="text-slate-300"> · </span><span className="text-slate-600">{c.phone}</span></> : null}
                  </div>
                  {(c.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(c.tags ?? []).map((t) => (
                        <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{t}</span>
                      ))}
                    </div>
                  )}
                  {c.notes && <div className="text-xs text-slate-500 mt-1 line-clamp-1">{c.notes}</div>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!c.isPrimary && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md inline-flex items-center justify-center text-amber-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                          disabled={!canManage || isPending}
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                await setClientContactPrimary(orgSlug, clientSlug, c.id)
                                setContacts((prev) => prev.map((x) => ({ ...x, isPrimary: x.id === c.id })))
                              } catch (e) {
                                addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not set primary contact.' })
                              }
                            })
                          }}
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Set as primary</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                        disabled={!canManage}
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md inline-flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                        disabled={!canManage || isPending}
                        onClick={() => setContactToDelete(c)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Remove</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-[560px] border-[#e5e7eb] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[2px]">
          <VisuallyHidden><DialogTitle>{isEditing ? 'Edit Contact' : 'New Client Contact'}</DialogTitle></VisuallyHidden>

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#f9f9fb] flex items-start gap-3">
            <div className="mt-0.5 h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
              {isEditing ? <Pencil className="h-3.5 w-3.5 text-primary" /> : <UserPlus className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1b1b1d] leading-tight">
                {isEditing ? `Edit ${editingContact?.name}` : 'New Client Contact'}
              </p>
              <p className="text-xs text-[#45474c] mt-0.5">
                {isEditing ? 'Update the details for this contact.' : 'Add a contact person for this client.'}
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {isSandboxFirm && <SandboxInfoBanner />}

            {/* Name */}
            <div>
              <label className={fieldLabel}>Name <span className="text-red-500 normal-case tracking-normal font-sans">*</span></label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Full name" className={inputCls} disabled={isSandboxFirm} />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Email <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                <Input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@company.com" type="email" className={inputCls} disabled={isSandboxFirm} />
              </div>
              <div>
                <label className={fieldLabel}>Phone <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
                <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 (555) 000-0000" type="tel" className={inputCls} disabled={isSandboxFirm} />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className={fieldLabel}>Job title <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
              <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="e.g. CFO, Legal Counsel" className={inputCls} disabled={isSandboxFirm} />
            </div>

            {/* Tags */}
            <div>
              <label className={fieldLabel}>Tags <span className="normal-case tracking-normal font-sans text-[#9a9ba0]">(optional)</span></label>
              <div
                className={`flex flex-wrap gap-1.5 min-h-[36px] w-full rounded border px-3 py-2 text-sm transition-colors cursor-text ${isSandboxFirm ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-50 cursor-not-allowed' : 'border-[#e5e7eb] bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'}`}
                onClick={() => tagInputRef.current?.focus()}
              >
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-0.5 text-[11px] font-medium text-[#45474c]">
                    {tag}
                    {!isSandboxFirm && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setTags((prev) => prev.filter((t) => t !== tag)); tagInputRef.current?.focus() }} className="text-[#9a9ba0] hover:text-[#1b1b1d] transition-colors" aria-label={`Remove ${tag}`}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={handleTagChange}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }}
                  placeholder={tags.length === 0 ? 'e.g. billing, primary…' : ''}
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
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Any notes about this contact"
                rows={2}
                disabled={isSandboxFirm}
                className="flex w-full rounded border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1b1b1d] placeholder:text-[#9a9ba0] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-3">
            <Button variant="outline" className="rounded-[2px] text-[10px] font-headline font-bold tracking-widest uppercase" disabled={isPending} onClick={closeModal}>
              Cancel
            </Button>
            <Button
              variant="greenCta"
              disabled={isSandboxFirm || !canManage || isPending || !draft.name.trim()}
              className="rounded-[2px] min-w-[8rem] text-[10px] font-headline font-bold tracking-widest uppercase text-white"
              onClick={handleSubmit}
            >
              {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={contactToDelete !== null}
        onOpenChange={(open) => { if (!open) setContactToDelete(null) }}
        icon={<UserMinus className="h-3.5 w-3.5" />}
        iconVariant="red"
        title="Remove contact"
        subtitle="This action cannot be undone."
        description={contactToDelete ? <>This will permanently remove <span className="font-semibold text-[#1b1b1d]">{contactToDelete.name}</span> from this client.</> : ''}
        confirmLabel="Remove contact"
        confirmVariant="red"
        onCancel={() => setContactToDelete(null)}
        onConfirm={() => {
          if (!contactToDelete) return
          const id = contactToDelete.id
          startTransition(async () => {
            try {
              await deleteClientContact(orgSlug, clientSlug, id)
              addToast({ type: 'success', title: 'Removed', message: 'Contact removed.' })
              setContacts((prev) => prev.filter((x) => x.id !== id))
              setContactToDelete(null)
            } catch (e) {
              addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not remove contact.' })
            }
          })
        }}
        loading={isPending}
      />
    </div>
  )
}
