import type { ReactNode } from "react"
import { BarChart3, Check, FolderOpen, Mail, Scale, Server, ShieldCheck, User } from "lucide-react"

import { BrandName } from "@/components/brand/BrandName"
import { CookieSettingsButton } from "@/components/marketing/v2/reading/cookie-settings-button"
import { DocView } from "@/components/marketing/v2/reading/doc-view"
import {
  Checks,
  Clause,
  Clauses,
  ClauseTag,
  ContactBlock,
  LegalLead,
  LegalSection,
} from "@/components/marketing/v2/reading/legal-blocks"
import { BRAND_NAME } from "@/config/brand"
import { PLATFORM_NOTIFICATION_EMAIL } from "@/config/platform-emails"
import { platformEmail } from "@/config/platform-domain"

export type PrivacyPolicyVariant = "page" | "embedded"

/**
 * The page's sections, in order: the "On this page" list and the headings' ids. `ai`, `your-rights`
 * and `cookies` are long-standing deep links (the footer's "Cookie settings" opens `/privacy#cookies`).
 */
const SECTIONS = [
  { id: "information-we-collect", n: "01", title: "Information we collect" },
  { id: "how-we-use-your-information", n: "02", title: "How we use your information" },
  { id: "data-sovereignty-and-sharing", n: "03", title: "Data sovereignty & sharing" },
  { id: "security-and-retention", n: "04", title: "Security & retention" },
  { id: "ai", n: "05", title: "AI assistant" },
  { id: "your-rights", n: "06", title: "Your rights" },
  { id: "cookies", n: "07", title: "Cookie policy" },
  { id: "contact-us", n: "08", title: "Contact us" },
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

/** `/privacy`, on the marketing site's reading template. The policy's wording lives here unchanged. */
function PrivacyPolicyPageView() {
  const notificationEmail = PLATFORM_NOTIFICATION_EMAIL

  return (
    <DocView
      crumbs={[{ label: "Legal" }, { label: "Privacy Policy", href: "/privacy" }]}
      title="Privacy Policy"
      dek={
        <>
          At {BRAND_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), we respect your privacy and are
          committed to protecting the proprietary assets you entrust to our platform. This Privacy Policy explains
          how we collect, use, and safeguard your information when you use our service, specifically tailored for
          Strategic Advisors and Consultants.
        </>
      }
      meta={
        <>
          Last updated <time dateTime="2026-01">January 2026</time>
        </>
      }
      toc={TOC}
    >
      <Section index={0}>
        <LegalLead>
          Our platform is designed to be <strong>Non-Custodial</strong> regarding your intellectual property. We
          minimize data collection to the absolute essentials required for service delivery.
        </LegalLead>
        <Clauses>
          <Clause icon={User} title="Account identity">
            Basic profile information (Name, Email, Organization).
          </Clause>
          <Clause icon={FolderOpen} title="Storage metadata">
            We request access to file names, folder structures, and permission settings to organize your client
            portal. <strong>We do not store the actual content of your files.</strong>
          </Clause>
          <Clause icon={BarChart3} title="Usage telemetry">
            Anonymized data on how you interact with the platform to improve performance.
          </Clause>
        </Clauses>
      </Section>

      <Section index={1}>
        <LegalLead>
          We use your data solely to facilitate the secure delivery of your professional services:
        </LegalLead>
        <Checks
          items={[
            "Automating the creation and management of Client Portals.",
            'Enforcing access control and revocation policies ("Zombie Link" prevention).',
            "Sending critical security alerts regarding your shared assets.",
            "Generating audit logs for your engagements.",
          ]}
        />
      </Section>

      <Section index={2}>
        <LegalLead>
          Your client data remains in your own storage — Google Drive, OneDrive or SharePoint.{" "}
          <strong>We do not sell your data.</strong> We do not share your data with third parties, except:
        </LegalLead>
        <Clauses>
          <Clause icon={Server} title="Service providers">
            AWS/Vercel (Hosting), Supabase (Database), Polar (Payments), Anthropic (AI assistant) – strictly for
            infrastructure. See section 05 for what the AI assistant sends and what it does not.
          </Clause>
          <Clause icon={Scale} title="Legal compliance">
            If compelled by law enforcement (highly specific and rare).
          </Clause>
        </Clauses>
      </Section>

      <Section index={3}>
        <LegalLead>Encryption protocols and data lifecycle management policies.</LegalLead>
        <Clauses>
          <Clause icon={ShieldCheck} title="Encryption">
            We employ enterprise-grade encryption (TLS 1.2+) for all data in transit. Since we do not store your
            files, the security of your documents rests primarily on Google&apos;s world-class infrastructure,
            layered with our access governance.
          </Clause>
          <Clause icon={Server} title="Purge protocol">
            When you delete your {BRAND_NAME} account, all metadata stored on our servers is permanently erased
            within 30 days. Your actual files in your own storage remain untouched.
          </Clause>
        </Clauses>
      </Section>

      <Section index={4}>
        <LegalLead>
          {BRAND_NAME} includes an AI assistant, Brio, which answers questions about an engagement and can propose
          changes to how its files are organized.
        </LegalLead>
        <Clauses>
          <Clause icon={Server} title="What is sent">
            When you ask Brio a question, we send Anthropic the question and the engagement details needed to
            answer it — file and folder names, due dates, statuses, member roles and counts.{" "}
            <strong>The contents of your documents are never sent.</strong> Brio reads the names and properties of
            your files, not what is inside them.
          </Clause>
          <Clause icon={ShieldCheck} title="Not used for training">
            We use Anthropic&apos;s commercial API. Anthropic does not use what we send to train its models, and
            retains it only briefly for abuse monitoring under its own terms. We do not use your data to train any
            model, and we do not send it to any other AI provider.
          </Clause>
          <Clause icon={Check} title="Nothing without your approval">
            Brio can rename and move files and create folders, and only ever after you approve each change. It
            never deletes anything. Every change it makes is recorded in your engagement&apos;s audit trail,
            attributed both to the assistant and to the person who approved it.
          </Clause>
          <Clause icon={BarChart3} title="What we keep">
            Conversations with Brio are not stored on our servers — they are saved in your browser, on the device
            you used, so you can reopen them. They are kept for up to 30 days unless you pin them, and you can
            delete any of them, or all of them, from the assistant panel at any time. Clearing your browser data
            removes them too. When you rate an answer, we record the rating and the category you pick, never the
            question you asked or the answer you received. We also record how many AI requests an account makes,
            to apply plan limits and bill correctly.
          </Clause>
        </Clauses>
      </Section>

      <Section index={5}>
        <LegalLead>
          These rights are available to everyone who uses {BRAND_NAME}, not only to residents of places that
          require them. California residents have them under the CCPA/CPRA; residents of Canada under PIPEDA.
        </LegalLead>
        <Clauses>
          <Clause icon={FolderOpen} title="Know and access">
            You can download everything we hold about you from your account settings: your profile, your firm and
            engagement memberships, your activity in the audit trail, and your AI usage. The export is
            machine-readable and arrives immediately — you do not have to ask us for it.
          </Clause>
          <Clause icon={User} title="Correct">
            Your name, email and profile details are editable in your settings at any time. Anything you cannot
            edit yourself, we will correct on request.
          </Clause>
          <Clause icon={ShieldCheck} title="Delete">
            Request deletion from your account settings. We confirm by email when it is done, and in any case
            within 45 days. Your profile, memberships and sign-in credentials are erased; your files in your own
            storage are never touched. Two things survive, and we would rather say so plainly: audit records of
            actions you took remain, because an audit trail a participant can edit is not an audit trail; and a
            workspace you share with colleagues continues without you, since it is not yours alone to delete.
          </Clause>
          <Clause icon={Scale} title="No sale, no discrimination">
            We do not sell your personal information and we do not share it for cross-context behavioural
            advertising, so there is nothing to opt out of. Exercising any of these rights will never change your
            price, your plan or the service you receive.
          </Clause>
        </Clauses>
      </Section>

      <Section index={6}>
        <LegalLead>
          We use cookies to improve your experience, analyze site traffic, and deliver personalized content. You can
          adjust your preferences at any time via the &quot;Cookie Settings&quot; link in the footer.
        </LegalLead>
        <Clauses>
          <Clause icon={ShieldCheck} title="Strictly necessary" tag={<ClauseTag on>Required</ClauseTag>}>
            These cookies are essential for the operation of our secure portal. They handle user authentication,
            session security, and fraud prevention.
          </Clause>
          <Clause icon={BarChart3} title="Analytics & performance" tag={<ClauseTag>Optional</ClauseTag>}>
            We use these to understand how you interact with {BRAND_NAME} (e.g., page visit counts, load times,
            errors). Data is aggregated and anonymized.
          </Clause>
        </Clauses>
        <CookieSettingsButton />
      </Section>

      <Section index={7}>
        <ContactBlock
          icon={Mail}
          text="For any privacy concerns or data requests, please contact our Data Protection Officer at"
          email={notificationEmail}
        />
      </Section>
    </DocView>
  )
}

function PrivacyPolicyEmbedded() {
  const infoEmail = platformEmail("info")
  return (
    <div className="prose prose-slate prose-lg max-w-none">
      <div className="space-y-12">
        <div>
          <p className="mb-6 leading-relaxed text-slate-600">
            At <strong>Pockett</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), we respect your privacy and
            are committed to protecting the proprietary assets you intrust to our platform. This
            Privacy Policy explains how we collect, use, and safeguard your information when you use
            our service, specifically tailored for Strategic Advisors and Consultants.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            1
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Information We Collect</h3>
            <p className="mb-4 text-slate-600">
              Our platform is designed to be{" "}
              <strong className="text-slate-900">Non-Custodial</strong> regarding your intellectual
              property. We minimize data collection to the absolute essentials required for service
              delivery.
            </p>
            <ul className="ml-1 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Account Identity:</strong> Basic profile information (Name, Email,
                  Organization).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Storage Metadata:</strong> We request access to file names, folder
                  structures, and permission settings to organize your client portal.{" "}
                  <span className="font-medium text-purple-700">
                    We do not store the actual content of your files.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Usage Telemetry:</strong> Anonymized data on how you interact with the
                  platform to improve performance.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            2
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">How We Use Your Information</h3>
            <p className="mb-4 text-slate-600">
              We use your data solely to facilitate the secure delivery of your professional
              services:
            </p>
            <ul className="ml-1 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>Automating the creation and management of Client Portals.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  Enforcing access control and revocation policies (&quot;Zombie Link&quot; prevention).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>Sending critical security alerts regarding your shared assets.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>Generating audit logs for your engagements.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            3
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Data Sovereignty & Sharing</h3>
            <p className="mb-4 text-slate-600">
              Your client data remains in your own storage — Google Drive, OneDrive or
              SharePoint.{" "}
              <strong>We do not sell your data.</strong> We do not share your data with third
              parties, except:
            </p>
            <ul className="ml-1 mt-2 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Service Providers:</strong> AWS/Vercel (Hosting), Supabase (Database),
                  Polar (Payments), Anthropic (AI assistant) – strictly for infrastructure.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Legal Compliance:</strong> If compelled by law enforcement (highly specific
                  and rare).
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            4
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Security & Retention</h3>
            <p className="text-slate-600">
              We employ enterprise-grade encryption (TLS 1.2+) for all data in transit. Since we do
              not store your files, the security of your documents rests primarily on Google&apos;s
              world-class infrastructure, layered with our access governance.
            </p>
            <p className="mt-4 text-slate-600">
              When you delete your Pockett account, all metadata stored on our servers is permanently
              erased within 30 days. Your actual files in your own storage remain untouched.
            </p>
          </div>
        </div>

        <div id="ai" className="scroll-mt-36 flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            5
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">AI Assistant</h3>
            <p className="mb-4 text-slate-600">
              <BrandName gradient={false} className="inline [font-size:inherit] [line-height:inherit]" />{" "}
              includes an AI assistant, Brio, which answers questions about an engagement and can
              propose changes to how its files are organized.
            </p>
            <ul className="ml-1 mt-2 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>What is sent:</strong> your question and the engagement details needed to
                  answer it — file and folder names, due dates, statuses, member roles and counts.{" "}
                  <strong>The contents of your documents are never sent.</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Not used for training:</strong> we use Anthropic&apos;s commercial API.
                  Anthropic does not use what we send to train its models. We do not use your data
                  to train any model, and we do not send it to any other AI provider.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Nothing without your approval:</strong> Brio can rename and move files and
                  create folders, only ever after you approve each change. It never deletes
                  anything, and every change is recorded in your audit trail against both the
                  assistant and the person who approved it.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>What we keep:</strong> conversations are not stored on our servers — they
                  are saved in your browser for up to 30 days, and you can delete them there. When
                  you rate an answer we record the
                  rating and the category you pick, never the question or the answer. We also count
                  AI requests to apply plan limits.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div id="your-rights" className="scroll-mt-36 flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            6
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Your Rights</h3>
            <p className="mb-4 text-slate-600">
              Available to everyone, not only to residents of places that require them. California
              residents have these rights under the CCPA/CPRA; residents of Canada under PIPEDA.
            </p>
            <ul className="ml-1 mt-2 space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Know and access:</strong> download everything we hold about you from your
                  account settings — profile, memberships, audit activity and AI usage. It is
                  machine-readable and immediate; you do not have to ask.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Correct:</strong> your name, email and profile are editable in settings.
                  Anything you cannot edit yourself, we will correct on request.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>Delete:</strong> request deletion from your settings and we confirm by
                  email when it is done, within 45 days. Two things survive: audit records of
                  actions you took, because an audit trail a participant can edit is not an audit
                  trail; and a workspace shared with colleagues, which is not yours alone to
                  delete.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1">
                  <Check className="h-4 w-4 text-purple-600" />
                </div>
                <span>
                  <strong>No sale, no discrimination:</strong> we do not sell your personal
                  information or share it for cross-context behavioural advertising, so there is
                  nothing to opt out of. Exercising these rights never changes your price or your
                  service.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div id="cookies" className="scroll-mt-36 flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            7
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Cookie Policy</h3>
            <p className="mb-6 text-slate-600">
              We use cookies to improve your experience, analyze site traffic, and deliver
              personalized content. You can adjust your preferences at any time via the &quot;Cookie
              Settings&quot; link in the footer.
            </p>

            <div className="space-y-6">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h4 className="font-bold text-slate-900">Strictly Necessary</h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  These cookies are essential for the operation of our secure portal. They handle user
                  authentication, session security, and fraud prevention. You cannot opt-out of these
                  as they are required for the service to function.
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <h4 className="font-bold text-slate-900">Analytics & Performance</h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  We use these to understand how you interact with Pockett (e.g., page visit counts,
                  load times, errors). This data is aggregated and anonymized to help us improve
                  platform performance and usability.
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  <h4 className="font-bold text-slate-900">Marketing & Targeting</h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  These cookies may be set by our advertising partners to build a profile of your
                  interests and show you relevant ads on other sites. They do not store direct
                  personal information but uniquely identify your browser and device.
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <h4 className="font-bold text-slate-900">Personalization</h4>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  These allow the website to remember choices you make (such as your user name,
                  language, or the region you are in) and provide enhanced, more personal features.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            8
          </div>
          <div>
            <h3 className="mb-4 mt-0 text-xl font-bold text-slate-900">Contact Us</h3>
            <p className="text-slate-600">
              For any privacy concerns or data requests, please contact our Data Protection Officer
              at{" "}
              <a
                href={`mailto:${infoEmail}`}
                className="font-bold text-purple-600 decoration-2 underline-offset-2 transition-colors hover:text-purple-800 hover:underline"
              >
                {infoEmail}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PrivacyPolicy({ variant = "embedded" }: { variant?: PrivacyPolicyVariant }) {
  if (variant === "page") {
    return <PrivacyPolicyPageView />
  }
  return <PrivacyPolicyEmbedded />
}
