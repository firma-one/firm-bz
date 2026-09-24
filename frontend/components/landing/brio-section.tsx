'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, FileText, MessagesSquare, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { KineticMarketingBadge } from '@/components/kinetic/kinetic-section-intro'
import { MARKETING_SURFACE_DEPTH_HOVER } from '@/lib/marketing/target-audience-nav'

/**
 * Landing section introducing the in-product assistant.
 *
 * Leads with the constraints rather than the capability: the rest of the site sells
 * non-custodial trust, so an AI that reads client work would undercut the pitch unless its
 * limits are stated first. Every claim here is true of the implementation — the chat context
 * excludes document and comment bodies, and publishing requires a human.
 *
 * Styling follows the target-audience cards: square corners, hairline border, marketing green
 * and blue accents. No bespoke palette.
 */

const CAPABILITIES = [
    {
        icon: FileText,
        eyebrow: '01 / Status',
        title: 'Status summaries, drafted',
        body: `${ASSISTANT.name} writes the delivery status of an engagement — progress, risks, what needs attention — from what is actually in your workspace. You add the judgment calls and approve before anyone sees it.`,
    },
    {
        icon: MessagesSquare,
        eyebrow: '02 / Answers',
        title: 'Ask about any engagement',
        body: `"What's overdue?" "Which deliverables are at risk?" Answers come from that engagement's delivery data, with no invented numbers and no access to change anything.`,
    },
    {
        icon: Search,
        eyebrow: '03 / Search',
        title: 'Find documents by describing them',
        body: `Search the way you'd ask a colleague — "the Acme scope doc from last spring" — instead of assembling filters. The filters it infers stay visible, and you can drop any of them.`,
    },
]

/**
 * Rotating headlines, one per capability. Each names the work Brio does and the judgment that
 * stays with the reader — the section's whole argument in a sentence.
 */
const HEADLINES = [
    {
        lead: 'drafts your status report.',
        leadStartsWithName: true,
        accent: 'You review, edit and publish it.',
        accentColor: '#049669',
    },
    {
        lead: 'Ask what needs your attention.',
        accent: 'ranks it, you decide what moves.',
        accentStartsWithName: true,
        accentColor: '#5A78FF',
    },
    {
        lead: 'Describe the document you half-remember.',
        accent: 'finds it across every engagement.',
        accentStartsWithName: true,
        accentColor: '#049669',
    },
]

const GUARANTEES = [
    'Reads delivery status — not the contents of your client documents.',
    'Anything that commits you to a course of action is reviewed by a person first, by design.',
    'Read-only. It cannot share, edit, or change a status.',
]

export function BrioSection({ shellClass }: { shellClass: string }) {
    const [headlineIndex, setHeadlineIndex] = useState(0)

    // Slower than the hero's 4s: these headlines run to ten words plus the Brio mark, and 4s was
    // not enough to read one for the first time before it moved on.
    useEffect(() => {
        const timer = setInterval(() => {
            setHeadlineIndex((prev) => (prev + 1) % HEADLINES.length)
        }, 5600)
        return () => clearInterval(timer)
    }, [])

    const headline = HEADLINES[headlineIndex]

    return (
        <section className="relative bg-white pb-28 pt-24 lg:pb-36 lg:pt-32">
            <div className={cn(shellClass, 'relative z-10')}>
                <div className="mb-14 max-w-3xl text-left">
                    <KineticMarketingBadge
                        variant="lime"
                        tracking="widest"
                        className="mb-6"
                    >
                        Ask <Brio />
                    </KineticMarketingBadge>

                    {/* CSS grid with every headline in the same cell: each is laid out, so the
                        row grows to the TALLEST one at whatever the current viewport is — no
                        hand-tuned heights, and the copy below never shifts as headlines rotate.
                        The spacers are invisible; the animated one overlays them in the same cell. */}
                    <div className="mb-6 grid">
                        {HEADLINES.map((h) => (
                            <h2
                                key={h.lead}
                                aria-hidden
                                // Inline, not a class: the marketing page's highlight styling was
                                // overriding `invisible`, leaving all three headlines painted.
                                style={{ visibility: 'hidden' }}
                                className="col-start-1 row-start-1 text-4xl font-bold tracking-tight md:text-6xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                            >
                                {h.leadStartsWithName ? <><Brio noIcon /> {h.lead}</> : h.lead}{' '}
                                {h.accentStartsWithName ? <><Brio noIcon /> {h.accent}</> : h.accent}
                            </h2>
                        ))}

                        <div className="relative col-start-1 row-start-1">
                            <AnimatePresence initial={false}>
                                <motion.h2
                                    key={`brio-headline-${headlineIndex}`}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                                    className="absolute inset-x-0 top-0 text-4xl font-bold tracking-tight text-[#1b1b1d] md:text-6xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                                >
                                    {headline.leadStartsWithName
                                        ? <><Brio /> {headline.lead}</>
                                        : headline.lead}{' '}
                                    <span style={{ color: headline.accentColor }}>
                                        {headline.accentStartsWithName
                                            ? <><Brio /> {headline.accent}</>
                                            : headline.accent}
                                    </span>
                                </motion.h2>
                            </AnimatePresence>
                        </div>
                    </div>

                    <p className="text-xl leading-relaxed text-[#45474c] md:text-2xl">
                        A delivery assistant built into your workspace — it does the assembling, you
                        keep the judgment.{' '}
                        <span className="font-bold text-[#1b1b1d]">
                            It never reads your clients&apos; work, and never sends anything on your behalf.
                        </span>
                    </p>
                </div>

                <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
                    {CAPABILITIES.map(({ icon: Icon, eyebrow, title, body }) => (
                        <div
                            key={title}
                            className={cn(
                                'group h-full overflow-hidden rounded-none border border-black/[0.06] bg-white p-8 shadow-sm',
                                MARKETING_SURFACE_DEPTH_HOVER,
                            )}
                        >
                            <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                                {eyebrow}
                            </span>
                            <Icon className="mb-4 h-6 w-6 text-[#049669]" aria-hidden />
                            <h3 className="mb-3 text-xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                                {title}
                            </h3>
                            <p className="text-sm leading-relaxed text-[#45474c]">{body}</p>
                        </div>
                    ))}
                </div>

                <div className="rounded-none bg-[#141c2a] p-8 shadow-sm lg:p-10">
                    <div className="mb-5 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#049669]" aria-hidden />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            How <Brio /> is kept in its lane
                        </span>
                    </div>
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {GUARANTEES.map((line) => (
                            <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-white/80">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#049669]" />
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    )
}
