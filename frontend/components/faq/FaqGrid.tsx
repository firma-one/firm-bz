"use client"

import { Fragment, useState } from "react"
import { HelpCircle, Lock, CreditCard, Layers, CircleHelp, Megaphone, type LucideIcon } from "lucide-react"
import { FAQ_DATA } from "@/data/faq-data"
import { BRAND_NAME } from "@/config/brand"
import { BrandName } from "@/components/brand/BrandName"
import { BillingPolarExplainInline } from "@/components/billing/billing-polar-inline"
import { cn } from "@/lib/utils"

const labelFont = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"

const faqCardShellFeatured =
    "overflow-x-hidden overflow-y-visible rounded-none border border-[#c6c6cc]/30 bg-white shadow-sm transition-shadow duration-500 hover:shadow-xl"

const faqCardShellCompact =
    "overflow-x-hidden overflow-y-visible rounded-none border border-[#c6c6cc]/30 bg-[#f9f9fb] shadow-sm transition-shadow duration-500 hover:shadow-md"

function faqCardLayout(index: number): "featured" | "compact" {
    const m = index % 6
    return m === 0 || m === 3 ? "featured" : "compact"
}

function categoryAccentIcon(category: string): LucideIcon {
    switch (category) {
        case "Security":
            return Lock
        case "Billing":
            return CreditCard
        case "Features":
            return Layers
        case "Marketing":
            return Megaphone
        default:
            return CircleHelp
    }
}

function FaqQuestionTitle({ text, featured }: { text: string; featured: boolean }) {
    const parts = text.split(BRAND_NAME)
    const sizeClass = featured ? "text-2xl" : "text-xl"
    return (
        <h3
            className={cn(
                labelFont,
                "mb-4 font-bold leading-snug text-neutral-950 transition-colors group-hover:text-[#006e16]",
                sizeClass,
            )}
        >
            {parts.map((part, i) => (
                <Fragment key={i}>
                    {part}
                    {i < parts.length - 1 ? (
                        <BrandName className={cn("font-bold", sizeClass)} />
                    ) : null}
                </Fragment>
            ))}
        </h3>
    )
}

const POLAR_LINK_PLACEHOLDER = "[[POLAR_LINK]]"

function FaqAnswer({ html, plainText, featured }: { html?: string; plainText: string; featured: boolean }) {
    const source = html || plainText
    const className = cn(
        "prose prose-p:my-1 prose-strong:font-semibold prose-strong:text-neutral-950 leading-relaxed text-[#45474c]",
        featured ? "max-w-3xl text-lg" : "text-base",
    )

    if (!source.includes(POLAR_LINK_PLACEHOLDER)) {
        return <div className={className} dangerouslySetInnerHTML={{ __html: source }} />
    }

    const parts = source.split(POLAR_LINK_PLACEHOLDER)
    return (
        <div className={className}>
            {parts.map((part, i) => (
                <Fragment key={i}>
                    <span dangerouslySetInnerHTML={{ __html: part }} />
                    {i < parts.length - 1 && <BillingPolarExplainInline className="mx-0.5" />}
                </Fragment>
            ))}
        </div>
    )
}

interface FaqGridProps {
    /** Pre-selected filter on mount. Defaults to "All". */
    defaultFilter?: string
    className?: string
}

export function FaqGrid({ defaultFilter = "All", className }: FaqGridProps) {
    const [activeFilter, setActiveFilter] = useState(defaultFilter)
    const categories = ["All", ...Array.from(new Set(FAQ_DATA.map((f) => f.category || "General")))]

    const filteredFAQs =
        activeFilter === "All" ? FAQ_DATA : FAQ_DATA.filter((f) => (f.category || "General") === activeFilter)

    return (
        <section
            className={cn("animate-in fade-in slide-in-from-bottom-4 duration-500", className)}
            aria-label="Frequently asked questions"
        >
            <div className="mb-8 flex flex-wrap gap-3 md:mb-10">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveFilter(cat)}
                        className={cn(
                            labelFont,
                            "rounded-none px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors active:scale-[0.98]",
                            activeFilter === cat
                                ? "border border-[#006e16]/20 bg-[#72ff70] text-[#002203]"
                                : "border border-[#c6c6cc]/30 bg-white text-[#45474c] hover:border-[#c6c6cc]/50 hover:bg-[#f6f3f4]",
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-y-10 md:grid-cols-12 md:gap-x-10 md:gap-y-12 lg:gap-x-12">
                {filteredFAQs.map((faq, idx) => {
                    const layout = faqCardLayout(idx)
                    const featured = layout === "featured"
                    const cat = faq.category || "General"
                    const Icon = categoryAccentIcon(cat)

                    return (
                        <div
                            key={`${cat}-${faq.question}`}
                            className={cn(
                                "group",
                                featured ? "md:col-span-12 lg:col-span-10" : "md:col-span-6 lg:col-span-5",
                            )}
                        >
                            <div
                                className={cn(
                                    "h-full p-8",
                                    featured ? faqCardShellFeatured : faqCardShellCompact,
                                )}
                            >
                                <div
                                    className={cn(
                                        "mb-4",
                                        featured && "flex items-start justify-between gap-4",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            labelFont,
                                            "inline-block rounded-none border border-[#c6c6cc]/40 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                            featured ? "text-[#3f4757]" : "text-[#45474c]",
                                        )}
                                    >
                                        {cat}
                                    </span>
                                    {featured ? (
                                        <Icon
                                            className="h-6 w-6 shrink-0 text-[#72ff70]"
                                            strokeWidth={1.75}
                                            aria-hidden
                                        />
                                    ) : null}
                                </div>
                                <FaqQuestionTitle text={faq.question} featured={featured} />
                                <FaqAnswer html={faq.displayAnswer} plainText={faq.answer} featured={featured} />
                            </div>
                        </div>
                    )
                })}
            </div>

            {filteredFAQs.length === 0 ? (
                <div className="mt-10 rounded-none border border-dashed border-[#c6c6cc]/40 bg-[#f9f9fb] py-16 text-center shadow-sm md:mt-12">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#45474c]/50">
                        <HelpCircle className="h-8 w-8" aria-hidden />
                    </div>
                    <h3 className={cn(labelFont, "text-lg font-bold text-neutral-950")}>No questions found</h3>
                    <p className="mt-1 text-[#45474c]">Try selecting a different topic.</p>
                </div>
            ) : null}
        </section>
    )
}
