import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface DemoEngagementMember {
    name: string
    email: string
    persona: string
}

const DEMO_ENGAGEMENT_MEMBERS: DemoEngagementMember[] = [
    { name: 'Alex Jordan', email: 'alex@beacongrowth.com', persona: 'Engagement Lead' },
    { name: 'Sam Rivera', email: 'sam@beacongrowth.com', persona: 'Team Member' },
]

function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

/** Static counterpart to engagement-members-tab.tsx — a plausible small team roster for this engagement, no fetching, no write actions. */
export function DemoEngagementMembers() {
    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#f3f4f6] text-[#45474c]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                            Engagement Members
                            <span className="font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                {DEMO_ENGAGEMENT_MEMBERS.length}
                            </span>
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">Manage access and roles for this project.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DEMO_ENGAGEMENT_MEMBERS.map((member) => (
                        <div key={member.email} className="rounded border border-[#e5e7eb] bg-white p-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 shrink-0 border border-[#e5e7eb]">
                                    <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
                                        {getInitials(member.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">{member.name}</p>
                                    <p className="text-xs text-slate-500 truncate">{member.email}</p>
                                </div>
                            </div>
                            <div className="mt-4">
                                <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
                                    {member.persona}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
