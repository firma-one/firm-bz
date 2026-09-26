import { getSubdomainExampleHost } from './platform-domain'

const customSubdomainTooltip = `Use custom subdomain (e.g., ${getSubdomainExampleHost()}) for client portal access`

/** Per-plan value for comparison table: string (e.g. "10", "Unlimited"), true = check, false = dash */
export type PlanValue = string | boolean

export type PricingComparisonTooltipLayout = 'hierarchy-sample' | 'engagement-personas'

export interface PricingComparisonRow {
    feature: string
    tooltip?: string
    /** Rich layout for the comparison-table tooltip (see pricing page). */
    tooltipLayout?: PricingComparisonTooltipLayout
    /** Optional icon key(s) rendered inline after the feature label. */
    featureIcon?: 'google-drive' | 'onedrive' | 'sharepoint' | 'ai' | Array<'google-drive' | 'onedrive' | 'sharepoint' | 'ai'>
    /** planId -> value */
    values: Record<string, PlanValue>
}

export interface PricingComparisonCategory {
    name: string
    rows: PricingComparisonRow[]
}

export interface PricingPlan {
    id: string
    title: string
    description: string
    price: string
    /** When set, shown as /month when "Annually" is selected (overrides price * 0.84). */
    priceBilledAnnually?: number
    prevPrice?: string
    duration: string
    /** Firms covered (marketing cards + comparison). Defaults to 1 when omitted. */
    firmsIncluded?: number
    /** Cap for concurrent active engagements; pricing UI shows with firms line. */
    projectsIncluded?: number
    /**
     * PUBLISHED entitlements — the four limits customers see. Mirror the matching
     * `entitled*` keys in the tier's Polar product metadata.
     *
     * Declared per plan rather than in lookup tables keyed by id, so adding a tier means adding
     * one object here and nothing else. `null` means unlimited; omitted means not yet configured,
     * and the line is left off rather than guessed.
     *
     * The other entitlements (firms, engagements, documents, client contacts) stay in Polar,
     * parsed and enforced, but are deliberately not published — they are anti-abuse floors that
     * only ever bind on the free tier.
     */
    entitlements?: {
        clients: number | null
        aiCredits: number | null
        auditDays: number | null
        commentHistoryDays: number | null
    }
    cta: string | null
    ctaVariant?: 'black' | 'gray'
    href: string | null
    launchingLater?: boolean
    popular?: boolean
    theme: 'blue' | 'purple'
}

function firmLineForCard(firms: number): string {
    return firms === 1 ? '1 firm' : `${firms} firms`
}

/**
 * Lines under the plan title on the pricing page.
 *
 * Derived from `plan.entitlements`, so a new tier needs no change here. Only the four published
 * limits appear; firms, engagements, documents and contacts remain enforced but unadvertised,
 * because publishing floors that only bind on free invites comparing plans on the wrong numbers.
 */
export function planCardUsageSummary(plan: PricingPlan): string[] {
    const e = plan.entitlements
    if (!e) return []

    const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
    const lines: string[] = [
        e.clients === null ? 'Unlimited clients' : plural(e.clients, 'client'),
    ]

    if (e.aiCredits !== undefined) {
        lines.push(e.aiCredits === null ? 'Unlimited AI credits' : `${e.aiCredits} AI credits / month`)
    }

    // Audit and comment retention move together per tier, so one line rather than two.
    if (e.auditDays !== undefined && e.commentHistoryDays !== undefined) {
        const audit = e.auditDays === null ? 'Unlimited' : e.auditDays === 0 ? 'No' : `${e.auditDays}-day`
        const comments = e.commentHistoryDays === null ? 'unlimited' : `${e.commentHistoryDays}-day`
        lines.push(`${audit} audit · ${comments} comments`)
    }

    return lines
}

/**
 * Four engagement personas — same copy as `persona.description` in `frontend/prisma/seed.ts`.
 * Used for rich pricing tooltips (`role` highlighted) and plain `ENGAGEMENT_PERSONAS_PRICING_TOOLTIP` elsewhere.
 */
export const ENGAGEMENT_PERSONA_TOOLTIP_ROWS = [
    {
        role: 'Engagement Lead',
        body: 'Responsible for managing a specific engagement. Can manage engagement members, update engagement content, and oversee collaboration within the engagement workspace. Usually a project manager, engagement lead, or team lead.',
    },
    {
        role: 'Contributor (Internal)',
        body: 'Internal team member contributing to engagement work. Can create and edit engagement content, collaborate with team members, and participate in discussions within assigned engagements. Typically full-time employees or core engagement team members.',
    },
    {
        role: 'Contributor (External)',
        body: 'External collaborator invited to contribute to an engagement. Can create or edit content within the engagement but has limited access outside the engagement scope. Typically contractors, consultants, vendors, or agency partners.',
    },
    {
        role: 'Reviewer',
        body: 'External stakeholder with read-only access to engagement content. Cannot modify content but can review materials and stay informed. Typically clients, sponsors, or external stakeholders.',
    },
] as const

export const ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER =
    'Access and tabs (e.g. Files for handoffs) follow each persona automatically'

/** Plain multi-paragraph string (plan cards, billing, any `whitespace-pre-line` tooltip). */
export const ENGAGEMENT_PERSONAS_PRICING_TOOLTIP = [
    ...ENGAGEMENT_PERSONA_TOOLTIP_ROWS.map((r) => `${r.role} — ${r.body}`),
    ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER,
].join('\n\n')

export const PRICING_PLANS: PricingPlan[] = [
    {
        id: 'Standard',
        title: 'Standard',
        firmsIncluded: 1,
        projectsIncluded: 10,
        entitlements: { clients: 3, aiCredits: 500, auditDays: 30, commentHistoryDays: 60 },
        description:
            'Take off the training wheels. Full client portal on your existing Drive—engagements, personas, and feedback in one place.',
        price: '$49',
        priceBilledAnnually: 39,
        duration: '/month',
        cta: 'Get Standard',
        ctaVariant: 'black',
        href: '/contact',
        popular: true,
        theme: 'purple'
    },
    {
        id: 'Pro',
        title: 'Pro',
        firmsIncluded: 1,
        entitlements: { clients: 10, aiCredits: 1000, auditDays: 90, commentHistoryDays: 90 },
        projectsIncluded: 25,
        description: 'For growing firms needing advanced review and templates.',
        price: '$99',
        priceBilledAnnually: 79,
        duration: '/month',
        cta: 'Coming Soon',
        ctaVariant: 'gray',
        href: '/contact',
        launchingLater: true,
        theme: 'blue'
    },
    {
        id: 'Business',
        title: 'Business',
        firmsIncluded: 3,
        entitlements: { clients: 20, aiCredits: 3000, auditDays: 365, commentHistoryDays: 365 },
        projectsIncluded: 50,
        description: 'For established firms and mid-size agencies.',
        price: '$149',
        priceBilledAnnually: 119,
        duration: '/month',
        cta: 'Coming Soon',
        ctaVariant: 'gray',
        href: '/contact',
        launchingLater: true,
        theme: 'purple'
    },
    {
        id: 'Enterprise',
        title: 'Enterprise',
        entitlements: { clients: null, aiCredits: 10000, auditDays: null, commentHistoryDays: null },
        projectsIncluded: 100,
        description: 'For large organizations requiring advanced security and compliance.',
        price: 'Contact Us',
        duration: '',
        cta: 'Coming Soon',
        ctaVariant: 'gray',
        href: '/contact',
        launchingLater: true,
        theme: 'purple'
    }
]

/** Marketing-only column id for the free sandbox tier (not a billable `PricingPlan`). */
export const PRICING_SANDBOX_COLUMN_ID = 'Sandbox' as const

/** Feature comparison matrix for Slab-style pricing table. Plan IDs must match PRICING_PLANS; `Sandbox` is the free exploration tier. */
export const PRICING_COMPARISON: PricingComparisonCategory[] = [
    {
        name: "USAGE",
        rows: [
            {
                feature: "Firm → Client → Engagement → Deliverable → Document hierarchy",
                tooltip: "Clean structure: Firm → Client → Engagement → Deliverable → Document. Maps to folders in your Drive. Clients see a clear place for their engagement and document handoffs.",
                tooltipLayout: "hierarchy-sample",
                // Clients only. The other levels stay enforced but unpublished — see
                // planCardUsageSummary for why.
                values: {
                    Sandbox: "1 client",
                    Standard: "3 clients",
                    Pro: "10 clients",
                    Business: "20 clients",
                    Enterprise: "Unlimited",
                },
            },
            {
                feature: "Credits included",
                featureIcon: 'ai',
                tooltip: "One credit is one AI action — an engagement summary, a firm brief, or a chat answer. Natural language document search (describe the document instead of assembling filters) costs half a credit. Every plan includes all four; the allowance is what differs. Credits reset each billing period and do not roll over.",
                values: {
                    Sandbox: "25 / month",
                    Standard: "500 / month",
                    Pro: "1,000 / month",
                    Business: "3,000 / month",
                    Enterprise: "10,000 / month",
                },
            },
            {
                feature: "Users & Access Control",
                tooltip: ENGAGEMENT_PERSONAS_PRICING_TOOLTIP,
                tooltipLayout: "engagement-personas",
                values: { Sandbox: "2 users", Standard: "Unlimited", Pro: "Unlimited", Business: "Unlimited", Enterprise: "Unlimited" },
            },
        ],
    },
    {
        name: "ESSENTIALS",
        rows: [
            {
                feature: "Bring your own Google Drive",
                tooltip: "Your files stay in your Google Drive. We don't store or copy them. Non-custodial: no migration, no new storage; we add the portal on top.",
                featureIcon: 'google-drive',
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Bring your own OneDrive / SharePoint",
                tooltip: "Connect your Microsoft OneDrive or SharePoint as the storage backend for your firm portal. Available now in Beta.",
                featureIcon: ['onedrive', 'sharepoint'],
                values: { Sandbox: "Beta", Standard: "Beta", Pro: "Beta", Business: "Beta", Enterprise: "Beta" },
            },
            {
                feature: "Custom branded client portal",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
                tooltip: "Professional client portal with your branding instead of generic Drive links or email attachments. Works with your existing Google Drive or Microsoft OneDrive/SharePoint (Beta).",
            },
            {
                feature: "Private documents (Never Share tags)",
                tooltip: "Mark files as internal-only — visible to you alone, and excluded from every client-facing view by design. Full control over what your clients can ever see.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Scheduled follow-ups & reminders",
                tooltip: "Rule-based scheduled emails, not AI — consolidated client follow-ups on pending documents. Custom follow-up templates and scheduling.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Full Audit Trail",
                tooltip: "Append-only audit trail capturing user & system activity at Firm, Client, Engagement, and Document levels — including lifecycle events, membership changes, sharing actions, and per-document access tracking. Each column shows how long events are retained.",
                values: {
                    Sandbox: false,
                    Standard: "30 days",
                    Pro: "90 days",
                    Business: "365 days",
                    Enterprise: "Unlimited",
                },
            },
            {
                feature: "Document version history",
                tooltip:
                    "Append-only engagement audit trail: lifecycle, membership, sharing, and key document events—in the Audit tab. Each column shows how long those audit events are retained.",
                values: { Sandbox: false, Standard: "30 days", Pro: "90 days", Business: "365 days", Enterprise: "Unlimited" },
            },
            {
                feature: "In-app messaging (Deliverable comment thread) history.",
                tooltip: "One thread per deliverable for comments and feedback—shared with everyone on the engagement. Replace scattered email and chat with a single place where the conversation stays with the work. Each column shows how long comment history is retained.",
                values: { Sandbox: "15 days", Standard: "60 days", Pro: "90 days", Business: "365 days", Enterprise: "Unlimited" },
            },
            {
                feature: "One-click engagement closure",
                tooltip: "Revoke client and external access when an engagement ends. Lock folders to view-only; remove guest members automatically.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
        ],
    },
    {
        name: "DELIVERY & OVERSIGHT",
        rows: [
            {
                feature: "Deliverable Board",
                tooltip: "Track every deliverable through To Do → In Progress → In Review → Approved, with guest approvals and locking on approval — no more email sign-offs or scattered threads to figure out where work stands.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Firm / Engagement summaries & AI assistant",
                featureIcon: 'ai',
                tooltip: "Brio drafts the engagement status summary — progress, risks, what needs attention — from your delivery data, and answers questions about any engagement. You review, edit and approve before a client sees anything. Included on every plan; usage draws on your AI credits.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Tracking Calendar",
                tooltip: "Every deadline across every client, deliverable & document — one color-coded calendar, click to jump straight to the work.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Engagement Health Dashboard",
                tooltip: "See every engagement's pulse at a glance — status rollups, client health scoring, and an action centre surfacing approvals & due dates in one view. Catch a stalling engagement before your client has to ask.",
                values: {
                    Sandbox: false,
                    Standard: "PDF export",
                    Pro: "+ Email notifications",
                    Business: "+ Priority rollups",
                    Enterprise: "Incl. all features in Business",
                },
            },
        ],
    },
    {
        name: "ADVANCED",
        rows: [
            {
                feature: "Engagement & Document templates",
                tooltip: "Pre-configured engagement & document templates with folder structures. Duplicate engagements and choose templates for common use cases.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Document versioning",
                tooltip: "Lock documents on approval and create version snapshots. Download historical versions.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Custom subdomain",
                tooltip: `${customSubdomainTooltip}.`,
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Custom DNS domain",
                tooltip: "Use your own domain (e.g. portal.yourcompany.com) with full DNS control and SSL certificate management.",
                values: { Sandbox: false, Standard: false, Pro: false, Business: false, Enterprise: true },
            },
            {
                feature: "SSO / SAML",
                tooltip: "Single Sign-On for enterprise authentication. Integrate with your identity provider.",
                values: { Sandbox: false, Standard: false, Pro: false, Business: false, Enterprise: true },
            },
        ],
    },
    {
        name: "SUPPORT",
        rows: [
            {
                feature: "Dedicated Support Portal",
                tooltip: "Submit bug reports, feature requests, and general enquiries directly from your workspace. Track status, upload attachments, and exchange comments with our team — all in one place.",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "SLA-based Priority support",
                tooltip: "Enterprise customers get guaranteed response times under a dedicated SLA, a named support contact, and priority routing through the in-app support portal.",
                values: { Sandbox: false, Standard: false, Pro: false, Business: false, Enterprise: true },
            },
        ],
    },
]

/** Plan IDs used in PRICING_PLANS / PRICING_COMPARISON (for profile billing, etc.). */
export type PricingPlanColumnId = (typeof PRICING_PLANS)[number]['id']

/**
 * Bullets derived from the same matrix as /pricing — one line per row where the plan has a check or a text value.
 * Wording matches the feature column (and "Feature: value" for numeric/text cells).
 */
export function getPricingComparisonBulletsForPlan(planId: PricingPlanColumnId): string[] {
    const bullets: string[] = []
    for (const category of PRICING_COMPARISON) {
        for (const row of category.rows) {
            const v = row.values[planId]
            if (v === true) {
                bullets.push(row.feature)
            } else if (typeof v === 'string' && v.trim()) {
                bullets.push(`${row.feature}: ${v}`)
            }
        }
    }
    return bullets
}

/**
 * Highlights for the Free plan card (billing page + plan picker).
 * Derived from the same PRICING_COMPARISON matrix as the /pricing page Sandbox column,
 * so they stay in sync automatically.
 */
export function getSandboxPlanHighlights(): string[] {
    const bullets: string[] = []
    for (const category of PRICING_COMPARISON) {
        for (const row of category.rows) {
            const v = row.values[PRICING_SANDBOX_COLUMN_ID]
            if (v === true) {
                bullets.push(row.feature)
            } else if (typeof v === 'string' && v.trim()) {
                bullets.push(`${row.feature}: ${v}`)
            }
        }
    }
    return bullets
}
