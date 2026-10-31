/**
 * The guided tour's outline (.claude/plans/tour-chapters.md): chapters and their sections, in the
 * order of the data model (Firm › Clients › Engagements), with deep links to any of them. Free of
 * React so the app can import it for its "How this works" links; the steps themselves, with their
 * copy, live in components/demo/demo-tour-steps.tsx.
 */

export const TOUR_NODE_IDS = [
    'search',
    'home',
    'inbox',
    'profile',
    'firm',
    'firm-switcher',
    'firm-overview',
    'doc-search',
    'calendar',
    'firm-members',
    'firm-audit',
    'firm-settings',
    'clients',
    'all-clients',
    'contacts',
    'new-client',
    'engagements',
    'all-engagements',
    'new-engagement',
    'engagement-overview',
    'files',
    'file-details',
    'board',
    'deliverable-details',
    'discussions',
    'engagement-members',
    'engagement-audit',
    'engagement-settings',
    'brio',
    'support',
    'billing',
] as const

/** A chapter, a section, or a section's own sub-section: every one can be run and linked on its own. */
export type TourNodeId = (typeof TOUR_NODE_IDS)[number]

export interface TourNode {
    id: TourNodeId
    title: string
    children?: TourNode[]
}

/** The chapters, in the order the whole tour runs them; TOUR_NODE_IDS lists the same nodes in the same order. */
export const TOUR_OUTLINE: TourNode[] = [
    { id: 'search', title: 'Search (⌘K)' },
    { id: 'home', title: 'Home' },
    { id: 'inbox', title: 'Inbox' },
    { id: 'profile', title: 'Profile' },
    {
        id: 'firm',
        title: 'Firm',
        children: [
            { id: 'firm-switcher', title: 'Switch firms' },
            { id: 'firm-overview', title: 'Overview and daily brief' },
            { id: 'doc-search', title: 'Doc Search' },
            { id: 'calendar', title: 'Calendar' },
            { id: 'firm-members', title: 'Members' },
            { id: 'firm-audit', title: 'Audit' },
            { id: 'firm-settings', title: 'Settings' },
        ],
    },
    {
        id: 'clients',
        title: 'Clients',
        children: [
            { id: 'all-clients', title: 'All clients' },
            { id: 'contacts', title: 'Contacts' },
            { id: 'new-client', title: 'New client' },
        ],
    },
    {
        id: 'engagements',
        title: 'Engagements',
        children: [
            { id: 'all-engagements', title: 'All engagements' },
            { id: 'new-engagement', title: 'New engagement' },
            { id: 'engagement-overview', title: 'Overview, AI summary and progress' },
            { id: 'files', title: 'Files', children: [{ id: 'file-details', title: 'Details' }] },
            { id: 'board', title: 'Board', children: [{ id: 'deliverable-details', title: 'Details' }] },
            { id: 'discussions', title: 'Discussions' },
            { id: 'engagement-members', title: 'Members' },
            { id: 'engagement-audit', title: 'Audit' },
            { id: 'engagement-settings', title: 'Settings' },
            { id: 'brio', title: 'Brio AI' },
        ],
    },
    { id: 'support', title: 'Support' },
    { id: 'billing', title: 'Billing' },
]

/** A node with where it sits: its depth (0 for a chapter) and its ancestors, chapter first. */
export interface PlacedTourNode extends TourNode {
    depth: number
    ancestors: TourNode[]
}

function place(nodes: TourNode[], ancestors: TourNode[] = []): PlacedTourNode[] {
    return nodes.flatMap((node) => [{ ...node, depth: ancestors.length, ancestors }, ...place(node.children ?? [], [...ancestors, node])])
}

/** Every node, each before its children: the order the whole tour runs them. */
export const TOUR_NODES: PlacedTourNode[] = place(TOUR_OUTLINE)

/** The query parameter that starts a chapter or section on any /tour route: /tour?guide=files. */
export const GUIDE_PARAM = 'guide'

export function isTourNodeId(value: unknown): value is TourNodeId {
    return typeof value === 'string' && (TOUR_NODE_IDS as readonly string[]).includes(value)
}

/** The node a ?guide= value names, or null for a missing or unknown one. */
export function parseGuideParam(value: string | null | undefined): TourNodeId | null {
    return isTourNodeId(value) ? value : null
}

/** Where a chapter or section starts: the tour takes it from there to its first page. */
export function tourGuideHref(id: TourNodeId): string {
    return `/tour?${GUIDE_PARAM}=${id}`
}

export function tourNode(id: TourNodeId): PlacedTourNode {
    return TOUR_NODES.find((n) => n.id === id)!
}

/** The node and everything under it, in order. */
export function tourSubtree(id: TourNodeId): PlacedTourNode[] {
    const start = TOUR_NODES.findIndex((n) => n.id === id)
    const depth = TOUR_NODES[start].depth
    const end = TOUR_NODES.findIndex((n, i) => i > start && n.depth <= depth)
    return TOUR_NODES.slice(start, end === -1 ? undefined : end)
}

/** What comes after a node and everything under it: its next sibling, or the next one up. Null after the last. */
export function nextTourNode(id: TourNodeId): PlacedTourNode | null {
    const subtree = tourSubtree(id)
    const after = TOUR_NODES.indexOf(subtree[subtree.length - 1]) + 1
    return TOUR_NODES[after] ?? null
}

/**
 * How a run plays: Autopilot (`autoplay`, the default) moves on by itself, each step on its own
 * timer; Guided (`step`) waits for Next; Explore shows no step cards, and the outline pane takes the
 * visitor to each part's page instead. The ids are what deep links and saved choices carry, so they
 * keep their first names when the labels (TOUR_MODE_LABELS) change.
 */
export const TOUR_MODES = ['autoplay', 'step', 'explore'] as const

export type TourMode = (typeof TOUR_MODES)[number]

export const DEFAULT_TOUR_MODE: TourMode = 'autoplay'

/** The query parameter that picks the mode for a deep link: /tour?guide=files&mode=step. */
export const MODE_PARAM = 'mode'

export function parseModeParam(value: string | null | undefined): TourMode | null {
    return typeof value === 'string' && (TOUR_MODES as readonly string[]).includes(value) ? (value as TourMode) : null
}

/** Autoplay's time on a step: enough to read it at an easy pace (about 300 words a minute) and a
 * beat to look at what it points at, within 5 to 15 seconds. A step can set its own. */
export function autoplayDuration(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length
    return Math.min(15000, Math.max(5000, 2500 + words * 200))
}
