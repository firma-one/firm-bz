'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Clock, FileWarning, FolderOpen, HardDrive, Inbox, MessagesSquare, Share2 } from 'lucide-react'
import { ActionSection, attentionCount, type ActionItem } from '@/components/dashboard/action-list'
import type { DemoFirm } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Static counterpart to FirmActionCenter (components/dashboard/firm-action-center.tsx): the same
 * Linear-style groups, counted from the sample firm's deliverables. The demo has no reminders,
 * comments or document scan, so those rows read zero and fold into "nothing to do". Counts depend
 * on today, so they are worked out after mount.
 */
export function DemoFirmActionCenter({ firm }: { firm: DemoFirm }) {
    const [counts, setCounts] = useState<{ overdue: number; upcoming: number } | null>(null)

    useEffect(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const open = firm.clients
            .flatMap((c) => c.engagements)
            .flatMap((e) => getDemoDeliverables(e))
            .filter((d) => d.status !== 'approved' && d.dueDate)
            .map((d) => {
                const due = new Date(d.dueDate!)
                due.setHours(0, 0, 0, 0)
                return Math.round((due.getTime() - today.getTime()) / 86400000)
            })
        setCounts({ overdue: open.filter((n) => n < 0).length, upcoming: open.filter((n) => n >= 0 && n <= 14).length })
    }, [firm])

    const followUps: ActionItem[] = [
        { key: 'overdue', label: 'Overdue', count: counts?.overdue ?? 0, severity: 'critical', icon: AlertTriangle, sub: plural(counts?.overdue ?? 0, 'deliverable') },
        { key: 'upcoming', label: 'Upcoming', count: counts?.upcoming ?? 0, severity: 'info', icon: Clock, sub: `${plural(counts?.upcoming ?? 0, 'deliverable')} in the next two weeks` },
        { key: 'threads', label: 'Unanswered comments', count: 0, severity: 'warning', icon: MessagesSquare },
    ]
    const documents: ActionItem[] = [
        { key: 'sensitive', label: 'Sensitive files', count: 0, severity: 'critical', icon: FileWarning },
        { key: 'sharing', label: 'Sharing alerts', count: 0, severity: 'warning', icon: Share2 },
        { key: 'storage', label: 'Large files', count: 0, severity: 'warning', icon: HardDrive },
    ]
    const attentionTotal = attentionCount(followUps, documents)

    return (
        <div>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                    <Inbox className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <h2 className="truncate text-h3 text-fg">Action Center</h2>
                    {attentionTotal > 0 && <span className="text-small tabular-nums text-fg-subtle">{attentionTotal}</span>}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ActionSection title="Follow-ups" icon={CalendarClock} items={followUps} />
                    <ActionSection
                        title="Documents"
                        icon={FolderOpen}
                        items={documents}
                        footer={<p className="px-2 pt-1 text-caption text-fg-subtle">Full scan today</p>}
                    />
                </div>
            </div>
        </div>
    )
}
