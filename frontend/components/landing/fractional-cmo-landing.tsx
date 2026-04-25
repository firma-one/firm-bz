"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ArrowRight, LineChart, Lock, CheckCircle, Shield, AlertTriangle, DollarSign } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { MARKETING_PAGE_SHELL, CALENDLY_DEMO_URL } from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"
import { BRAND_NAME } from "@/config/brand"

const cmoFaqs = [
  {
    q: "How does Firma help fractional CMOs stand out?",
    a: "Most fractional CMOs deliver via email or Drive links. Clients see scattered, disorganized handoffs. Firma gives you a branded, professional portal where clients experience your work as premium and intentional. The same strategy, better perceived. That perception shift is worth $2-3K per client per year.",
  },
  {
    q: "What exactly do clients see?",
    a: "A clean, branded workspace with your firm's logo and colors. Your Drive folders appear organized and professional. Clients access strategy docs, deliverables, and engagement materials from a single, branded destination instead of hunting email attachments. It feels premium.",
  },
  {
    q: "How does this help me raise rates or win more retainers?",
    a: "Clients perceive premium delivery when work is organized and presented professionally. A branded portal makes you look like a high-end agency, not a freelancer. Clients who can visualize your work are 3x more likely to renew retainers and 2x less likely to push back on price.",
  },
  {
    q: "Do clients need a login?",
    a: "Yes, but onboarding is frictionless. You send them an invite email link. They click it, use an OTP based signup & subsequent signin. Takes less than 1 minute.",
  },
  {
    q: "Is it really white-labeled?",
    a: "Completely. Your brand, your colors, your domain. Clients see your firm name and logo. Firma stays in the background. Feels like a proprietary tool built just for them.",
  },
  {
    q: "What about my files—are they secure?",
    a: "Your files stay in YOUR Google Drive. We don't store or copy them. You control access: decide who sees what, set expiration dates, revoke instantly. You get an audit trail showing every time a client opens something. Full control, full transparency.",
  },
  {
    q: "Can I lock down sensitive frameworks?",
    a: "Yes. Tag internal-only docs and frameworks so they never accidentally get shared. Set expiration dates on sensitive materials. When an engagement ends, one click makes the portal view-only—clean handoff with no awkward 'access denied' messages.",
  },
  {
    q: "How much time does this save per month?",
    a: "You eliminate: email status update threads, 'where's my report?' messages, PDF versioning confusion, and redundant explanation calls. Conservative estimate: 4-6 hours per month per client. For a CMO managing 5-8 clients, that's 20-48 hours monthly recovered.",
  },
  {
    q: "What's the real business impact?",
    a: "Conservative ROI math: If this helps you win 1 extra retainer client per year (worth $12-24K) or reduces churn by 1 client, ROI is immediate. Most CMOs see both. Plus, clients perceive your work as worth more, so you can raise rates.",
  },
  {
    q: "How is this different from just using Drive or email?",
    a: "Drive links look amateur. Email attachments scatter. Firma creates a unified, branded experience that says 'I'm a premium consultant, not a freelancer.' Same work, completely different perception. That's the entire point.",
  },
]

export function FractionalCMOLanding() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  return (
    <>
      <Header />
      <main className="overflow-hidden bg-white">
        {/* Hero */}
        <section className="pt-24 pb-12 md:pt-28 md:pb-16 bg-gradient-to-b from-[#f6f3f4] to-white">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold tracking-widest uppercase text-[#5a78ff] mb-4">
                For Fractional CMOs
              </p>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-[#1b1b1d] mb-6 leading-tight">
                If your work is not visible, it is undervalued
              </h1>
              <p className="text-xl text-[#45474c] mb-8 leading-relaxed">
                Stop sending Drive links and PDFs. Show clients the value of your work with a professional portal. Transform how they perceive your strategy. Justify retainers. Land more clients.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href={CALENDLY_DEMO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#72ff70] text-[#002203] font-semibold rounded-none hover:bg-[#60dd5e] transition-colors"
                >
                  See How Top CMOs Present Their Work
                  <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-16 md:py-24 border-t border-[#c6c6cc]/20">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-4xl mx-auto">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-[#1b1b1d] mb-6">
                  The Problem: Great Work, Invisible Value
                </h2>
                <ul className="space-y-4 text-lg text-[#45474c]">
                  <li className="flex gap-3">
                    <span className="text-[#72ff70] font-bold">→</span>
                    <span>Clients get a PDF email. They skim it. They don't remember it.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[#72ff70] font-bold">→</span>
                    <span>Strategy docs disappear in Drive folders. Clients forget what they paid for.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[#72ff70] font-bold">→</span>
                    <span>No narrative. No structure. Just files. You look like a contractor, not a strategic partner.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-[#72ff70] font-bold">→</span>
                    <span>Retainer justification is hard. "What did I get for my money?" they ask.</span>
                  </li>
                </ul>
              </div>
              <div className="bg-[#f6f3f4] p-8 rounded-lg">
                <p className="font-semibold text-[#1b1b1d] mb-4">What Most CMOs Do:</p>
                <div className="space-y-3 text-sm text-[#45474c]">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">✕</span> Email: "Here's your monthly report..."
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">✕</span> Drive link (clients lose it)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">✕</span> Hopes they read it
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">✕</span> Gets pushback on price
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="py-16 md:py-24 bg-[#141c2a]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 text-center">
                How It Works
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white/5 p-8 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Lock className="w-6 h-6 text-[#72ff70]" />
                    <h3 className="text-xl font-bold text-white">Your Drive, Your Control</h3>
                  </div>
                  <p className="text-[#bfc6da]">
                    Files stay in YOUR Google Drive. We don't store them. You control who sees what, set expiration dates, revoke access instantly. Full control, zero compromise.
                  </p>
                </div>
                <div className="bg-white/5 p-8 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-6 h-6 text-[#72ff70]" />
                    <h3 className="text-xl font-bold text-white">All Stakeholders, One Platform</h3>
                  </div>
                  <p className="text-[#bfc6da]">
                    No more scattered emails, Drive links, or version confusion. Everyone—team and clients—converges on a single, professional workspace. Organized, unified, white-glove experience.
                  </p>
                </div>
                <div className="bg-white/5 p-8 rounded-lg border border-white/10">
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

        {/* Why It Works */}
        <section className="py-16 md:py-24">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-[#1b1b1d] mb-8">The Business Impact</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <DollarSign className="w-6 h-6 text-[#72ff70] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-[#1b1b1d] mb-2">Higher Retainer Renewal Rates</h3>
                    <p className="text-[#45474c]">
                      Clients who see organized, professional delivery renew 3x more often. You lose fewer clients to perceived low value. That's 1-2 extra retainers per year, worth $12-24K.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <AlertTriangle className="w-6 h-6 text-[#72ff70] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-[#1b1b1d] mb-2">Protection from Brand Damage</h3>
                    <p className="text-[#45474c]">
                      Stop sending messy Drive links and email attachments that scream "amateur." A professional portal fixes the perception problem instantly. Protects the premium brand you've built.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Shield className="w-6 h-6 text-[#72ff70] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-[#1b1b1d] mb-2">Control Your IP & Engagement Lifecycle</h3>
                    <p className="text-[#45474c]">
                      Lock down frameworks, tag internal-only docs, set expiration dates. When engagements end, one click makes everything view-only. Your IP is protected, engagements wrap cleanly.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <CheckCircle className="w-6 h-6 text-[#72ff70] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-[#1b1b1d] mb-2">20-40 Hours Freed Per Month</h3>
                    <p className="text-[#45474c]">
                      Eliminate email threads, version confusion, repetitive explanation calls. A CMO managing 5-8 clients recovers nearly a full work day per month.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Chaos vs Calm */}
        <section className="py-16 md:py-24 bg-white border-t border-[#c6c6cc]/20">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-[#1b1b1d] mb-12 text-center">
                The Perception Shift
              </h2>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="bg-white p-8 rounded-lg border border-black/[0.06] shadow-sm">
                  <div className="mb-4">
                    <span className="inline-block bg-red-600 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded mb-4">
                      Without Firma
                    </span>
                  </div>
                  <ul className="space-y-3 text-[#45474c]">
                    <li className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">✕</span>
                      <span>Email: "Here's your strategy..."</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">✕</span>
                      <span>Drive link (they lose it immediately)</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">✕</span>
                      <span>Scattered attachments across email</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">✕</span>
                      <span>No narrative, just files</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-red-600 font-bold shrink-0">✕</span>
                      <span>Looks disorganized, amateur</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-white p-8 rounded-lg border border-black/[0.06] shadow-sm">
                  <div className="mb-4">
                    <span className="inline-block bg-[#72ff70] text-[#002203] px-3 py-1 text-xs font-bold uppercase tracking-wider rounded mb-4">
                      With Firma
                    </span>
                  </div>
                  <ul className="space-y-3 text-[#45474c]">
                    <li className="flex gap-3">
                      <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                      <span>Your branded portal with your logo</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                      <span>Organized, professional workspace</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                      <span>One destination for all engagement work</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                      <span>Clear narrative and structure</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-[#72ff70] font-bold shrink-0">✓</span>
                      <span>Looks premium, intentional, professional</span>
                    </li>
                  </ul>
                </div>
              </div>
              <p className="text-center text-[#45474c] mt-12 text-lg">
                Same work. Completely different perception. That perception difference is what changes retainer renewals and lets you raise rates.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-24 bg-[#f6f3f4]">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="mx-auto max-w-3xl">
              <h2 className="text-3xl font-bold tracking-tight text-[#1b1b1d] md:text-4xl mb-3">
                Frequently Asked Questions
              </h2>
              <p className="text-[#45474c] mb-10">
                Everything fractional CMOs ask about presenting work like an agency.
              </p>

              <div className="space-y-4">
                {cmoFaqs.map((faq, i) => {
                  const open = openFaqIndex === i
                  return (
                    <div
                      key={i}
                      className="rounded-none bg-white p-6 shadow-[0_8px_24px_rgba(27,27,29,0.05)] md:p-8"
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start justify-between gap-4 text-left",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a78ff] focus-visible:ring-offset-2",
                        )}
                        aria-expanded={open}
                        aria-controls={`cmo-faq-panel-${i}`}
                        onClick={() => setOpenFaqIndex(open ? null : i)}
                      >
                        <h3 className="text-lg font-bold text-[#1b1b1d] md:text-xl">
                          {faq.q}
                        </h3>
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[#c6c6cc]/30 bg-[#f6f3f4] text-[#45474c] transition-transform duration-200",
                            open && "rotate-180",
                          )}
                          aria-hidden
                        >
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </button>
                      <div
                        id={`cmo-faq-panel-${i}`}
                        className={cn(
                          "overflow-hidden transition-[max-height] duration-200",
                          open ? "mt-4 block" : "hidden"
                        )}
                      >
                        <p className="text-[15px] leading-relaxed text-[#45474c]">
                          {faq.a}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-24">
          <div className={MARKETING_PAGE_SHELL}>
            <div className="max-w-2xl mx-auto text-center bg-[#141c2a] p-12 rounded-lg">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Present Your Work Like an Agency?
              </h2>
              <p className="text-[#bfc6da] mb-8 text-lg">
                See how top fractional CMOs use Firma to land more retainer clients and justify higher rates.
              </p>
              <a
                href={CALENDLY_DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#72ff70] text-[#002203] font-bold rounded-none hover:bg-[#60dd5e] transition-colors"
              >
                Book a Demo
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
