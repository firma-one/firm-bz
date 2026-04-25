"use client"

import { useState } from "react"
import { ChevronDown, ArrowRight, LineChart, Lock, CheckCircle, Shield, AlertTriangle, DollarSign, SquareFunction } from "lucide-react"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { MARKETING_PAGE_SHELL, CALENDLY_DEMO_URL } from "@/lib/marketing/target-audience-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BlogSection } from "@/components/landing/blog-section"
import { KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import type { AudienceContent } from "@/lib/marketing/audience-content"
import type { BlogPost } from "@/lib/blog-types"

interface AudienceLandingProps {
  content: AudienceContent
  blogPosts?: BlogPost[]
}

const iconMap = {
  dollar: DollarSign,
  alert: AlertTriangle,
  shield: Shield,
  checkmark: CheckCircle,
}

function StyledTitle({ text }: { text: string }) {
  const colonIdx = text.indexOf(': ')
  if (colonIdx !== -1) {
    return (
      <>
        {text.slice(0, colonIdx)}:{' '}
        <span className="text-[#7c8496]">{text.slice(colonIdx + 2)}</span>
      </>
    )
  }
  const lastSpace = text.lastIndexOf(' ')
  if (lastSpace > 0) {
    return (
      <>
        {text.slice(0, lastSpace)}{' '}
        <span className="text-[#7c8496]">{text.slice(lastSpace + 1)}</span>
      </>
    )
  }
  return <>{text}</>
}

export function AudienceLanding({ content, blogPosts = [] }: AudienceLandingProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  return (
    <>
      <Header />
        {/* Hero */}
        <section className="w-full">
          <div className={cn(MARKETING_PAGE_SHELL, "pb-12 md:pb-16")}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold tracking-widest uppercase text-[#5a78ff] mb-4">
                {content.audienceLabel}
              </p>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#1b1b1d] mb-6 leading-tight">
                {content.heroHeadline}
              </h1>
              <p className="text-xl text-[#45474c] mb-8 leading-relaxed">
                {content.heroSubheading}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href={CALENDLY_DEMO_URL} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="ghost"
                    className="group inline-flex items-center gap-2 rounded bg-[#72ff70] px-8 py-3 text-base font-bold tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95"
                  >
                    {content.ctaText}
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-16 md:py-24 bg-white">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mb-12">
              <KineticSectionIntro
                badge={{
                  variant: "lime",
                  icon: <SquareFunction className="ds-badge-kinetic__icon" aria-hidden />,
                  label: "The Challenge",
                }}
                title={<StyledTitle text={content.problemTitle} />}
                description="Most professionals deliver great work, but clients often don't see the full value of what they've received."
              />
            </div>
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h3 className="text-xl font-bold text-[#1b1b1d] mb-6">What's the real problem?</h3>
                <ul className="space-y-4 text-lg text-[#45474c]">
                  {content.problems.map((problem, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-[#72ff70] font-bold">→</span>
                      <span>{problem}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#f6f3f4] p-8 border border-black/[0.05] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(27,27,29,0.22)]">
                <p className="font-semibold text-[#1b1b1d] mb-4">{content.problemBoxTitle}</p>
                <div className="space-y-3 text-sm text-[#45474c]">
                  {content.problemBoxItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-red-500">✕</span> {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="py-16 md:py-24 bg-[#141c2a]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mb-12">
              <KineticSectionIntro
                badge={{
                  variant: "lime",
                  icon: <SquareFunction className="ds-badge-kinetic__icon" aria-hidden />,
                  label: "How It Works",
                }}
                title="Built for Control & Collaboration"
                titleClassName="text-white"
                description="Three core principles that transform how you deliver and collaborate with clients."
                descriptionClassName="text-lg text-[#bfc6da] max-w-2xl"
              />
            </div>
            <div>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white/5 p-8 border border-white/[0.08] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(114,255,112,0.2)]">
                  <div className="flex items-center gap-3 mb-4">
                    <Lock className="w-6 h-6 text-[#72ff70]" />
                    <h3 className="text-xl font-bold text-white">Your Drive, Your Control</h3>
                  </div>
                  <p className="text-[#bfc6da]">
                    Files stay in YOUR Google Drive. We don't store them. You control who sees what, set expiration dates, revoke access instantly. Full control, zero compromise.
                  </p>
                </div>
                <div className="bg-white/5 p-8 border border-white/[0.08] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(114,255,112,0.2)]">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-6 h-6 text-[#72ff70]" />
                    <h3 className="text-xl font-bold text-white">All Stakeholders, One Platform</h3>
                  </div>
                  <p className="text-[#bfc6da]">
                    No more scattered emails, Drive links, or version confusion. Everyone—team and clients—converges on a single, professional workspace. Organized, unified, white-glove experience.
                  </p>
                </div>
                <div className="bg-white/5 p-8 border border-white/[0.08] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(114,255,112,0.2)]">
                  <div className="flex items-center gap-3 mb-4">
                    <LineChart className="w-6 h-6 text-[#72ff70]" />
                    <h3 className="text-xl font-bold text-white">Branded & Professional</h3>
                  </div>
                  <p className="text-[#bfc6da]">
                    Your logo, your colors, your domain. Clients see YOUR premium workspace, not a generic folder. Same work, completely different perception.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Business Impact */}
        <section className="py-16 md:py-24 bg-[#f6f3f4]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mb-12">
              <KineticSectionIntro
                badge={{
                  variant: "lime",
                  icon: <SquareFunction className="ds-badge-kinetic__icon" aria-hidden />,
                  label: "The Impact",
                }}
                title={<StyledTitle text={content.businessImpactTitle} />}
                description="Real benefits that compound over time as you transform how clients perceive your work."
              />
            </div>
            <div className="space-y-6">
                {content.businessImpacts.map((impact, idx) => {
                  const Icon = iconMap[impact.icon]
                  return (
                    <div key={idx} className="flex gap-4">
                      <Icon className="w-6 h-6 text-[#72ff70] flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-bold text-[#1b1b1d] mb-2">{impact.title}</h3>
                        <p className="text-[#45474c]">{impact.description}</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </section>

        {/* Perception Shift */}
        <section className="py-16 md:py-24 bg-[#f6f3f4]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mb-12">
              <KineticSectionIntro
                badge={{
                  variant: "lime",
                  icon: <SquareFunction className="ds-badge-kinetic__icon" aria-hidden />,
                  label: "The Shift",
                }}
                title={<StyledTitle text={content.perceptionShiftTitle} />}
                description={
                  <div className="space-y-4">
                    <p>See how Firma changes the perception of your work from invisible to invaluable.</p>
                    <p className="font-medium">{content.perceptionShiftCta}</p>
                  </div>
                }
                descriptionClassName=""
              />
            </div>
            <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="bg-white p-8 border border-black/[0.05] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(27,27,29,0.22)]">
                  <div className="mb-4">
                    <span className="inline-block bg-red-50 text-red-700 px-3 py-1 rounded-none text-[10px] font-bold uppercase tracking-widest border border-red-200 mb-4">
                      Without Firma
                    </span>
                  </div>
                  <ul className="space-y-3 text-[#45474c]">
                    {content.perceptionShiftWithout.map((item, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="text-red-600 font-bold shrink-0">✕</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white p-8 border border-black/[0.05] rounded-none transition-shadow duration-200 hover:shadow-[0_14px_32px_-10px_rgba(27,27,29,0.22)]">
                  <div className="mb-4">
                    <span className="inline-block bg-[#72ff70]/20 text-[#006e16] px-3 py-1 rounded-none text-[10px] font-bold uppercase tracking-widest border border-[#72ff70]/50 mb-4">
                      With Firma
                    </span>
                  </div>
                  <ul className="space-y-3 text-[#45474c]">
                    {content.perceptionShiftWith.map((item, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
          </div>
        </section>

        {/* Blog Section */}
        <BlogSection posts={blogPosts} audienceLabel={content.audienceLabel} />

        {/* FAQ */}
        <section className="py-16 md:py-24 bg-[#f6f3f4]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mb-12">
              <KineticSectionIntro
                badge={{
                  variant: "lime",
                  icon: <SquareFunction className="ds-badge-kinetic__icon" aria-hidden />,
                  label: "FAQ",
                }}
                title="Frequently Asked Questions"
              />
            </div>
            <div className="space-y-4">
                {content.faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className="border border-[#c6c6cc]/30 bg-white"
                  >
                    <button
                      onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                      className="w-full px-6 py-4 text-left font-semibold text-[#1b1b1d] hover:bg-[#f6f3f4] transition-colors flex items-center justify-between"
                    >
                      {faq.q}
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-[#45474c] transition-transform",
                          openFaqIndex === idx ? "rotate-180" : ""
                        )}
                      />
                    </button>
                    {openFaqIndex === idx && (
                      <div className="px-6 py-4 border-t border-[#c6c6cc]/30 text-[#45474c] leading-relaxed">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
        </section>
      <Footer />
    </>
  )
}
