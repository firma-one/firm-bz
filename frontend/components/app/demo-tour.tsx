"use client"

import { useCallback, useRef } from "react"
import { Joyride, EVENTS, STATUS, type EventData, type Controls } from "react-joyride"
import { useRouter } from "next/navigation"
import { useDemoTour, saveTourProgress } from "@/lib/demo-tour-context"

// ─── Step definitions ────────────────────────────────────────────────────────

function makeSteps(firmSlug: string, clientSlug: string | null, engSlug: string | null) {
  const firm = `/d/f/${firmSlug}`
  const client = clientSlug ? `${firm}/c/${clientSlug}` : null
  const eng = engSlug && clientSlug ? `${firm}/c/${clientSlug}/e/${engSlug}` : null

  return [
    // 1 – Command Palette
    {
      target: '[data-demo-tour="command-palette"]',
      title: "Command Palette",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Press <kbd className="px-1 py-0.5 rounded border border-slate-200 font-mono text-xs">⌘K</kbd> (or <kbd className="px-1 py-0.5 rounded border border-slate-200 font-mono text-xs">Ctrl K</kbd>) to instantly jump anywhere — clients, engagements, settings, reminders, and more.</p>,
      placement: "bottom" as const,
      route: firm,
      disableBeacon: true,
    },
    // 2 – Firm Overview tab
    {
      target: '[data-demo-tour="firm-overview-tab"]',
      title: "Firm Overview",
      content: <p className="text-xs leading-relaxed text-[#45474c]">The Overview tab shows business insights — active engagements, recent activity, and key metrics across all clients.</p>,
      placement: "bottom" as const,
      route: `${firm}?tab=analytics`,
    },
    // 3 – Firm Settings tab
    {
      target: '[data-demo-tour="firm-settings-tab"]',
      title: "Firm Settings",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Configure your firm — name, logo, branding, domain, storage, and app-level settings are all here.</p>,
      placement: "bottom" as const,
      route: `${firm}?tab=settings`,
    },
    // 4 – Firm Members tab
    {
      target: '[data-demo-tour="firm-members-tab"]',
      title: "Firm Members",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Invite firm administrators who manage the firm. Per-engagement access and roles are set separately in each engagement's Members tab.</p>,
      placement: "bottom" as const,
      route: `${firm}?tab=members`,
    },
    // 5 – Firm Audit tab
    {
      target: '[data-demo-tour="firm-audit-tab"]',
      title: "Firm Audit Log",
      content: <p className="text-xs leading-relaxed text-[#45474c]">A complete activity log across all clients and engagements in your firm — searchable and exportable.</p>,
      placement: "bottom" as const,
      route: `${firm}?tab=audit`,
    },
    // 6 – Add Client button
    {
      target: '[data-demo-tour="firm-add-client-btn"]',
      title: "Add a Client",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Create a new client workspace. Each client can have its own branding, contacts, and multiple engagements.</p>,
      placement: "bottom" as const,
      route: `${firm}?tab=clients`,
    },
    // 7 – Add Client Contact (requires client page, contacts tab)
    ...(client ? [{
      target: '[data-demo-tour="client-add-contact-btn"]',
      title: "Add Client Contacts",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Add contacts for this client — external people you collaborate with, on prospective and active engagements.</p>,
      placement: "bottom" as const,
      route: `${client}?tab=contacts`,
    }] : []),
    // 8 – Client Settings tab
    ...(client ? [{
      target: '[data-demo-tour="client-settings-form"]',
      title: "Client Settings",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Set the client's name, branding, and configuration from the Settings tab.</p>,
      placement: "bottom" as const,
      route: `${client}?tab=settings`,
    }] : []),
    // 9 – Add Engagement button (projects tab)
    ...(client ? [{
      target: '[data-demo-tour="engagement-add-btn"]',
      title: "Add an Engagement",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Engagements are client-billable projects — e.g. SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a <strong className="text-[#1b1b1d]">Retainer</strong>, <strong className="text-[#1b1b1d]">T&amp;M</strong>, or <strong className="text-[#1b1b1d]">Fixed Price</strong> engagement. Each has its own files, shares, and team.</p>,
      placement: "bottom" as const,
      route: `${client}?tab=projects`,
    }] : []),
    // 10 – Engagement header / overview
    ...(eng ? [{
      target: '[data-demo-tour="engagement-header"]',
      title: "Engagement Overview",
      content: <p className="text-xs leading-relaxed text-[#45474c]">The engagement header shows the project name, status, and key metadata. Everything for this engagement lives here.</p>,
      placement: "bottom" as const,
      route: `${eng}/files`,
    }] : []),
    // 11 – Files tab
    ...(eng ? [{
      target: '[data-demo-tour="engagement-files-tab"]',
      title: "Files",
      content: <p className="text-xs leading-relaxed text-[#45474c]">The Files tab is the default view — browse folders, upload documents, and manage the full file hierarchy for this engagement.</p>,
      placement: "bottom" as const,
      route: `${eng}/files`,
    }] : []),
    // 12 – Upload button
    ...(eng ? [{
      target: '[data-demo-tour="engagement-upload-btn"]',
      title: "Upload Files & Create Folders",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Upload files from your computer, create new folders, or import from Google Drive — think strategy decks, SOPs, campaign reports, client onboarding docs, or quarterly reviews. You can also drag and drop directly.</p>,
      placement: "bottom" as const,
      route: `${eng}/files`,
    }] : []),
    // 13 – Document action menu
    ...(eng ? [{
      target: '[data-demo-tour="document-action-trigger"]',
      title: "Document Actions",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Click the ⋯ menu on any file to download, share, rename, set a due date, add a reminder, bookmark it, and more.</p>,
      placement: "left" as const,
      route: `${eng}/files`,
    }] : []),
    // 14 – Board view (Deliverables)
    ...(eng ? [{
      target: '[data-demo-tour="engagement-board-tab"]',
      title: "Deliverables Board",
      content: <div className="text-xs leading-relaxed text-[#45474c] space-y-2">
        <p>The Board tracks shared documents as deliverables through a Kanban-style workflow.</p>
        <ul className="space-y-1.5">
          <li><strong className="text-[#1b1b1d]">Four stages</strong> — To Do, In Progress, In Review, and Approved.</li>
          <li><strong className="text-[#1b1b1d]">Drag to advance</strong> — move cards one stage at a time; approved deliverables are locked.</li>
          <li><strong className="text-[#1b1b1d]">Subtask detail</strong> — click any card to see assigned documents, due dates, and assignees.</li>
        </ul>
      </div>,
      placement: "bottom" as const,
      route: `${eng}/board`,
    }] : []),
    // 15 – Comments tab
    ...(eng ? [{
      target: '[data-demo-tour="engagement-comments-tab"]',
      title: "Comments",
      content: <p className="text-xs leading-relaxed text-[#45474c]">See all in-app comments across documents in this engagement in one place. Collaborate and resolve threads without switching files.</p>,
      placement: "bottom" as const,
      route: `${eng}/comments`,
    }] : []),
    // 16 – Audit tab
    ...(eng ? [{
      target: '[data-demo-tour="engagement-audit-tab"]',
      title: "Engagement Audit",
      content: <p className="text-xs leading-relaxed text-[#45474c]">A full activity log for this engagement — who uploaded, shared, commented, or changed settings and when.</p>,
      placement: "bottom" as const,
      route: `${eng}/audit`,
    }] : []),
    // 17 – Members tab
    ...(eng ? [{
      target: '[data-demo-tour="engagement-members-tab"]',
      title: "Engagement Members",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Manage who has access to this engagement and their role — Lead, Collaborator or Viewer.</p>,
      placement: "bottom" as const,
      route: `${eng}/members`,
    }] : []),
    // 18 – Settings tab
    ...(eng ? [{
      target: '[data-demo-tour="engagement-settings-tab"]',
      title: "Engagement Settings",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Configure the engagement — name, status, due dates, intake settings and advanced options.</p>,
      placement: "bottom" as const,
      route: `${eng}/settings`,
    }] : []),
    // 19 – Firm Switcher
    {
      target: '[data-demo-tour="firm-switcher"]',
      title: "Firm Switcher",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Switch between firms or create a new one. Each firm is an independent workspace with its own clients, engagements and documents.</p>,
      placement: "right" as const,
      route: firm,
    },
    // 20 – Support
    {
      target: '[data-demo-tour="sidebar-support"]',
      title: "Support",
      content: <div className="text-xs leading-relaxed text-[#45474c] space-y-2">
        <p>No more chasing support over email. Firma has a built-in support module — raise a request, track its status, and get responses, all without leaving the app.</p>
        <ul className="space-y-1.5">
          <li><strong className="text-[#1b1b1d]">Contextual</strong> — requests are tied to your firm, so our team has full context from the start.</li>
          <li><strong className="text-[#1b1b1d]">Trackable</strong> — see open, in-progress, and resolved tickets in one place.</li>
          <li><strong className="text-[#1b1b1d]">Always accessible</strong> — one click away in the sidebar, wherever you are in the app.</li>
        </ul>
      </div>,
      placement: "right" as const,
      route: firm,
    },
    // 21 – Recent
    {
      target: '[data-demo-tour="sidebar-recent"]',
      title: "Recent",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Quickly jump back to recently visited clients and engagements. The last 10 are tracked automatically.</p>,
      placement: "right" as const,
      route: firm,
    },
    // 22 – Reminders
    {
      target: '[data-demo-tour="sidebar-reminders"]',
      title: "Reminders",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Auto reminders are set based on follow-up dates, due dates or assignments. They surface here so nothing slips through the cracks.</p>,
      placement: "right" as const,
      route: firm,
    },
    // 23 – Bookmarks
    {
      target: '[data-demo-tour="sidebar-bookmarks"]',
      title: "Bookmarks",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Bookmark any document or engagement for fast access. Your bookmarks are always one click away.</p>,
      placement: "right" as const,
      route: firm,
    },
    // 24 – View As
    {
      target: '[data-demo-tour="view-as-selector"]',
      title: "View As",
      content: <p className="text-xs leading-relaxed text-[#45474c]">As a Firm Admin, you can switch into any role — <strong className="text-[#1b1b1d]">Member</strong>, <strong className="text-[#1b1b1d]">Client Collaborator</strong>, or <strong className="text-[#1b1b1d]">External Viewer</strong> — and see the app exactly as they would. No guesswork about what a client or contractor can see. Switch back to Firm Admin any time from the same selector to continue regular operations.</p>,
      placement: "right" as const,
      route: firm,
    },
    // 25 – Profile trigger (last step)
    {
      target: '[data-checkout-hint-profile="trigger"]',
      title: "Profile Menu",
      content: <p className="text-xs leading-relaxed text-[#45474c]">Access billing, plan usage, firm switcher and sign-out from here.</p>,
      placement: "right" as const,
      route: firm,
    },
  ]
}

// ─── Component ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function DemoTour() {
  const { run, stepIndex, slugs, setRun, setStepIndex, endTour } = useDemoTour()
  const router = useRouter()
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  const steps = slugs
    ? makeSteps(slugs.firmSlug, slugs.clientSlug, slugs.engagementSlug)
    : []

  const clearRetry = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
    retryCountRef.current = 0
  }, [])

  const navigateForStep = useCallback(async (stepIdx: number): Promise<void> => {
    if (!slugs || !steps[stepIdx]) return
    const step = steps[stepIdx] as any
    const targetRoute: string | undefined = step.route
    if (!targetRoute) return

    const targetPath = targetRoute.split("?")[0]
    const targetQuery = targetRoute.includes("?") ? `?${targetRoute.split("?")[1]}` : ""
    const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
    const currentQuery = typeof window !== "undefined" ? window.location.search : ""

    if (currentPath !== targetPath) {
      router.push(targetRoute)
      await sleep(1800)
    } else if (targetQuery && currentQuery !== targetQuery) {
      router.push(targetRoute)
      await sleep(900)
    }
  }, [slugs, steps, router])

  const handleJoyrideEvent = useCallback(async (data: EventData, _controls: Controls) => {
    const { status, type, index } = data

    if (type === EVENTS.TARGET_NOT_FOUND) {
      const isLastStep = index >= steps.length - 1
      const step = steps[index] as any
      const stepRoute: string | undefined = step?.route
      const stepPath = stepRoute?.split("?")?.[0]
      const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
      // Same-page steps (upload btn, document action, etc.) get more retries since the
      // page content may load slowly after navigation. Cross-page steps cap at 12.
      const isSamePage = !!stepPath && currentPath === stepPath
      const retryLimit = isSamePage ? 24 : 12
      if (!isLastStep && retryCountRef.current >= retryLimit) {
        // Exhausted retries — skip this step
        clearRetry()
        setStepIndex(index + 1)
        return
      }
      retryCountRef.current += 1
      // Every 3rd retry re-push the route in case the page load is still in flight
      const shouldReNav = retryCountRef.current % 3 === 0
      retryRef.current = setTimeout(async () => {
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
      // X / skip button mid-tour — save progress so user can resume, stop cleanly
      if (action === "close" || action === "skip") {
        if (slugs?.firmSlug) {
          saveTourProgress(index, slugs.firmSlug)
          setStepIndex(index) // keep context in sync
        }
        endTour(false)
        return
      }
      const nextIndex = action === "prev" ? Math.max(0, index - 1) : index + 1
      await navigateForStep(nextIndex)
      setStepIndex(nextIndex)
      if (slugs?.firmSlug) saveTourProgress(nextIndex, slugs.firmSlug)
      return
    }

    if (status === STATUS.FINISHED || type === EVENTS.TOUR_END) {
      clearRetry()
      endTour(status === STATUS.FINISHED)
    }
  }, [steps, slugs, navigateForStep, clearRetry, setRun, setStepIndex, endTour])

  if (!run || steps.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JoyrideAny = Joyride as any

  return (
    <JoyrideAny
      run={run}
      stepIndex={stepIndex}
      steps={steps}
      continuous
      scrollToFirstStep
      disableOverlayClose
      disableScrolling={false}
      onEvent={handleJoyrideEvent}
      locale={{ last: "Next →", next: "Next →", back: "← Back", skip: "Skip tour", close: "Close" }}
      options={{
        primaryColor: "#1b1b1d",
        textColor: "#1b1b1d",
        backgroundColor: "#ffffff",
        arrowColor: "#ffffff",
        overlayColor: "rgba(15, 23, 42, 0.48)",
        spotlightPadding: 10,
        spotlightRadius: 4,
        zIndex: 10050,
        skipBeacon: true,
        showProgress: false,
        scrollDuration: 400,
        scrollOffset: 40,
      } as any}
      styles={{
        floater: { filter: "drop-shadow(0 4px 16px rgba(15,23,42,0.13))" },
        tooltip: {
          borderRadius: 2,
          padding: "16px 16px 12px",
          fontSize: 12,
          maxWidth: 280,
          border: "1px solid #e5e7eb",
          boxShadow: "0 8px 32px -8px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)",
          fontFamily: "inherit",
        },
        tooltipContainer: { textAlign: "left", lineHeight: 1.5 },
        tooltipTitle: {
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.01em",
          color: "#1b1b1d",
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0,
        },
        tooltipContent: { padding: "6px 0 2px", fontSize: 12, color: "#45474c", lineHeight: 1.55 },
        tooltipFooter: { marginTop: 10, paddingTop: 8, borderTop: "1px solid #e5e7eb", justifyContent: "space-between" },
        buttonPrimary: {
          borderRadius: 2,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "5px 12px",
          backgroundColor: "#1b1b1d",
          color: "#ffffff",
          fontFamily: "inherit",
        },
        buttonBack: {
          borderRadius: 2,
          fontSize: 10,
          fontWeight: 600,
          padding: "5px 10px",
          color: "#45474c",
          order: -1,
          marginRight: "auto",
        },
        buttonSkip: { fontSize: 10, color: "#9ca3af", padding: "5px 6px" },
        buttonClose: { color: "#9ca3af", width: 10, height: 10, padding: 8, top: 2, right: 2 },
      }}
    />
  )
}

