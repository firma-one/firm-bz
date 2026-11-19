import { Brio } from '@/components/ui/brio'
import { RaidInfo } from '@/components/projects/raid/raid-info'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'
import { getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { TOUR_NODES, tourSubtree, type TourNodeId } from '@/lib/demo/tour-chapters'

const firstClient = DEMO_FIRM.clients[0]
const firstEngagement = firstClient?.engagements[0]

const firm = '/tour'
const client = firstClient ? `/tour/${firstClient.slug}` : firm
const eng = firstClient && firstEngagement ? `/tour/${firstClient.slug}/${firstEngagement.slug}` : client

/** A tour page with these query parameters, encoded as the page's own URL reads them back. */
const at = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`
const engAt = (params: Record<string, string>) => at(eng, params)

// The Files and Board sections work inside the engagement's In progress deliverable: its documents'
// stages and due dates change there, and its first document's Details pane can flag it Blocked.
const inProgress = firstEngagement ? getDemoDeliverables(firstEngagement).find((d) => d.status === 'in_progress') : undefined
const inProgressId = inProgress?.folder.id ?? ''
const firstDocumentId = inProgress?.folder.files[0]?.id ?? ''

/** How long the docked right pane takes to open and slide in (layout-right-panel.tsx), with room to spare. */
const PANE_SETTLE_MS = 600
/** How long the profile menu takes to open (?menu=profile, demo-sidebar.tsx). */
const MENU_SETTLE_MS = 300

export interface TourStep {
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
    /** Don't scroll the target into view — use when it's already visible without scrolling, so the
     * page stays put (demo-tour.tsx scrolls the others, only as far as needed). */
    skipScroll?: boolean
    /** Extra wait (ms) after navigating to the step, for a target that opens from the URL and
     * animates in (the docked right pane, the profile menu): shown sooner, the step card points at
     * where it was mid-animation. */
    settle?: number
    /** Autoplay's time on this step (ms), when the card's length alone doesn't say it: worked out
     * from the card's words otherwise (autoplayDuration). */
    duration?: number
    /** What the card says aloud, title included, where its own words don't read well aloud ("⌘K");
     * otherwise its title and copy are read (lib/demo/tour-narration-text.ts). */
    spoken?: string
}

/** A step in a run, with the node it belongs to: the step card names the node's place in the
 * outline and counts within the node, and the tour's outline pane marks it. */
export interface TourRunStep extends TourStep {
    node: TourNodeId
    indexInNode: number
    nodeSize: number
}

/** Each node's own steps, over the public tour's New UI shell. A chapter with sections has none of
 * its own: its sections' steps run in order. Settings pages, Billing and Contacts don't exist in
 * this static copy, so their steps show where they live. Every target must exist as a
 * data-demo-tour attribute (lib/demo/tour-chapters.test.ts checks). */
export const NODE_STEPS: Record<TourNodeId, TourStep[]> = {
    home: [
        {
            target: '[data-demo-tour="sidebar-home"]',
            title: 'Home',
            content: <p>Home picks up where you left off: your brief, what needs you, recent pages, this week&apos;s agenda, your engagements and your bookmarks.</p>,
            route: `${firm}/home`,
            placement: 'right',
        },
        {
            target: '[data-demo-tour="home-day-brief"]',
            title: 'Your brief',
            content: <p>Once a day, <Brio /> writes your brief from what&apos;s on your plate: what needs you first, what&apos;s due and what&apos;s changed. The sparkle rewrites it when your day moves on.</p>,
            route: `${firm}/home`,
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="home-needs-you"]',
            title: 'Needs you',
            content: <p>Right under your brief, always: approvals, client comments, changes requested, @mentions and the Actions you own, across every firm you&apos;re in.</p>,
            route: `${firm}/home`,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    inbox: [
        {
            target: '[data-demo-tour="sidebar-inbox"]',
            title: 'Inbox',
            content: <p>Reminders from due dates, follow-ups, the Actions you own, review requests and @mentions land here with your notifications, so nothing slips through the cracks.</p>,
            route: `${firm}/inbox`,
            placement: 'right',
        },
        {
            target: '[data-demo-tour="inbox-views"]',
            title: 'Needs you and Updates',
            content: <p><strong>Needs you</strong> is what&apos;s waiting on you to act. <strong>Updates</strong> keeps your notifications, with the unread ones counted.</p>,
            route: `${firm}/inbox`,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    // After Home and Inbox, as in the sidebar; on the Inbox page, where the run already is.
    search: [
        {
            target: '[data-demo-tour="command-palette"]',
            title: 'Search (⌘K)',
            content: <p>Press ⌘K (or Ctrl K) anywhere to jump to a client, an engagement, a document or a setting, or to run a command. Typing G and then a letter goes straight to a page: G D opens Doc Search. Search is inert in this demo.</p>,
            spoken: 'Search. Press Command K, or Control K, anywhere to jump to a client, an engagement, a document or a setting, or to run a command. Typing G and then a letter goes straight to a page: G, then D, opens Doc Search. Search is inert in this demo.',
            route: `${firm}/inbox`,
            placement: 'right',
            disableBeacon: true,
        },
    ],
    profile: [
        {
            target: '[data-demo-tour="profile-menu-items"]',
            title: 'Profile menu',
            content: <p>Your profile, Billing and Support live in the menu under your name, with the changelog and sign-out.</p>,
            route: at(`${firm}/inbox`, { menu: 'profile' }),
            placement: 'right',
            settle: MENU_SETTLE_MS,
        },
    ],
    firm: [],
    'firm-switcher': [
        {
            target: '[data-demo-tour="firm-switcher"]',
            title: 'Firm switcher',
            content: <p>Switch between firms or create a new one. Each firm is an independent workspace with its own clients, engagements and documents.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'right',
        },
    ],
    'firm-overview': [
        {
            target: '[data-demo-tour="firm-overview-tab"]',
            title: 'Firm overview',
            content: <p>Overview shows business insights: revenue pipeline, engagement health, and what needs attention across all clients.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'right',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="firm-brief"]',
            title: "Firm brief",
            content: <p><Brio />, Firma&apos;s AI assistant, writes a daily brief from your firm&apos;s own data: where things stand, what needs attention and what&apos;s worth watching.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="firm-chat"]',
            title: <>Ask <Brio /> about the firm</>,
            content: <p>Ask across every engagement: what&apos;s late this week, which clients are waiting on you, where the pipeline stands. Answers link the engagements they name.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'top',
            skipScroll: true,
        },
    ],
    'doc-search': [
        {
            target: '[data-demo-tour="firm-doc-search-tab"]',
            title: 'Doc Search',
            content: <p>Search every document across your firm by filename or topic. Semantic search finds a document by what it&apos;s about, with filters for file type, client and engagement.</p>,
            route: at(firm, { tab: 'doc-search' }),
            placement: 'right',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="doc-search-filters"]',
            title: 'Filters',
            content: <p>Narrow the results by client, engagement, file type or when a file last changed. Try them: the results here update as you pick.</p>,
            route: at(firm, { tab: 'doc-search' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    calendar: [
        {
            target: '[data-demo-tour="firm-calendar-tab"]',
            title: 'Calendar',
            content: <p>See deadlines and events across every client and engagement in your firm in one calendar, in Month, Week, Day or Agenda view.</p>,
            route: at(firm, { tab: 'calendar' }),
            placement: 'right',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="calendar-engagements"]',
            title: 'One calendar per engagement',
            content: <p>Each engagement has its own color. Show or hide them here to see just the deadlines you care about.</p>,
            route: at(firm, { tab: 'calendar' }),
            placement: 'right',
            skipScroll: true,
        },
    ],
    'firm-members': [
        {
            target: '[data-demo-tour="firm-members-tab"]',
            title: 'Firm members',
            content: <p>As the firm owner, you&apos;re an administrator by default. Invite more administrators here if you&apos;d like help managing the firm. Per-engagement access and roles are set separately in each engagement&apos;s Members tab.</p>,
            route: at(firm, { tab: 'members' }),
            placement: 'right',
            skipScroll: true,
        },
    ],
    'firm-audit': [
        {
            target: '[data-demo-tour="firm-audit-tab"]',
            title: 'Firm audit log',
            content: <p>A complete activity log across all clients and engagements in your firm, searchable and exportable.</p>,
            route: at(firm, { tab: 'audit' }),
            placement: 'right',
            skipScroll: true,
        },
    ],
    'firm-settings': [
        {
            target: '[data-demo-tour="firm-settings-item"]',
            title: 'Firm settings',
            content: <p>Settings are for firm admins: everything about the firm itself, in four tabs.</p>,
            route: at(firm, { tab: 'settings' }),
            placement: 'right',
        },
        {
            target: '[data-demo-tour="firm-settings-tabs"]',
            title: 'General, Branding, App settings, Storage',
            content: (
                <ul>
                    <li><strong>General</strong>: the firm&apos;s details and an internal memo only admins see.</li>
                    <li><strong>Branding</strong>: the name, tagline, color and logo shown in the app.</li>
                    <li><strong>App settings</strong>: who can join by email domain, currency, reminder emails, notifications, <Brio />, and what Limited Access contributors and Reviewers see on an engagement&apos;s Overview.</li>
                    <li><strong>Storage</strong>: the firm&apos;s Google Drive or OneDrive.</li>
                </ul>
            ),
            route: at(firm, { tab: 'settings' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="firm-settings-brio"]',
            title: <><Brio /> settings</>,
            content: <p>Whether <Brio /> reads each new memo. Whether names, emails and links are swapped for placeholders before <Brio /> reads. And whether Reviewers can ask <Brio /> on an engagement&apos;s Overview.</p>,
            route: at(firm, { tab: 'settings', section: 'appsettings' }),
            placement: 'top',
        },
    ],
    clients: [],
    'all-clients': [
        {
            target: '[data-demo-tour="firm-clients-tab"]',
            title: 'Clients',
            content: <p>Every client workspace for your firm lives here, each with its own branding, contacts and engagements.</p>,
            route: at(firm, { tab: 'clients' }),
            placement: 'right',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="client-list"]',
            title: 'A client',
            content: <p>Each row shows a client&apos;s status, industry, engagements and last update. Open one for its page: its engagements, contacts and settings.</p>,
            route: at(firm, { tab: 'clients' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    contacts: [
        {
            target: '[data-demo-tour="client-contacts-tab"]',
            title: 'Contacts',
            content: <p>The people you deal with at each client, with their title, email, phone and notes. The Contacts tab is inert in this demo.</p>,
            route: client,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'new-client': [
        {
            target: '[data-demo-tour="firm-add-client-btn"]',
            title: 'Add a client',
            content: <p>Create a new client workspace. Each client can have its own branding, contacts, and multiple engagements.</p>,
            route: at(firm, { tab: 'clients' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    engagements: [],
    'all-engagements': [
        {
            target: '[data-demo-tour="sidebar-engagements"]',
            title: 'Your engagements',
            content: <p>Every engagement you&apos;re on, grouped by client, with its status. One click opens it.</p>,
            route: client,
            placement: 'right',
        },
        {
            target: '[data-demo-tour="client-engagements-tab"]',
            title: "A client's engagements",
            content: <p>Every engagement for this client lives here. Each one is its own client-billable project, with its own Files, Deliverables, Discussions, RAID log<RaidInfo className="ml-0.5" />, audit log, members and settings.</p>,
            route: client,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'new-engagement': [
        {
            target: '[data-demo-tour="engagement-add-btn"]',
            title: 'Add an engagement',
            content: <p>Engagements are client-billable projects, like SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a <strong>Retainer</strong>, <strong>T&amp;M</strong>, or <strong>Fixed Price</strong> engagement. Each has its own Files, Deliverables, Discussions and team.</p>,
            spoken: 'Engagements are client-billable projects, like SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a Retainer, Time and Materials, or Fixed Price engagement. Each has its own Files, Deliverables, Discussions and team.',
            route: client,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-overview': [
        {
            target: '[data-demo-tour="engagement-header"]',
            title: 'Engagement',
            content: <p>The engagement header shows the project name, status, and key metadata. Everything for this engagement lives here.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="overview-status-row"]',
            title: 'Where it stands',
            content: <p>The engagement in one row: its health score, the time left, how many deliverables are approved, what&apos;s due next, and the open Risks, Actions and Issues in its RAID log.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
        },
        {
            target: '[data-demo-tour="engagement-action-center"]',
            title: 'Needs you',
            content: <p>Everything that needs doing on this engagement, in one list: what&apos;s <strong>waiting on you</strong> (your RAID actions, <Brio />&apos;s suggestions, planning gaps, anything overdue) and what&apos;s <strong>waiting on others</strong>. What&apos;s all clear folds into one line.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
        },
        {
            target: '[data-demo-tour="overview-waiting-reviewer"]',
            title: 'Waiting on others',
            content: <p>Deliverables that have sat with the client for a while, each with a nudge <Brio /> drafts for you to edit and send, and invitations not yet accepted.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
        },
        {
            target: '[data-demo-tour="engagement-ai-summary"]',
            title: 'Latest update',
            content: <p><Brio /> drafts the engagement&apos;s update from its own data, and your team writes the plan. Publish it here, or publish and email it to everyone on the engagement in one go.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'top',
        },
        {
            target: '[data-demo-tour="engagement-progress"]',
            title: 'Deliverables',
            content: <p>Every deliverable on a timeline from kickoff to the due date, with today marked: what&apos;s done, what&apos;s due next and what&apos;s running late.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'top',
        },
    ],
    files: [
        {
            target: '[data-demo-tour="engagement-files-tab"]',
            title: 'Files',
            content: <p>The engagement&apos;s folder on your firm&apos;s Google Drive or OneDrive. The numbered folders are its deliverables, each with a Status and a Due date; next, we&apos;ll open one that&apos;s in progress.</p>,
            route: engAt({ tab: 'files' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-upload-btn"]',
            title: 'Upload files and create folders',
            content: <p>Upload files, create folders or import from Google Drive with New. You can also drag files from your computer onto the list. Try it here: the tour only adds them on screen.</p>,
            route: engAt({ tab: 'files', folder: inProgressId }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="files-stage"]',
            title: 'Stages',
            content: (
                <div className="space-y-2">
                    <p>Each document in a deliverable has a stage, from Not started to Approved. Change it here.</p>
                    <ul>
                        <li><strong>The deliverable follows</strong>: its stage is worked out from its documents&apos;, so there&apos;s nothing to keep in step by hand.</li>
                        <li><strong>Firma asks first</strong> when a move would show the deliverable to a Limited Access contributor or Reviewer for the first time, or approve it.</li>
                    </ul>
                </div>
            ),
            route: engAt({ tab: 'files', folder: inProgressId }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="files-due"]',
            title: 'Due dates',
            content: <p>Work that&apos;s underway with no due date gets a warning. Click to set one: a document can&apos;t be due after its deliverable, and Firma offers to move the dates so they fit.</p>,
            route: engAt({ tab: 'files', folder: inProgressId }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="document-action-trigger"]',
            title: 'Document actions',
            content: <p>Hover a row for its quick actions, or click ⋯ on any file to open, download, bookmark, set a due date, rename or move it, and more.</p>,
            spoken: 'Document actions. Hover a row for its quick actions, or click the three dots on any file to open, download, bookmark, set a due date, rename or move it, and more.',
            route: engAt({ tab: 'files', folder: inProgressId }),
            placement: 'left',
        },
        {
            target: '[data-demo-tour="files-views"]',
            title: 'Recent and Health',
            content: <p>Two more views, for your team only. <strong>Recent</strong> lists what changed this week and who changed it. <strong>Health</strong> scores how tidy the folder is and flags duplicate, stale or sensitive files.</p>,
            route: engAt({ tab: 'files', view: 'health' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'file-details': [
        {
            target: '[data-demo-tour="details-blocked"]',
            title: 'Details and Blocked',
            content: (
                <div className="space-y-2">
                    <p>Details has everything about a file: its stage, due date, assignee and type.</p>
                    <p>When a document is waiting on someone, flag it <strong>Blocked</strong> with a reason and a note. Only Leads and Full Access contributors see the flag, and the Deliverables tab can filter by it.</p>
                </div>
            ),
            route: engAt({ tab: 'files', folder: inProgressId, details: firstDocumentId }),
            placement: 'left',
            skipScroll: true,
            settle: PANE_SETTLE_MS,
        },
        {
            target: '[data-demo-tour="details-tabs"]',
            title: 'Versions, activity and discussions',
            content: <p>Versions lists each saved version, Activity everything that happened to the file, and Discussions its comments. An approved document&apos;s approval record shows under Details.</p>,
            route: engAt({ tab: 'files', folder: inProgressId, details: firstDocumentId }),
            placement: 'left',
            skipScroll: true,
        },
    ],
    board: [
        {
            target: '[data-demo-tour="engagement-board-tab"]',
            title: 'Deliverables',
            content: <p>Every deliverable is a card in one of four lanes: To do, In progress, In review and Approved.</p>,
            route: engAt({ tab: 'board' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="board-card"]',
            title: 'Stages follow the documents',
            content: (
                <div className="space-y-2">
                    <p>A card&apos;s lane is worked out from its documents&apos; stages: any document in progress puts it In progress, and it&apos;s Approved once they all are.</p>
                    <p>The bar counts the approved documents. Ones Not started stay out of the lanes until work begins.</p>
                </div>
            ),
            route: engAt({ tab: 'board' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="board-lane-approved"]',
            title: 'Approval',
            content: <p>Approving a document locks it and keeps an exact copy of the version approved, with who approved it and when. When every document in it is approved, so is the deliverable.</p>,
            route: engAt({ tab: 'board' }),
            placement: 'left',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="board-filters"]',
            title: 'Overdue and Blocked',
            content: <p>Narrow the list to the deliverables that are overdue, or that have a document your firm flagged Blocked. Blocked shows up while there are some.</p>,
            route: engAt({ tab: 'board' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'deliverable-details': [
        {
            target: '[data-demo-tour="deliverable-documents"]',
            title: 'Inside a deliverable',
            content: <p>Click a card for its documents and their stages, with the approved ones counted. Documents Not started wait under their own line.</p>,
            route: engAt({ tab: 'board', deliverable: inProgressId }),
            placement: 'left',
            skipScroll: true,
            settle: PANE_SETTLE_MS,
        },
        {
            target: '[data-demo-tour="deliverable-tabs"]',
            title: "The deliverable's discussion",
            content: <p>Comments is the deliverable&apos;s conversation, with your team and the client: @ mentions a teammate and # tags one of its documents.</p>,
            spoken: "The deliverable's discussion. Comments is the deliverable's conversation, with your team and the client. Type an at sign to mention a teammate, or a hash sign to tag one of its documents.",
            route: engAt({ tab: 'board', deliverable: inProgressId }),
            placement: 'left',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="deliverable-composer"]',
            title: <><Brio /> drafts a reply</>,
            content: <p>When the client is waiting on you, <strong>Draft reply</strong> has <Brio /> write one from the thread, for you to edit and send. Internal notes are never used.</p>,
            route: engAt({ tab: 'board', deliverable: inProgressId, dtab: 'comments' }),
            placement: 'left',
            skipScroll: true,
            settle: PANE_SETTLE_MS,
        },
    ],
    discussions: [
        {
            target: '[data-demo-tour="engagement-comments-tab"]',
            title: 'Discussions',
            content: <p>Every deliverable’s discussion in one place: see what’s new and who’s waiting on a reply, answer without leaving the page, and resolve what’s settled. Beside Threads, Memos keeps your team’s call notes.</p>,
            route: engAt({ tab: 'comments' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="discussions-views"]',
            title: 'Find the ones that need you',
            content: <p>Awaiting reply lists the threads where the client spoke last. Mentions holds the ones that @mention you, and Resolved keeps what&apos;s settled. Search by document ID or by person.</p>,
            route: engAt({ tab: 'comments' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="discussions-threads"]',
            title: 'Reply and resolve',
            content: <p>Expand a thread to read its latest comments, or open it to reply beside the list. Resolve it once it&apos;s settled.</p>,
            route: engAt({ tab: 'comments' }),
            placement: 'top',
            skipScroll: true,
        },
    ],
    memos: [
        {
            target: '[data-demo-tour="discussions-memos-tab"]',
            title: 'Memos',
            content: <p>Your team&apos;s notes and call transcripts, each a Markdown file in your Google Drive or OneDrive. Only Leads and Full Access contributors see them.</p>,
            route: engAt({ tab: 'comments', view: 'memos' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="memos-add"]',
            title: 'Add a memo',
            content: <p>Paste your notes or a transcript after a call. <Brio /> reads a new memo once: it writes the meeting&apos;s minutes and suggests what to log in RAID<RaidInfo className="ml-0.5" />.</p>,
            route: engAt({ tab: 'comments', view: 'memos' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="memo-brio-summary"]',
            title: 'Minutes',
            content: <p>Minutes for the people who were there: who came, what was discussed and decided, and the action items. Copy the subject and the summary into an email.</p>,
            route: engAt({ tab: 'comments', view: 'memos', memo: 'tour-memo-weekly', brio: 'summary' }),
            placement: 'left',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="memo-brio-raid"]',
            title: 'RAID suggestions',
            content: <p>Each is a Risk, Action, Issue or Decision. Click its letter, title, date or priority to change it before you accept. Nothing changes until you do.</p>,
            route: engAt({ tab: 'comments', view: 'memos', memo: 'tour-memo-weekly', brio: 'raid' }),
            placement: 'left',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="memo-accept"]',
            title: 'Accept',
            content: <p>Accept one, or every selected one at once. Each joins the RAID log, where its owner and status are set.</p>,
            route: engAt({ tab: 'comments', view: 'memos', memo: 'tour-memo-weekly', brio: 'raid' }),
            placement: 'top',
            skipScroll: true,
        },
    ],
    raid: [
        {
            target: '[data-demo-tour="engagement-raid-tab"]',
            title: 'RAID log',
            content: <p>The engagement&apos;s Risks, Actions, Issues and Decisions, for your team only, each marked by its first letter. Filter by kind, and switch between what&apos;s open and what&apos;s closed.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="raid-table"]',
            title: 'Risks',
            content: <p>A Risk is what could go wrong, like a project falling behind pace. Give it a priority, an owner and a mitigation, such as re-planning with the client on the next call. Close it once it&apos;s handled; a pace or planning Risk closes by itself when the work is back on track.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="raid-table"]',
            title: 'Actions',
            content: <p>An Action has an owner and a due date. While it&apos;s open, it&apos;s a reminder on its owner&apos;s Home and Inbox, and Done there closes it here. Late ones turn red.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="raid-table"]',
            title: 'Issues',
            content: <p>An Issue is what has already gone wrong, like a report five days overdue or a client reply still waiting on your team. Give it a priority, an owner and a next step. Overdue work, blocked files and waiting threads show up here by themselves, and close when they&apos;re fixed.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="raid-table"]',
            title: 'Decisions',
            content: <p>A Decision records what people agreed, like the scope leaving out state returns, so no one digs through emails later. Approving a deliverable records one by itself, and <Brio /> picks them up from memos and threads. <Brio /> records decisions; it never makes them.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="raid-brio-check"]',
            title: <><Brio />&apos;s suggestions</>,
            content: <p><Brio /> reads threads with new messages once a day, or now with the sparkle, and suggests what to log. What it finds in a memo waits on the memo. The plus adds your own.</p>,
            route: engAt({ tab: 'raid' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-members': [
        {
            target: '[data-demo-tour="engagement-members-tab"]',
            title: 'Engagement members',
            content: <p>Who&apos;s on the engagement at a glance, joined and by role, then everyone with access and their role: Lead, Contributor or Reviewer.</p>,
            route: engAt({ tab: 'members' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-audit': [
        {
            target: '[data-demo-tour="engagement-audit-tab"]',
            title: 'Engagement audit',
            content: <p>A full activity log for this engagement: who uploaded, shared, commented or changed settings, and when.</p>,
            route: engAt({ tab: 'audit' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-settings': [
        {
            target: '[data-demo-tour="engagement-settings-tab"]',
            title: 'Engagement settings',
            content: <p>For the engagement&apos;s leads: its name, status and description, contract type and value, start and end dates, and call notes, where <Brio /> can identify action items. Edits here stay on screen; Save and Delete are inert in this demo.</p>,
            route: engAt({ tab: 'settings' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    brio: [
        {
            target: '[data-demo-tour="ask-brio"]',
            title: <>Ask <Brio /></>,
            content: <p>Ask <Brio /> about this engagement: what&apos;s due, what&apos;s waiting on the client, where things stand. Prompt hints get you started.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="ask-brio"]',
            title: <><Brio /> on Files</>,
            content: <p>On the Files tab, <Brio /> answers about the deliverables, folders and files, and how the engagement&apos;s work is organized.</p>,
            route: engAt({ tab: 'files' }),
            placement: 'top',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="ask-brio"]',
            title: <><Brio /> and your data</>,
            content: <p>By default, the names, emails and links <Brio /> knows are swapped for placeholders before it reads, and come back in what it writes. Nothing it suggests changes anything until someone accepts it.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'top',
            skipScroll: true,
        },
    ],
    support: [
        {
            target: '[data-demo-tour="profile-menu-support"]',
            title: 'Support',
            content: <p>Support is in the profile menu, for firm admins. Requests are tied to your firm, so our team has the context from the start.</p>,
            route: at(`${firm}/support`, { menu: 'profile' }),
            placement: 'right',
            settle: MENU_SETTLE_MS,
        },
        {
            target: '[data-demo-tour="support-requests"]',
            title: 'Your requests',
            content: (
                <div className="space-y-2">
                    <p>Every request your firm has raised with the Firma team, with whose turn it is. <strong>Last update</strong> reads darker when Firma has replied.</p>
                    <p>Open one to see the whole conversation and reply; <strong>New request</strong> opens beside the list, with room to drop screenshots.</p>
                </div>
            ),
            route: `${firm}/support`,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    billing: [
        {
            target: '[data-demo-tour="profile-menu-billing"]',
            title: 'Billing',
            content: <p>Billing is in the profile menu too, for firm admins: your plan, your payments and your <Brio /> usage. It&apos;s inert in this demo.</p>,
            route: at(`${firm}/support`, { menu: 'profile' }),
            placement: 'right',
            settle: MENU_SETTLE_MS,
        },
    ],
}

/** A run's steps: everything under one node, or the whole tour (scope null), each node's own steps before its children's. */
export function tourSteps(scope: TourNodeId | null): TourRunStep[] {
    const nodes = scope ? tourSubtree(scope) : TOUR_NODES
    return nodes.flatMap((n) => NODE_STEPS[n.id].map((step, i, all) => ({ ...step, node: n.id, indexInNode: i, nodeSize: all.length })))
}

/** Seen: every part of the node that has steps of its own was seen to its last step. */
export function isNodeSeen(id: TourNodeId, completed: TourNodeId[]): boolean {
    return tourSubtree(id).every((n) => NODE_STEPS[n.id].length === 0 || completed.includes(n.id))
}
