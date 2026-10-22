'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Joyride, EVENTS, STATUS, type EventData, type Controls, type TooltipRenderProps } from 'react-joyride'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Brio } from '@/components/ui/brio'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

const JoyrideAny = Joyride as any

const firstClient = DEMO_FIRM.clients[0]
const firstEngagement = firstClient?.engagements[0]

const firm = '/tour'
const client = firstClient ? `/tour/${firstClient.slug}` : firm
const eng = firstClient && firstEngagement ? `/tour/${firstClient.slug}/${firstEngagement.slug}` : client

interface TourStep {
    target: string
    title: React.ReactNode
    content: React.ReactNode
    route: string
    placement?: 'top' | 'bottom' | 'left' | 'right'
    disableBeacon?: boolean
    /** Disable Popper's auto-flip for this step — use when the "natural" side is known to be
     * cramped (e.g. dense page content sitting right below the target) and flipping would just
     * trade one collision for another. */
    disableFlip?: boolean
    /** Skip Joyride's scroll-into-view for this step — use when the target is already visible
     * without scrolling; letting Joyride "center" it anyway can drag the whole page (tab strip
     * included) uncomfortably close to the topbar on short pages, squeezing the tooltip. */
    skipScroll?: boolean
}

/** The guided tour's steps, over the public tour's New UI shell: firm views are sidebar items
 * (?tab= on /tour), and Home and the Inbox stand for recents, reminders and bookmarks. Settings
 * pages and View As don't exist in this static copy, so they have no steps. */
const STEPS: TourStep[] = [
    {
        target: '[data-demo-tour="command-palette"]',
        title: 'Command palette',
        content: <p>Press ⌘K (or Ctrl K) to instantly jump anywhere — clients, engagements, settings, reminders, and more.</p>,
        route: firm,
        placement: 'right',
        disableBeacon: true,
    },
    {
        target: '[data-demo-tour="firm-overview-tab"]',
        title: 'Firm overview',
        content: <p>Overview shows business insights — revenue pipeline, engagement health, and what needs attention across all clients.</p>,
        route: `${firm}?tab=analytics`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-brief"]',
        title: "Today's brief",
        content: <p><Brio />, Firma&apos;s AI assistant, writes a daily brief from your firm&apos;s own data: where things stand, what needs attention and what&apos;s worth watching.</p>,
        route: `${firm}?tab=analytics`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-calendar-tab"]',
        title: 'Calendar',
        content: <p>See deadlines and events across every client and engagement in your firm in one calendar — switch between Month, Week, Day, and Agenda views.</p>,
        route: `${firm}?tab=calendar`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-doc-search-tab"]',
        title: 'Doc search',
        content: <p>Search every document across your firm by filename or topic — powered by AI semantic search, with filters for file type, client, and engagement.</p>,
        route: `${firm}?tab=doc-search`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-members-tab"]',
        title: 'Firm members',
        content: <p>As the firm owner, you&apos;re an administrator by default. Invite more administrators here if you&apos;d like help managing the firm. Per-engagement access and roles are set separately in each engagement&apos;s Members tab.</p>,
        route: `${firm}?tab=members`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-audit-tab"]',
        title: 'Firm audit log',
        content: <p>A complete activity log across all clients and engagements in your firm — searchable and exportable.</p>,
        route: `${firm}?tab=audit`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-clients-tab"]',
        title: 'Clients',
        content: <p>Every client workspace for your firm lives here — each with its own branding, contacts, and engagements.</p>,
        route: `${firm}?tab=clients`,
        placement: 'right',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-add-client-btn"]',
        title: 'Add a client',
        content: <p>Create a new client workspace. Each client can have its own branding, contacts, and multiple engagements.</p>,
        route: `${firm}?tab=clients`,
        placement: 'bottom',
        skipScroll: true,
    },
    ...(firstClient ? [
        {
            target: '[data-demo-tour="client-engagements-tab"]',
            title: 'Engagements',
            content: <p>Every engagement for this client lives here — each one is its own client-billable project with its own files, shares, and team.</p>,
            route: client,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-add-btn"]',
            title: 'Add an engagement',
            content: <p>Engagements are client-billable projects — e.g. SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a <strong>Retainer</strong>, <strong>T&amp;M</strong>, or <strong>Fixed Price</strong> engagement. Each has its own files, shares, and team.</p>,
            route: client,
            placement: 'bottom' as const,
            skipScroll: true,
        },
    ] : []),
    ...(firstEngagement ? [
        {
            target: '[data-demo-tour="engagement-header"]',
            title: 'Engagement',
            content: <p>The engagement header shows the project name, status, and key metadata. Everything for this engagement lives here.</p>,
            route: `${eng}?tab=analytics`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-overview-tab"]',
            title: 'Engagement overview',
            content: <p>The Overview tab surfaces engagement-level insights — progress, activity, and key metrics at a glance.</p>,
            route: `${eng}?tab=analytics`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="ask-brio"]',
            title: <>Ask <Brio /></>,
            content: <p>Ask <Brio /> about this engagement: what&apos;s due, what&apos;s waiting on the client, where things stand. Prompt hints get you started, and <Brio noIcon /> is on the Files tab too.</p>,
            route: `${eng}?tab=analytics`,
            placement: 'top' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-files-tab"]',
            title: 'Files',
            content: <p>The Files tab is the default view — browse folders, upload documents, and manage the full file hierarchy for this engagement.</p>,
            route: `${eng}?tab=files`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-upload-btn"]',
            title: 'Upload files and create folders',
            content: <p>Upload files from your computer, create new folders, or import from Google Drive — think strategy decks, SOPs, campaign reports, client onboarding docs, or quarterly reviews. You can also drag and drop directly.</p>,
            route: `${eng}?tab=files`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="document-action-trigger"]',
            title: 'Document actions',
            content: <p>Hover a row for its quick actions, or click ⋯ on any file to open, download, comment on, bookmark, set a due date, rename or move it, and more.</p>,
            route: `${eng}?tab=files`,
            placement: 'left' as const,
        },
        {
            target: '[data-demo-tour="engagement-board-tab"]',
            title: 'Deliverables board',
            content: (
                <div className="space-y-2">
                    <p>The Board tracks shared documents as deliverables through a Kanban-style workflow.</p>
                    <ul className="space-y-1.5">
                        <li><strong>Four stages</strong> — To Do, In Progress, In Review, and Approved.</li>
                        <li><strong>Drag to advance</strong> — move cards one stage at a time; approved deliverables are locked.</li>
                        <li><strong>Subtask detail</strong> — click any card to see assigned documents, due dates, and assignees.</li>
                    </ul>
                </div>
            ),
            route: `${eng}?tab=board`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-comments-tab"]',
            title: 'Comments',
            content: <p>See all in-app comments across documents in this engagement in one place. Collaborate and resolve threads without switching files.</p>,
            route: `${eng}?tab=comments`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-audit-tab"]',
            title: 'Engagement audit',
            content: <p>A full activity log for this engagement — who uploaded, shared, commented, or changed settings and when.</p>,
            route: `${eng}?tab=audit`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-members-tab"]',
            title: 'Engagement members',
            content: <p>Manage who has access to this engagement and their role — Lead, Collaborator or Viewer.</p>,
            route: `${eng}?tab=members`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
    ] : []),
    {
        target: '[data-demo-tour="firm-switcher"]',
        title: 'Firm switcher',
        content: <p>Switch between firms or create a new one. Each firm is an independent workspace with its own clients, engagements and documents.</p>,
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-home"]',
        title: 'Home',
        content: <p>Home picks up where you left off: recent pages, this week&apos;s agenda, what needs you, your engagements and your bookmarks.</p>,
        route: `${firm}/home`,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-inbox"]',
        title: 'Inbox',
        content: <p>Reminders from due dates, follow-ups, review requests and @mentions land here with your notifications, so nothing slips through the cracks.</p>,
        route: `${firm}/inbox`,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="profile-menu"]',
        title: 'Profile menu',
        content: (
            <div className="space-y-2">
                <p>Your profile, billing, plan usage and sign-out live here.</p>
                <p>So does <strong>Support</strong>: raise a request, track its status and get answers without leaving the app. Requests are tied to your firm, so our team has the context from the start.</p>
            </div>
        ),
        route: firm,
        placement: 'right',
    },
]

/**
 * The tour's step card, in the app's design system: a popover-style card with the step title, its
 * copy in muted text, a step counter and Skip on the left, Back and Next on the right. Joyride
 * portals it to the body, outside the demo shell.
 *
 * Joyride's button props carry a `title`, which would show the browser's native tooltip; it is
 * dropped in favor of the visible labels.
 */
function TourTooltip({ backProps, closeProps, primaryProps, skipProps, step, index, size, isLastStep, tooltipProps }: TooltipRenderProps) {
    const { title: _back, ...back } = backProps
    const { title: _close, ...close } = closeProps
    const { title: _next, ...next } = primaryProps
    const { title: _skip, ...skip } = skipProps
    return (
        <div {...tooltipProps} className="w-[300px] max-w-[calc(100vw-2rem)] rounded-card bg-surface p-4 text-left shadow-popover">
            <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-ui font-semibold text-fg">{step.title as React.ReactNode}</h3>
                <button
                    {...close}
                    type="button"
                    className="-mr-1.5 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="mt-1.5 space-y-2 text-small leading-relaxed text-fg-muted [&_li]:pl-0.5 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-4">
                {step.content as React.ReactNode}
            </div>
            <div className="mt-4 flex items-center gap-3">
                <span className="text-caption tabular-nums text-fg-subtle">{index + 1} of {size}</span>
                <button {...skip} type="button" className="text-caption text-fg-subtle underline-offset-2 transition-colors hover:text-fg-muted hover:underline">
                    Skip tour
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                    {index > 0 && <Button {...back} type="button" variant="ghost" size="sm">Back</Button>}
                    <Button {...next} type="button" size="sm">{isLastStep ? 'Finish' : 'Next'}</Button>
                </div>
            </div>
        </div>
    )
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The guided tour: steps through STEPS, driving router navigation across the tour's pages and
 * tabs as it advances, with the step card in the app's design system (TourTooltip). */
export function DemoTour() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { run, stepIndex, setStepIndex, setRun, endTour, saveProgress } = useDemoTour()
    const pathnameRef = useRef(pathname)
    const searchParamsRef = useRef(searchParams)
    const retryCountRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    pathnameRef.current = pathname
    searchParamsRef.current = searchParams

    const clearRetry = () => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
    }

    const navigateForStep = async (index: number) => {
        const step = STEPS[index]
        if (!step) return
        const [targetPath, targetQuery] = step.route.split('?')
        const samePath = targetPath === pathnameRef.current
        if (!samePath) {
            router.push(step.route, { scroll: false })
            await sleep(500)
        } else if ((targetQuery ?? '') !== searchParamsRef.current.toString()) {
            router.push(step.route, { scroll: false })
            await sleep(350)
        }
        setStepIndex(index)
    }

    useEffect(() => {
        if (run && STEPS[stepIndex]) {
            void navigateForStep(stepIndex)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleJoyrideEvent = (data: EventData, _controls: Controls) => {
        const { status, type, index } = data

        if (type === EVENTS.TARGET_NOT_FOUND) {
            const isLastStep = index >= STEPS.length - 1
            if (!isLastStep && retryCountRef.current >= 20) {
                clearRetry()
                retryCountRef.current = 0
                void navigateForStep(index + 1)
                return
            }
            retryCountRef.current += 1
            const shouldReNav = retryCountRef.current % 3 === 0
            retryTimerRef.current = setTimeout(async () => {
                if (shouldReNav) await navigateForStep(index)
                setRun(false)
                setTimeout(() => setRun(true), 80)
            }, 700)
            return
        }

        if (type === EVENTS.STEP_BEFORE) {
            clearRetry()
            retryCountRef.current = 0
        }

        if (type === EVENTS.STEP_AFTER) {
            clearRetry()
            const { action } = data as any
            if (action === 'close' || action === 'skip') {
                saveProgress(index)
                setStepIndex(index)
                endTour(false)
                return
            }
            const nextIndex = action === 'prev' ? Math.max(0, index - 1) : index + 1
            if (nextIndex >= STEPS.length) {
                endTour(true)
                return
            }
            saveProgress(nextIndex)
            void navigateForStep(nextIndex)
            return
        }

        if (status === STATUS.FINISHED || type === EVENTS.TOUR_END) {
            endTour(true)
        }
    }

    if (typeof window === 'undefined') return null

    return (
        <JoyrideAny
            run={run}
            stepIndex={stepIndex}
            steps={STEPS.map((s) => ({
                target: s.target,
                title: s.title,
                content: s.content,
                placement: s.placement,
                disableBeacon: s.disableBeacon,
                skipScroll: s.skipScroll,
                // The tour must never abort from an accidental click-outside or Escape press — only the
                // tooltip's own close (X) button should end it. disableOverlayClose is a legacy v2 prop with
                // no effect in v3; overlayClickAction/dismissKeyAction are the real per-step gates.
                overlayClickAction: false as const,
                dismissKeyAction: false as const,
                ...(s.disableFlip ? { floatingOptions: { flipOptions: false } } : {}),
            }))}
            continuous
            scrollToFirstStep
            onEvent={handleJoyrideEvent}
            tooltipComponent={TourTooltip}
            options={{
                arrowColor: '#ffffff',
                overlayColor: 'rgba(15, 15, 15, 0.45)',
                spotlightPadding: 8,
                spotlightRadius: 6,
                zIndex: 10050,
                skipBeacon: true,
                showProgress: false,
                scrollDuration: 400,
                scrollOffset: 40,
            }}
        />
    )
}
