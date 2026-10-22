'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AtSign, Clock3, Mail, Shield, Type, UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Tag } from '@/components/ui/tag'
import { StatusPill } from '@/components/ui/status-pill'
import { Hint } from '@/components/ui/tooltip'
import {
    NotionTable,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { initialsOf } from '@/lib/initials'

interface DemoEngagementMember {
    name: string
    email: string
    role: ReactNode
    addedDaysAgo: number
}

/** The app's engagement roles, tagged as member-list.tsx tags them. */
const DEMO_ENGAGEMENT_MEMBERS: DemoEngagementMember[] = [
    { name: 'Alex Jordan', email: 'alex@beacongrowth.com', role: <Tag color="purple">Owner</Tag>, addedDaysAgo: 88 },
    { name: 'Sam Rivera', email: 'sam@beacongrowth.com', role: <Tag color="gray">Contributor · Full Access</Tag>, addedDaysAgo: 85 },
    { name: 'Jordan Lee', email: 'jordan@beacongrowth.com', role: <Tag color="gray">Contributor · Full Access</Tag>, addedDaysAgo: 60 },
    { name: 'Morgan Ellis', email: 'morgan@client-example.com', role: <Tag color="blue">Reviewer</Tag>, addedDaysAgo: 41 },
]

/** The invitation the engagement's Overview counts as pending. */
const INVITEE = 'riley@client-example.com'
const INVITEE_ROLE = <Tag color="blue">Reviewer</Tag>

/** Static counterpart to engagement-members-tab.tsx: the same count line and members table. No write actions. */
export function DemoEngagementMembers() {
    // Relative to now, so set after mount to keep server and client markup equal.
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])

    return (
        <div className="flex flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between gap-3">
                <span className="text-small tabular-nums text-fg-muted">{DEMO_ENGAGEMENT_MEMBERS.length} people</span>
                <Hint label="Not available in this demo" side="bottom">
                    <span>
                        <Button size="sm" type="button" disabled>
                            <UserPlus className="h-3.5 w-3.5" />
                            Invite
                        </Button>
                    </span>
                </Hint>
            </div>
            <NotionTable>
                <NotionTableHeader>
                    <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                    <NotionTableHead icon={<AtSign />} className="hidden md:table-cell">Email</NotionTableHead>
                    <NotionTableHead icon={<Shield />}>Role</NotionTableHead>
                    <NotionTableHead icon={<Clock3 />} className="hidden sm:table-cell">Added</NotionTableHead>
                </NotionTableHeader>
                <NotionTableBody>
                    {DEMO_ENGAGEMENT_MEMBERS.map((m) => (
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
                            <NotionTableCell>{m.role}</NotionTableCell>
                            <NotionTableCell className="hidden whitespace-nowrap sm:table-cell">
                                {now !== null && (
                                    <RelativeDateTime
                                        date={new Date(now - m.addedDaysAgo * 86400000).toISOString()}
                                        textClassName="text-small text-fg-muted"
                                        iconClassName="hidden"
                                        tooltipSide="left"
                                    />
                                )}
                            </NotionTableCell>
                        </NotionTableRow>
                    ))}
                    {/* A pending invitation, as member-list.tsx draws one: the email, a dashed avatar and the "Invited" pill */}
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
                        <NotionTableCell>{INVITEE_ROLE}</NotionTableCell>
                        <NotionTableCell className="hidden sm:table-cell">
                            <StatusPill kind="invitation" status="PENDING" />
                        </NotionTableCell>
                    </NotionTableRow>
                </NotionTableBody>
            </NotionTable>
        </div>
    )
}
