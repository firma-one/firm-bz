"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Logo from "@/components/Logo"
import { BrandName } from "@/components/brand/BrandName"
import {
    Menu,
    X,
    ChevronDown,
    Mail,
    DollarSign,
    FileText,
    HelpCircle,
    ExternalLink,
    CalendarClock,
    ArrowRight,
    LogIn,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
    BLOG_BASE_PATH,
    CALENDLY_DEMO_URL,
    contactMegaMenuItems,
    platformMegaMenuItems,
} from "@/lib/marketing/target-audience-nav"

interface HeaderProps {
    onOpenModal?: (modalName: string) => void
}

type MobileNavSection = "platform" | "contact" | "main" | "resources"

const labelFont = "[font-family:var(--font-header-label),system-ui,sans-serif]"

const mobileSectionTriggerClass = cn(
    labelFont,
    "flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50",
)

/** Black primary CTA — Sign in (header + mobile menu). */
const headerSignInCtaClass = cn(
    labelFont,
    "inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-[#141c2a] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_1px_0_rgba(2,6,23,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 sm:px-6",
)

/** Lime primary CTA — Get started (header + mobile menu). */
const headerGetStartedCtaClass = cn(
    labelFont,
    "group inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-[#72ff70] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 sm:px-6",
)

/** Shared desktop mega-menu (Platform + Contact + Resources): panel, stack, row hover. */
const megaMenuDropdownClass =
    "invisible absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-left translate-y-1 rounded-2xl border border-slate-200/60 bg-white p-2 opacity-0 shadow-xl shadow-slate-900/5 backdrop-blur-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"

const megaMenuStackClass = "flex flex-col divide-y divide-slate-100 overflow-hidden rounded-xl"

const megaMenuLinkClass =
    "group/item block px-3 py-3 transition-colors duration-200 first:pt-2.5 last:pb-2.5 hover:bg-slate-50"

const megaMenuTitleClass = cn(
    labelFont,
    "text-xs font-medium uppercase tracking-widest text-slate-700 transition-colors duration-200 group-hover/item:text-emerald-700",
)

const megaMenuDescClass =
    "mt-1.5 text-[11px] font-normal leading-snug text-slate-500 transition-colors duration-200 normal-case group-hover/item:text-slate-600"

/** design1: flush `top-0` bar; main content needs ~`pt-24 lg:pt-28` (see PublicPageLayout, pricing, landing hero). */
export function Header({ onOpenModal: _onOpenModal }: HeaderProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [mobileOpenSection, setMobileOpenSection] = useState<MobileNavSection | null>(null)
    const pathname = usePathname()

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false)
        setMobileOpenSection(null)
    }

    const toggleMobileSection = (id: MobileNavSection) => {
        setMobileOpenSection((cur) => (cur === id ? null : id))
    }

    const isActive = (path: string) => {
        if (path === "/" && pathname === "/") return true
        if (path !== "/" && pathname?.startsWith(path)) return true
        return false
    }

    /** Shared shell: fixed height + pseudo underline prevents baseline drift between items with/without chevrons. */
    const navItemShell =
        "relative inline-flex h-9 items-center gap-1.5 leading-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:origin-left after:bg-emerald-500 after:transition-transform after:duration-200"

    const navLabelClass = (active: boolean) =>
        cn(
            navItemShell,
            "text-xs font-medium uppercase tracking-widest transition-colors duration-200",
            labelFont,
            active
                ? "text-emerald-500 after:scale-x-100"
                : "text-slate-600 after:scale-x-0 hover:text-emerald-500 hover:after:scale-x-100 group-hover:text-emerald-500 group-hover:after:scale-x-100",
        )

    return (
        <>
            {isMobileMenuOpen ? (
                <button
                    type="button"
                    className="fixed inset-x-0 bottom-0 top-24 z-40 bg-slate-900/30 backdrop-blur-md md:hidden"
                    aria-label="Dismiss menu"
                    onClick={closeMobileMenu}
                />
            ) : null}
            <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-slate-200/60 bg-white/70 backdrop-blur-md">
            <div className="relative mx-auto flex w-full max-w-[min(100%,92rem)] items-center justify-between gap-4 px-3 py-4 sm:px-4 md:px-5 lg:px-6 xl:px-10">
                <div className="flex min-w-0 flex-1 items-center">
                    <Link
                        href="/"
                        className="shrink-0"
                        onClick={closeMobileMenu}
                    >
                        <Logo size="md" showText wordmarkClassName="text-2xl leading-none" />
                    </Link>

                    <nav
                        className="hidden md:absolute md:left-1/2 md:flex md:-translate-x-1/2 md:items-center md:gap-6 lg:gap-8"
                        aria-label="Primary"
                    >
                        <div className="relative group">
                            <button
                                type="button"
                                className={cn(
                                    navLabelClass(false),
                                    "m-0 cursor-pointer bg-transparent p-0 text-left outline-none ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                                )}
                            >
                                <span className="whitespace-nowrap">Platform</span>
                                <ChevronDown
                                    className="h-3.5 w-3.5 shrink-0 text-current opacity-70 transition-transform duration-200 group-hover:rotate-180"
                                    aria-hidden
                                />
                            </button>
                            <div className={megaMenuDropdownClass}>
                                <div className={megaMenuStackClass}>
                                    {platformMegaMenuItems.map((item) => (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            className={megaMenuLinkClass}
                                        >
                                            <div className={megaMenuTitleClass}>{item.title}</div>
                                            <div className={megaMenuDescClass}>{item.description}</div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="relative group">
                            <button
                                type="button"
                                className={cn(
                                    navLabelClass(pathname === "/contact"),
                                    "m-0 cursor-pointer bg-transparent p-0 text-left outline-none ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                                )}
                            >
                                <span className="whitespace-nowrap">Contact</span>
                                <ChevronDown
                                    className="h-3.5 w-3.5 shrink-0 text-current opacity-70 transition-transform duration-200 group-hover:rotate-180"
                                    aria-hidden
                                />
                            </button>
                            <div className={megaMenuDropdownClass}>
                                <div className={megaMenuStackClass}>
                                    {contactMegaMenuItems.map((item) =>
                                        item.external ? (
                                            <a
                                                key={item.id}
                                                href={item.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={megaMenuLinkClass}
                                                aria-label={`${item.title} (opens Calendly in a new tab)`}
                                            >
                                                <div className={megaMenuTitleClass}>{item.title}</div>
                                                <div className={megaMenuDescClass}>{item.description}</div>
                                            </a>
                                        ) : (
                                            <Link key={item.id} href={item.href} className={megaMenuLinkClass}>
                                                <div className={megaMenuTitleClass}>{item.title}</div>
                                                <div className={megaMenuDescClass}>{item.description}</div>
                                            </Link>
                                        ),
                                    )}
                                </div>
                            </div>
                        </div>

                        <Link href="/pricing" className={navLabelClass(isActive("/pricing"))}>
                            Pricing
                        </Link>

                        <div className="relative group">
                            <button
                                type="button"
                                className={cn(
                                    navLabelClass(
                                        Boolean(
                                            pathname?.startsWith(BLOG_BASE_PATH) ||
                                                pathname?.startsWith("/resources/faq"),
                                        ),
                                    ),
                                    "m-0 cursor-pointer bg-transparent p-0 text-left outline-none ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                                )}
                            >
                                <span className="whitespace-nowrap">Resources</span>
                                <ChevronDown
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0 text-current opacity-70 transition-transform duration-200 group-hover:rotate-180",
                                        (pathname?.startsWith(BLOG_BASE_PATH) ||
                                            pathname?.startsWith("/resources/faq")) &&
                                            "opacity-100",
                                    )}
                                    aria-hidden
                                />
                            </button>
                            <div className={megaMenuDropdownClass}>
                                <div className={megaMenuStackClass}>
                                    <Link href="/resources/faq" className={megaMenuLinkClass}>
                                        <div className={megaMenuTitleClass}>FAQs</div>
                                        <div className={megaMenuDescClass}>
                                            Common questions and answers about <BrandName className="text-[11px] font-medium" />.
                                        </div>
                                    </Link>
                                    <Link href={BLOG_BASE_PATH} className={megaMenuLinkClass}>
                                        <div className={megaMenuTitleClass}>Blog</div>
                                        <div className={megaMenuDescClass}>
                                            Insights, guides, and best practices for client portals.
                                        </div>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </nav>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:gap-4 md:gap-6">
                    <Link href="/signin" className={cn(headerSignInCtaClass, "hidden md:inline-flex")}>
                        <LogIn className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                        Sign in
                    </Link>

                    <Link href="/signup" className={cn(headerGetStartedCtaClass, "hidden md:inline-flex")}>
                        Get started
                        <ArrowRight
                            className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                            strokeWidth={2.5}
                            aria-hidden
                        />
                    </Link>

                    <button
                        type="button"
                        className="p-2 text-slate-600 transition-colors hover:bg-slate-100/80 md:hidden"
                        onClick={() => {
                            setMobileOpenSection(null)
                            setIsMobileMenuOpen((o) => !o)
                        }}
                        aria-expanded={isMobileMenuOpen}
                        aria-controls="site-header-mobile-panel"
                        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                    >
                        {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </div>

            {isMobileMenuOpen && (
                <div
                    id="site-header-mobile-panel"
                    className="relative z-[45] border-t border-slate-200/60 bg-white/95 px-4 py-4 backdrop-blur-md md:hidden"
                >
                    <div className="mb-4 flex flex-col gap-2">
                        <Link href="/signin" onClick={closeMobileMenu} className={cn(headerSignInCtaClass, "w-full justify-center")}>
                            <LogIn className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                            Sign in
                        </Link>
                        <Link href="/signup" onClick={closeMobileMenu} className={cn(headerGetStartedCtaClass, "w-full justify-center")}>
                            Get started
                            <ArrowRight
                                className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                strokeWidth={2.5}
                                aria-hidden
                            />
                        </Link>
                    </div>

                    <div className="mb-2 space-y-2">
                        <button
                            type="button"
                            className={mobileSectionTriggerClass}
                            aria-expanded={mobileOpenSection === "platform"}
                            onClick={() => toggleMobileSection("platform")}
                        >
                            Platform
                            <ChevronDown
                                className={cn(
                                    "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                                    mobileOpenSection === "platform" && "rotate-180",
                                )}
                                aria-hidden
                            />
                        </button>
                        {mobileOpenSection === "platform" ? (
                            <div
                                className={cn(
                                    megaMenuStackClass,
                                    "rounded-lg border border-slate-100 bg-white",
                                )}
                            >
                                {platformMegaMenuItems.map((item) => (
                                    <Link
                                        key={item.id}
                                        href={item.href}
                                        className={cn(megaMenuLinkClass, "active:bg-slate-100")}
                                        onClick={closeMobileMenu}
                                    >
                                        <div className={megaMenuTitleClass}>{item.title}</div>
                                        <div className={megaMenuDescClass}>{item.description}</div>
                                    </Link>
                                ))}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className={mobileSectionTriggerClass}
                            aria-expanded={mobileOpenSection === "contact"}
                            onClick={() => toggleMobileSection("contact")}
                        >
                            Contact
                            <ChevronDown
                                className={cn(
                                    "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                                    mobileOpenSection === "contact" && "rotate-180",
                                )}
                                aria-hidden
                            />
                        </button>
                        {mobileOpenSection === "contact" ? (
                            <div className={cn(megaMenuStackClass, "overflow-hidden rounded-lg border border-slate-100 bg-white")}>
                                <Link
                                    href="/contact"
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-3 transition-colors first:pt-2.5 last:pb-2.5 hover:bg-slate-50 active:bg-slate-100",
                                        pathname === "/contact" ? "bg-slate-100" : "",
                                    )}
                                    onClick={closeMobileMenu}
                                >
                                    <Mail
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            pathname === "/contact" ? "text-slate-900" : "text-slate-700",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "text-sm",
                                            pathname === "/contact"
                                                ? "font-semibold text-slate-900"
                                                : "font-medium text-slate-900",
                                        )}
                                    >
                                        Get in touch
                                    </span>
                                </Link>
                                <a
                                    href={CALENDLY_DEMO_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 px-3 py-3 transition-colors first:pt-2.5 last:pb-2.5 hover:bg-slate-50 active:bg-slate-100"
                                    aria-label="Book a demo (opens Calendly in a new tab)"
                                    onClick={closeMobileMenu}
                                >
                                    <CalendarClock className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
                                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-slate-900">
                                        Book a demo
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                    </span>
                                </a>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className={mobileSectionTriggerClass}
                            aria-expanded={mobileOpenSection === "main"}
                            onClick={() => toggleMobileSection("main")}
                        >
                            Main
                            <ChevronDown
                                className={cn(
                                    "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                                    mobileOpenSection === "main" && "rotate-180",
                                )}
                                aria-hidden
                            />
                        </button>
                        {mobileOpenSection === "main" ? (
                            <div className={cn(megaMenuStackClass, "overflow-hidden rounded-lg border border-slate-100 bg-white")}>
                                <Link
                                    href="/pricing"
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-3 transition-colors first:pt-2.5 last:pb-2.5 hover:bg-slate-50 active:bg-slate-100",
                                        pathname === "/pricing" ? "bg-slate-100" : "",
                                    )}
                                    onClick={closeMobileMenu}
                                >
                                    <DollarSign
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            pathname === "/pricing" ? "text-slate-900" : "text-slate-700",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "text-sm",
                                            pathname === "/pricing"
                                                ? "font-semibold text-slate-900"
                                                : "font-medium text-slate-900",
                                        )}
                                    >
                                        Pricing
                                    </span>
                                </Link>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className={mobileSectionTriggerClass}
                            aria-expanded={mobileOpenSection === "resources"}
                            onClick={() => toggleMobileSection("resources")}
                        >
                            Resources
                            <ChevronDown
                                className={cn(
                                    "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                                    mobileOpenSection === "resources" && "rotate-180",
                                )}
                                aria-hidden
                            />
                        </button>
                        {mobileOpenSection === "resources" ? (
                            <div className={cn(megaMenuStackClass, "overflow-hidden rounded-lg border border-slate-100 bg-white")}>
                                <Link
                                    href="/resources/faq"
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-3 transition-colors first:pt-2.5 last:pb-2.5 hover:bg-slate-50 active:bg-slate-100",
                                        pathname === "/resources/faq" ? "bg-slate-100" : "",
                                    )}
                                    onClick={closeMobileMenu}
                                >
                                    <HelpCircle
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            pathname === "/resources/faq" ? "text-slate-900" : "text-slate-700",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "text-sm",
                                            pathname === "/resources/faq"
                                                ? "font-semibold text-slate-900"
                                                : "font-medium text-slate-900",
                                        )}
                                    >
                                        FAQs
                                    </span>
                                </Link>
                                <Link
                                    href={BLOG_BASE_PATH}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-3 transition-colors first:pt-2.5 last:pb-2.5 hover:bg-slate-50 active:bg-slate-100",
                                        pathname?.startsWith(BLOG_BASE_PATH) ? "bg-slate-100" : "",
                                    )}
                                    onClick={closeMobileMenu}
                                >
                                    <FileText
                                        className={cn(
                                            "h-4 w-4 shrink-0",
                                            pathname?.startsWith(BLOG_BASE_PATH) ? "text-slate-900" : "text-slate-700",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "text-sm",
                                            pathname?.startsWith(BLOG_BASE_PATH)
                                                ? "font-semibold text-slate-900"
                                                : "font-medium text-slate-900",
                                        )}
                                    >
                                        Blog
                                    </span>
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </header>
        </>
    )
}
