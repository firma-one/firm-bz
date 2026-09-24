'use client'

import { ShieldCheck, FileText, MessagesSquare, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ASSISTANT } from '@/lib/ai/assistant'
import { BrioAvatar } from '@/components/ui/brio-avatar'

/**
 * Landing section introducing the in-product assistant.
 *
 * Leads with the constraints rather than the capability: the rest of the site sells
 * non-custodial trust, so an AI that reads client work would undercut the pitch unless its
 * limits are stated first. Every claim here is true of the implementation — the chat context
 * excludes document and comment bodies, and publishing requires a human.
 */

const CAPABILITIES = [
    {
        icon: FileText,
        title: 'Status summaries, drafted',
        body: `${ASSISTANT.name} writes the delivery status of an engagement — progress, risks, what needs attention — from what is actually in your workspace. You add the judgment calls and approve before anyone sees it.`,
    },
    {
        icon: MessagesSquare,
        title: 'Ask about any engagement',
        body: `"What's overdue?" "Which deliverables are at risk?" Answers come from that engagement's delivery data, with no invented numbers and no access to change anything.`,
    },
    {
        icon: Search,
        title: 'Find documents by describing them',
        body: `Search the way you'd ask a colleague — "the Acme scope doc from last spring" — instead of assembling filters. The filters it infers stay visible, and you can drop any of them.`,
    },
]

const GUARANTEES = [
    'Reads delivery status — not the contents of your client documents.',
    'Nothing reaches a client until a human approves it.',
    'Read-only. It cannot share, edit, or change a status.',
]

export function BrioSection({ shellClass }: { shellClass: string }) {
    return (
        <section className="relative bg-white pb-28 pt-24 lg:pb-36 lg:pt-32">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-50/60 via-transparent to-transparent" />

            <div className={cn(shellClass, 'relative z-10')}>
                <div className="mb-14 max-w-3xl text-left">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5">
                        <BrioAvatar size={18} title={null} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-700">
                            Meet {ASSISTANT.name}
                        </span>
                    </div>

                    <h2 className="mb-6 text-4xl font-bold tracking-tight text-[#1b1b1d] md:text-6xl">
                        The status report{' '}
                        <span className="text-violet-600">writes its first draft</span>
                    </h2>

                    <p className="text-xl leading-relaxed text-[#45474c] md:text-2xl">
                        {ASSISTANT.name} is a delivery assistant built into your workspace. It drafts the
                        status update, answers questions about an engagement, and finds the document you
                        half-remember —{' '}
                        <span className="font-bold text-[#1b1b1d]">
                            without ever reading your clients&apos; work or sending anything on your behalf.
                        </span>
                    </p>
                </div>

                <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
                    {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                        <div
                            key={title}
                            className="rounded border border-[#e5e7eb] bg-white p-6 shadow-md"
                        >
                            <div className="mb-4 inline-flex rounded-lg border border-violet-100 bg-violet-50 p-2.5">
                                <Icon className="h-4 w-4 text-violet-600" aria-hidden />
                            </div>
                            <h3 className="mb-2 text-base font-bold text-[#1b1b1d]">{title}</h3>
                            <p className="text-sm leading-relaxed text-[#45474c]">{body}</p>
                        </div>
                    ))}
                </div>

                <div className="rounded border border-[#e5e7eb] bg-[#f9f9fb] p-6 md:p-8">
                    <div className="mb-4 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#1b1b1d]" aria-hidden />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#45474c]">
                            What {ASSISTANT.name} will never do
                        </span>
                    </div>
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {GUARANTEES.map((line) => (
                            <li key={line} className="text-sm leading-relaxed text-[#45474c]">
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    )
}
