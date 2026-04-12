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

export interface PricingFeature {
    name: string
    tooltip: string
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
    featuresHeader?: string // e.g. "Everything in Free, plus:"
    features: PricingFeature[]
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
        featuresHeader: 'Standard features:',
        features: [
            { 
                name: "Bring your own Google Drive · Non-custodial", 
                tooltip: "Your files stay in your Drive. We don't store or copy them. Keep using your current document storage—no migration." 
            },
            { 
                name: "Custom branded professional client portal (replaces documents delivered as email attachments or Drive links)", 
                tooltip: "Branded portal instead of generic 'Untitled Folder' links. Works with your existing Google Drive." 
            },            { 
                name: "Firm → Client → Engagement hierarchy", 
                tooltip: "Clean structure: your firm, each client, and their engagements. Maps to folders in your Drive—no migration." 
            },
            { 
                name: "Unlimited clients. Unlimited firm & engagement members. Unlimited external contributors & viewers.", 
                tooltip: "No per-user fees. Add clients, internal contributors, and external collaborators and viewers as needed." 
            },
            { 
                name: "Google Drive–style document operations in Pockett", 
                tooltip: "Familiar open, preview, download, and share actions. No new storage system to learn." 
            },
            { 
                name: "Persona-based access (4 engagement roles)", 
                tooltip: ENGAGEMENT_PERSONAS_PRICING_TOOLTIP,
            },
            { 
                name: "Simple permission management. No granular file-by-file permissions.", 
                tooltip: "No resharing links. Clients always know where to find documents." 
            },
            { 
                name: "Engagement activity audit", 
                tooltip: "Append-only audit trail for the engagement: lifecycle events, sharing actions, and key document operations—visible in the Audit tab. On Standard, audit history is kept for 30 days (longer on higher tiers—see Technical comparison)." 
            },
            { 
                name: "Document comment thread (feedback & approvals)", 
                tooltip: "Bring comments, feedback, and sign-offs together in one thread beside each file. Everyone on the engagement sees the same story—so nothing important lives only in an inbox or a chat app." 
            },            { 
                name: "One-click engagement closure", 
                tooltip: "Revoke client and external access when an engagement ends. Lock folders to view-only." 
            }
        ],
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
        featuresHeader: 'Everything in Standard, plus templates & advanced review:',
        features: [
            { name: "Custom Subdomain", tooltip: customSubdomainTooltip },
            { name: "Watermarked Document Delivery", tooltip: "Add firm branding watermarks to exported PDFs" },
            { name: "Document Templates", tooltip: "Pre-configured document templates for common use cases" },
            { name: "Engagement templates", tooltip: "Choose from template engagements with pre-defined folder structures" },
            { name: "Duplicate engagement", tooltip: "Clone existing engagements with all configurations" },
            { name: "Engagement activity dashboard", tooltip: "See engagement activity, deadlines, and pending actions in one view" },
            { name: "Document access tracking", tooltip: "See who viewed what and when, per document—for compliance and handoffs (beyond the engagement activity audit). On Pro, access history is kept for 90 days (longer on Business and Enterprise—see Technical comparison)." },
            { name: "Advanced Review & Approval Workflow", tooltip: "Approve / Finalize / Publish workflow with guest approvals (Contributor External, Viewer External)" },
            { name: "Document Versioning", tooltip: "Lock documents on approval, create version snapshots" },
            { name: "Download Historical Versions", tooltip: "Access and download previous document versions" },
            { name: "Review status & activity tracking", tooltip: "Comprehensive tracking of review status, comments, approvals, version history" },
            { name: "Activity export (per engagement)", tooltip: "Export who viewed what and when for an engagement—for compliance or handoffs" }
        ],
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
        featuresHeader: 'Everything in Pro, plus automation:',
        features: [
            { name: "Engagement due date reminders", tooltip: "Automated reminders for engagement deadlines" },
            { 
                name: "Self-destruct timers & Never Share tags", 
                tooltip: "Protect sensitive files. Set expiry on shared links. Tag internal files so they never reach clients." 
            },
            { name: "Document Relationships", tooltip: "Link related/dependent documents with relationship tracking" },
            { name: "Relationship Tree View", tooltip: "Visualize document dependencies and connections" },
            { name: "Automated Follow-ups", tooltip: "Automated consolidated client follow-up emails on pending documents" },
            { name: "Custom Follow-up Messages", tooltip: "Customize follow-up templates and scheduling" },
            { name: "Calendar Integration", tooltip: "Calendly integration for document discussion scheduling" },
            { name: "Bi-directional Calendar Requests", tooltip: "Firm ↔ Client calendar request flows" },
            { name: "Pre-configured Scheduling", tooltip: "Pre-configured scheduling, reminders, and email notifications" },
            { name: "Weekly engagement status reports", tooltip: "Weekly schedule status to firm administrators and engagement leads" },
            { name: "Folder Badge Indicators", tooltip: "Visual badges for pending actions from external contributors and viewers" },
            { name: "Auto-permit Documents", tooltip: "Automatically deliver documents on onboarding to external contributors and viewers" }
        ],
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
        featuresHeader: 'Everything in Business, plus enterprise features:',
        features: [
            { name: "Custom DNS Domain", tooltip: "Use your own domain (e.g., portal.yourcompany.com) with full DNS control and SSL certificate management" },
            { name: "Critical engagement activity auditing", tooltip: "Comprehensive audit logs for all engagement activities" },
            { name: "Recover from Recycle Bin", tooltip: "Restore deleted files with alerts on upcoming purges" },
            { name: "Recycle Bin Purge Alerts", tooltip: "Notifications before permanent deletion" },
            { name: "IP Theft Protection", tooltip: "Advanced security features to prevent unauthorized access" },
            { name: "Disallow Download/Print", tooltip: "Restrict document download and printing for Viewer (External)" },
            { name: "Custom Trigger Creation", tooltip: "Create custom automation triggers for scheduling" },
            { name: "Scheduled engagement kickoff", tooltip: "Create engagements with delayed kickoff; schedule future firm and engagement memberships" },
            { name: "Advanced Access Controls", tooltip: "Enhanced persona management and custom personas beyond the four default engagement roles" },
            { name: "SSO/SAML Integration", tooltip: "Single Sign-On for enterprise authentication" },
            { name: "Advanced Compliance", tooltip: "Enhanced compliance features for regulated industries" },
            { name: "Dedicated Support", tooltip: "Priority support with SLA guarantees" },
            { name: "Custom Onboarding", tooltip: "Tailored onboarding and training" }
        ],
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
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
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
                tooltip: "One thread per file for comments, feedback, and approvals—shared with everyone on the engagement. Replace scattered email and chat with a single place where the conversation stays with the work.",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
            },
            {
                feature: "One-click engagement closure",
                tooltip: "Revoke client and external access when an engagement ends. Lock folders to view-only; remove guest members automatically.",
                values: { Sandbox: false, Standard: true, Pro: true, Business: true, Enterprise: true },
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
