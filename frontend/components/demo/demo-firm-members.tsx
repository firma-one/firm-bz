import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RelativeDateTime } from '@/components/ui/relative-date-time'

interface DemoMember {
    name: string
    email: string
    role: 'firm_admin' | 'firm_member'
    joinedDaysAgo: number
}

const DEMO_MEMBERS: DemoMember[] = [
    { name: 'Alex Jordan', email: 'alex@beacongrowth.com', role: 'firm_admin', joinedDaysAgo: 420 },
    { name: 'Sam Rivera', email: 'sam@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 310 },
    { name: 'Jordan Lee', email: 'jordan@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 180 },
    { name: 'Taylor Kim', email: 'taylor@beacongrowth.com', role: 'firm_member', joinedDaysAgo: 95 },
]

function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

/** Static counterpart to firm-members-tab.tsx — plausible team roster, no fetching, no write actions. */
export function DemoFirmMembers() {
    return (
        <div className="flex flex-col h-full bg-white rounded border border-[#e5e7eb] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#f3f4f6] text-[#45474c]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            Firm Members
                            <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                {DEMO_MEMBERS.length}
                            </span>
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Firm administrators can manage settings and members.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                <div className="rounded border border-[#e5e7eb] bg-white overflow-hidden">
                    <div className="divide-y divide-[#e5e7eb]">
                        {DEMO_MEMBERS.map((member) => {
                            const roleLabel = member.role === 'firm_admin' ? 'Firm Administrator' : 'Firm Member'
                            const roleBadgeClass = member.role === 'firm_admin'
                                ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                                : 'bg-[#f3f4f6] text-[#45474c] ring-1 ring-inset ring-[#e5e7eb]'
                            return (
                                <div key={member.email} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f3f4f6] transition-colors">
                                    <Avatar className="h-8 w-8 shrink-0 border border-[#e5e7eb]">
                                        <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
                                            {getInitials(member.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-900 truncate">{member.name}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
                                    </div>
                                    <div className="w-36 flex justify-end shrink-0">
                                        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium ${roleBadgeClass}`}>
                                            {roleLabel}
                                        </span>
                                    </div>
                                    <div className="w-24 flex justify-end shrink-0">
                                        <RelativeDateTime
                                            date={new Date(Date.now() - member.joinedDaysAgo * 86400000).toISOString()}
                                            textClassName="text-[11px] text-slate-400"
                                            iconClassName="h-3 w-3 text-slate-400"
                                            tooltipSide="left"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
