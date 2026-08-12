'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Joyride, EVENTS, STATUS, type EventData, type Controls } from 'react-joyride'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { useDemoTour } from '@/lib/demo/demo-tour-context'

const JoyrideAny = Joyride as any

const firstClient = DEMO_FIRM.clients[0]
const firstEngagement = firstClient?.engagements[0]

const firm = '/demo'
const client = firstClient ? `/demo/${firstClient.slug}` : firm
const eng = firstClient && firstEngagement ? `/demo/${firstClient.slug}/${firstEngagement.slug}` : client

interface TourStep {
    target: string
    title: string
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

/** Static counterpart to components/app/demo-tour.tsx — same react-joyride config, same step
 * sequence/copy, adapted to the demo's own routes (?tab= for firm-level, path segments are not
 * used at engagement-level here since the demo keeps everything under ?tab=). Settings-page steps
 * (Firm/Client/Engagement Settings) and the View As step are omitted — those surfaces don't exist
 * in this static demo. */
const STEPS: TourStep[] = [
    {
        target: '[data-demo-tour="command-palette"]',
        title: 'Command Palette',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Press ⌘K (or Ctrl K) to instantly jump anywhere — clients, engagements, settings, reminders, and more.</p>,
        route: firm,
        placement: 'bottom',
        disableBeacon: true,
    },
    {
        target: '[data-demo-tour="firm-overview-tab"]',
        title: 'Firm Overview',
        content: <p className="text-xs leading-relaxed text-[#45474c]">The Overview tab shows business insights — active engagements, recent activity, and key metrics across all clients.</p>,
        route: `${firm}?tab=analytics`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-calendar-tab"]',
        title: 'Calendar',
        content: <p className="text-xs leading-relaxed text-[#45474c]">See deadlines and events across every client and engagement in your firm in one calendar — switch between Month, Week, Day, and Agenda views.</p>,
        route: `${firm}?tab=calendar`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-doc-search-tab"]',
        title: 'Doc Search',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Search every document across your firm by filename or topic — powered by AI semantic search, with filters for file type, client, and engagement.</p>,
        route: `${firm}?tab=doc-search`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-members-tab"]',
        title: 'Firm Members',
        content: <p className="text-xs leading-relaxed text-[#45474c]">As the firm owner, you&apos;re an administrator by default. Invite more administrators here if you&apos;d like help managing the firm. Per-engagement access and roles are set separately in each engagement&apos;s Members tab.</p>,
        route: `${firm}?tab=members`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-audit-tab"]',
        title: 'Firm Audit Log',
        content: <p className="text-xs leading-relaxed text-[#45474c]">A complete activity log across all clients and engagements in your firm — searchable and exportable.</p>,
        route: `${firm}?tab=audit`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-clients-tab"]',
        title: 'Clients',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Every client workspace for your firm lives here — each with its own branding, contacts, and engagements.</p>,
        route: `${firm}?tab=clients`,
        placement: 'bottom',
        skipScroll: true,
    },
    {
        target: '[data-demo-tour="firm-add-client-btn"]',
        title: 'Add a Client',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Create a new client workspace. Each client can have its own branding, contacts, and multiple engagements.</p>,
        route: `${firm}?tab=clients`,
        placement: 'bottom',
        skipScroll: true,
    },
    ...(firstClient ? [
        {
            target: '[data-demo-tour="client-engagements-tab"]',
            title: 'Engagements',
            content: <p className="text-xs leading-relaxed text-[#45474c]">Every engagement for this client lives here — each one is its own client-billable project with its own files, shares, and team.</p>,
            route: client,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-add-btn"]',
            title: 'Add an Engagement',
            content: <p className="text-xs leading-relaxed text-[#45474c]">Engagements are client-billable projects — e.g. SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a <strong className="text-[#1b1b1d]">Retainer</strong>, <strong className="text-[#1b1b1d]">T&amp;M</strong>, or <strong className="text-[#1b1b1d]">Fixed Price</strong> engagement. Each has its own files, shares, and team.</p>,
            route: client,
            placement: 'bottom' as const,
            skipScroll: true,
        },
    ] : []),
    ...(firstEngagement ? [
        {
            target: '[data-demo-tour="engagement-header"]',
            title: 'Engagement',
            content: <p className="text-xs leading-relaxed text-[#45474c]">The engagement header shows the project name, status, and key metadata. Everything for this engagement lives here.</p>,
            route: `${eng}?tab=analytics`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-overview-tab"]',
            title: 'Engagement Overview',
            content: <p className="text-xs leading-relaxed text-[#45474c]">The Overview tab surfaces engagement-level insights — progress, activity, and key metrics at a glance.</p>,
            route: `${eng}?tab=analytics`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-files-tab"]',
            title: 'Files',
            content: <p className="text-xs leading-relaxed text-[#45474c]">The Files tab is the default view — browse folders, upload documents, and manage the full file hierarchy for this engagement.</p>,
            route: `${eng}?tab=files`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-upload-btn"]',
            title: 'Upload Files & Create Folders',
            content: <p className="text-xs leading-relaxed text-[#45474c]">Upload files from your computer, create new folders, or import from Google Drive — think strategy decks, SOPs, campaign reports, client onboarding docs, or quarterly reviews. You can also drag and drop directly.</p>,
            route: `${eng}?tab=files`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="document-action-trigger"]',
            title: 'Document Actions',
            content: <p className="text-xs leading-relaxed text-[#45474c]">Click the ⋯ menu on any file to download, share, rename, set a due date, add a reminder, bookmark it, and more.</p>,
            route: `${eng}?tab=files`,
            placement: 'left' as const,
        },
        {
            target: '[data-demo-tour="engagement-board-tab"]',
            title: 'Deliverables Board',
            content: (
                <div className="text-xs leading-relaxed text-[#45474c] space-y-2">
                    <p>The Board tracks shared documents as deliverables through a Kanban-style workflow.</p>
                    <ul className="space-y-1.5">
                        <li><strong className="text-[#1b1b1d]">Four stages</strong> — To Do, In Progress, In Review, and Approved.</li>
                        <li><strong className="text-[#1b1b1d]">Drag to advance</strong> — move cards one stage at a time; approved deliverables are locked.</li>
                        <li><strong className="text-[#1b1b1d]">Subtask detail</strong> — click any card to see assigned documents, due dates, and assignees.</li>
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
            content: <p className="text-xs leading-relaxed text-[#45474c]">See all in-app comments across documents in this engagement in one place. Collaborate and resolve threads without switching files.</p>,
            route: `${eng}?tab=comments`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-audit-tab"]',
            title: 'Engagement Audit',
            content: <p className="text-xs leading-relaxed text-[#45474c]">A full activity log for this engagement — who uploaded, shared, commented, or changed settings and when.</p>,
            route: `${eng}?tab=audit`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-members-tab"]',
            title: 'Engagement Members',
            content: <p className="text-xs leading-relaxed text-[#45474c]">Manage who has access to this engagement and their role — Lead, Collaborator or Viewer.</p>,
            route: `${eng}?tab=members`,
            placement: 'bottom' as const,
            skipScroll: true,
        },
    ] : []),
    {
        target: '[data-demo-tour="firm-switcher"]',
        title: 'Firm Switcher',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Switch between firms or create a new one. Each firm is an independent workspace with its own clients, engagements and documents.</p>,
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-support"]',
        title: 'Support',
        content: (
            <div className="text-xs leading-relaxed text-[#45474c] space-y-2">
                <p>No more chasing support over email. Firma has a built-in support module — raise a request, track its status, and get responses, all without leaving the app.</p>
                <ul className="space-y-1.5">
                    <li><strong className="text-[#1b1b1d]">Contextual</strong> — requests are tied to your firm, so our team has full context from the start.</li>
                    <li><strong className="text-[#1b1b1d]">Trackable</strong> — see open, in-progress, and resolved tickets in one place.</li>
                    <li><strong className="text-[#1b1b1d]">Always accessible</strong> — one click away in the sidebar, wherever you are in the app.</li>
                </ul>
            </div>
        ),
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-recent"]',
        title: 'Recent',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Quickly jump back to recently visited clients and engagements. The last 10 are tracked automatically.</p>,
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-reminders"]',
        title: 'Reminders',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Auto reminders are set based on follow-up dates, due dates or assignments. They surface here so nothing slips through the cracks.</p>,
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="sidebar-bookmarks"]',
        title: 'Bookmarks',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Bookmark any document or engagement for fast access. Your bookmarks are always one click away.</p>,
        route: firm,
        placement: 'right',
    },
    {
        target: '[data-demo-tour="profile-menu"]',
        title: 'Profile Menu',
        content: <p className="text-xs leading-relaxed text-[#45474c]">Access billing, plan usage, firm switcher and sign-out from here.</p>,
        route: firm,
        placement: 'right',
    },
]

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Static counterpart to components/app/demo-tour.tsx — same react-joyride visual config
 * (spotlight overlay, tooltip chrome, colors) and step copy, driving router navigation across
 * the demo's own pages/tabs as it advances. */
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
            locale={{ last: 'Next →', next: 'Next →', back: '← Back', skip: 'Skip tour', close: 'Close' }}
            options={{
                primaryColor: '#1b1b1d',
                textColor: '#1b1b1d',
                backgroundColor: '#ffffff',
                arrowColor: '#ffffff',
                overlayColor: 'rgba(15, 23, 42, 0.48)',
                spotlightPadding: 10,
                spotlightRadius: 4,
                zIndex: 10050,
                skipBeacon: true,
                showProgress: false,
                scrollDuration: 400,
                scrollOffset: 40,
            }}
            styles={{
                floater: { filter: 'drop-shadow(0 4px 16px rgba(15,23,42,0.13))' },
                tooltip: {
                    borderRadius: 2,
                    padding: '16px 16px 12px',
                    fontSize: 12,
                    maxWidth: 280,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 8px 32px -8px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)',
                    fontFamily: 'inherit',
                },
                tooltipContainer: { textAlign: 'left', lineHeight: 1.5 },
                tooltipTitle: { fontSize: 12, fontWeight: 700, letterSpacing: '0.01em', color: '#1b1b1d', margin: 0 },
                tooltipContent: { padding: '6px 0 2px', fontSize: 12, color: '#45474c', lineHeight: 1.55 },
                tooltipFooter: { marginTop: 10, paddingTop: 8, borderTop: '1px solid #e5e7eb', justifyContent: 'space-between' },
                buttonPrimary: { borderRadius: 2, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', backgroundColor: '#1b1b1d', color: '#ffffff', fontFamily: 'inherit' },
                buttonBack: { borderRadius: 2, fontSize: 10, fontWeight: 600, padding: '5px 10px', color: '#45474c', order: -1, marginRight: 'auto' },
                buttonSkip: { fontSize: 10, color: '#9ca3af', padding: '5px 6px' },
                buttonClose: { color: '#9ca3af', width: 10, height: 10, padding: 8, top: 2, right: 2 },
            }}
        />
    )
}
