"use client"

import React, { useState, useCallback, useEffect } from "react"
import { submitWaitlistForm } from "@/app/actions/submit-waitlist"
import { getWaitlistStatus } from "@/app/actions/get-waitlist-status"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Loader2, ArrowRight, ArrowUpRight, Users, Copy, Check, Gift, Zap, Pencil, Star, Award, LayoutGrid } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { Turnstile } from "@marsidev/react-turnstile"
import { getPlatformSiteOrigin } from "@/config/platform-domain"
import { KineticSectionIntro, kineticSectionLeadClassName } from "@/components/kinetic/kinetic-section-intro"
import { cn } from "@/lib/utils"
import { MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { BrandName } from "@/components/brand/BrandName"
import { LandingHeroPrimaryCtas } from "@/components/marketing/landing-hero-primary-ctas"

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

    const labelFont = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
    const stdBadge = <span className="ds-badge-kinetic normal-case text-[9px] px-1.5 py-0.5 inline-flex align-middle relative top-[-1px] mx-0.5"><Star className="w-2.5 h-2.5 shrink-0" />Standard</span>
    const proBadge = <span className="normal-case inline-flex align-middle relative top-[-1px] mx-0.5 text-[10px] font-bold text-[#001256] bg-[#5a78ff]/12 border border-[#5a78ff]/25 px-1.5 py-0.5 rounded">Pro ✦</span>

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

    // Shared referral panel used in both success and status views
    const ReferralPanel = ({ code, referralCount }: { code: string; referralCount: number }) => {
        const isPro = referralCount >= 5
        return (
            <div className="p-5 space-y-4">
                {/* Plan status */}
                <div className={cn(
                    "flex items-center gap-3 p-4 border",
                    isPro
                        ? "bg-[#5a78ff]/[0.07] border-[#5a78ff]/20"
                        : "bg-[#72ff70]/[0.07] border-[#22c55e]/20"
                )}>
                    <CheckCircle2 className={cn("w-5 h-5 shrink-0", isPro ? "text-[#5a78ff]" : "text-[#22c55e]")} />
                    <div>
                        <p className="text-sm font-semibold text-[#1b1b1d]">
                            {isPro
                                ? <span>Free 3-month {proBadge} plan secured!</span>
                                : <span>Free 3-month {stdBadge} plan secured!</span>
                            }
                        </p>
                        <p className="text-xs text-[#45474c] mt-0.5">
                            {isPro
                                ? `${referralCount} referrals — Pro upgrade unlocked 🎉`
                                : referralCount === 0
                                    ? `Refer 5 friends to unlock a free 3-month ${''} Pro upgrade`
                                    : `${referralCount} of 5 referrals — ${5 - referralCount} more to unlock ${''} Pro`
                            }
                        </p>
                    </div>
                    {!isPro && referralCount > 0 && (
                        <div className="ml-auto shrink-0 text-right">
                            <span className="text-2xl font-black text-[#1b1b1d]">{referralCount}</span>
                            <span className="text-xs text-[#45474c] block">/ 5</span>
                        </div>
                    )}
                </div>

                {/* Progress bar (only when in progress) */}
                {!isPro && (
                    <div>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#45474c] mb-1.5 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            <span>Referral progress</span>
                            <span>{referralCount} / 5</span>
                        </div>
                        <div className="h-1.5 bg-[#f4f5f7] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#72ff70] rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, (referralCount / 5) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Referral link */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] mb-2">
                        Your referral link
                    </p>
                    <div className="bg-[#f4f5f7] border border-[#c6c6cc]/40 p-3 flex items-center gap-2">
                        <code className="text-[11px] font-mono text-[#45474c] flex-1 break-all">
                            {buildReferralUrl(code)}
                        </code>
                        <button
                            onClick={() => copyReferralLink(code)}
                            className="shrink-0 h-7 px-3 bg-[#141c2a] text-white text-xs font-semibold rounded hover:bg-black transition-colors flex items-center gap-1.5"
                        >
                            {referralLinkCopied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
                        </button>
                    </div>
                </div>

                {!isPro && (
                    <div className="bg-[#5a78ff]/[0.07] border border-[#5a78ff]/20 p-3 flex items-start gap-2">
                        <Zap className="w-4 h-4 text-[#5a78ff] shrink-0 mt-0.5" />
                        <p className="text-sm text-[#45474c]">
                            Refer 5 friends to unlock a free 3-month {proBadge} upgrade!
                        </p>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className={cn(MARKETING_PAGE_SHELL, "relative z-10 w-full flex-1 pt-20 pb-16 md:pb-24")}>
                <header className="mb-10 md:mb-12">
                    <KineticSectionIntro
                        compact
                        heading="h1"
                        titleScale="hero"
                        badge={{
                            variant: "lime",
                            icon: <Star className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
                            label: "Early Access // Waitlist",
                        }}
                        title={
                            <>
                                <span className="text-[#1b1b1d]">Get in early —</span>
                                <br />
                                <span className="text-[#5a78ff]">exclusive early adopter offer</span>
                            </>
                        }
                        description={
                            <p className={cn(kineticSectionLeadClassName, "max-w-3xl")}>
                                Firma is launching soon — early access is by invitation only. Secure your spot before this offer closes.
                            </p>
                        }
                        descriptionClassName=""
                    />
                </header>

                {/* 50:50 main grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* LEFT: Offer cards */}
                    <div className="flex flex-col border border-black/[0.08]">
                        {/* For You */}
                        <div className="relative overflow-hidden bg-white p-8 md:p-10 flex flex-col flex-1 border-b border-black/[0.08] group">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.07] transition-opacity group-hover:opacity-[0.12] pointer-events-none select-none">
                                <Gift className="h-28 w-28 text-[#22c55e]" />
                            </div>
                            <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                                01 / For You
                            </span>
                            <h3 className="mb-5 text-2xl md:text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] leading-tight">
                                Free 3 months on us.<br />Refer 5 friends — upgrade to {proBadge}.
                            </h3>
                            <div className="flex flex-col gap-3 mt-auto">
                                <span className="flex items-center gap-2 text-[11px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] uppercase tracking-wide">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shrink-0" />
                                    Free 3-month {stdBadge} — exclusively for Early Adopters
                                </span>
                                <span className="flex items-center gap-2 text-[11px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] uppercase tracking-wide">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shrink-0" />
                                    5 referrals → free 3-month {proBadge} upgrade
                                </span>
                            </div>
                            <div className="mt-6">
                                <a
                                    href="/pricing"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group inline-flex items-center gap-2 rounded-md bg-[#141c2a] px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all duration-200 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                                    Explore plans &amp; features
                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                </a>
                            </div>
                        </div>

                        {/* For Your Friends */}
                        <div className="relative overflow-hidden bg-white p-8 md:p-10 flex flex-col flex-1 group">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.07] transition-opacity group-hover:opacity-[0.12] pointer-events-none select-none">
                                <Users className="h-28 w-28 text-[#5a78ff]" />
                            </div>
                            <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                                02 / For your friends
                            </span>
                            <h3 className="mb-5 text-2xl md:text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] leading-tight">
                                Share the spot.<br />They get the same deal.
                            </h3>
                            <div className="flex flex-col gap-3 mt-auto">
                                <span className="flex items-center gap-2 text-[11px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] uppercase tracking-wide">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#5a78ff] shrink-0" />
                                    They secure a free 3-month {stdBadge} spot
                                </span>
                                <span className="flex items-center gap-2 text-[11px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] uppercase tracking-wide">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#5a78ff] shrink-0" />
                                    Every referral counts toward your {proBadge} upgrade
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: context-dependent panel */}
                    <div className="border border-black/[0.08]">
                        {checkingStatus ? (
                            /* ── LOADING ── */
                            <div className="bg-white p-10 flex flex-col items-center justify-center gap-3 min-h-[280px]">
                                <Loader2 className="w-7 h-7 animate-spin text-[#45474c]" />
                                <p className="text-sm text-[#45474c]">Checking waitlist status…</p>
                            </div>
                        ) : submitted ? (
                            /* ── SUCCESS — just joined ── */
                            <div className="bg-white h-full">
                                <div className="bg-[#F0EDEE] px-5 py-4 flex items-center gap-3 border-b border-black/[0.08]">
                                    <div className="w-6 h-6 rounded-full bg-[#22c55e] flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="w-4 h-4 text-white" />
                                    </div>
                                    <span className={cn(labelFont, "font-bold text-[#1b1b1d]")}>You're on the list!</span>
                                </div>
                                {newReferralCode
                                    ? <ReferralPanel code={newReferralCode} referralCount={0} />
                                    : <p className="p-5 text-sm text-[#45474c]">Check your email for your referral link.</p>
                                }
                            </div>
                        ) : waitlistStatus?.exists && emailInput ? (
                            /* ── STATUS — already on list ── */
                            <div className="bg-white h-full">
                                <div className="bg-[#F0EDEE] px-5 py-4 flex items-center gap-3 border-b border-black/[0.08]">
                                    <CheckCircle2 className="w-5 h-5 text-[#22c55e] shrink-0" />
                                    <span className={cn(labelFont, "font-bold text-[#1b1b1d]")}>You're on the waitlist!</span>
                                </div>
                                {waitlistStatus.referralCode
                                    ? <ReferralPanel code={waitlistStatus.referralCode} referralCount={waitlistStatus.referralCount ?? 0} />
                                    : <p className="p-5 text-sm text-[#45474c]">Check your email for your referral link.</p>
                                }
                            </div>
                        ) : emailLocked && emailInput ? (
                            /* ── JOIN PANEL ── */
                            <div className="bg-white h-full">
                                <div className="bg-[#F0EDEE] px-5 py-4 flex items-center gap-3 border-b border-black/[0.08]">
                                    <div className="w-8 h-8 rounded-md bg-[#22c55e]/15 flex items-center justify-center shrink-0">
                                        <Award className="w-4 h-4 text-[#006e16] stroke-2" />
                                    </div>
                                    <span className={cn(labelFont, "font-bold text-[#1b1b1d]")}>Secure your spot</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="flex items-center gap-2 bg-[#f4f5f7] border border-[#c6c6cc]/40 px-3 h-11">
                                        <span className="flex-1 text-sm text-[#1b1b1d] font-medium truncate">{emailInput}</span>
                                        <button type="button" onClick={handleUnlockEmail} className="p-1.5 hover:bg-[#c6c6cc]/30 rounded-full transition-colors shrink-0" aria-label="Edit email">
                                            <Pencil className="w-3.5 h-3.5 text-[#45474c]" />
                                        </button>
                                    </div>

                                    {referralCodeFromUrl && (
                                        <div className="bg-[#72ff70]/10 border border-[#006e16]/20 p-3 text-sm text-[#002203] flex items-start gap-2">
                                            <Star className="w-4 h-4 shrink-0 mt-0.5 text-[#006e16]" />
                                            <span><strong>You were referred!</strong> You'll get a free 3-month {stdBadge} spot when you join.</span>
                                        </div>
                                    )}

                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                                        Complete verification to join
                                    </p>
                                    <div className="flex items-center gap-4 flex-wrap">
                                        <Turnstile
                                            siteKey={turnstileSiteKey}
                                            onSuccess={(token) => setTurnstileToken(token)}
                                            onError={() => setTurnstileToken("")}
                                            onExpire={() => setTurnstileToken("")}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleJoin}
                                            disabled={!turnstileToken || isSubmitting}
                                            className="inline-flex items-center justify-center gap-2 rounded-md px-6 h-[66px] text-sm font-bold uppercase tracking-[0.2em] transition-all duration-200 [font-family:var(--font-kinetic-headline),system-ui,sans-serif] disabled:cursor-not-allowed disabled:pointer-events-none bg-[#c6c6cc]/30 text-[#45474c] enabled:bg-[#72ff70] enabled:text-[#002203] enabled:hover:-translate-y-0.5 enabled:hover:bg-[#5ce85a] enabled:hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] enabled:active:translate-y-0 enabled:active:scale-95"
                                        >
                                            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Joining…</> : <><Star className="h-4 w-4 shrink-0" />Join Waitlist</>}
                                        </button>
                                    </div>
                                    {formError && <p className="text-sm text-red-600">{formError}</p>}
                                </div>
                            </div>
                        ) : (
                            /* ── EMAIL FORM ── */
                            <div className="bg-white h-full">
                                <div className="bg-[#F0EDEE] px-5 py-4 flex items-center gap-3 border-b border-black/[0.08]">
                                    <div className="w-8 h-8 rounded-md bg-[#22c55e]/15 flex items-center justify-center shrink-0">
                                        <Award className="w-4 h-4 text-[#006e16] stroke-2" />
                                    </div>
                                    <span className={cn(labelFont, "font-bold text-[#1b1b1d]")}>Secure your spot</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    {referralCodeFromUrl && (
                                        <div className="bg-[#72ff70]/10 border border-[#006e16]/20 p-3 text-sm text-[#002203] flex items-start gap-2">
                                            <Star className="w-4 h-4 shrink-0 mt-0.5 text-[#006e16]" />
                                            <span><strong>You were referred!</strong> You'll receive priority early access and a free 3-month {stdBadge} plan when you sign up.</span>
                                        </div>
                                    )}
                                    <div>
                                        <Label htmlFor="email-check" className="text-sm font-semibold text-[#1b1b1d] mb-2 block">
                                            Enter your email to get started
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="email-check"
                                                type="email"
                                                placeholder="you@company.com"
                                                value={emailInput}
                                                onChange={(e) => setEmailInput(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                className="h-11 pr-11"
                                            />
                                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                                {checkingStatus
                                                    ? <Loader2 className="w-4 h-4 animate-spin text-[#45474c] mr-2" />
                                                    : <button
                                                        type="button"
                                                        onClick={handleCheckClick}
                                                        disabled={!isValidEmail(emailInput)}
                                                        className="h-8 w-8 flex items-center justify-center bg-[#72ff70] text-[#002203] hover:bg-[#5ce85a] transition-colors disabled:opacity-30 disabled:pointer-events-none rounded-[4px]"
                                                        aria-label="Check status"
                                                    >
                                                        <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                                                    </button>
                                                }
                                            </div>
                                        </div>
                                        {emailCheckError && (
                                            <div className="mt-2 bg-amber-50 border border-amber-200 p-3">
                                                <p className="text-sm text-amber-800">{emailCheckError}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* CTA Band */}
                <section
                    className={cn(
                        "relative mt-20 overflow-hidden p-10 md:mt-28 md:p-16 lg:mt-32 lg:p-20",
                        "bg-[#232c42] border-t border-white/[0.08]",
                    )}
                    aria-labelledby="waitlist-cta-heading"
                >
                    <div className="relative z-10 max-w-2xl">
                        <h2
                            id="waitlist-cta-heading"
                            className={cn(labelFont, "mb-6 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl")}
                        >
                            Still have questions?{" "}
                            <br className="hidden sm:block" />
                            <span className="text-[#72ff70]">Talk to our team.</span>
                        </h2>
                        <p className="mb-10 text-lg leading-relaxed text-[#7c8496] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                            Our team is ready to help you understand how{" "}
                            <BrandName gradient={false} className="inline font-semibold text-[#b4bccf] [font-size:inherit] [line-height:inherit]" />{" "}
                            fits in your workflow. Connect with a specialist today.
                        </p>
                        <LandingHeroPrimaryCtas />
                    </div>
                    <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-[#006e16]/10 blur-[100px]" aria-hidden />
                </section>
            </main>
            <Footer />
        </div>
    )
}
