import type { ReactNode } from "react"
import { BarChart3, Check, FolderOpen, Mail, Scale, Server, ShieldCheck, User } from "lucide-react"

import { BrandName } from "@/components/brand/BrandName"
import { KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import { MarketingBreadcrumb } from "@/components/marketing/marketing-breadcrumb"
import { PLATFORM_NOTIFICATION_EMAIL } from "@/config/platform-emails"
import { platformEmail } from "@/config/platform-domain"
import { cn } from "@/lib/utils"

export type PrivacyPolicyVariant = "page" | "embedded"

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

function PrivacyPolicyPageView() {
  const notificationEmail = PLATFORM_NOTIFICATION_EMAIL

  return (
    <>
      <MarketingBreadcrumb items={[{ label: "Privacy Policy" }]} className="mb-8" />

      <header className="mb-12 md:mb-16">
        <div className="flex flex-col justify-between gap-6 border-b border-[#c6c6cc]/30 pb-8 md:flex-row md:items-end md:gap-8 md:pb-10">
          <div className="min-w-0 max-w-2xl">
            <KineticSectionIntro
              heading="h1"
              titleScale="hero"
              badge={{
                variant: "lime",
                icon: <ShieldCheck className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />,
                label: "Legal framework // Governance",
                className: "mb-6",
              }}
              title={
                <>
                  <span className="text-[#1b1b1d]">Privacy</span>{" "}
                  <span className="text-[#5a78ff]">Policy</span>
                </>
              }
              description={
                <p
                  className={cn(
                    "max-w-xl border-l-2 border-[#5a78ff] py-1.5 pl-5 text-lg leading-relaxed text-[#45474c] md:text-xl",
                    bodySans
                  )}
                >
                  At{" "}
                  <BrandName className="inline [font-size:inherit] [line-height:inherit]" gradient />{" "}
                  (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), we respect your privacy and are
                  committed to protecting the proprietary assets you entrust to our platform. This
                  Privacy Policy explains how we collect, use, and safeguard your information when you
                  use our service, specifically tailored for Strategic Advisors and Consultants.
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
              Last sync: Jan 2026
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-20 md:space-y-24">
        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="01" title="Information we collect" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              Our platform is designed to be <strong className="text-[#1b1b1d]">Non-Custodial</strong>{" "}
              regarding your intellectual property. We minimize data collection to the absolute
              essentials required for service delivery.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <User className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Account identity
                </h3>
              </div>
              <p className="text-sm text-[#45474c]">
                Basic profile information (Name, Email, Organization).
              </p>
            </TechnicalCard>
            <TechnicalCard className="border-l-4 border-l-[#5a78ff]">
              <div className="mb-4 flex items-center gap-2">
                <FolderOpen className="h-5 w-5 shrink-0 text-[#5a78ff]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Storage metadata
                </h3>
              </div>
              <p className="text-sm text-[#45474c]">
                We request access to file names, folder structures, and permission settings to
                organize your client portal.{" "}
                <span className="font-bold text-[#1b1b1d]">
                  We do not store the actual content of your files.
                </span>
              </p>
            </TechnicalCard>
            <TechnicalCard className="md:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Usage telemetry
                </h3>
              </div>
              <p className="text-sm text-[#45474c]">
                Anonymized data on how you interact with the platform to improve performance.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="02" title="How we use your information" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              We use your data solely to facilitate the secure delivery of your professional
              services:
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            {[
              "Automating the creation and management of Client Portals.",
              'Enforcing access control and revocation policies ("Zombie Link" prevention).',
              "Sending critical security alerts regarding your shared assets.",
              "Generating audit logs for your engagements.",
            ].map((text) => (
              <TechnicalCard key={text} className="flex items-start gap-4 p-5">
                <div className="mt-1.5 h-2 w-2 shrink-0 bg-[#22c55e]" aria-hidden />
                <p className="text-sm font-medium text-[#1b1b1d]">{text}</p>
              </TechnicalCard>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="03" title="Data sovereignty & sharing" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              Your client data remains in your own storage — Google Drive, OneDrive or
              SharePoint.{" "}
              <strong className="text-[#1b1b1d]">We do not sell your data.</strong> We do not share
              your data with third parties, except:
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Service providers
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                AWS/Vercel (Hosting), Supabase (Database), Polar (Payments), Anthropic (AI
                assistant) – strictly for infrastructure. See section 05 for what the AI assistant
                sends and what it does not.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Scale className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Legal compliance
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                If compelled by law enforcement (highly specific and rare).
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="04" title="Security & retention" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              Encryption protocols and data lifecycle management policies.
            </p>
          </div>
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 gap-10 rounded-sm bg-[#141c2a] p-8 text-white md:grid-cols-2 md:p-10">
              <div>
                <h3
                  className={cn(
                    "mb-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#72ff70]",
                    headline
                  )}
                >
                  Encryption
                </h3>
                <p className="text-sm leading-relaxed text-[#7c8496]">
                  We employ enterprise-grade encryption (TLS 1.2+) for all data in transit. Since we
                  do not store your files, the security of your documents rests primarily on
                  Google&apos;s world-class infrastructure, layered with our access governance.
                </p>
              </div>
              <div>
                <h3
                  className={cn(
                    "mb-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#72ff70]",
                    headline
                  )}
                >
                  Purge protocol
                </h3>
                <p className="text-sm leading-relaxed text-[#7c8496]">
                  When you delete your{" "}
                  <BrandName
                    gradient={false}
                    className="inline !text-white [font-size:inherit] [line-height:inherit]"
                  />{" "}
                  account, all metadata stored on our servers is permanently erased within 30 days.
                  Your actual files in your own storage remain untouched.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="ai"
          className="scroll-mt-36 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <SectionHeading n="05" title="AI assistant" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              <BrandName gradient={false} className="inline [font-size:inherit] [line-height:inherit]" />{" "}
              includes an AI assistant, Brio, which answers questions about an engagement and can
              propose changes to how its files are organized.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  What is sent
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                When you ask Brio a question, we send Anthropic the question and the engagement
                details needed to answer it — file and folder names, due dates, statuses, member
                roles and counts.{" "}
                <strong className="text-[#1b1b1d]">
                  The contents of your documents are never sent.
                </strong>{" "}
                Brio reads the names and properties of your files, not what is inside them.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Not used for training
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                We use Anthropic&apos;s commercial API. Anthropic does not use what we send to
                train its models, and retains it only briefly for abuse monitoring under its own
                terms. We do not use your data to train any model, and we do not send it to any
                other AI provider.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Check className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Nothing without your approval
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Brio can rename and move files and create folders, and only ever after you approve
                each change. It never deletes anything. Every change it makes is recorded in your
                engagement&apos;s audit trail, attributed both to the assistant and to the person
                who approved it.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  What we keep
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Conversations with Brio are not stored on our servers — they live in your browser
                for the session and are gone when you close the tab. When you rate an answer, we
                record the rating and the category you pick, never the question you asked or the
                answer you received. We also record how many AI requests an account makes, to apply
                plan limits and bill correctly.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section
          id="your-rights"
          className="scroll-mt-36 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <SectionHeading n="06" title="Your rights" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              These rights are available to everyone who uses{" "}
              <BrandName gradient={false} className="inline [font-size:inherit] [line-height:inherit]" />,
              not only to residents of places that require them. California residents have them
              under the CCPA/CPRA; residents of Canada under PIPEDA.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <FolderOpen className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Know and access
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                You can download everything we hold about you from your account settings: your
                profile, your firm and engagement memberships, your activity in the audit trail,
                and your AI usage. The export is machine-readable and arrives immediately — you do
                not have to ask us for it.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <User className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Correct
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Your name, email and profile details are editable in your settings at any time.
                Anything you cannot edit yourself, we will correct on request.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Delete
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                Request deletion from your account settings. We confirm by email when it is done,
                and in any case within 45 days. Your profile, memberships and sign-in credentials
                are erased; your files in your own storage are never touched. Two things survive,
                and we would rather say so plainly: audit records of actions you took remain,
                because an audit trail a participant can edit is not an audit trail; and a
                workspace you share with colleagues continues without you, since it is not yours
                alone to delete.
              </p>
            </TechnicalCard>
            <TechnicalCard>
              <div className="mb-4 flex items-center gap-2">
                <Scale className="h-5 w-5 shrink-0 text-[#22c55e]" aria-hidden />
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  No sale, no discrimination
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[#45474c]">
                We do not sell your personal information and we do not share it for cross-context
                behavioural advertising, so there is nothing to opt out of. Exercising any of these
                rights will never change your price, your plan or the service you receive.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section
          id="cookies"
          className="scroll-mt-36 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <SectionHeading n="07" title="Cookie policy" />
            <p className="mt-4 text-sm leading-relaxed text-[#45474c]">
              We use cookies to improve your experience, analyze site traffic, and deliver
              personalized content. You can adjust your preferences at any time via the &quot;Cookie
              Settings&quot; link in the footer.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:col-span-8">
            <TechnicalCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Strictly necessary
                </h3>
                <span className="rounded-sm bg-[#22c55e]/10 px-2 py-0.5 text-[9px] font-bold text-[#22c55e]">
                  Required
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#45474c]">
                These cookies are essential for the operation of our secure portal. They handle user
                authentication, session security, and fraud prevention.
              </p>
            </TechnicalCard>
            <TechnicalCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", headline)}>
                  Analytics & performance
                </h3>
                <span className="rounded-sm bg-[#5a78ff]/10 px-2 py-0.5 text-[9px] font-bold text-[#5a78ff]">
                  Optional
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#45474c]">
                We use these to understand how you interact with{" "}
                <BrandName
                  gradient={false}
                  className="inline text-[#1b1b1d] [font-size:inherit] [line-height:inherit]"
                />{" "}
                (e.g., page visit counts, load times, errors). Data is aggregated and anonymized.
              </p>
            </TechnicalCard>
          </div>
        </section>

        <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <SectionHeading n="08" title="Contact us" />
          </div>
          <div className="lg:col-span-8">
            <div className="flex flex-col items-center justify-between gap-8 rounded-sm border border-[#c6c6cc]/20 bg-[#f6f3f4] p-8 md:flex-row md:p-10">
              <p className="max-w-sm text-sm font-medium text-[#45474c]">
                For any privacy concerns or data requests, please contact our Data Protection Officer
                at
              </p>
              <a
                href={`mailto:${notificationEmail}`}
                className={cn(
                  "group flex items-center gap-3 border-b-2 border-[#1b1b1d] pb-1 text-xl font-bold text-[#1b1b1d] transition-colors hover:border-[#22c55e] hover:text-[#22c55e] md:text-2xl",
                  headline
                )}
              >
                <Mail className="h-8 w-8 shrink-0" aria-hidden />
                <span className="break-all">{notificationEmail}</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
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
                  live in your browser for the session. When you rate an answer we record the
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
