'use client'

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
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
import { createClientContact, deleteClientContact, listClientContacts, setClientContactPrimary, updateClientContact, type ClientContactRecord } from '@/lib/actions/client'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { useOrgSandbox } from '@/lib/use-org-sandbox'
import { cn } from '@/lib/utils'
import { UserPlus, Trash2, Pencil, X, Save, Star } from 'lucide-react'

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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Contacts</h2>
        <p className="text-sm text-slate-500">Keep track of key people for this client (external contacts).</p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Client contacts</span>
            {!loading && (
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
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
              size="sm"
              className="h-8 px-3 bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => {
                setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
                setNewContactModalOpen(true)
              }}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              <span className="text-xs font-medium">New contact</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No contacts yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const isEditing = editingId === c.id
              return (
                <div key={c.id} className={cn('p-5 flex flex-col gap-3', isEditing && 'bg-slate-50/60')}>
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
                            size="sm"
                            disabled={!canManage || isPending}
                            className="bg-slate-900 text-white hover:bg-slate-800"
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
        if (!open) setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">New contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {isSandboxFirm && <SandboxInfoBanner />}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Name</Label>
                <Input value={newContactDraft.name} onChange={(e) => setNewContactDraft((d) => ({ ...d, name: e.target.value }))} className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Email (optional)</Label>
                <Input value={newContactDraft.email} onChange={(e) => setNewContactDraft((d) => ({ ...d, email: e.target.value }))} className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Phone (optional)</Label>
                <Input value={newContactDraft.phone} onChange={(e) => setNewContactDraft((d) => ({ ...d, phone: e.target.value }))} className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Title (optional)</Label>
                <Input value={newContactDraft.title} onChange={(e) => setNewContactDraft((d) => ({ ...d, title: e.target.value }))} className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Tags (optional, comma-separated)</Label>
                <Input value={newContactDraft.tags} onChange={(e) => setNewContactDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="e.g. billing, primary" className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
              <div className="space-y-2">
                <Label className={isSandboxFirm ? 'text-slate-500' : 'text-slate-700'}>Notes (optional)</Label>
                <Input value={newContactDraft.notes} onChange={(e) => setNewContactDraft((d) => ({ ...d, notes: e.target.value }))} className="border-slate-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSandboxFirm} />
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end pt-2">
              <Button
                variant="outline"
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
                disabled={isPending}
                onClick={() => {
                  setNewContactModalOpen(false)
                  setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                disabled={isSandboxFirm || !canManage || isPending}
                className="bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => {
                  if (isSandboxFirm) return
                  const clean = normalizeDraft(newContactDraft)
                  startTransition(async () => {
                    try {
                      await createClientContact(orgSlug, clientSlug, {
                        name: clean.name,
                        email: clean.email || undefined,
                        phone: clean.phone || undefined,
                        title: clean.title || undefined,
                        notes: clean.notes || undefined,
                        tags: clean.tags.length ? clean.tags : undefined,
                      })
                      addToast({ type: 'success', title: 'Added', message: 'Contact added.' })
                      setNewContactModalOpen(false)
                      setNewContactDraft({ name: '', email: '', phone: '', title: '', notes: '', tags: '' })
                      await refresh()
                    } catch (e) {
                      addToast({ type: 'error', title: 'Failed', message: e instanceof Error ? e.message : 'Could not add contact.' })
                    }
                  })
                }}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={contactToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setContactToDelete(null)
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete contact?</DialogTitle>
            <DialogDescription className="text-slate-600">
              {contactToDelete ? (
                <>
                  This will permanently remove <span className="font-medium text-slate-800">{contactToDelete.name}</span>{' '}
                  from this client. This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
              disabled={isPending}
              onClick={() => setContactToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canManage || isPending || !contactToDelete}
              onClick={() => {
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
            >
              Delete contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

