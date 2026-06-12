import { BRAND_NAME, brandNameInlineHtml } from "@/config/brand"
import { platformEmail } from "@/config/platform-domain"
import { PLATFORM_SUPPORT_EMAIL } from "@/config/platform-emails"

export interface FAQItem {
  question: string;
  answer: string;
  displayAnswer?: string;
  category?: string;
}

export const FAQ_DATA: FAQItem[] = [
  {
    question: `How does ${BRAND_NAME} connect to my Google Drive?`,
    answer: `${BRAND_NAME} uses secure OAuth 2.0 authentication to act as a management layer on top of your existing Google Drive. We assume a 'Non-Custodial' design, meaning your files effectively never leave your Google Drive. We simply organize them into professional Client Portals and manage sharing permissions.`,
    displayAnswer: `${brandNameInlineHtml()} uses secure OAuth 2.0 authentication to act as a management layer on top of your existing Google Drive. We assume a <strong>'Non-Custodial'</strong> design, meaning your files effectively <strong>never leave your Google Drive</strong>. We simply organize them into professional <strong>Client Portals</strong> and manage sharing permissions.`,
    category: "Security"
  },
  {
    question: `What exactly does ${BRAND_NAME} do for consultants and marketing teams?`,
    answer: `${BRAND_NAME} turns your messy Google Drive folders into a secure, branded Client Portal. Marketing agencies, fractional executives, and advisory firms use it to package campaign and strategy deliverables professionally, track who accesses your Intellectual Property, and—most importantly—instantly revoke access ('Wrap') when an engagement ends to prevent 'Zombie Links'.`,
    displayAnswer: `${brandNameInlineHtml()} turns your messy Google Drive folders into a secure, branded <strong>Client Portal</strong>. Marketing agencies, fractional executives, and advisory firms use it to package campaign and strategy deliverables professionally, track who accesses your <strong>Intellectual Property</strong>, and—most importantly—instantly revoke access (<strong>'Wrap'</strong>) when an engagement ends to prevent <strong>'Zombie Links'</strong>.`,
    category: "General"
  },
  {
    question: "Is my data secure? Do you store my files?",
    answer: "Your security is our priority. Because we use a Non-Custodial architecture, we do not store your actual file contents on our servers—they remain encrypted in your Google Drive. We only store the metadata needed to power your dashboard, audit logs, and engagement hierarchy.",
    displayAnswer: "Your security is our priority. Because we use a <strong>Non-Custodial</strong> architecture, <strong>we do not store your actual file contents</strong> on our servers—they remain encrypted in your Google Drive. We only store the <strong>metadata</strong> needed to power your dashboard, <strong>audit logs</strong>, and engagement hierarchy.",
    category: "Security"
  },
  {
    question: `What happens if I stop using ${BRAND_NAME}?`,
    answer: `Nothing happens to your files. Since ${BRAND_NAME} organizes the data that already lives in your Google Drive, you retain full ownership. If you cancel, your folders and files remain exactly where they are in Drive—you just lose the professional Portal view and automated access controls.`,
    displayAnswer: `Nothing happens to your files. Since ${brandNameInlineHtml()} organizes the data that already lives in your Google Drive, <strong>you retain full ownership</strong>. If you cancel, your folders and files remain exactly where they are in Drive—you just lose the professional Portal view and automated access controls.`,
    category: "Billing"
  },
  {
    question: "Can I manage access for multiple clients?",
    answer: `Yes. ${BRAND_NAME} is designed for firm-level scale. You can create distinct Engagements for each client, map specific Drive folders to them, and manage permissions granularly. Our 'Audit Log' shows you exactly which external domains (clients) have access to which files.`,
    displayAnswer: `Yes. ${brandNameInlineHtml()} is designed for <strong>firm-level scale</strong>. You can create distinct Engagements for each client, map specific Drive folders to them, and manage permissions granularly. Our <strong>'Audit Log'</strong> shows you exactly which external domains (clients) have access to which files.`,
    category: "Features"
  },
  {
    question: `Do I need IT admin permissions to use ${BRAND_NAME}?`,
    answer: `No! ${BRAND_NAME} is designed for independent consultants, boutique agencies, and fractional executives who need professional tools without complex IT setup. You can connect your own accounts and start protecting your Intellectual Property immediately.`,
    displayAnswer: `No! ${brandNameInlineHtml()} is designed for <strong>independent consultants</strong>, boutique agencies, and fractional executives who need professional tools <strong>without complex IT setup</strong>. You can connect your own accounts and start protecting your <strong>Intellectual Property</strong> immediately.`,
    category: "General"
  },
  {
    question: `Is ${BRAND_NAME} a good fit for marketing agencies and fractional marketing leaders?`,
    answer: `Yes. ${BRAND_NAME} is built for teams that juggle many clients and recurring deliverables—retainers, campaigns, and approvals—without migrating files off Google Drive. You get one branded portal per client engagement, clear access boundaries, and Wrap when the relationship ends.`,
    displayAnswer: `Yes. ${brandNameInlineHtml()} is built for teams that juggle many clients and recurring deliverables—retainers, campaigns, and approvals—without migrating files off Google Drive. You get one branded portal per client engagement, clear access boundaries, and Wrap when the relationship ends.`,
    category: "Marketing",
  },
  {
    question: `How does ${BRAND_NAME} help with campaign assets, approvals, and retainers if we keep files in Google Drive?`,
    answer: `${BRAND_NAME} does not duplicate your creative files—it maps your existing Drive folders into client-facing portals. Clients see a professional, on-brand experience while your team keeps working in Drive. Engagements align to how you bill (projects or retainers), and you can see who accessed what in the Audit Log.`,
    displayAnswer: `${brandNameInlineHtml()} does not duplicate your creative files—it maps your existing Drive folders into client-facing portals. Clients see a professional, on-brand experience while your team keeps working in Drive. Engagements align to how you bill (projects or retainers), and you can see who accessed what in the <strong>Audit Log</strong>.`,
    category: "Marketing",
  },
  {
    question: `Why use ${BRAND_NAME} instead of email and ad-hoc Google Drive links for agency clients?`,
    answer: `Email and one-off Drive links scatter versions, hide who saw what, and leave “zombie links” active after a project wraps. ${BRAND_NAME} centralizes access per engagement, preserves an audit trail, and lets you revoke access in one step with Wrap—so campaign and strategy IP does not leak after the engagement ends.`,
    displayAnswer: `Email and one-off Drive links scatter versions, hide who saw what, and leave “zombie links” active after a project wraps. ${brandNameInlineHtml()} centralizes access per engagement, preserves an audit trail, and lets you revoke access in one step with <strong>Wrap</strong>—so campaign and strategy IP does not leak after the engagement ends.`,
    category: "Marketing",
  },
  {
    question: `Can a strategic consultant or advisory partner use ${BRAND_NAME} for long-term client relationships?`,
    answer: `Yes. Advisory and consulting engagements map cleanly to Engagements in ${BRAND_NAME}: ongoing strategy work, board-ready packs, and shared folders stay organized under one portal per client. When an advisory mandate concludes, Wrap removes client access without deleting your Drive files.`,
    displayAnswer: `Yes. Advisory and consulting engagements map cleanly to Engagements in ${brandNameInlineHtml()}: ongoing strategy work, board-ready packs, and shared folders stay organized under one portal per client. When an advisory mandate concludes, <strong>Wrap</strong> removes client access without deleting your Drive files.`,
    category: "Marketing",
  },
  {
    question: `Does ${BRAND_NAME} work for multiple marketing clients at the same time?`,
    answer: `Yes. Create a separate Engagement for each client, map the right Drive folders, and manage permissions per relationship. The Audit Log shows which external domains touched which files—ideal for agencies and fractional leaders running parallel accounts.`,
    displayAnswer: `Yes. Create a separate <strong>Engagement</strong> for each client, map the right Drive folders, and manage permissions per relationship. The <strong>Audit Log</strong> shows which external domains touched which files—ideal for agencies and fractional leaders running parallel accounts.`,
    category: "Marketing",
  },
  {
    question: `What counts as an "active engagement"?`,
    answer: "An active engagement is any engagement that is not deleted or closed. You can have unlimited closed or deleted engagements without counting toward your limit. Each subscription covers one firm; the cap applies to that firm's engagements.",
    category: "Billing",
  },
  {
    question: "Can I add more engagements?",
    answer: "Free includes 1 active engagement, Standard 10, Pro 25, Business 50, and Enterprise typically up to 100 (negotiated). Need more? Contact us for custom capacity.",
    displayAnswer: "Free includes <strong>1</strong> active engagement, Standard <strong>10</strong>, Pro <strong>25</strong>, Business <strong>50</strong>, and Enterprise typically up to <strong>100</strong> (negotiated). Need more? Contact us for custom capacity.",
    category: "Billing",
  },
  {
    question: "What if I need more than one firm?",
    answer: "Standard and Pro each cover 1 firm workspace. Business covers 3 firms. For additional firms beyond your plan's included count, add another subscription — or talk to us about Enterprise for custom multi-firm arrangements and consolidated billing.",
    category: "Billing",
  },
  {
    question: "Are there per-user charges?",
    answer: "No. All plans include unlimited members. Add as many team members, clients, and collaborators as you need without additional charges.",
    displayAnswer: "<strong>No.</strong> All plans include <strong>unlimited members</strong>. Add as many team members, clients, and collaborators as you need without additional charges.",
    category: "Billing",
  },
  {
    question: "What happens if I exceed my engagement limit?",
    answer: "Your plan includes a set number of active engagements per firm (Free 1, Standard 10, Pro 25, Business 50, Enterprise per contract). Close engagements you no longer need to free up slots, upgrade tiers, or contact us for higher capacity.",
    category: "Billing",
  },
  {
    question: "Can I upgrade, downgrade or cancel my plan?",
    answer: `Yes. Plan changes and cancellations are managed in our Polar billing portal. Upgrade, downgrade, and cancellation options are shown based on your current subscription and portal settings. Effective dates and billing adjustments are displayed in checkout/portal before you confirm any change. If you need a billing exception, contact ${PLATFORM_SUPPORT_EMAIL} and we'll help review it.`,
    displayAnswer: `Yes. Plan changes and cancellations are managed in our <strong>Polar billing portal</strong>. Upgrade, downgrade, and cancellation options are shown based on your current subscription and portal settings. Effective dates and billing adjustments are displayed in checkout/portal before you confirm any change. If you need a billing exception, contact <a href="mailto:${PLATFORM_SUPPORT_EMAIL}" class="underline">${PLATFORM_SUPPORT_EMAIL}</a> and we'll help review it.`,
    category: "Billing",
  },
  {
    question: "Is there a free plan?",
    answer: `Yes. ${BRAND_NAME} includes a free plan with a Demo firm and 1 real firm — no credit card required. When you're ready to remove limits, upgrade to Standard. All checkout details are shown in Polar before you confirm.`,
    displayAnswer: `Yes. ${brandNameInlineHtml()} includes a <strong>free plan</strong> with a Demo firm and 1 real firm — no credit card required. When you're ready to remove limits, <strong>upgrade to Standard and take off the training wheels</strong>. All checkout details are shown in [[POLAR_LINK]] before you confirm.`,
    category: "Billing",
  },
  {
    question: `What does "bring your own Storage Drive" mean?`,
    answer: `Your files stay in your own storage — Google Drive today, with OneDrive coming soon. ${BRAND_NAME} adds the client portal, engagement structure, and permissions on top without storing a second copy of your documents. There's no bulk migration: you keep working from your existing Drive with a professional delivery layer.`,
    displayAnswer: `Your files stay in your own storage — <strong>Google Drive</strong> today, with <strong>OneDrive coming soon</strong>. ${brandNameInlineHtml()} adds the client portal, engagement structure, and permissions on top without storing a second copy of your documents. <strong>No bulk migration</strong>: you keep working from your existing Drive with a professional delivery layer.`,
    category: "Billing",
  },
  {
    question: "What's included in the free plan?",
    answer: "The free plan includes a Demo firm (with sample data for exploration) and 1 real firm for production use — no credit card required. Limits apply: 1 active engagement, 1 client, and 20 documents. Paid plans remove those limits and unlock additional features such as templates, advanced review workflows, custom DNS, and SSO.",
    category: "Billing",
  },
  {
    question: "Where do I manage subscriptions and invoices?",
    answer: "Paid subscriptions are handled through our Polar billing integration. After checkout you'll use the Polar customer portal to update payment methods, view invoices, and start upgrades, downgrades, or cancellations—subject to what your subscription allows.",
    displayAnswer: "Paid subscriptions are handled through our <strong>Polar billing integration</strong>. After checkout you'll use the Polar customer portal to update payment methods, view invoices, and start upgrades, downgrades, or cancellations.",
    category: "Billing",
  },
  {
    question: "When should I choose Enterprise over Business?",
    answer: `Enterprise is for organizations that need custom DNS for the client portal, SSO/SAML, stricter controls (for example download restrictions and advanced auditing), multi-firm arrangements, or negotiated engagement limits. If that sounds like you, contact ${platformEmail("sales")} and we'll scope options.`,
    displayAnswer: `Enterprise is for organizations that need <strong>custom DNS</strong> for the client portal, <strong>SSO/SAML</strong>, stricter controls, multi-firm arrangements, or negotiated engagement limits. If that sounds like you, contact <a href="mailto:${platformEmail("sales")}" class="underline">${platformEmail("sales")}</a> and we'll scope options.`,
    category: "Billing",
  },
  {
    question: `How does the in-app Support Portal work?`,
    answer: `All paid plans (Standard and above) include a dedicated Support Portal built directly into your ${BRAND_NAME} workspace. You can submit bug reports, feature requests, or general enquiries, attach files or screenshots, track the status of each request, and exchange threaded comments with our team—without leaving the app.\n\nFor runtime errors, the portal goes a step further: if ${BRAND_NAME} detects an error during your session, the Bug Report form opens automatically with the relevant error context captured in the background. You can add any additional details you'd like to share and submit — our team receives the full technical information needed to investigate.`,
    category: "Billing",
  },
  {
    question: "What is SLA-based Priority support on Enterprise?",
    answer: `Enterprise subscribers receive a guaranteed response-time SLA, a named support contact, and priority routing for all requests submitted through the in-app portal. SLA terms are agreed as part of your Enterprise contract. Contact ${platformEmail("sales")} to discuss specifics.`,
    displayAnswer: `Enterprise subscribers receive a <strong>guaranteed response-time SLA</strong>, a named support contact, and priority routing for all requests submitted through the in-app portal. SLA terms are agreed as part of your Enterprise contract. Contact <a href="mailto:${platformEmail("sales")}" class="underline">${platformEmail("sales")}</a> to discuss specifics.`,
    category: "Billing",
  },
  {
    question: "What is your refund policy?",
    answer: "Valid subscription orders cannot be refunded per Firma's billing policy. However, if you experience any billing issues—such as accidental duplicate charges or payment errors—please contact our support team and we'll investigate and process a refund promptly.",
    displayAnswer: "Valid subscription orders cannot be refunded per Firma's billing policy. However, if you experience any billing issues—such as accidental duplicate charges or payment errors—please contact our support team and we'll investigate and process a refund promptly.",
    category: "Billing",
  },
  {
    question: "What if I experience a billing issue or duplicate charge?",
    answer: "Contact our support team at support@firma.io and describe the issue. We'll verify the charge and process a refund if a genuine billing error occurred. Our team reviews all billing disputes within 48 hours.",
    displayAnswer: "Contact our support team at <strong>support@firma.io</strong> and describe the issue. We'll verify the charge and process a refund if a genuine billing error occurred. Our team reviews all billing disputes within <strong>48 hours</strong>.",
    category: "Billing",
  },
  {
    question: "Can I pause or downgrade my subscription instead of canceling?",
    answer: "You can downgrade to a lower-tier plan at any time through the Polar billing portal. Downgrades take effect at your next billing date. If you need to temporarily pause your account, contact our support team to discuss options.",
    displayAnswer: "You can downgrade to a lower-tier plan at any time through the <strong>Polar billing portal</strong>. Downgrades take effect at your next billing date. If you need to temporarily pause your account, contact our support team to discuss options.",
    category: "Billing",
  },
]