import type { ReactNode } from "react"
import { AlertTriangle, Check, Copyright, CreditCard, HardDrive, Mail, Scale } from "lucide-react"

import { BrandName } from "@/components/brand/BrandName"
import { DocView } from "@/components/marketing/v2/reading/doc-view"
import { Checks, Clause, Clauses, LegalLead, LegalSection } from "@/components/marketing/v2/reading/legal-blocks"
import { BRAND_NAME } from "@/config/brand"
import { platformEmail } from "@/config/platform-domain"

export type TermsOfServiceVariant = "page" | "embedded"

/** The page's sections, in order: the "On this page" list and the headings' ids (`ai` is a deep link). */
const SECTIONS = [
  { id: "non-custodial-service-model", n: "01", title: "Non-custodial service model" },
  { id: "subscription-and-usage", n: "02", title: "Subscription & usage" },
  { id: "liability-disclaimer", n: "03", title: "Liability disclaimer" },
  { id: "ai", n: "04", title: "AI assistant" },
  { id: "intellectual-property", n: "05", title: "Intellectual property" },
  { id: "contact", n: "06", title: "Contact" },
] as const

const TOC = SECTIONS.map(({ id, title }) => ({ id, text: title }))

function Section({ index, children }: { index: number; children: ReactNode }) {
  const { id, n, title } = SECTIONS[index]
  return (
    <LegalSection id={id} n={n} title={title}>
      {children}
    </LegalSection>
  )
}

/** Embedded (modal) variant only; the page variant uses the reading template's link style. */
const mailLinkClass =
  "font-bold text-[#5a78ff] decoration-2 underline-offset-2 transition-colors hover:text-[#3d5ce0] hover:underline"

/** `/terms`, on the marketing site's reading template. The Terms' wording lives here unchanged. */
function TermsOfServicePageView() {
  const infoEmail = platformEmail("info")

  return (
    <DocView
      crumbs={[{ label: "Legal" }, { label: "Terms of Service", href: "/terms" }]}
      title="Terms of Service"
      dek={
        <>
          By using {BRAND_NAME}, you agree to these Terms. They govern the relationship between us and Strategic
          Advisors, Consultants, and Firms who use our services to manage client portals.
        </>
      }
      meta={
        <>
          Last updated <time dateTime="2026-10">October 2026</time>
        </>
      }
      toc={TOC}
    >
      <Section index={0}>
        <LegalLead>
          {BRAND_NAME} operates on a <strong>Non-Custodial</strong> architecture. We provide an interface to
          organize and govern files that reside in <strong>your</strong> own storage — Google Drive, OneDrive or
          SharePoint.
        </LegalLead>
        <Checks
          items={[
            "We do not take ownership of your intellectual property.",
            "We do not store file content on our servers.",
            "Searching inside your documents runs in your own storage provider; we receive only which files matched.",
            "You retain full liability for the content you share via our platform.",
          ]}
        />
      </Section>

      <Section index={1}>
        <LegalLead>Access is provided on a subscription basis (monthly or annual).</LegalLead>
        <Clauses>
          <Clause icon={CreditCard} title="Plan limits and fair use">
            Your plan sets what it includes — how many clients, engagements and documents you may have, how long
            comment history is kept, and your AI credits. We enforce those limits, and your storage
            provider&apos;s own API quotas apply on top of them. Current limits are on our pricing page.
          </Clause>
          <Clause icon={HardDrive} title="Cancellation">
            You may cancel at any time. Your portals remain active until the end of the billing cycle.
          </Clause>
          <Clause icon={AlertTriangle} title="Termination">
            We reserve the right to suspend accounts that attempt to reverse-engineer our governance protocols.
          </Clause>
        </Clauses>
      </Section>

      <Section index={2}>
        <LegalLead>Governance tooling, not legal advice.</LegalLead>
        <Clauses>
          <Clause icon={Scale} title="As-is service">
            {BRAND_NAME} is a tool for governance and organization. We are not a legal compliance firm. While our
            tools assist in protecting your IP (&quot;Zombie Links&quot;), we do not guarantee against all forms of
            data exfiltration by your clients. The service is provided &quot;AS IS&quot; without warranties of any
            kind.
          </Clause>
        </Clauses>
      </Section>

      <Section index={3}>
        <LegalLead>What Brio does, what it will not do, and who is accountable for the result.</LegalLead>
        <Clauses>
          <Clause icon={AlertTriangle} title="Output may be wrong">
            Brio generates its answers, and generated answers can be incomplete or incorrect even when they read as
            confident. Treat them as a starting point, not as a professional conclusion. You remain responsible for
            checking anything you rely on, and for the advice you give your own clients.
          </Clause>
          <Clause icon={Check} title="You approve every change">
            Brio can rename and move files and create folders. It proposes; you approve each change before
            anything happens, and nothing happens without that approval. A change you approve is your decision and
            your responsibility — it is recorded in your audit trail against both the assistant and your account.
          </Clause>
          <Clause icon={HardDrive} title="It never deletes">
            Brio performs reversible operations only. It will not delete, trash or archive a file, a folder or a
            member, and it will not remove anyone&apos;s access. Asked to, it declines and points you to where you
            can do it yourself.
          </Clause>
          <Clause icon={CreditCard} title="AI credits">
            AI features consume credits included with your plan. Credits reset each billing period, do not carry
            over, and are not separately refundable. When they run out, AI features pause until the next period;
            everything else keeps working.
          </Clause>
        </Clauses>
      </Section>

      <Section index={4}>
        <LegalLead>Our platform and your responsibilities.</LegalLead>
        <Clauses>
          <Clause icon={Copyright} title="Platform rights">
            The {BRAND_NAME} platform, including its source code, governance algorithms, and visual interfaces, is
            the exclusive property of {BRAND_NAME}.
          </Clause>
        </Clauses>
      </Section>

      <Section index={5}>
        <LegalLead>Questions about these Terms.</LegalLead>
        <Clauses>
          <Clause icon={Mail} title="Reach us">
            For questions regarding these Terms, please contact:{" "}
            <a href={`mailto:${infoEmail}`} className="mk-doc-link">
              {infoEmail}
            </a>
          </Clause>
        </Clauses>
      </Section>
    </DocView>
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
