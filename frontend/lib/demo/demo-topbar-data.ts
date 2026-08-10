export interface DemoReminder {
    id: string
    entityName: string
    action: string
    note?: string
    delta: number
    entityType: 'client' | 'engagement'
}

export const DEMO_REMINDERS: DemoReminder[] = [
    { id: 'rem-1', entityName: 'CMO Advisory & Leadership', action: 'Engagement due', note: 'CMO Advisory & Leadership', delta: 0, entityType: 'engagement' },
    { id: 'rem-2', entityName: 'Product Launch Campaign', action: 'Review launch budget approval', note: 'Deliverable due soon', delta: 2, entityType: 'engagement' },
    { id: 'rem-3', entityName: 'Financial Advisory Scoping', action: 'Deliverable due', note: 'Fee Proposal.xlsx', delta: -1, entityType: 'engagement' },
]

export interface DemoRecentItem {
    type: 'client' | 'engagement'
    name: string
    href: string
    visitedMinutesAgo: number
}

export const DEMO_RECENTS: DemoRecentItem[] = [
    { type: 'engagement', name: 'CMO Advisory & Leadership', href: '/demo/acme-robotics/cmo-advisory-leadership', visitedMinutesAgo: 4 },
    { type: 'client', name: 'Horizon FinTech', href: '/demo/horizon-fintech', visitedMinutesAgo: 22 },
    { type: 'engagement', name: 'Growth Marketing Retainer', href: '/demo/horizon-fintech/growth-marketing-retainer', visitedMinutesAgo: 55 },
]

export interface DemoBookmark {
    id: string
    label: string
    sublabel: string
    href: string
}

export const DEMO_BOOKMARKS: DemoBookmark[] = [
    { id: 'bm-1', label: 'Revenue Forecast Model.xlsx', sublabel: 'Acme Robotics · CMO Advisory & Leadership', href: '/demo/acme-robotics/cmo-advisory-leadership' },
    { id: 'bm-2', label: 'GTM Strategy Deck.pptx', sublabel: 'Acme Robotics · Marketing Strategy Engagement', href: '/demo/acme-robotics/marketing-strategy-engagement' },
]
