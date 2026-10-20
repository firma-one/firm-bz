"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  Clock,
  Loader2,
  Mail,
  Send,
} from "lucide-react"
import { Turnstile } from "@marsidev/react-turnstile"
import { submitContactForm } from "@/app/actions/submit-contact"
import { sendEvent, ANALYTICS_EVENTS } from "@/lib/analytics"
import { BRAND_NAME } from "@/config/brand"
import { CONTACT_MESSAGE_MAX_LENGTH } from "@/lib/contact-form-limits"
import {
  CONTACT_INQUIRY_QUERY_KEY,
  CONTACT_INQUIRY_SALES_LABEL,
  CONTACT_INQUIRY_SALES_VALUE,
} from "@/lib/marketing/contact-inquiry"
import { CONTACT_EMAIL, DEMO_BOOKING_URL } from "@/components/marketing/v2/config"
import {
  FormCard,
  FormHero,
  FormPageSection,
  FormSplit,
  InfoPoints,
  LinkRows,
  type FormLinkRow,
  type FormPoint,
} from "@/components/marketing/v2/forms/form-page"
import { FormAlert, FormField, FormSelect, FormSelectItem } from "@/components/marketing/v2/forms/fields"

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

const infoPoints: FormPoint[] = [
  {
    title: "Expert support",
    body: "Direct access to our product experts for any feature or technical inquiries.",
  },
  {
    title: "Partnerships",
    body: "Looking to collaborate? Let’s discuss how we can grow together.",
  },
  {
    title: "Product demo",
    body: `Inquire about a live walkthrough—we’ll show you how ${BRAND_NAME} works with your Google Drive or OneDrive.`,
  },
]

const reachRows: FormLinkRow[] = [
  { href: DEMO_BOOKING_URL, label: "Book a demo", icon: CalendarDays, external: true },
  { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL, icon: Mail },
]

const whileYouWaitRows: FormLinkRow[] = [
  { href: "/pricing", label: "Pricing", icon: CircleDollarSign },
  { href: "/resources/faq", label: "Help / FAQ", icon: CircleHelp },
  { href: DEMO_BOOKING_URL, label: "Book a demo", icon: CalendarDays, external: true },
]

const REPLY_TIME = "We usually reply within one business day."

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
      <FormPageSection ribbon>
        <div className="mk-form-solo">
          <FormCard>
            <div className="text-center">
              <span className="mk-form-badge mk-form-badge--electric mk-form-badge--lg">
                <Check size={26} strokeWidth={2.6} aria-hidden />
              </span>
              <h1 id="contact-thank-you-heading" tabIndex={-1} className="mk-form-card-title mt-5">
                Message received
              </h1>
              <p className="mx-auto mt-3 max-w-[400px] text-[16px] leading-[1.6] text-[var(--mk-body)]">
                Thanks for reaching out. We read every message and will get back to you shortly.
              </p>
              <p className="mt-2 text-[14.5px] leading-[1.5] text-[var(--mk-muted)]">{REPLY_TIME}</p>
            </div>
            <Link href="/" className="mk-btn mk-btn--primary mk-form-submit mt-7">
              Back to home
              <ChevronRight size={16} strokeWidth={2.6} aria-hidden />
            </Link>
            <nav aria-labelledby="contact-while-you-wait">
              <p id="contact-while-you-wait" className="mk-form-divider">
                While you wait
              </p>
              <LinkRows rows={whileYouWaitRows} />
            </nav>
          </FormCard>
        </div>
      </FormPageSection>
    )
  }

  return (
    <FormPageSection ribbon>
      <FormHero
        eyebrow="Support · Sales · Partnerships"
        title={
          <>
            Get in <span className="text-[var(--mk-bottle)]">touch</span>
          </>
        }
        lede="Have a question or want to learn more? We are here to help. Reach out and our team will get back to you shortly."
      />

      <FormSplit
        asideLabel="Other ways to reach us"
        main={
          <FormCard
            foot={
              <>
                <Clock size={16} strokeWidth={2.2} aria-hidden />
                {REPLY_TIME}
              </>
            }
          >
            <form id="contact-marketing-form" onSubmit={handleSubmit} className="mk-form-stack">
              <FormField id="contact-email" label="Your email">
                <input
                  id="contact-email"
                  type="email"
                  required
                  name="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value })
                    e.target.setCustomValidity("")
                  }}
                  onInvalid={(e) => {
                    ;(e.target as HTMLInputElement).setCustomValidity("Please enter a valid email address.")
                  }}
                  className="mk-form-input"
                />
              </FormField>

              <div className="mk-form-row2">
                <FormField id="contact-role" label="Primary role">
                  <FormSelect
                    id="contact-role"
                    value={formData.role}
                    onChange={(role) => setFormData({ ...formData, role })}
                    placeholder="Select role"
                  >
                    <FormSelectItem value="Strategic Advisor">Strategic Advisor</FormSelectItem>
                    <FormSelectItem value="Process Consultant">Process Consultant / Implementation</FormSelectItem>
                    <FormSelectItem value="Fractional Executive">Fractional Executive</FormSelectItem>
                    <FormSelectItem value="Firm Owner">Firm Owner</FormSelectItem>
                    <FormSelectItem value="Agency Owner">Agency Owner</FormSelectItem>
                    <FormSelectItem value="Other">Other</FormSelectItem>
                  </FormSelect>
                </FormField>
                <FormField id="contact-team" label="Team size">
                  <FormSelect
                    id="contact-team"
                    value={formData.teamSize}
                    onChange={(teamSize) => setFormData({ ...formData, teamSize })}
                    placeholder="Select size"
                  >
                    <FormSelectItem value="1">Just me</FormSelectItem>
                    <FormSelectItem value="2-20">2 – 20 members</FormSelectItem>
                    <FormSelectItem value="21-50">21 – 50 members</FormSelectItem>
                    <FormSelectItem value="51-100">51 – 100 members</FormSelectItem>
                    <FormSelectItem value="100+">100+ members</FormSelectItem>
                  </FormSelect>
                </FormField>
              </div>

              {formData.role === "Other" && (
                <FormField
                  id="contact-other-role"
                  label="Specify role"
                  className="[animation:mkFormPointIn_360ms_cubic-bezier(0.22,1,0.36,1)_both]"
                >
                  <input
                    id="contact-other-role"
                    type="text"
                    required
                    placeholder="e.g. Operations Manager"
                    value={formData.otherRole}
                    onChange={(e) => setFormData({ ...formData, otherRole: e.target.value })}
                    className="mk-form-input"
                  />
                </FormField>
              )}

              <FormField id="contact-inquiry" label="Inquiry type">
                <FormSelect
                  id="contact-inquiry"
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
                    <FormSelectItem key={t} value={t}>
                      {t}
                    </FormSelectItem>
                  ))}
                </FormSelect>
              </FormField>

              <FormField
                id="contact-message"
                label="Your message"
                note={
                  <span
                    className="mk-form-count"
                    title="Same as JavaScript string.length (UTF-16 code units); may differ from some editors’ counts for emoji or rare Unicode."
                    aria-live="polite"
                  >
                    {formData.message.length.toLocaleString()} / {CONTACT_MESSAGE_MAX_LENGTH.toLocaleString()} characters
                  </span>
                }
              >
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={5}
                  maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                  placeholder="How can we help you today?"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="mk-form-input mk-form-textarea"
                />
              </FormField>

              <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

              <div className="mk-form-turnstile">
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                  onSuccess={(token) => setTurnstileToken(token)}
                />
              </div>

              {formError && <FormAlert tone="error">{formError}</FormAlert>}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="mk-btn mk-btn--primary mk-form-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} strokeWidth={2.4} className="animate-spin" aria-hidden />
                    Sending…
                  </>
                ) : (
                  <>
                    Send a message
                    <Send size={16} strokeWidth={2.4} aria-hidden />
                  </>
                )}
              </button>
            </form>
          </FormCard>
        }
        aside={
          <>
            <InfoPoints items={infoPoints} />
            <div className="mk-form-panel mt-10">
              <LinkRows rows={reachRows} />
            </div>
          </>
        }
      />
    </FormPageSection>
  )
}

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <FormPageSection>
          <div className="mk-form-status" style={{ minHeight: "50vh" }}>
            <Loader2 size={28} strokeWidth={2.2} className="animate-spin" aria-hidden />
            <span className="sr-only">Loading contact form</span>
          </div>
        </FormPageSection>
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
