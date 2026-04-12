"use client"

import Link from "next/link"
import { useCallback } from "react"
import { Mail, Share2 } from "lucide-react"
import Logo from "@/components/Logo"
import { BrandName } from "@/components/brand/BrandName"
import { BRAND_NAME } from "@/config/brand"
import { platformEmail } from "@/config/platform-domain"
import { requestOpenCookieSettings } from "@/lib/cookie-consent-storage"
import {
    BLOG_BASE_PATH,
    CALENDLY_DEMO_URL,
    MARKETING_PAGE_SHELL,
    platformMegaMenuItems,
} from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"

interface FooterProps {
    onOpenModal?: (modalName: string) => void
}

/** Global marketing footer — matches `docs/design/v4/landing-v4.html` (white, kinetic columns). */
export function Footer({ onOpenModal: _onOpenModal }: FooterProps) {
    const infoEmail = platformEmail("info")
    const year = new Date().getFullYear()

    const handleSharePage = useCallback(async () => {
        if (typeof window === "undefined") return
        const url = window.location.href
        const title = document.title?.trim() || BRAND_NAME
        const text = `${BRAND_NAME} — Organize · Protect · Deliver`

        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
            try {
                await navigator.share({ title, text, url })
                return
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return
            }
        }

        try {
            await navigator.clipboard.writeText(url)
        } catch {
            window.prompt("Copy this link:", url)
        }
    }, [])

    const footerMetaText =
        "text-sm leading-snug text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"

    return (
        <footer className="border-t border-[#c6c6cc]/10 bg-white pb-6 pt-8 text-[#1b1b1d]">
            <div className={cn(MARKETING_PAGE_SHELL, "w-full")}>
                <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-12 md:gap-8">
                    <div className="col-span-2 md:col-span-4">
                        <div className="mb-3">
                            <Link
                                href="/"
                                className="inline-flex max-w-full shrink-0"
                            >
                                {/* Same lockup as global `Header` (`Logo` + `BrandName` + default tagline). */}
                                <Logo size="md" showText wordmarkClassName="text-2xl leading-none" />
                            </Link>
                        </div>
                        <p className="max-w-sm leading-relaxed text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif] text-sm">
                            Stop sending raw Drive links. Deliver a professional client portal on the storage you already
                            trust — non-custodial, with revoke-on-close discipline for your IP.
                        </p>
                    </div>

                    <div className="col-span-1 md:col-span-2 md:ml-auto">
                        <h4 className="mb-3 text-sm font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            Platform
                        </h4>
                        <ul className="space-y-2">
                            {platformMegaMenuItems.map((item) => (
                                <li key={item.id}>
                                    <Link
                                        href={item.href}
                                        className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                    >
                                        {item.title}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link
                                    href="/pricing"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Pricing
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div className="col-span-1 md:col-span-2 md:ml-auto">
                        <h4 className="mb-3 text-sm font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            Resources
                        </h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/resources/faq"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    FAQs
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href={BLOG_BASE_PATH}
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Blog
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div className="col-span-1 md:col-span-2 md:ml-auto">
                        <h4 className="mb-3 text-sm font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            Contact
                        </h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/contact"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Get in touch
                                </Link>
                            </li>
                            <li>
                                <a
                                    href={CALENDLY_DEMO_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Book a demo
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div className="col-span-1 md:col-span-2 md:ml-auto">
                        <h4 className="mb-3 text-sm font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            Legal
                        </h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/privacy"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/terms"
                                    className="text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    onClick={() => requestOpenCookieSettings()}
                                    className="text-left text-sm text-[#45474c] transition-colors hover:text-[#22c55e] [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
                                >
                                    Cookie settings
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-[#c6c6cc]/10 pt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5", footerMetaText)}>
                            <span>© {year}</span>
                            <span className="font-semibold text-[#1b1b1d]">
                                <BrandName gradient={false} className="inline text-sm font-semibold text-[#1b1b1d]" />
                                .
                            </span>
                            <span>All rights reserved.</span>
                        </div>
                        <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
                            <button
                                type="button"
                                onClick={() => void handleSharePage()}
                                className={cn(
                                    "group flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#c6c6cc] bg-[#f6f3f4] transition-all hover:border-[#22c55e]",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40 focus-visible:ring-offset-2",
                                )}
                                aria-label="Share this page"
                            >
                                <Share2 className="h-4 w-4 text-[#45474c] group-hover:text-[#22c55e]" aria-hidden />
                            </button>
                            <a
                                href={`mailto:${infoEmail}`}
                                className={cn(
                                    "flex items-center gap-2 text-[#45474c] transition-colors hover:text-[#1b1b1d]",
                                    footerMetaText,
                                )}
                            >
                                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                                <span>{infoEmail}</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    )
}
