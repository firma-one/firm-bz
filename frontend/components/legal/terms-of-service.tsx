import type { ReactNode } from "react"
import { AlertTriangle, Check, Copyright, CreditCard, HardDrive, Mail, Scale } from "lucide-react"

import { BrandName } from "@/components/brand/BrandName"
import { KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import { MarketingBreadcrumb } from "@/components/marketing/marketing-breadcrumb"
import { platformEmail } from "@/config/platform-domain"
import { cn } from "@/lib/utils"

export type TermsOfServiceVariant = "page" | "embedded"

const headline = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
const bodySans = "[font-family:var(--font-kinetic-body),system-ui,sans-serif]"

function TechnicalCard({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-sm border border-[#0b1321]/10 bg-white p-5 transition-all duration-200 md:p-6",
        "hover:border-[#22c55e] hover:shadow-[0_4px_20px_-10px_rgba(0,255,65,0.2)]",
        className
      )}
    >
      {children}
    </div>
  )
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <h2
      className={cn(
        "flex items-center gap-4 text-2xl font-bold uppercase tracking-tighter sm:text-3xl",
        headline
      )}
    >
      <span className="text-[#22c55e]">{n}</span>
      {title}
    </h2>
  )
}

const mailLinkClass =
  "font-bold text-[#5a78ff] decoration-2 underline-offset-2 transition-colors hover:text-[#3d5ce0] hover:underline"

function TermsOfServicePageView() {
  const infoEmail = platformEmail("info")

  return (
    <>
      <MarketingBreadcrumb items={[{ label: "Terms of Service" }]} className="mb-8" />

      <header className="mb-12 md:mb-16">
        <div className="flex flex-col justify-between gap-6 border-b border-[#c6c6cc]/30 pb-8 md:flex-row md:items-end md:gap-8 md:pb-10">
          <div className="min-w-0 max-w-2xl">
            <KineticSectionIntro
              heading="h1"
              titleScale="hero"
              badge={{
                variant: "lime",
                icon: <Scale className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
                label: "Legal framework // Agreement",
                className: "mb-6",
              }}
              title={
                <>
                  <span className="text-[#1b1b1d]">Terms</span>{" "}
                  <span className="text-[#5a78ff]">of Service</span>
                </>
              }
              description={
                <p
                  className={cn(
                    "max-w-xl border-l-2 border-[#5a78ff] py-1.5 pl-5 text-lg leading-relaxed text-[#45474c] md:text-xl",
                    bodySans
                  )}
                >
                  By using <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient />, you
                  agree to these Terms. They govern the relationship between us and Strategic Advisors,
                  Consultants, and Firms who use our services to manage client portals.
                </p>
              }
              descriptionClassName=""
            />
          </div>
          <div className="hidden shrink-0 text-right md:block">
            <p
              className={cn(
                "mb-2 text-[10px] font-bold uppercase tracking-widest text-[#45474c]",
                headline
              )}
            >
              Status: Active documentation
            </p>
            <p className={cn("text-xs font-bold uppercase tracking-widest text-[#1b1b1d] md:text-sm", headline)}>
              Last updated: Jan 2026
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-20 md:space-y-24">
        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="01" title="Non-custodial service model" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient /> operates on a{" "}
              <strong className="text-[#1b1b1d]">Non-Custodial</strong> architecture. We provide an interface to
              organize and govern files that reside in <strong className="text-[#1b1b1d]">your</strong> Google Drive.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard className="flex items-start gap-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
              <p className="text-sm leading-relaxed text-[#45474c]">
                We do not take ownership of your intellectual property.
              </p>
            </TechnicalCard>
            <TechnicalCard className="flex items-start gap-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
              <p className="text-sm leading-relaxed text-[#45474c]">
                We do not store file content on our servers.
              </p>
            </TechnicalCard>
            <TechnicalCard className="flex items-start gap-4 md:col-span-2">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
              <p className="text-sm leading-relaxed text-[#45474c]">
                You retain full liability for the content you share via our platform.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="02" title="Subscription & usage" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              Access is provided on a subscription basis (monthly or annual).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>Fair use</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                API limits may apply to prevent abuse of the Google Drive integration.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <HardDrive className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>Cancellation</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                You may cancel at any time. Your portals remain active until the end of the billing cycle.
              </p>
            </TechnicalCard>
            <TechnicalCard className="md:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>Termination</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                We reserve the right to suspend accounts that attempt to reverse-engineer our governance protocols.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="03" title="Liability disclaimer" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              Governance tooling, not legal advice.
            </p>
          </div>
          <div className="lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Scale className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>As-is service</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient /> is a tool for governance and organization. We are
                not a legal compliance firm. While our tools assist in protecting your IP (&quot;Zombie Links&quot;), we
                do not guarantee against all forms of data exfiltration by your clients. The service is provided
                &quot;AS IS&quot; without warranties of any kind.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section
          id="ai"
          className="scroll-mt-36 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <SectionHeading n="04" title="AI assistant" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              What Brio does, what it will not do, and who is accountable for the result.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Output may be wrong
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Brio generates its answers, and generated answers can be incomplete or incorrect
                even when they read as confident. Treat them as a starting point, not as a
                professional conclusion. You remain responsible for checking anything you rely on,
                and for the advice you give your own clients.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Check className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  You approve every change
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Brio can rename and move files and create folders. It proposes; you approve each
                change before anything happens, and nothing happens without that approval. A change
                you approve is your decision and your responsibility — it is recorded in your audit
                trail against both the assistant and your account.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <HardDrive className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  It never deletes
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Brio performs reversible operations only. It will not delete, trash or archive a
                file, a folder or a member, and it will not remove anyone&apos;s access. Asked to,
                it declines and points you to where you can do it yourself.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  AI credits
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                AI features consume credits included with your plan. Credits reset each billing
                period, do not carry over, and are not separately refundable. When they run out, AI
                features pause until the next period; everything else keeps working.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="05" title="Intellectual property" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">Our platform and your responsibilities.</p>
          </div>
          <div className="lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Copyright className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>Platform rights</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                The <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient /> platform,
                including its source code, governance algorithms, and visual interfaces, is the exclusive property of{" "}
                <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient />.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="06" title="Contact" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">Questions about these Terms.</p>
          </div>
          <div className="lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Mail className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>Reach us</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                For questions regarding these Terms, please contact:{" "}
                <a href={`mailto:${infoEmail}`} className={mailLinkClass}>
                  {infoEmail}
                </a>
              </p>
            </TechnicalCard>
          </div>
        </section>
      </div>
    </>
  )
}

function TermsOfServiceEmbedded() {
  const infoEmail = platformEmail("info")

  return (
    <div className="prose prose-slate prose-lg max-w-none">
      <div className="space-y-12">
        <div>
          <p className="mb-6 leading-relaxed text-slate-600">
            Welcome to <BrandName gradient />. By accessing our platform, you agree to be bound by these Terms of
            Service. This agreement governs the relationship between us and Strategic Advisors, Consultants, and
            Firms who use our services to manage client portals.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            1
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Non-Custodial Service Model</h3>
            <p className="mb-4 text-slate-600">
              <BrandName gradient /> operates on a <strong>Non-Custodial</strong> architecture. We provide an interface
              to organize and govern files that reside in <strong>your</strong> Google Drive.
            </p>
            <ul className="ml-1 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>We do not take ownership of your intellectual property.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>We do not store file content on our servers.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>You retain full liability for the content you share via our platform.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            2
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Subscription & Usage</h3>
            <p className="mb-4 text-slate-600">
              Access to <BrandName gradient /> is provided on a subscription basis (Monthly or Annual).
            </p>
            <ul className="ml-1 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Fair Use:</strong> API limits may apply to prevent abuse of the Google Drive integration.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Cancellation:</strong> You may cancel at any time. Your portals will remain active until the
                  end of the billing cycle.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Termination:</strong> We reserve the right to suspend accounts that attempt to
                  reverse-engineer our governance protocols.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            3
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Liability Disclaimer</h3>
            <p className="text-slate-600">
              <BrandName gradient /> is a tool for governance and organization. We are not a legal compliance firm.
              While our tools assist in protecting your IP (&quot;Zombie Links&quot;), we do not guarantee against all
              forms of data exfiltration by your clients. The service is provided &quot;AS IS&quot; without warranties
              of any kind.
            </p>
          </div>
        </div>

        <div id="ai" className="scroll-mt-36 flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            4
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">AI Assistant</h3>
            <ul className="ml-1 mt-2 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Output may be wrong:</strong> Brio generates its answers, and generated
                  answers can be incomplete or incorrect even when they read as confident. You
                  remain responsible for checking anything you rely on, and for the advice you give
                  your own clients.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>You approve every change:</strong> Brio proposes renames, moves and new
                  folders; nothing happens until you approve each one. A change you approve is your
                  decision, recorded in your audit trail against both the assistant and your
                  account.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>It never deletes:</strong> Brio performs reversible operations only. It
                  will not delete, trash or archive a file, folder or member, and will not remove
                  anyone&apos;s access.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>AI credits:</strong> AI features consume credits included with your plan.
                  Credits reset each billing period, do not carry over, and are not separately
                  refundable. When they run out, AI features pause until the next period.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            5
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Intellectual Property Rights</h3>
            <p className="text-lg text-slate-600">
              The <BrandName gradient /> platform, including its source code, governance algorithms, and visual
              interfaces, is the exclusive property of <BrandName gradient />.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            6
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Contact Information</h3>
            <p className="text-slate-600">
              For questions regarding these Terms, please contact:{" "}
              <a href={`mailto:${infoEmail}`} className={mailLinkClass}>
                {infoEmail}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TermsOfService({ variant = "embedded" }: { variant?: TermsOfServiceVariant }) {
  if (variant === "page") {
    return <TermsOfServicePageView />
  }
  return <TermsOfServiceEmbedded />
}
