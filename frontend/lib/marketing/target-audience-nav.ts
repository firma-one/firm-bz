/**
 * Marketing anchors, mega-menu copy, scroll offsets, and shared layout shell (max-width + gutters).
 * Filename is historical; non-nav constants live here to avoid tiny one-export modules.
 */
import { cn } from "@/lib/utils"
/** Stable fragment for the Target Audience block on the marketing home page (`/`). */
export const TARGET_AUDIENCE_SECTION_ID = "target-audience"

/** Deep link to the Target Audience section on the main marketing home (`/`). */
export const TARGET_AUDIENCE_HREF = `/#${TARGET_AUDIENCE_SECTION_ID}` as const

/** Firma Transformation / “Infrastructure evolution” block on the marketing home (`/`). */
export const INFRASTRUCTURE_EVOLUTION_SECTION_ID = "infrastructure-evolution"

/** Deep link to the transformation intro (problem / BEFORE narrative). */
export const WHY_THIS_EXISTS_HREF = `/#${INFRASTRUCTURE_EVOLUTION_SECTION_ID}` as const

/** Scroll target for the use-case grid (below “Who is Firma for?” on `/`). */
export const USE_CASES_SECTION_ID = "use-cases"

export const USE_CASES_HREF = `/#${USE_CASES_SECTION_ID}` as const

/** Canonical marketing URLs (blog + trust live under `/resources/…`). */
export const BLOG_BASE_PATH = "/resources/blog" as const

export const TRUST_CENTER_PATH = "/resources/trust-center" as const

/** Calendly scheduling — header/footer Contact mega-menu and marketing CTAs. */
export const CALENDLY_DEMO_URL = "https://calendly.com/firmaone/30min" as const

/**
 * Max width + horizontal padding aligned with the marketing header rail (`Header`) and main landing sections.
 * Kept intentionally tight from `md` up so the default `legacy` landing hero (grid + `LegacyHeroScreenMock`) and
 * interior marketing pages visibly use more of the rail — small steps (e.g. 6→4) are easy to miss in the browser.
 */
export const MARKETING_PAGE_SHELL =
  "max-w-[min(100%,92rem)] mx-auto px-3 sm:px-3 md:px-4 lg:px-3 xl:px-5 2xl:px-6"

/**
 * Hover depth on bordered marketing tiles — matches `RealityStatCard` in
 * `components/landing/reality-check-section.tsx` (`shadow-sm` base + this on hover).
 */
export const MARKETING_SURFACE_DEPTH_HOVER =
  "relative transition-[box-shadow] duration-200 ease-out hover:z-[1] hover:shadow-[0_14px_32px_-10px_rgba(27,27,29,0.22)]"

/** Same intent as `MARKETING_SURFACE_DEPTH_HOVER` for dark (`#141c2a`) surfaces. */
export const MARKETING_SURFACE_DEPTH_HOVER_DARK =
  "relative transition-[box-shadow] duration-200 ease-out hover:z-[1] hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]"

/** Lime hero pill above the H1 — kinetic hero + default landing grid (`LandingPage`). */
export const KINETIC_LANDING_HERO_BADGE = "NON-CUSTODIAL · CLIENT PORTAL" as const

/**
 * Platform mega-menu: problem → audience → use cases → Trust Center.
 */
export const platformMegaMenuItems = [
  {
    id: "why-this-exists",
    title: "Why this exists",
    description:
      "Inefficient, manual document sharing results in productivity loss, client dissatisfaction & security gaps.",
    href: WHY_THIS_EXISTS_HREF,
  },
  {
    id: "who-its-for",
    title: "Who it's for",
    description:
      "Fractional executives, marketing agencies, strategic consultants, and advisory partners—plus audit, training, and other high-touch teams who deliver client work through documents.",
    href: TARGET_AUDIENCE_HREF,
  },
  {
    id: "use-cases",
    title: "Use cases",
    description:
      "Partnerships, consultations, projects, case management, audits, and training—how engagements map to your Drive.",
    href: USE_CASES_HREF,
  },
  {
    id: "trust-center",
    title: "Trust Center",
    description:
      "Non-custodial architecture, how data flows, and how Firma earns trust without holding your files.",
    href: TRUST_CENTER_PATH,
  },
] as const

/**
 * Contact mega-menu: form vs scheduled demo (external Calendly).
 */
export const contactMegaMenuItems = [
  {
    id: "get-in-touch",
    title: "Get in touch",
    description: "Send a message to our team through the contact form.",
    href: "/contact",
    external: false,
  },
  {
    id: "book-demo",
    title: "Book a demo",
    description: "Pick a time on Calendly for a live walkthrough.",
    href: CALENDLY_DEMO_URL,
    external: true,
  },
] as const

/**
 * Scroll margin so in-page anchors clear the fixed header + layout top padding
 * (`pt-24 lg:pt-28` on marketing layout).
 */
export const targetAudienceScrollMarginClass = "scroll-mt-28 lg:scroll-mt-32"

export const audienceRoles = [
  { id: "audience-fractional-executives", label: "Fractional Executives" },
  { id: "audience-marketing-agencies", label: "Marketing Agencies" },
  { id: "audience-strategic-consultants", label: "Strategic Consultants" },
  { id: "audience-strategic-advisory", label: "Advisory Partners" },
  { id: "audience-management-consulting", label: "Management Consulting" },
  { id: "audience-audit-compliance", label: "Audit & Compliance" },
  { id: "audience-corporate-trainers", label: "Corporate Trainers" },
] as const

export type UseCaseVariant =
  | "partnership"
  | "consultation"
  | "project"
  | "caseManagement"
  | "auditReview"
  | "training"

export type UseCaseBlock = {
  id: string
  menuTitle: string
  menuDescription: string
  variant: UseCaseVariant
  eyebrow: string
  headline: string
  body?: string
  delay: number
  colClass: string
  cardShellClass: string
}

export const useCaseBlocks: readonly UseCaseBlock[] = [
  {
    id: "use-case-strategic-partnership",
    menuTitle: "Strategic Partnership",
    menuDescription:
      "Ongoing, high-trust advisory relationships. A permanent digital home for knowledge.",
    variant: "partnership",
    eyebrow: "01 / Strategic Partnership",
    headline:
      "Ongoing, high-trust advisory relationships. A permanent digital home for knowledge.",
    delay: 100,
    colClass: "md:col-span-7",
    cardShellClass: cn(
      "group h-full overflow-hidden rounded-none border border-black/[0.06] bg-white p-8 shadow-sm lg:p-10 md:min-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER,
    ),
  },
  {
    id: "use-case-consultation",
    menuTitle: "Consultation",
    menuDescription:
      "One-time advisory engagement — strategy sessions, assessments, and structured reviews.",
    variant: "consultation",
    eyebrow: "02 / Consultation",
    headline: "One-time advisory engagement.",
    body: "Strategy sessions, assessments, and structured reviews for high-stakes decisions.",
    delay: 150,
    colClass: "md:col-span-5",
    cardShellClass: cn(
      "flex h-full flex-col overflow-hidden rounded-none bg-[#141c2a] p-8 shadow-sm lg:p-10 md:min-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER_DARK,
    ),
  },
  {
    id: "use-case-project",
    menuTitle: "Project",
    menuDescription:
      "Time-bound deliverables with milestones — from redesigns to launches, assets stay organized.",
    variant: "project",
    eyebrow: "03 / Project",
    headline: "Time-bound deliverable with clear milestones.",
    body: "From website redesigns to product launches - keep every asset organized.",
    delay: 200,
    colClass: "md:col-span-5",
    cardShellClass: cn(
      "group flex h-full flex-col overflow-hidden rounded-none border border-black/[0.05] bg-[#f0edee] p-8 shadow-sm lg:p-10 md:h-[260px] md:min-h-[260px] md:max-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER,
    ),
  },
  {
    id: "use-case-case-management",
    menuTitle: "Case Management",
    menuDescription:
      "Focused matters — legal and crisis workflows with sensitive documentation.",
    variant: "caseManagement",
    eyebrow: "04 / Case Management",
    headline: "Specific matters requiring focused attention.",
    body: "Ideal for legal matters and crisis management where documentation is sensitive.",
    delay: 250,
    colClass: "md:col-span-7",
    cardShellClass: cn(
      "group h-full overflow-hidden rounded-none border border-black/[0.06] bg-white p-8 shadow-sm lg:p-10 md:h-[260px] md:min-h-[260px] md:max-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER,
    ),
  },
  {
    id: "use-case-audit-review",
    menuTitle: "Audit & Review",
    menuDescription:
      "Compliance work with structured docs and a clear, immutable trail.",
    variant: "auditReview",
    eyebrow: "05 / Audit & Review",
    headline: "Compliance work with structured docs.",
    body: "Manage security audits and financial reviews with a clear, immutable trail.",
    delay: 300,
    colClass: "md:col-span-8",
    cardShellClass: cn(
      "group h-full overflow-hidden rounded-none border border-black/[0.06] bg-white p-8 shadow-sm lg:p-10 md:min-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER,
    ),
  },
  {
    id: "use-case-corporate-training",
    menuTitle: "Corporate Training",
    menuDescription:
      "Long-lived enterprise access — courseware and media with controlled expiration.",
    variant: "training",
    eyebrow: "06 / Corporate Training",
    headline: "Long-lived access for enterprise firms.",
    body: "Securely distribute courseware and video assets with controlled expiration.",
    delay: 350,
    colClass: "md:col-span-4",
    cardShellClass: cn(
      "group flex h-full flex-col overflow-hidden rounded-none border border-black/[0.06] bg-white p-8 shadow-sm lg:p-10 md:h-[260px] md:min-h-[260px] md:max-h-[260px]",
      MARKETING_SURFACE_DEPTH_HOVER,
    ),
  },
] as const
