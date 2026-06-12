"use client"

import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { HelpCircle } from "lucide-react"
import { BrandName } from "@/components/brand/BrandName"
import { MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { MarketingBreadcrumb } from "@/components/marketing/marketing-breadcrumb"
import { LandingHeroPrimaryCtas } from "@/components/marketing/landing-hero-primary-ctas"
import {
    KineticSectionIntro,
    kineticSectionLeadClassName,
} from "@/components/kinetic/kinetic-section-intro"
import { cn } from "@/lib/utils"
import { FaqGrid } from "@/components/faq/FaqGrid"

const labelFont = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

/** Electric blue — matches contact / privacy intros (`KINETIC_COLORS.onTertiaryContainer`). */
const kineticIntroBlue = "text-[#5a78ff]"

/**
 * FAQ bottom CTA band: slightly above `primaryContainer` (#141c2a) so the navy "Book a Demo" pill
 * doesn’t disappear into the section background.
 */
const faqCtaBandBg = "bg-[#232c42]"

export default function FAQPage() {
    return (
        <div className="relative flex min-h-screen flex-col">
            <Header />

            <main className={cn(MARKETING_PAGE_SHELL, "relative z-10 w-full flex-1 pb-16 md:pb-24")}>
                <MarketingBreadcrumb
                    items={[
                        // No href until a resources hub exists; avoids sending users to stale /resources/docs.
                        { label: "Resources" },
                        { label: "Frequently Asked Questions" },
                    ]}
                    className="mb-8"
                />

                <header className="mb-10 md:mb-12">
                    <KineticSectionIntro
                        compact
                        heading="h1"
                        titleScale="hero"
                        badge={{
                            variant: "lime",
                            icon: <HelpCircle className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
                            label: "Help // FAQs",
                        }}
                        title={
                            <>
                                <span className="text-[#1b1b1d]">Frequently Asked</span>{" "}
                                <span className={kineticIntroBlue}>Questions</span>
                            </>
                        }
                        description={
                            <p className={cn(kineticSectionLeadClassName, "max-w-2xl")}>
                                Everything you need to know about{" "}
                                <BrandName
                                    className="inline [font-size:inherit] [line-height:inherit]"
                                    gradient
                                />
                                &apos;s features, security, and Storage Drive integration.
                            </p>
                        }
                        descriptionClassName=""
                    />
                </header>

                <FaqGrid />

                {/* CTA — `docs/design/v4/faq/code.html` */}
                <section
                    className={cn(
                        "relative mt-20 overflow-hidden rounded-none p-10 md:mt-28 md:p-16 lg:mt-32 lg:p-20",
                        faqCtaBandBg,
                        "border-t border-white/[0.08]",
                    )}
                    aria-labelledby="faq-cta-heading"
                >
                    <div className="relative z-10 max-w-2xl">
                        <h2
                            id="faq-cta-heading"
                            className={cn(
                                labelFont,
                                "mb-6 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl",
                            )}
                        >
                            Still have questions?{" "}
                            <br className="hidden sm:block" />
                            <span className="text-[#72ff70]">Talk to our team.</span>
                        </h2>
                        <p
                            className={cn(
                                "mb-10 text-lg leading-relaxed text-[#7c8496] [font-family:var(--font-kinetic-body),system-ui,sans-serif]",
                            )}
                        >
                            Our team is ready to help you understand how{" "}
                            <BrandName
                                gradient={false}
                                className="inline font-semibold text-[#b4bccf] [font-size:inherit] [line-height:inherit]"
                            />{" "}
                            fits in your workflow. Connect with a specialist today.
                        </p>
                        <LandingHeroPrimaryCtas />
                    </div>
                    <div
                        className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-[#006e16]/10 blur-[100px]"
                        aria-hidden
                    />
                </section>
            </main>

            <Footer />
        </div>
    )
}
