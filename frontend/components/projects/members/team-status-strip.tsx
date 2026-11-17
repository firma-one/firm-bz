'use client'

import { UserCheck, Users } from 'lucide-react'
import { DATA } from '@/components/projects/insight-rings'
import { Legend, SegmentedBar, type ChartSegment } from '@/components/projects/overview-charts'
import { StatusCell } from '@/components/projects/overview-layout'
import { ROLE_SHORT_NAME, isPersonaUiSlug, type PersonaUiSlug } from '@/lib/persona-ui-groups'

/** The roles in the order the bar draws them: internal ones first, then the limited ones. */
const ROLE_ORDER: PersonaUiSlug[] = ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer']
const INTERNAL: ReadonlySet<PersonaUiSlug> = new Set<PersonaUiSlug>(['eng_admin', 'eng_member'])
/** Not a status: the categorical grays, darkest first. */
const ROLE_HEX: Record<PersonaUiSlug, string> = {
    eng_admin: DATA.category1,
    eng_member: DATA.category2,
    eng_ext_collaborator: DATA.category3,
    eng_viewer: DATA.category4,
}

export interface TeamStatus {
    joined: number
    invited: number
    roles: ChartSegment[]
    internal: number
    limited: number
}

/** Who is on the engagement, from the member list: `role` is each member's persona slug. */
export function teamStatusOf(members: { role?: string | null }[], invitedCount: number): TeamStatus {
    const counts = new Map<PersonaUiSlug, number>()
    for (const m of members) {
        if (m.role && isPersonaUiSlug(m.role)) counts.set(m.role, (counts.get(m.role) ?? 0) + 1)
    }
    const roles = ROLE_ORDER.filter((slug) => (counts.get(slug) ?? 0) > 0)
        .map((slug) => ({ label: ROLE_SHORT_NAME[slug], hex: ROLE_HEX[slug], value: counts.get(slug) ?? 0 }))
    const internal = ROLE_ORDER.filter((s) => INTERNAL.has(s)).reduce((sum, s) => sum + (counts.get(s) ?? 0), 0)
    const limited = ROLE_ORDER.filter((s) => !INTERNAL.has(s)).reduce((sum, s) => sum + (counts.get(s) ?? 0), 0)
    return { joined: members.length, invited: invitedCount, roles, internal, limited }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Team Status, at the top of the Members tab (it was a section on the Overview,
 * .claude/plans/engagement-overview-restructure.md): who has joined against who is invited, and the team
 * by role. "Internal vs limited" is the same split as By role, so it is By role's aside rather than a
 * third bar. Members are internal-only already, so this needs no gate of its own.
 */
export function TeamStatusStrip({ status: s }: { status: TeamStatus }) {
    const teamTotal = s.joined + s.invited
    const joinedItems: ChartSegment[] = [
        // An invitation waiting to be accepted is the status language's Waiting; joined is Done.
        { label: 'Joined', hex: DATA.done, value: s.joined },
        { label: 'Invited', hex: DATA.waiting, value: s.invited },
    ]
    return (
        <section aria-label="Team status" className="@container">
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line @lg:grid-cols-2">
                <StatusCell icon={UserCheck} label="Joined" info="People who have joined the engagement against invitations not yet accepted.">
                    <p className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-h2 tabular-nums text-fg">{teamTotal > 0 ? `${s.joined} of ${teamTotal}` : 'No one yet'}</span>
                        {s.invited > 0 && <span className="truncate text-small text-fg-muted">{plural(s.invited, 'invitation')} pending</span>}
                    </p>
                    {teamTotal > 0 && (
                        <>
                            <SegmentedBar segments={joinedItems} />
                            <Legend items={joinedItems} />
                        </>
                    )}
                </StatusCell>
                <StatusCell icon={Users} label="By role" info="Joined members by role. Internal is Leads and Contributors · Full Access; limited is Contributors · Limited Access and Reviewers.">
                    <p className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-h2 tabular-nums text-fg">{s.joined > 0 ? plural(s.joined, 'member') : 'No members'}</span>
                        {s.joined > 0 && <span className="truncate text-small text-fg-muted">{s.internal} internal · {s.limited} limited</span>}
                    </p>
                    {s.roles.length > 0 && (
                        <>
                            <SegmentedBar segments={s.roles} />
                            <Legend items={s.roles} />
                        </>
                    )}
                </StatusCell>
            </div>
        </section>
    )
}
