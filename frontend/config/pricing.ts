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
    /** Firms covered per subscription (marketing cards + comparison). Defaults to 1 when omitted. */
    firmsIncluded?: number
    /** Cap for concurrent active engagements per subscription; pricing UI shows with firms line. */
    projectsIncluded?: number
    cta: string | null
    ctaVariant?: 'black' | 'gray'
    href: string | null
    launchingLater?: boolean
    popular?: boolean
    theme: 'blue' | 'purple'
}

function firmLineForCard(firms: number): string {
    return firms === 1 ? '1 firm per subscription' : `${firms} firms per subscription`
}

/** Lines under the plan title on the pricing page (firm scope + engagement cap). */
export function planCardUsageSummary(plan: PricingPlan): string[] {
    if (plan.id === 'Enterprise') {
        return ['Custom firm package', 'Engagement limits negotiated']
    }
    if (plan.projectsIncluded != null) {
        const firms = plan.firmsIncluded ?? 1
        return [
            firmLineForCard(firms),
            `${plan.projectsIncluded} active engagements per subscription`,
        ]
    }
    return []
}

/** Free Sandbox card — same usage framing as the comparison table Sandbox column. */
export function sandboxPlanUsageSummary(): string[] {
    return ['1 firm per subscription', '10 active engagements per subscription']
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
        role: 'Viewer (External)',
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
            'Full client portal on your existing Google Drive—engagements, personas, and feedback in one place.',
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
        firmsIncluded: 5,
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
        firmsIncluded: 10,
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
                feature: "Firms per subscription",
                tooltip: "Each Standard–Business subscription covers one firm workspace (one billable Pockett firm). Another legal entity or separate firm usually means another subscription. Enterprise: multiple firms and consolidated billing—contact sales.",
                values: {
                    Sandbox: "1",
                    Standard: "1",
                    Pro: "5",
                    Business: "10",
                    Enterprise: "Custom",
                },
            },
            {
                feature: "Active engagements per subscription",
                tooltip: "Maximum concurrent open engagements included with that subscription (per covered firm workspace). Closed or deleted engagements do not count. Enterprise includes a negotiated cap (often up to 100).",
                values: {
                    Sandbox: "10",
                    Standard: "10",
                    Pro: "25",
                    Business: "50",
                    Enterprise: "100",
                },
            },
            {
                feature: "Unlimited internal users",
                tooltip: "No per-seat fee for Firm Administrator, Firm Member, Client Administrator, Engagement Lead, and Contributor (Internal).",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Unlimited external users",
                tooltip: "No per-seat fee for Contributor (External) or Viewer (External).",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Document Version history",
                tooltip:
                    "Each plan column shows how long prior document revisions stay available to view or restore. Older revisions roll off after that window except on Enterprise (Unlimited).",
                values: {
                    Sandbox: false,
                    Standard: "30 days",
                    Pro: "90 days",
                    Business: "365 days",
                    Enterprise: "Unlimited",
                },
            },
        ],
    },
    {
        name: "ESSENTIALS",
        rows: [
            {
                feature: "Bring your own Google Drive",
                tooltip: "Your files stay in your Google Drive. We don't store or copy them. Non-custodial: no migration, no new storage; we add the portal on top.",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Custom branded client portal",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
                tooltip: "Professional client portal with your branding instead of generic Drive links or email attachments. Works with your existing Google Drive.",
            },
            {
                feature: "Firm → Client → Engagement hierarchy",
                tooltip: "Clean structure: Firm → Client → Engagement. Maps to folders in your Drive. Clients see a clear place for their engagement and document handoffs.",
                tooltipLayout: "hierarchy-sample",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Persona-based access (4 engagement roles)",
                tooltip: ENGAGEMENT_PERSONAS_PRICING_TOOLTIP,
                tooltipLayout: "engagement-personas",
                values: { Sandbox: true, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Engagement activity audit",
                tooltip:
                    "Append-only engagement audit trail: lifecycle, membership, sharing, and key document events—in the Audit tab. Each column shows how long those audit events are retained.",
                values: { Sandbox: false, Standard: "30 days", Pro: "90 days", Business: "365 days", Enterprise: "Unlimited" },
            },
            {
                feature: "Document comment thread (feedback & approvals)",
                tooltip: "One thread per file for comments, feedback, and approvals—shared with everyone on the engagement. Replace scattered email and chat with a single place where the conversation stays with the work. Each column shows how long comment history is retained.",
                values: { Sandbox: false, Standard: "30 days", Pro: "90 days", Business: "365 days", Enterprise: "Unlimited" },
            },
            {
                feature: "One-click engagement closure",
                tooltip: "Revoke client and external access when an engagement ends. Lock folders to view-only; remove guest members automatically.",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
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
        name: "ADVANCED",
        rows: [
            {
                feature: "Document access tracking",
                tooltip:
                    "Per-document visibility into who accessed files and when—beyond the engagement-level activity audit. Included from Pro; not on Standard. Each plan column shows how long access events are retained.",
                values: { Sandbox: false, Standard: false, Pro: "90 days", Business: "365 days", Enterprise: "Unlimited" },
            },
            {
                feature: "Custom subdomain",
                tooltip: `${customSubdomainTooltip}.`,
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Engagement & Document templates",
                tooltip: "Pre-configured engagement & document templates with folder structures. Duplicate engagements and choose templates for common use cases.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Advanced review & approval workflow",
                tooltip: "Approve / Finalize / Publish workflow with guest approvals. Lock documents on approval and create version snapshots.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Document versioning",
                tooltip: "Lock documents on approval and create version snapshots. Download historical versions.",
                values: { Sandbox: false, Standard: false, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "Self-destruct timers & Never Share tags",
                tooltip: "Protect sensitive files: set expiry on shared links; tag internal files so they never reach clients.",
                values: { Sandbox: false, Standard: false, Pro: false, Business: true, Enterprise: true },
            },
            {
                feature: "Automated follow-ups & reminders",
                tooltip: "Automated consolidated client follow-up emails on pending documents. Custom follow-up templates and scheduling.",
                values: { Sandbox: false, Standard: false, Pro: false, Business: true, Enterprise: true },
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

/** First line of Profile → What's included for sandbox — aligns with /pricing hero + FAQ (trial of Standard). */
export const PRICING_SANDBOX_PROFILE_LEAD =
    'Free sandbox — no credit card required. Unlock full features with a 30-day trial of Standard when you\'re ready.'

/** Sandbox workspace: same facts as /pricing (Standard column) plus hero line. */
export function getProfileBillingSandboxInclusions(): string[] {
    return [PRICING_SANDBOX_PROFILE_LEAD, ...getPricingComparisonBulletsForPlan('Standard')]
}
