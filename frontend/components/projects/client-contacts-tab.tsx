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
import { createClientContact, deleteClientContact, listClientContacts, updateClientContact, type ClientContactRecord } from '@/lib/actions/client'
import { AtSign, Briefcase, Contact, CornerDownLeft, Pencil, Phone, Plus, RefreshCw, Search, Star, Tags, Type, UserMinus, UserPlus, X } from 'lucide-react'
import {
  NotionTable,
  NotionTableActions,
  NotionTableActionsHead,
  NotionTableBody,
  NotionTableCell,
  NotionTableHead,
  NotionTableHeader,
  NotionTableRow,
} from '@/components/ui/notion-table'
import { Tag } from '@/components/ui/tag'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { LoadingAnnouncement, ShimmerBar } from '@/components/ui/shimmer'

type Draft = { name: string; email: string; phone: string; title: string; notes: string }

const EMPTY_DRAFT: Draft = { name: '', email: '', phone: '', title: '', notes: '' }

export function ClientContactsTab({
  orgSlug,
  clientSlug,
  canManage,
}: {
  orgSlug: string
  clientSlug: string
  canManage: boolean
}) {
  const { addToast } = useToast()
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

  const fieldLabel = 'mb-1 block text-small font-medium text-fg-muted'
  const optional = <span className="font-normal text-fg-subtle">(optional)</span>

  return (
    <div className="space-y-3">
      {/* Toolbar: search on the left, refresh and add on the right */}
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-[260px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
            className="h-7 pl-7 text-small"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={loading} title="Refresh" aria-label="Refresh contacts" className="h-7 w-7">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canManage && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" />
              New contact
            </Button>
          )}
        </div>
      </div>

      {loading && contacts.length === 0 ? (
        <div aria-busy="true">
          <LoadingAnnouncement label="Loading contacts" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-9 items-center gap-2 border-b border-line pl-1" aria-hidden>
              <ShimmerBar className="w-40" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={<Contact />}
          title={query.trim() ? 'No matching contacts' : 'No contacts yet'}
          description={query.trim() ? 'Try a different name, email or tag.' : 'The people you work with at this client — billing, legal, sign-off.'}
        />
      ) : (
        <NotionTable>
          <NotionTableHeader>
            <NotionTableHead icon={<Type />}>Name</NotionTableHead>
            <NotionTableHead icon={<Briefcase />} className="hidden md:table-cell">Title</NotionTableHead>
            <NotionTableHead icon={<AtSign />}>Email</NotionTableHead>
            <NotionTableHead icon={<Phone />} className="hidden lg:table-cell">Phone</NotionTableHead>
            <NotionTableHead icon={<Tags />} className="hidden sm:table-cell">Tags</NotionTableHead>
            {canManage && <NotionTableActionsHead />}
          </NotionTableHeader>
          <NotionTableBody>
            {filtered.map((c) => (
              <NotionTableRow key={c.id} onClick={canManage ? () => openEdit(c) : undefined}>
                <NotionTableCell className="max-w-0 w-[28%]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium" title={c.notes ? `${c.name} — ${c.notes}` : c.name}>{c.name}</span>
                    {c.isPrimary && (
                      <Tag color="yellow" className="shrink-0" icon={<Star />}>
                        Primary
                      </Tag>
                    )}
                  </div>
                </NotionTableCell>
                <NotionTableCell className="hidden max-w-[12rem] truncate text-fg-muted md:table-cell">
                  {c.title || <span className="text-fg-subtle">—</span>}
                </NotionTableCell>
                <NotionTableCell className="max-w-[16rem] truncate">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="text-fg-muted hover:text-fg hover:underline">{c.email}</a>
                  ) : <span className="text-fg-subtle">—</span>}
                </NotionTableCell>
                <NotionTableCell className="hidden whitespace-nowrap tabular-nums text-fg-muted lg:table-cell">
                  {c.phone || <span className="text-fg-subtle">—</span>}
                </NotionTableCell>
                <NotionTableCell className="hidden sm:table-cell">
                  {(c.tags?.length ?? 0) > 0 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {(c.tags ?? []).slice(0, 3).map((t) => <Tag key={t} color="gray">{t}</Tag>)}
                      {(c.tags?.length ?? 0) > 3 && <span className="text-caption text-fg-subtle">+{(c.tags?.length ?? 0) - 3}</span>}
                    </span>
                  ) : <span className="text-fg-subtle">—</span>}
                </NotionTableCell>
                {canManage && (
                  <NotionTableActions>
                    <span className="inline-flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Edit" aria-label={`Edit ${c.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" disabled={isPending} onClick={() => setContactToDelete(c)} title="Remove" aria-label={`Remove ${c.name}`}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </NotionTableActions>
                )}
              </NotionTableRow>
            ))}
          </NotionTableBody>
        </NotionTable>
      )}

      {/* Add / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <VisuallyHidden><DialogTitle>{isEditing ? 'Edit Contact' : 'New Client Contact'}</DialogTitle></VisuallyHidden>

          {/* Header */}
          <div className="px-5 py-4 border-b border-line flex items-start gap-3">
            <div className="mt-0.5 h-7 w-7 rounded-control bg-surface-muted text-fg-muted flex items-center justify-center shrink-0">
              {isEditing ? <Pencil className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            </div>
            <div>
              <p className="text-ui font-semibold text-fg leading-tight">
                {isEditing ? `Edit ${editingContact?.name}` : 'New contact'}
              </p>
              <p className="text-small text-fg-muted mt-0.5">
                {isEditing ? 'Update the details for this contact.' : 'Add a contact person for this client.'}
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">

            {/* Name */}
            <div>
              <label className={fieldLabel}>Name <span className="text-danger">*</span></label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Full name" />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Email {optional}</label>
                <Input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@company.com" type="email" />
              </div>
              <div>
                <label className={fieldLabel}>Phone {optional}</label>
                <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 (555) 000-0000" type="tel" />
              </div>
            </div>

            {/* Title */}
            <div>
              <label className={fieldLabel}>Job title {optional}</label>
              <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="e.g. CFO, Legal Counsel" />
            </div>

            {/* Tags */}
            <div>
              <label className={fieldLabel}>Tags {optional}</label>
              <div
                className="flex flex-wrap gap-1.5 min-h-[36px] w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui transition-colors cursor-text focus-within:ring-2 focus-within:ring-action/30 focus-within:border-action"
                onClick={() => tagInputRef.current?.focus()}
              >
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-control bg-surface-muted px-1.5 py-0.5 text-small text-fg-muted">
                    {tag}
                    <button type="button" onClick={(e) => { e.stopPropagation(); setTags((prev) => prev.filter((t) => t !== tag)); tagInputRef.current?.focus() }} className="text-fg-subtle hover:text-fg transition-colors" aria-label={`Remove ${tag}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={handleTagChange}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => { if (tagInput.trim()) commitTag(tagInput) }}
                  placeholder={tags.length === 0 ? 'e.g. billing, primary…' : ''}
                  className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-fg-subtle text-fg text-small disabled:cursor-not-allowed"
                />
                <CornerDownLeft className="h-3 w-3 text-fg-subtle shrink-0 self-center ml-1" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={fieldLabel}>Notes {optional}</label>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Any notes about this contact"
                rows={2}
                className="flex w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-action/30 focus:border-action disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
            <Button variant="outline" disabled={isPending} onClick={closeModal}>
              Cancel
            </Button>
            <Button
              disabled={!canManage || isPending || !draft.name.trim()}
              className="min-w-[8rem]"
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
        description={contactToDelete ? <>This will permanently remove <span className="font-semibold text-fg">{contactToDelete.name}</span> from this client.</> : ''}
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
