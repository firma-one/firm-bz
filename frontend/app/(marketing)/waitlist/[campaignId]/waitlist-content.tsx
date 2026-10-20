"use client"

import React, { useState, useCallback, useEffect } from "react"
import { submitWaitlistForm } from "@/app/actions/submit-waitlist"
import { getWaitlistStatus } from "@/app/actions/get-waitlist-status"
import {
    ArrowRight,
    ArrowUpRight,
    Award,
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    Gift,
    Loader2,
    Pencil,
    Star,
    Users,
    Zap,
} from "lucide-react"
import { Turnstile } from "@marsidev/react-turnstile"
import { getPlatformSiteOrigin } from "@/config/platform-domain"
import { BRAND_NAME } from "@/config/brand"
import { DEMO_BOOKING_URL } from "@/components/marketing/v2/config"
import { Band, CheckDot, PillLink } from "@/components/marketing/v2/primitives"
import { FormCard, FormHero, FormPageSection, FormSplit } from "@/components/marketing/v2/forms/form-page"
import { FormAlert, FormField } from "@/components/marketing/v2/forms/fields"

interface WaitlistStatus {
    exists: boolean
    referralCode: string | null
    referralCount: number | null
    upgradedToProPlus: boolean | null
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

interface WaitlistPageContentProps {
    campaignId: string
    batch: { id: string; name: string; isActive: boolean }
    searchParams: Record<string, string>
}

/** Plan chips inside running text: Standard in the soft green outline, Pro in electric. */
const StdChip = () => (
    <span className="mk-form-chip mk-form-chip--std">
        <Star className="h-[0.95em] w-[0.95em] shrink-0" strokeWidth={2.4} aria-hidden />
        Standard
    </span>
)
const ProChip = () => <span className="mk-form-chip mk-form-chip--pro">Pro ✦</span>

/** Icon badge and title at the top of each card panel. */
function CardHead({ icon, title, electric = false }: { icon: React.ReactNode; title: React.ReactNode; electric?: boolean }) {
    return (
        <div className="mk-form-card-head">
            <span className={`mk-form-badge${electric ? " mk-form-badge--electric" : ""}`} aria-hidden="true">
                {icon}
            </span>
            <h2 className="mk-form-card-title">{title}</h2>
        </div>
    )
}

/** Plan status, referral progress and the referral link; shared by the success and status panels. */
function ReferralPanel({
    referralUrl,
    referralCount,
    copied,
    onCopy,
}: {
    referralUrl: string
    referralCount: number
    copied: boolean
    onCopy: () => void
}) {
    const isPro = referralCount >= 5
    return (
        <div className="flex flex-col gap-5">
            {/* Plan status */}
            <div className={`mk-form-plan${isPro ? " mk-form-plan--pro" : ""}`}>
                <CheckCircle2 size={22} strokeWidth={2.2} aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="text-[15.5px] font-semibold leading-[1.45] text-[var(--mk-ink)]">
                        Free 3-month {isPro ? <ProChip /> : <StdChip />} plan secured!
                    </p>
                    <p className="mt-0.5 text-[13.5px] leading-[1.5] text-[var(--mk-body)]">
                        {isPro
                            ? `${referralCount} referrals — Pro upgrade unlocked 🎉`
                            : referralCount === 0
                                ? "Refer 5 friends to unlock a free 3-month Pro upgrade"
                                : `${referralCount} of 5 referrals — ${5 - referralCount} more to unlock Pro`}
                    </p>
                </div>
                {!isPro && referralCount > 0 && (
                    <div className="shrink-0 text-right">
                        <span
                            className="block text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--mk-ink)]"
                            style={{ fontFamily: "var(--mk-font-display)" }}
                        >
                            {referralCount}
                        </span>
                        <span className="mt-1 block text-[12px] text-[var(--mk-muted)]">/ 5</span>
                    </div>
                )}
            </div>

            {/* Progress bar (only when in progress) */}
            {!isPro && (
                <div>
                    <div className="mb-2 flex justify-between text-[13px] font-semibold text-[var(--mk-body)]">
                        <span>Referral progress</span>
                        <span className="tabular-nums">{referralCount} / 5</span>
                    </div>
                    <div
                        className="mk-form-progress"
                        role="progressbar"
                        aria-label="Referral progress"
                        aria-valuemin={0}
                        aria-valuemax={5}
                        aria-valuenow={referralCount}
                    >
                        <span style={{ transform: `scaleX(${Math.min(1, referralCount / 5)})` }} />
                    </div>
                </div>
            )}

            {/* Referral link */}
            <div>
                <p className="mk-form-label">Your referral link</p>
                <div className="mk-form-link-box mt-2">
                    <code>{referralUrl}</code>
                    <button type="button" onClick={onCopy} className="mk-btn mk-btn--secondary mk-btn--sm shrink-0">
                        {copied ? (
                            <>
                                <Check size={14} strokeWidth={2.6} className="text-[var(--mk-bottle)]" aria-hidden />
                                Copied
                            </>
                        ) : (
                            <>
                                <Copy size={14} strokeWidth={2.2} aria-hidden />
                                Copy
                            </>
                        )}
                    </button>
                </div>
            </div>

            {!isPro && (
                <FormAlert tone="note" icon={Zap}>
                    Refer 5 friends to unlock a free 3-month <ProChip /> upgrade!
                </FormAlert>
            )}
        </div>
    )
}

export function WaitlistPageContent({ campaignId, searchParams }: WaitlistPageContentProps) {
    const referralCodeFromUrl = searchParams['ref'] ?? null
    const planFromUrl = searchParams['plan'] ?? 'Standard'
    const emailFromUrl = searchParams['email'] ?? null

    const [turnstileToken, setTurnstileToken] = useState<string>("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [newReferralCode, setNewReferralCode] = useState<string | null>(null)
    const [waitlistStatus, setWaitlistStatus] = useState<WaitlistStatus | null>(null)
    const [checkingStatus, setCheckingStatus] = useState(false)
    const [emailInput, setEmailInput] = useState<string>("")
    const [referralLinkCopied, setReferralLinkCopied] = useState(false)
    const [emailLocked, setEmailLocked] = useState(false)
    const [isEditingEmail, setIsEditingEmail] = useState(false)
    const [emailCheckError, setEmailCheckError] = useState<string | null>(null)

    // Pre-fill email from ?email= param (e.g. from the CTA in the confirmation email)
    useEffect(() => {
        if (emailFromUrl && isValidEmail(emailFromUrl)) {
            setEmailInput(emailFromUrl)
            checkStatus(emailFromUrl)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY as string) || '1x00000000000000000000AA'
    const siteOrigin = process.env.NEXT_PUBLIC_APP_URL || getPlatformSiteOrigin()

    const buildReferralUrl = (code: string) =>
        `${siteOrigin}/waitlist/${campaignId}?ref=${code}&utm_source=referral&utm_medium=link&utm_campaign=waitlist`

    const copyReferralLink = async (code: string) => {
        try {
            await navigator.clipboard.writeText(buildReferralUrl(code))
            setReferralLinkCopied(true)
            setTimeout(() => setReferralLinkCopied(false), 2000)
        } catch { /* fallback: user can select and copy manually */ }
    }

    const checkStatus = useCallback(async (email: string) => {
        if (!isValidEmail(email)) {
            setWaitlistStatus(null)
            setCheckingStatus(false)
            setEmailLocked(false)
            setIsEditingEmail(false)
            setEmailCheckError(null)
            return
        }

        setCheckingStatus(true)
        setEmailCheckError(null)
        setWaitlistStatus(null)
        try {
            const result = await getWaitlistStatus(email, campaignId)
            if (result.success && result.data) {
                setWaitlistStatus({
                    exists: result.data.exists,
                    referralCode: result.data.referralCode,
                    referralCount: result.data.referralCount,
                    upgradedToProPlus: result.data.upgradedToProPlus,
                })
                setEmailLocked(true)
                setIsEditingEmail(false)
            } else {
                setWaitlistStatus(null)
                setEmailLocked(false)
                setIsEditingEmail(false)
                if (result.error) setEmailCheckError(result.error)
            }
        } catch (error) {
            setWaitlistStatus(null)
            setEmailLocked(false)
            setIsEditingEmail(false)
            setEmailCheckError(error instanceof Error ? error.message : 'Failed to check email. Please try again.')
        } finally {
            requestAnimationFrame(() => setCheckingStatus(false))
        }
    }, [campaignId])

    const handleUnlockEmail = () => {
        setIsEditingEmail(true)
        setEmailLocked(false)
        setWaitlistStatus(null)
        setEmailCheckError(null)
    }

    const handleCheckClick = () => {
        if (isValidEmail(emailInput)) {
            if (isEditingEmail) setIsEditingEmail(false)
            checkStatus(emailInput)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); handleCheckClick() }
    }

    const handleJoin = async () => {
        setFormError(null)
        if (!turnstileToken) { setFormError("Please complete the verification."); return }
        setIsSubmitting(true)

        try {
            const formData = new FormData()
            formData.set('email', emailInput)
            formData.set('plan', planFromUrl)
            formData.set('website', '')
            if (referralCodeFromUrl) formData.append('referralCode', referralCodeFromUrl.toUpperCase())

            const result = await submitWaitlistForm(formData, turnstileToken, campaignId)
            if (!result.success) throw new Error(result.error || 'Failed to submit form')

            if (result.data?.isDuplicate) {
                // Re-fetch full status to get referralCode + referralCount
                const statusResult = await getWaitlistStatus(emailInput, campaignId)
                if (statusResult.success && statusResult.data) {
                    setWaitlistStatus({
                        exists: true,
                        referralCode: statusResult.data.referralCode,
                        referralCount: statusResult.data.referralCount,
                        upgradedToProPlus: statusResult.data.upgradedToProPlus,
                    })
                }
                setEmailLocked(true)
                setIsEditingEmail(false)
                setSubmitted(false)
                setFormError(null)
            } else {
                setNewReferralCode(result.data?.referralCode || null)
                setSubmitted(true)
                setEmailLocked(true)
                setIsEditingEmail(false)
                setWaitlistStatus(null)
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Failed to submit form. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Which panel the card shows (same precedence as before: checking, joined, already on the list, join, email).
    const panel = checkingStatus
        ? "loading"
        : submitted
            ? "success"
            : waitlistStatus?.exists && emailInput
                ? "status"
                : emailLocked && emailInput
                    ? "join"
                    : "email"

    // Panels slide in when they swap, but not on first paint (the card itself rises in then).
    const [firstPanel] = useState(panel)
    const [panelChanged, setPanelChanged] = useState(false)
    if (!panelChanged && panel !== firstPanel) setPanelChanged(true)
    const stepClass = panelChanged ? "mk-form-step" : ""

    const referredNote = (children: React.ReactNode) =>
        referralCodeFromUrl ? (
            <FormAlert tone="note">
                <strong className="font-semibold">You were referred!</strong> {children}
            </FormAlert>
        ) : null

    const referralOrEmailNote = (code: string | null | undefined, count: number) =>
        code ? (
            <ReferralPanel
                referralUrl={buildReferralUrl(code)}
                referralCount={count}
                copied={referralLinkCopied}
                onCopy={() => copyReferralLink(code)}
            />
        ) : (
            <p className="text-[15px] leading-[1.6] text-[var(--mk-body)]">Check your email for your referral link.</p>
        )

    const card = (
        <FormCard>
            {panel === "loading" ? (
                /* ── LOADING ── */
                <div key="loading" className={`mk-form-status ${stepClass}`} role="status">
                    <Loader2 size={28} strokeWidth={2.2} className="animate-spin" aria-hidden />
                    <p>Checking waitlist status…</p>
                </div>
            ) : panel === "success" ? (
                /* ── SUCCESS — just joined ── */
                <div key="success" className={stepClass}>
                    <CardHead electric icon={<Check size={20} strokeWidth={2.8} />} title="You’re on the list!" />
                    {referralOrEmailNote(newReferralCode, 0)}
                </div>
            ) : panel === "status" ? (
                /* ── STATUS — already on list ── */
                <div key="status" className={stepClass}>
                    <CardHead icon={<CheckCircle2 size={20} strokeWidth={2.2} />} title="You’re on the waitlist!" />
                    {referralOrEmailNote(waitlistStatus?.referralCode, waitlistStatus?.referralCount ?? 0)}
                </div>
            ) : panel === "join" ? (
                /* ── JOIN PANEL ── */
                <div key="join" className={stepClass}>
                    <CardHead icon={<Award size={19} strokeWidth={2.2} />} title="Secure your spot" />
                    <div className="mk-form-stack">
                        <div className="mk-form-locked">
                            <span className="min-w-0 flex-1 truncate">{emailInput}</span>
                            <button type="button" onClick={handleUnlockEmail} className="mk-form-ghost-btn" aria-label="Edit email">
                                <Pencil size={15} strokeWidth={2.2} aria-hidden />
                            </button>
                        </div>

                        {referredNote(<>You’ll get a free 3-month <StdChip /> spot when you join.</>)}

                        <div>
                            <p className="mk-form-label">Complete verification to join</p>
                            <div className="mk-form-turnstile mk-form-turnstile--start mt-3">
                                <Turnstile
                                    siteKey={turnstileSiteKey}
                                    onSuccess={(token) => setTurnstileToken(token)}
                                    onError={() => setTurnstileToken("")}
                                    onExpire={() => setTurnstileToken("")}
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleJoin}
                            disabled={!turnstileToken || isSubmitting}
                            aria-busy={isSubmitting}
                            className="mk-btn mk-btn--primary mk-form-submit"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={18} strokeWidth={2.4} className="animate-spin" aria-hidden />
                                    Joining…
                                </>
                            ) : (
                                <>
                                    Join waitlist
                                    <ChevronRight size={16} strokeWidth={2.6} aria-hidden />
                                </>
                            )}
                        </button>
                        {formError && <FormAlert tone="error">{formError}</FormAlert>}
                    </div>
                </div>
            ) : (
                /* ── EMAIL FORM ── */
                <div key="email" className={stepClass}>
                    <CardHead icon={<Award size={19} strokeWidth={2.2} />} title="Secure your spot" />
                    <div className="mk-form-stack">
                        {referredNote(
                            <>You’ll receive priority early access and a free 3-month <StdChip /> plan when you sign up.</>,
                        )}
                        <FormField id="email-check" label="Enter your email to get started">
                            <div className="mk-form-inline">
                                <input
                                    id="email-check"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="mk-form-input"
                                />
                                <div className="mk-form-inline__action">
                                    {checkingStatus ? (
                                        <Loader2 size={18} className="animate-spin text-[var(--mk-bottle)]" aria-hidden />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleCheckClick}
                                            disabled={!isValidEmail(emailInput)}
                                            className="mk-form-icon-btn"
                                            aria-label="Check status"
                                        >
                                            <ArrowRight size={17} strokeWidth={2.6} aria-hidden />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </FormField>
                        {emailCheckError && <FormAlert tone="warn">{emailCheckError}</FormAlert>}
                    </div>
                </div>
            )}
        </FormCard>
    )

    const offers = (
        <div className="mk-form-panel">
            <section aria-labelledby="waitlist-offer-you">
                <div className="flex items-center gap-3">
                    <span className="mk-form-tile" aria-hidden="true">
                        <Gift size={18} strokeWidth={2} />
                    </span>
                    <span className="mk-form-kicker">01 / For You</span>
                </div>
                <h2 id="waitlist-offer-you" className="mk-card-title mt-5 text-[var(--mk-ink)]">
                    Free 3 months on us.
                    <br />
                    Refer 5 friends — upgrade to <ProChip />.
                </h2>
                <ul className="mk-form-checks mt-5">
                    <li>
                        <CheckDot size={18} />
                        <span>Free 3-month <StdChip /> — exclusively for Early Adopters</span>
                    </li>
                    <li>
                        <CheckDot size={18} />
                        <span>5 referrals → free 3-month <ProChip /> upgrade</span>
                    </li>
                </ul>
                <a href="/pricing" target="_blank" rel="noopener noreferrer" className="mk-link mt-6 text-[15.5px]">
                    Explore plans &amp; features
                    <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                </a>
            </section>

            <hr className="mk-form-panel__rule" />

            <section aria-labelledby="waitlist-offer-friends">
                <div className="flex items-center gap-3">
                    <span className="mk-form-tile" aria-hidden="true">
                        <Users size={18} strokeWidth={2} />
                    </span>
                    <span className="mk-form-kicker">02 / For your friends</span>
                </div>
                <h2 id="waitlist-offer-friends" className="mk-card-title mt-5 text-[var(--mk-ink)]">
                    Share the spot.
                    <br />
                    They get the same deal.
                </h2>
                <ul className="mk-form-checks mt-5">
                    <li>
                        <CheckDot size={18} />
                        <span>They secure a free 3-month <StdChip /> spot</span>
                    </li>
                    <li>
                        <CheckDot size={18} />
                        <span>Every referral counts toward your <ProChip /> upgrade</span>
                    </li>
                </ul>
            </section>
        </div>
    )

    return (
        <>
            <FormPageSection ribbon>
                <FormHero
                    eyebrow="Early Access // Waitlist"
                    title={
                        <>
                            Get in early —
                            <br />
                            <span className="text-[var(--mk-bottle)]">exclusive early adopter offer</span>
                        </>
                    }
                    lede="Firma is launching soon — early access is by invitation only. Secure your spot before this offer closes."
                />
                <FormSplit main={card} aside={offers} asideLabel="The early adopter offer" />
            </FormPageSection>

            {/* CTA band */}
            <Band surface="gray" aria-labelledby="waitlist-cta-heading" className="py-20 md:py-[104px]">
                <div className="mk-rail">
                    <div className="max-w-[760px]">
                        <h2 id="waitlist-cta-heading" className="mk-section text-[var(--mk-ink)]">
                            Still have questions?{" "}
                            <br className="hidden sm:block" />
                            <span className="text-[var(--mk-bottle)]">Talk to our team.</span>
                        </h2>
                        <p className="mk-lede mt-6 max-w-[600px]">
                            Our team is ready to help you understand how{" "}
                            <span className="font-semibold text-[var(--mk-ink)]">{BRAND_NAME}</span> fits in your workflow.
                            Connect with a specialist today.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <PillLink href="/contact" block>
                                Contact us
                            </PillLink>
                            <a href="/tour" target="_blank" rel="noopener noreferrer" className="mk-btn mk-btn--secondary mk-btn--block-phone">
                                Take a tour
                                <ChevronRight size={16} strokeWidth={2.6} aria-hidden />
                                <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                            <a
                                href={DEMO_BOOKING_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mk-btn mk-btn--secondary mk-btn--block-phone"
                            >
                                Book a demo
                                <ChevronRight size={16} strokeWidth={2.6} aria-hidden />
                                <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                        </div>
                    </div>
                </div>
            </Band>
        </>
    )
}
