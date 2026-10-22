'use client'

import { AtSign, Clock3, Mail, Shield, Type } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Tag } from '@/components/ui/tag'
import { StatusPill } from '@/components/ui/status-pill'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
    NotionTable,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { initialsOf } from '@/lib/initials'

interface DemoMember {
    name: string
    email: string
    role: 'firm_admin' | 'firm_member'
    joinedDaysAgo: number
}

export const DEMO_MEMBERS: DemoMember[] = [
    { name: 'Alex Jordan', email: 'alex@beacongrowth.com', role: 'firm_admin', joinedDaysAgo: 420 },
    { name: 'Sam Rivera', email: 'sam@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 310 },
    { name: 'Jordan Lee', email: 'jordan@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 180 },
    { name: 'Taylor Kim', email: 'taylor@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 95 },
]

const INVITEE = 'casey@beacongrowth.com'

/** Static counterpart to firm-members-tab.tsx: the same table, over a plausible team. No write actions. */
export function DemoFirmMembers() {
    const now = Date.now()
    return (
        <TooltipProvider>
            <NotionTable>
                <NotionTableHeader>
                    <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                    <NotionTableHead icon={<AtSign />} className="hidden md:table-cell">Email</NotionTableHead>
                    <NotionTableHead icon={<Shield />}>Role</NotionTableHead>
                    <NotionTableHead icon={<Clock3 />} className="hidden sm:table-cell">Added</NotionTableHead>
                </NotionTableHeader>
                <NotionTableBody>
                    {DEMO_MEMBERS.map((m) => (
                        <NotionTableRow key={m.email}>
                            <NotionTableCell>
                                <div className="flex min-w-0 items-center gap-2">
                                    <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarFallback className="text-[9px]">{initialsOf(m.name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="truncate">{m.name}</span>
                                </div>
                            </NotionTableCell>
                            <NotionTableCell className="hidden max-w-[16rem] truncate text-fg-muted md:table-cell">{m.email}</NotionTableCell>
                            <NotionTableCell>
                                <Tag color={m.role === 'firm_admin' ? 'purple' : 'gray'}>{m.role === 'firm_admin' ? 'Firm admin' : 'Member'}</Tag>
                            </NotionTableCell>
                            <NotionTableCell className="hidden whitespace-nowrap sm:table-cell">
                                <RelativeDateTime
                                    date={new Date(now - m.joinedDaysAgo * 86400000).toISOString()}
                                    textClassName="text-small text-fg-muted"
                                    iconClassName="hidden"
                                    tooltipSide="left"
                                />
                            </NotionTableCell>
                        </NotionTableRow>
                    ))}
                    {/* A pending invitation, as firm-members-tab.tsx draws one: the email, a dashed avatar and the "Invited" pill */}
                    <NotionTableRow>
                        <NotionTableCell>
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-fg-subtle">
                                    <Mail className="h-3 w-3" />
                                </span>
                                <span className="truncate text-fg-muted">{INVITEE}</span>
                            </div>
                        </NotionTableCell>
                        <NotionTableCell className="hidden text-fg-subtle md:table-cell">—</NotionTableCell>
                        <NotionTableCell><Tag color="gray">Member</Tag></NotionTableCell>
                        <NotionTableCell className="hidden sm:table-cell">
                            <StatusPill kind="invitation" status="PENDING" />
                        </NotionTableCell>
                    </NotionTableRow>
                </NotionTableBody>
            </NotionTable>
        </TooltipProvider>
    )
}
