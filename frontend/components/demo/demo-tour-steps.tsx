import { Brio } from '@/components/ui/brio'
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
            content: <p>Home picks up where you left off: recent pages, this week&apos;s agenda, what needs you, your engagements and your bookmarks.</p>,
            route: `${firm}/home`,
            placement: 'right',
        },
        {
            target: '[data-demo-tour="home-needs-you"]',
            title: 'Needs you',
            content: <p>Always first: approvals, client comments, changes requested and @mentions that are waiting on you, across every firm you&apos;re in.</p>,
            route: `${firm}/home`,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    inbox: [
        {
            target: '[data-demo-tour="sidebar-inbox"]',
            title: 'Inbox',
            content: <p>Reminders from due dates, follow-ups, review requests and @mentions land here with your notifications, so nothing slips through the cracks.</p>,
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
            content: <p>Overview shows business insights — revenue pipeline, engagement health, and what needs attention across all clients.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'right',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="firm-brief"]',
            title: "Today's brief",
            content: <p><Brio />, Firma&apos;s AI assistant, writes a daily brief from your firm&apos;s own data: where things stand, what needs attention and what&apos;s worth watching.</p>,
            route: at(firm, { tab: 'analytics' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'doc-search': [
        {
            target: '[data-demo-tour="firm-doc-search-tab"]',
            title: 'Doc Search',
            content: <p>Search every document across your firm by filename or topic — powered by AI semantic search, with filters for file type, client, and engagement.</p>,
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
            content: <p>See deadlines and events across every client and engagement in your firm in one calendar — switch between Month, Week, Day, and Agenda views.</p>,
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
            content: <p>A complete activity log across all clients and engagements in your firm — searchable and exportable.</p>,
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
                    <li><strong>General</strong> — the firm&apos;s details and an internal memo only admins see.</li>
                    <li><strong>Branding</strong> — the name, tagline, color and logo shown in the app.</li>
                    <li><strong>App settings</strong> — who can join by email domain, currency, reminder emails, notifications, and what collaborators and reviewers see on an engagement&apos;s Overview.</li>
                    <li><strong>Storage</strong> — the firm&apos;s Google Drive or OneDrive.</li>
                </ul>
            ),
            route: at(firm, { tab: 'settings' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    clients: [],
    'all-clients': [
        {
            target: '[data-demo-tour="firm-clients-tab"]',
            title: 'Clients',
            content: <p>Every client workspace for your firm lives here — each with its own branding, contacts, and engagements.</p>,
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
            content: <p>Every engagement for this client lives here — each one is its own client-billable project, with its own Files, Board, Discussions, members, audit log and settings.</p>,
            route: client,
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'new-engagement': [
        {
            target: '[data-demo-tour="engagement-add-btn"]',
            title: 'Add an engagement',
            content: <p>Engagements are client-billable projects — e.g. SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a <strong>Retainer</strong>, <strong>T&amp;M</strong>, or <strong>Fixed Price</strong> engagement. Each has its own Files, Board, Discussions and team.</p>,
            spoken: 'Engagements are client-billable projects, like SEO retainers, paid media campaigns, content sprints, brand audits, or social strategy. Run them as a Retainer, Time and Materials, or Fixed Price engagement. Each has its own Files, Board, Discussions and team.',
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
            target: '[data-demo-tour="engagement-overview-tab"]',
            title: 'Engagement overview',
            content: <p>The Overview tab surfaces engagement-level insights — progress, activity, and key metrics at a glance.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="engagement-action-center"]',
            title: 'Action Center',
            content: <p>What needs doing on this engagement, in two lists: <strong>Delivery</strong> (overdue deliverables, ones awaiting approval or rework, planning gaps, unanswered comments) and <strong>Housekeeping</strong> (pending invitations, sensitive, duplicate or stale files).</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'bottom',
        },
        {
            target: '[data-demo-tour="engagement-ai-summary"]',
            title: 'AI summary',
            content: <p><Brio /> drafts the engagement&apos;s status summary from its own data, and can rewrite it. Your team edits and approves it before anything reaches the client.</p>,
            route: engAt({ tab: 'analytics' }),
            placement: 'left',
        },
        {
            target: '[data-demo-tour="engagement-progress"]',
            title: 'Progress',
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
            content: <p>Upload files, create folders or import from Google Drive with New. You can also drag files from your computer onto the list — try it here; the tour only adds them on screen.</p>,
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
                        <li><strong>The deliverable follows</strong> — its stage is worked out from its documents&apos;, so there&apos;s nothing to keep in step by hand.</li>
                        <li><strong>Firma asks first</strong> when a move would show the deliverable to the client for the first time, or approve it.</li>
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
            content: <p>Hover a row for its quick actions, or click ⋯ on any file to open, download, comment on, bookmark, set a due date, rename or move it, and more.</p>,
            spoken: 'Document actions. Hover a row for its quick actions, or click the three dots on any file to open, download, comment on, bookmark, set a due date, rename or move it, and more.',
            route: engAt({ tab: 'files', folder: inProgressId }),
            placement: 'left',
        },
    ],
    'file-details': [
        {
            target: '[data-demo-tour="details-blocked"]',
            title: 'Details and Blocked',
            content: (
                <div className="space-y-2">
                    <p>Details has everything about a file: its stage, due date, assignee and type.</p>
                    <p>When a document is waiting on someone, flag it <strong>Blocked</strong> with a reason and a note. Only your firm sees the flag, and the Board can filter by it.</p>
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
            title: 'Deliverables board',
            content: <p>The Board shows every deliverable as a card in four lanes: To do, In progress, In review and Approved.</p>,
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
                    <p>The bar counts the approved documents. Ones Not started stay off the Board until work begins.</p>
                </div>
            ),
            route: engAt({ tab: 'board' }),
            placement: 'bottom',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="board-lane-approved"]',
            title: 'Approval',
            content: <p>Approving a document locks it and keeps an exact copy of the version approved, with who approved it and when. When every document on the Board is approved, so is the deliverable.</p>,
            route: engAt({ tab: 'board' }),
            placement: 'left',
            skipScroll: true,
        },
        {
            target: '[data-demo-tour="board-filters"]',
            title: 'Overdue and Blocked',
            content: <p>Narrow the Board to the deliverables that are overdue, or that have a document your firm flagged Blocked. Blocked shows up while there are some.</p>,
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
    ],
    discussions: [
        {
            target: '[data-demo-tour="engagement-comments-tab"]',
            title: 'Discussions',
            content: <p>Every deliverable’s discussion in one place: see what’s new and who’s waiting on a reply, answer without leaving the page, and resolve what’s settled.</p>,
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
    'engagement-members': [
        {
            target: '[data-demo-tour="engagement-members-tab"]',
            title: 'Engagement members',
            content: <p>Manage who has access to this engagement and their role — Lead, Collaborator or Viewer.</p>,
            route: engAt({ tab: 'members' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-audit': [
        {
            target: '[data-demo-tour="engagement-audit-tab"]',
            title: 'Engagement audit',
            content: <p>A full activity log for this engagement — who uploaded, shared, commented, or changed settings and when.</p>,
            route: engAt({ tab: 'audit' }),
            placement: 'bottom',
            skipScroll: true,
        },
    ],
    'engagement-settings': [
        {
            target: '[data-demo-tour="engagement-settings-tab"]',
            title: 'Engagement settings',
            content: <p>For the engagement&apos;s leads: its name, status and description, contract type and value, start and end dates, and an internal memo. Edits here stay on screen; Save and Delete are inert in this demo.</p>,
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
            content: <p>Billing is in the profile menu too, for firm admins: your plan and your payments. It&apos;s inert in this demo.</p>,
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
