'use client'

import React, { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { createManualReminder } from '@/lib/actions/user-reminders'
import { useToast } from '@/components/ui/toast'

interface AddReminderPopoverProps {
    entityKey: 'platform.clients' | 'platform.engagements'
    entityValue: string
    entityName: string
    firmId: string
    ctaUrl: string | null
    disabled?: boolean
}

const textareaCls = 'flex w-full rounded border border-line bg-surface px-3 py-2 text-xs font-normal text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-action/30 focus:border-action disabled:opacity-50 disabled:cursor-not-allowed resize-none'

export function AddReminderPopover({
    entityKey,
    entityValue,
    entityName,
    firmId,
    ctaUrl,
    disabled = false,
}: AddReminderPopoverProps) {
    const { addToast } = useToast()
    const [open, setOpen] = useState(false)
    const [action, setAction] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        const label = action.trim()
        if (!label) return
        setSaving(true)
        try {
            await createManualReminder({
                entityKey,
                entityValue,
                action: label,
                dateValue: dueDate || null,
                entityName,
                firmId,
                ctaUrl,
                note: note.trim() || null,
            })
            addToast({ type: 'success', title: 'Reminder added', message: `"${label}" saved.` })
            setOpen(false)
            setAction('')
            setDueDate('')
            setNote('')
        } catch {
            addToast({ type: 'error', title: 'Failed', message: 'Could not save reminder.' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5 border-line text-fg-muted hover:text-fg"
                disabled={disabled}
                onClick={() => setOpen(true)}
            >
                <Bell className="h-3 w-3" />
                + Reminder
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-small font-medium text-fg-muted">
                            Add Reminder
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 pt-1">
                        <div>
                            <label className="text-small font-medium text-fg-muted block mb-1">
                                Action / label <span className="text-danger">*</span>
                            </label>
                            <Input
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                                placeholder="e.g. Post-delivery review"
                                className="border-line text-fg text-xs"
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-small font-medium text-fg-muted block mb-1">
                                Due date <span className="text-fg-subtle font-normal normal-case tracking-normal">— optional</span>
                            </label>
                            <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Select date" defaultTime="09:00" />
                        </div>

                        <div>
                            <label className="text-small font-medium text-fg-muted block mb-1">
                                Note <span className="text-fg-subtle font-normal normal-case tracking-normal">— optional</span>
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Context or details…"
                                rows={2}
                                className={textareaCls}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                variant="greenCta"
                                size="sm"
                                className="text-xs"
                                disabled={!action.trim() || saving}
                                onClick={handleSave}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
