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

/** Lines under the plan title on the pricing page (firm scope + engagement cap). */
export function planCardUsageSummary(plan: PricingPlan): string[] {
    if (plan.id === 'Enterprise') {
        return ['Custom firms · Unlimited clients', 'Engagement limits negotiated']
    }
    if (plan.id === 'Business') {
        return ['3 firms · 20 clients', '50 active engagements']
    }
    if (plan.id === 'Pro') {
        return ['1 firm · 10 clients', '25 active engagements']
    }
    if (plan.id === 'Standard') {
        return ['1 firm · 3 clients', '10 active engagements']
    }
    return []
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
                tooltip: "Clean structure: Firm → Client → Engagement → Deliverable → Document. Maps to folders in your Drive. Clients see a clear place for their engagement and document handoffs. Each column shows the included limit at every level.",
                tooltipLayout: "hierarchy-sample",
                values: {
                    Sandbox: "1 firm\n1 client\n1 engagement\n1 deliverable\n10 documents",
                    Standard: "1 firm\n3 clients\n10 engagements\nUnlimited deliverables\nUnlimited documents",
                    Pro: "1 firm\n10 clients\n25 engagements\nUnlimited deliverables\nUnlimited documents",
                    Business: "3 firms\n20 clients\n50 engagements\nUnlimited deliverables\nUnlimited documents",
                    Enterprise: "No limits",
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
                feature: "Automated follow-ups & reminders",
                tooltip: "Automated consolidated client follow-up emails on pending documents. Custom follow-up templates and scheduling.",
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
                feature: "In-app messaging (Deliverable comment thread)",
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
    {
        name: "DELIVERY & OVERSIGHT",
        rows: [
            {
                feature: "Deliverable Board",
                tooltip: "Track every deliverable through To Do → In Progress → In Review → Approved, with guest approvals and locking on approval — no more email sign-offs or scattered threads to figure out where work stands.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "AI-powered search",
                tooltip: "Natural language search across your whole firm — e.g. \"find all competitor analysis docs\". Search by intent, not just exact file names.",
                featureIcon: 'ai',
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
                    Business: "+ AI Assistant",
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
