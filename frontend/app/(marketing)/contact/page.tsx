"use client"

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  Handshake,
  Headset,
  Home,
  Mail,
  PlayCircle,
  Send,
  Loader2,
} from "lucide-react"
import { Turnstile } from "@marsidev/react-turnstile"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { submitContactForm } from "@/app/actions/submit-contact"
import { sendEvent, ANALYTICS_EVENTS } from "@/lib/analytics"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { MarketingBreadcrumb } from "@/components/marketing/marketing-breadcrumb"
import { BRAND_NAME } from "@/config/brand"
import { MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import { CONTACT_MESSAGE_MAX_LENGTH } from "@/lib/contact-form-limits"
import {
  CONTACT_INQUIRY_QUERY_KEY,
  CONTACT_INQUIRY_SALES_LABEL,
  CONTACT_INQUIRY_SALES_VALUE,
} from "@/lib/marketing/contact-inquiry"
import { cn } from "@/lib/utils"

const labelClass =
  "block text-[10px] font-bold uppercase tracking-widest text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
const fieldShellClass =
  "w-full rounded-sm border border-[#c6c6cc]/40 bg-[#f6f3f4] px-5 py-4 text-sm text-[#1b1b1d] outline-none transition-all [font-family:var(--font-kinetic-body),system-ui,sans-serif] focus:border-[#72ff70] focus:ring-2 focus:ring-[#72ff70]/40"

/** Navy rail CTA — same as `LandingHeroPrimaryCtas` “Book a Demo” (font, lift, shadow). */
const contactNavyCtaClassName = cn(
  "group flex h-14 w-full items-center justify-center rounded-md border border-transparent bg-[#141c2a] px-8 text-base font-bold tracking-widest text-white transition-all duration-200",
  "hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95",
  "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
)

const contactNavyCtaLinkInnerClassName = cn(contactNavyCtaClassName, "cursor-pointer")

/** Lime primary CTA — same as `LandingHeroPrimaryCtas` “Contact Us” (inverted from navy Book a Demo). */
const contactLimeCtaClassName = cn(
  "group flex h-14 w-full items-center justify-center rounded-md border-0 bg-[#72ff70] px-8 text-base font-bold tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200",
  "hover:-translate-y-0.5 hover:bg-[#72ff70] hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95",
  "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
)

const contactLimeCtaSubmitClassName = cn(
  contactLimeCtaClassName,
  "disabled:pointer-events-none disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_1px_0_rgba(0,34,3,0.28)]",
)

/** Radix select trigger: kinetic field shell, chevron inset from edge, rotate when open. */
const kineticSelectTriggerClass = cn(
  "h-auto min-h-0 w-full justify-between gap-3 rounded-sm border border-[#c6c6cc]/40 bg-[#f6f3f4] py-4 pl-5 pr-14 text-left text-sm text-[#1b1b1d] shadow-none ring-offset-0 transition-all",
  "[font-family:var(--font-kinetic-body),system-ui,sans-serif]",
  "focus:border-[#72ff70] focus:ring-2 focus:ring-[#72ff70]/40 focus:outline-none data-[state=open]:border-[#72ff70]",
  "data-[placeholder]:text-[#76777d] disabled:cursor-not-allowed disabled:opacity-50",
  "[&>span]:line-clamp-2 [&>span]:text-left",
  "[&_.lucide-chevron-down]:pointer-events-none [&_.lucide-chevron-down]:size-4 [&_.lucide-chevron-down]:shrink-0 [&_.lucide-chevron-down]:text-[#45474c]",
  "[&_.lucide-chevron-down]:transition-transform [&_.lucide-chevron-down]:duration-200",
  "data-[state=open]:[&_.lucide-chevron-down]:rotate-180"
)

const kineticSelectContentClass = cn(
  "z-[100] max-h-[min(280px,70vh)] overflow-hidden rounded-sm border border-[#c6c6cc]/40 bg-white p-0 shadow-lg",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
)

const kineticSelectItemClass = cn(
  "cursor-pointer rounded-none py-3 pl-4 pr-10 text-sm text-[#1b1b1d] [font-family:var(--font-kinetic-body),system-ui,sans-serif]",
  "focus:bg-[#72ff70]/15 focus:text-[#1b1b1d] data-[highlighted]:bg-[#72ff70]/15 data-[highlighted]:text-[#1b1b1d]"
)

/**
 * Thank-you “While you wait” links — aligned with `Header` nav + mega-menu:
 * slate body, emerald hover/underline system (`text-emerald-700`, `hover:bg-slate-50`, `ring-emerald-500/30`).
 */
const thankYouSecondaryLinkClass = cn(
  "group flex w-full items-center gap-2 rounded-sm py-3 pl-2 pr-2 text-left text-sm font-semibold text-slate-700 transition-colors sm:pl-1",
  "[font-family:var(--font-kinetic-body),system-ui,sans-serif]",
  "hover:bg-slate-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
)

/** Muted slate default, emerald on row hover — readable on white / slate-50 (avoids neon lime on light fills). */
const thankYouSecondaryLeadingIconClass =
  "h-4 w-4 shrink-0 stroke-[1.5] text-slate-500 transition-colors group-hover:text-emerald-600"

const thankYouSecondaryChevronClass =
  "h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600"

const INQUIRY_TYPES = [
  "General Inquiry",
  "Technical Support",
  "Sales & Licensing",
  "Partnership Inquiry",
  "Media/Press",
] as const

type InquiryTypeValue = (typeof INQUIRY_TYPES)[number]

function getInitialInquiryType(
  searchParams: ReturnType<typeof useSearchParams>,
): "" | InquiryTypeValue {
  const fromSp = searchParams.get(CONTACT_INQUIRY_QUERY_KEY)?.trim()
  const fromWindow =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get(CONTACT_INQUIRY_QUERY_KEY)?.trim()
      : null
  const raw = fromSp ?? fromWindow
  if (raw?.toLowerCase() === CONTACT_INQUIRY_SALES_VALUE.toLowerCase()) {
    return CONTACT_INQUIRY_SALES_LABEL
  }
  return ""
}

const infoCards = [
  {
    icon: Headset,
    title: "Expert Support",
    body: "Direct access to our product experts for any feature or technical inquiries.",
  },
  {
    icon: Handshake,
    title: "Partnerships",
    body: "Looking to collaborate? Let's discuss how we can grow together.",
  },
  {
    icon: PlayCircle,
    title: "Product demo",
    body: `Enquire about a live walkthrough—we'll show you how ${BRAND_NAME} works with your Google Drive.`,
  },
] as const

function ContactKineticSelect({
  id,
  label,
  value,
  onChange,
  placeholder,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className={kineticSelectTriggerClass}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className={kineticSelectContentClass} viewportClassName="p-1">
          {children}
        </SelectContent>
      </Select>
    </div>
  )
}

function ContactPageContent() {
  const searchParams = useSearchParams()

  const [formData, setFormData] = useState({
    email: "",
    role: "",
    otherRole: "",
    teamSize: "",
    inquiryType: getInitialInquiryType(searchParams),
    message: "",
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string>("")
  const [formError, setFormError] = useState<string | null>(null)
  const thankYouAnalyticsFiredRef = useRef(false)

  useEffect(() => {
    if (!submitted || thankYouAnalyticsFiredRef.current) return
    thankYouAnalyticsFiredRef.current = true
    sendEvent({
      action: ANALYTICS_EVENTS.CONTACT_THANK_YOU_VIEW,
      category: "Engagement",
      label: "Contact Thank You",
    })
  }, [submitted])

  useEffect(() => {
    if (!submitted) return
    document.getElementById("contact-thank-you-heading")?.focus()
  }, [submitted])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setFormError("Please enter a valid work email address.")
      return
    }
    if (!formData.role) {
      setFormError("Please select your primary role.")
      return
    }
    if (formData.role === "Other" && !formData.otherRole.trim()) {
      setFormError("Please specify your role.")
      return
    }
    if (!formData.teamSize) {
      setFormError("Please select your team size.")
      return
    }
    if (!formData.inquiryType) {
      setFormError("Please select an inquiry type.")
      return
    }
    if (!formData.message.trim()) {
      setFormError("Please enter a message.")
      return
    }
    // Length cap is enforced by <textarea maxLength={…}>; server still validates for forged requests.

    setIsSubmitting(true)

    try {
      const payload = new FormData()
      payload.append("email", formData.email)

      let finalRole = formData.role
      if (formData.role === "Other") {
        finalRole = `Other - ${formData.otherRole}`
      }
      payload.append("role", finalRole)
      payload.append("teamSize", formData.teamSize)
      payload.append("inquiryType", formData.inquiryType)
      payload.append("message", formData.message.trim())

      const formElement = e.target as HTMLFormElement
      const honeypotVal = (formElement.elements.namedItem("website") as HTMLInputElement)?.value
      if (honeypotVal) payload.append("website", honeypotVal)

      const result = await submitContactForm(payload, turnstileToken)

      if (!result.success) {
        throw new Error(result.error || "Failed to submit form")
      }

      setSubmitted(true)

      sendEvent({
        action: ANALYTICS_EVENTS.CONTACT_SUBMIT,
        category: "Engagement",
        label: "Contact Form",
        role: payload.get("role") as string,
      })
    } catch (error) {
      console.error("Error submitting form:", error)
      setFormError(error instanceof Error ? error.message : "Failed to submit form.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main
          className={cn(
            MARKETING_PAGE_SHELL,
            "flex flex-1 flex-col pb-16 lg:pb-24",
          )}
        >
          <MarketingBreadcrumb items={[{ label: "Contact" }]} className="mb-8" />
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-8">
            <div className="w-full max-w-md rounded-sm border border-[#c6c6cc]/30 bg-white p-8 text-center shadow-xl md:p-12">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#72ff70]/30 text-[#006e16] ring-1 ring-[#72ff70]/25">
                <Check className="h-8 w-8" strokeWidth={2} aria-hidden />
              </div>
              <h2
                id="contact-thank-you-heading"
                tabIndex={-1}
                className="mb-2 text-2xl font-bold tracking-tighter text-[#1b1b1d] outline-none [font-family:var(--font-kinetic-headline),system-ui,sans-serif] focus-visible:ring-2 focus-visible:ring-[#72ff70]/50"
              >
                Message received
              </h2>
              <p className="mb-3 text-sm leading-relaxed text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                Thanks for reaching out. We read every message and will get back to you shortly.
              </p>
              <p className="mb-8 text-sm leading-relaxed text-[#76777d] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                We usually reply within one business day.
              </p>
              <Link href="/" className={cn(contactNavyCtaClassName, "w-full")}>
                <Home className="mr-2 h-5 w-5 shrink-0 stroke-[1.5] text-[#72ff70] opacity-90" aria-hidden />
                Back to home
              </Link>
              <div
                className="mt-8 border-t border-[#c6c6cc]/30 pt-8 text-left [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                aria-label="More options"
              >
                <p className={cn(labelClass, "mb-4 text-left")}>While you wait</p>
                <ul className="flex flex-col gap-1 sm:gap-0.5">
                  <li>
                    <Link href="/pricing" className={thankYouSecondaryLinkClass}>
                      <CircleDollarSign className={thankYouSecondaryLeadingIconClass} aria-hidden />
                      <span className="min-w-0 flex-1">Pricing</span>
                      <ChevronRight className={thankYouSecondaryChevronClass} aria-hidden />
                    </Link>
                  </li>
                  <li>
                    <Link href="/resources/faq" className={thankYouSecondaryLinkClass}>
                      <CircleHelp className={thankYouSecondaryLeadingIconClass} aria-hidden />
                      <span className="min-w-0 flex-1">Help / FAQ</span>
                      <ChevronRight className={thankYouSecondaryChevronClass} aria-hidden />
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://calendly.com/firmaone/firma-connect"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={thankYouSecondaryLinkClass}
                    >
                      <CalendarDays className={thankYouSecondaryLeadingIconClass} aria-hidden />
                      <span className="min-w-0 flex-1">Book a Demo</span>
                      <ChevronRight className={thankYouSecondaryChevronClass} aria-hidden />
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />

      <main className={cn(MARKETING_PAGE_SHELL, "relative z-10 w-full flex-1 pb-16 lg:pb-24")}>
        <MarketingBreadcrumb items={[{ label: "Contact" }]} className="mb-8" />
        {/*
          Flex (not grid) on large screens so both columns share one row height and stretch together —
          avoids subtle bottom misalignment between intro+cards and the form card.
        */}
        <div className="flex flex-col gap-12 lg:flex-row lg:items-stretch lg:gap-16">
          {/* Left: intro + cards fill column height */}
          <div className="flex min-h-0 w-full flex-col gap-5 py-2 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:gap-6 lg:py-0">
            <div className="shrink-0">
              <KineticSectionIntro
                compact
                titleScale="hero"
                heading="h1"
                badge={{
                  variant: "lime",
                  icon: <Mail className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
                  label: "Support · Sales · Partnerships",
                }}
                title={
                  <>
                    Get in <span className="text-emerald-600">touch</span>
                  </>
                }
                description="Have a question or want to learn more? We are here to help. Reach out and our team will get back to you shortly."
                descriptionClassName="max-w-md"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-4">
              {infoCards.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="group flex min-h-0 flex-1 items-center gap-5 rounded-sm border border-[#c6c6cc]/30 bg-white p-5 shadow-sm transition-all hover:shadow-md lg:p-6"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="mb-1 text-lg font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                      {title}
                    </h4>
                    <p className="text-sm leading-relaxed text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
              {/*
                Same control as `LandingHeroPrimaryCtas` “Book a Demo” (navy pill, lime calendar icon, lift shadow).
              */}
              <Link
                href="https://calendly.com/firmaone/firma-connect"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full shrink-0"
                aria-label="Book a Demo — opens Calendly in a new tab"
              >
                <div className={contactNavyCtaLinkInnerClassName}>
                  <CalendarDays className="mr-2 h-5 w-5 shrink-0 stroke-[1.5] text-[#72ff70] opacity-90" aria-hidden />
                  Book a Demo
                </div>
              </Link>
            </div>
          </div>

          {/* Right: form card + submit CTA below (same stack/gap as left cards + Book a Demo) */}
          <div className="flex min-h-0 w-full flex-col gap-3 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:gap-4">
            <div className="flex min-h-0 flex-1 flex-col rounded-sm border border-[#c6c6cc]/30 bg-white p-8 shadow-xl md:p-12 lg:min-h-0">
              <form
                id="contact-marketing-form"
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col lg:min-h-0"
              >
                <div className="flex shrink-0 flex-col gap-6">
                <div className="space-y-2">
                  <label htmlFor="contact-email" className={labelClass}>
                    Your email
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    name="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value })
                      e.target.setCustomValidity("")
                    }}
                    onInvalid={(e) => {
                      ;(e.target as HTMLInputElement).setCustomValidity("Please enter a valid email address.")
                    }}
                    className={cn(fieldShellClass, "h-auto")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <ContactKineticSelect
                    id="contact-role"
                    label="Primary role"
                    value={formData.role}
                    onChange={(role) => setFormData({ ...formData, role })}
                    placeholder="Select role"
                  >
                    <SelectItem value="Strategic Advisor" className={kineticSelectItemClass}>
                      Strategic Advisor
                    </SelectItem>
                    <SelectItem value="Process Consultant" className={kineticSelectItemClass}>
                      Process Consultant / Implementation
                    </SelectItem>
                    <SelectItem value="Fractional Executive" className={kineticSelectItemClass}>
                      Fractional Executive
                    </SelectItem>
                    <SelectItem value="Firm Owner" className={kineticSelectItemClass}>
                      Firm Owner
                    </SelectItem>
                    <SelectItem value="Agency Owner" className={kineticSelectItemClass}>
                      Agency Owner
                    </SelectItem>
                    <SelectItem value="Other" className={kineticSelectItemClass}>
                      Other
                    </SelectItem>
                  </ContactKineticSelect>
                  <ContactKineticSelect
                    id="contact-team"
                    label="Team size"
                    value={formData.teamSize}
                    onChange={(teamSize) => setFormData({ ...formData, teamSize })}
                    placeholder="Select size"
                  >
                    <SelectItem value="1" className={kineticSelectItemClass}>
                      Just me
                    </SelectItem>
                    <SelectItem value="2-20" className={kineticSelectItemClass}>
                      2 – 20 members
                    </SelectItem>
                    <SelectItem value="21-50" className={kineticSelectItemClass}>
                      21 – 50 members
                    </SelectItem>
                    <SelectItem value="51-100" className={kineticSelectItemClass}>
                      51 – 100 members
                    </SelectItem>
                    <SelectItem value="100+" className={kineticSelectItemClass}>
                      100+ members
                    </SelectItem>
                  </ContactKineticSelect>
                </div>

                {formData.role === "Other" && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label htmlFor="contact-other-role" className={labelClass}>
                      Specify role
                    </label>
                    <Input
                      id="contact-other-role"
                      type="text"
                      required
                      placeholder="e.g. Operations Manager"
                      value={formData.otherRole}
                      onChange={(e) => setFormData({ ...formData, otherRole: e.target.value })}
                      className={cn(fieldShellClass, "h-auto")}
                    />
                  </div>
                )}

                <ContactKineticSelect
                  id="contact-inquiry"
                  label="Inquiry type"
                  value={formData.inquiryType}
                  onChange={(inquiryType) =>
                    setFormData({
                      ...formData,
                      inquiryType: inquiryType as InquiryTypeValue,
                    })
                  }
                  placeholder="Select inquiry type"
                >
                  {INQUIRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className={kineticSelectItemClass}>
                      {t}
                    </SelectItem>
                  ))}
                </ContactKineticSelect>
                </div>

                <div className="mt-6 flex min-h-[180px] flex-1 flex-col gap-2 lg:mt-6 lg:min-h-0">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <label htmlFor="contact-message" className={labelClass}>
                      Your message
                    </label>
                    <span
                      className="text-[10px] font-medium tabular-nums text-[#76777d] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                      title="Same as JavaScript string.length (UTF-16 code units); may differ from some editors’ counts for emoji or rare Unicode."
                      aria-live="polite"
                    >
                      {formData.message.length.toLocaleString()} /{" "}
                      {CONTACT_MESSAGE_MAX_LENGTH.toLocaleString()} characters
                    </span>
                  </div>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                    placeholder="How can we help you today?"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className={cn(fieldShellClass, "min-h-[140px] flex-1 resize-y lg:min-h-0")}
                  />
                </div>

                <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

                <div className="mt-6 flex shrink-0 flex-col gap-4">
                  <div className="flex justify-center pt-2">
                    <Turnstile
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                      onSuccess={(token) => setTurnstileToken(token)}
                    />
                  </div>

                  {formError && (
                    <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                      {formError}
                    </div>
                  )}
                </div>
              </form>
            </div>

            <button
              type="submit"
              form="contact-marketing-form"
              disabled={isSubmitting}
              className={contactLimeCtaSubmitClassName}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2 text-[#002203]">
                  <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-[#002203]/30 border-t-[#002203]"
                    aria-hidden
                  />
                  Sending…
                </span>
              ) : (
                <>
                  Send a message
                  <Send
                    className="ml-2 h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen flex-col">
          <Header />
          <main
            className={cn(
              MARKETING_PAGE_SHELL,
              "relative z-10 flex flex-1 flex-col items-center justify-center pb-16 pt-12 lg:pb-24 lg:pt-16",
            )}
          >
            <Loader2 className="h-8 w-8 animate-spin text-[#45474c]" aria-hidden />
            <span className="sr-only">Loading contact form</span>
          </main>
          <Footer />
        </div>
      }
    >
      <ContactPageWithSearchParamsKey />
    </Suspense>
  )
}

function ContactPageWithSearchParamsKey() {
  const searchParams = useSearchParams()
  return <ContactPageContent key={searchParams.toString()} />
}
