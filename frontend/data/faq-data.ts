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
    question: `Does ${BRAND_NAME}'s AI read my clients' documents?`,
    answer: `No. Brio never opens the files you deliver. It works from delivery data: deliverable names, statuses, due dates and who is on the engagement. It reads comment text only to draft a reply or suggest RAID entries, and an internal memo's text when the memo is added (or you ask again), to identify its action items and RAID entries. Your files stay in your Drive under the same non-custodial design as the rest of the product. Whatever a comment says, Brio only drafts and suggests: it cannot share, send, edit or change a status on its own, and a person approves every change.`,
    displayAnswer: `<strong>No.</strong> Brio <strong>never opens the files you deliver</strong>. It works from delivery data: deliverable names, statuses, due dates and who is on the engagement. It reads comment text only to draft a reply or suggest [[RAID:RAID entries]], and an internal memo's text when the memo is added (or you ask again), to identify its action items and RAID entries. Your files stay in your Drive under the same non-custodial design as the rest of the product. Whatever a comment says, Brio <strong>only drafts and suggests</strong>: it cannot share, send, edit or change a status on its own, and a person approves every change.`,
    category: "Security"
  },
  {
    question: `Does the AI send anything to my clients automatically?`,
    answer: `No. Brio drafts; a person approves. An engagement summary waits in a draft that only your team can see until someone reviews, edits and publishes it, and replies, nudges and client updates wait for someone on your team to send them. The two sections that commit your firm to a course of action, Mitigation & Contingency and Next Steps, are left blank for the engagement lead by design, not because the model could not write them. Human review here is policy, not a capability gap. If you turn on Brio for Reviewers, a Reviewer can ask Brio questions, and it answers only from what they can already see.`,
    displayAnswer: `<strong>No. Brio drafts; a person approves.</strong> An engagement summary waits in a draft that only your team can see until someone reviews, edits and publishes it, and replies, nudges and client updates wait for someone on your team to send them. The two sections that commit your firm to a course of action, <strong>Mitigation &amp; Contingency</strong> and <strong>Next Steps</strong>, are left blank for the engagement lead by design, not because the model could not write them. Human review here is policy, not a capability gap. If you turn on <strong>Brio for Reviewers</strong>, a Reviewer can ask Brio questions, and it answers only from what they can already see.`,
    category: "Security"
  },
  {
    question: `What are AI credits, and what happens when I run out?`,
    answer: `One credit is one AI action: an engagement summary, a firm brief, a chat answer, a drafted status update, reply or nudge, or the action items Brio identifies in a memo's call notes. The RAID check costs one credit per engagement: at most once a day, on a day with new messages, and each time someone asks Brio to check. A memo is read once, when it's added, for the one credit its action items cost. Each person's morning rundown of what needs them is free; asking Brio to rewrite it costs one. Every plan includes AI; the monthly allowance is what differs, from 25 on the free tier to 10,000 on Enterprise. Unused credits don't roll over. Running out never blocks your work: only the AI features pause, until your credits refill at the start of the next monthly cycle. Everything else in ${BRAND_NAME} keeps working as usual for your team and your clients (engagements, files, approvals, comments and filtered search), and everything Brio has already written stays readable.`,
    displayAnswer: `One credit is <strong>one AI action</strong>: an engagement summary, a firm brief, a chat answer, a drafted status update, reply or nudge, or the action items Brio identifies in a memo's call notes. The [[RAID:RAID check]] costs one credit per engagement: at most once a day, on a day with new messages, and each time someone asks Brio to check. A memo is read once, when it's added, for the one credit its action items cost. Each person's morning rundown of what needs them is <strong>free</strong>; asking Brio to rewrite it costs one. Every plan includes AI; the monthly allowance is what differs, from 25 on the free tier to 10,000 on Enterprise. Unused credits don't roll over. <strong>Running out never blocks your work:</strong> only the AI features pause, until your credits refill at the start of the next monthly cycle. Everything else in ${brandNameInlineHtml()} keeps working as usual for your team and your clients (engagements, files, approvals, comments and filtered search), and everything Brio has already written stays readable.`,
    category: "Features"
  },
  {
    question: `How does ${BRAND_NAME} connect to my Google Drive?`,
    answer: `${BRAND_NAME} uses secure OAuth 2.0 authentication to act as a management layer on top of your existing Google Drive. We assume a 'Non-Custodial' design, meaning your files effectively never leave your Google Drive. We simply organize them into professional Client Portals and manage sharing permissions.`,
    displayAnswer: `${brandNameInlineHtml()} uses secure OAuth 2.0 authentication to act as a management layer on top of your existing Google Drive. We assume a <strong>'Non-Custodial'</strong> design, meaning your files effectively <strong>never leave your Google Drive</strong>. We simply organize them into professional <strong>Client Portals</strong> and manage sharing permissions.`,
    category: "Security"
  },
  {
    question: `Does ${BRAND_NAME} work with Microsoft OneDrive or SharePoint?`,
    answer: `Yes — OneDrive and SharePoint are supported today in Beta, alongside our fully supported Google Drive integration. Connect either as the storage backend for your firm portal using the same OAuth-based, Non-Custodial design: your files stay in your Microsoft account, and ${BRAND_NAME} adds the client portal, permissions, and engagement structure on top.`,
    displayAnswer: `Yes — <strong>OneDrive and SharePoint are supported today in Beta</strong>, alongside our fully supported Google Drive integration. Connect either as the storage backend for your firm portal using the same OAuth-based, Non-Custodial design: your files stay in your Microsoft account, and ${brandNameInlineHtml()} adds the client portal, permissions, and engagement structure on top.`,
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
    category: "Use cases",
  },
  {
    question: `How does ${BRAND_NAME} help with campaign assets, approvals, and retainers if we keep files in Google Drive?`,
    answer: `${BRAND_NAME} does not duplicate your creative files—it maps your existing Drive folders into client-facing portals. Clients see a professional, on-brand experience while your team keeps working in Drive. Engagements align to how you bill (projects or retainers), and you can see who accessed what in the Audit Log.`,
    displayAnswer: `${brandNameInlineHtml()} does not duplicate your creative files—it maps your existing Drive folders into client-facing portals. Clients see a professional, on-brand experience while your team keeps working in Drive. Engagements align to how you bill (projects or retainers), and you can see who accessed what in the <strong>Audit Log</strong>.`,
    category: "Use cases",
  },
  {
    question: `Why use ${BRAND_NAME} instead of email and ad-hoc Google Drive links for agency clients?`,
    answer: `Email and one-off Drive links scatter versions, hide who saw what, and leave “zombie links” active after a project wraps. ${BRAND_NAME} centralizes access per engagement, preserves an audit trail, and lets you revoke access in one step with Wrap—so campaign and strategy IP does not leak after the engagement ends.`,
    displayAnswer: `Email and one-off Drive links scatter versions, hide who saw what, and leave “zombie links” active after a project wraps. ${brandNameInlineHtml()} centralizes access per engagement, preserves an audit trail, and lets you revoke access in one step with <strong>Wrap</strong>—so campaign and strategy IP does not leak after the engagement ends.`,
    category: "Use cases",
  },
  {
    question: `Can a strategic consultant or advisory partner use ${BRAND_NAME} for long-term client relationships?`,
    answer: `Yes. Advisory and consulting engagements map cleanly to Engagements in ${BRAND_NAME}: ongoing strategy work, board-ready packs, and shared folders stay organized under one portal per client. When an advisory mandate concludes, Wrap removes client access without deleting your Drive files.`,
    displayAnswer: `Yes. Advisory and consulting engagements map cleanly to Engagements in ${brandNameInlineHtml()}: ongoing strategy work, board-ready packs, and shared folders stay organized under one portal per client. When an advisory mandate concludes, <strong>Wrap</strong> removes client access without deleting your Drive files.`,
    category: "Use cases",
  },
  {
    question: `Does ${BRAND_NAME} work for multiple marketing clients at the same time?`,
    answer: `Yes. Create a separate Engagement for each client, map the right Drive folders, and manage permissions per relationship. The Audit Log shows which external domains touched which files—ideal for agencies and fractional leaders running parallel accounts.`,
    displayAnswer: `Yes. Create a separate <strong>Engagement</strong> for each client, map the right Drive folders, and manage permissions per relationship. The <strong>Audit Log</strong> shows which external domains touched which files—ideal for agencies and fractional leaders running parallel accounts.`,
    category: "Use cases",
  },
  {
    question: `What counts as an "active engagement"?`,
    answer: "An active engagement is any engagement that is not deleted or closed. You can have unlimited closed or deleted engagements without counting toward your limit. The cap applies to each firm's engagements.",
    category: "Billing",
  },
  {
    question: "Can I add more engagements?",
    answer: "Yes. Higher plans include more active engagements, and closed or deleted engagements never count toward your limit. Need more than your plan allows? Contact us for custom capacity.",
    displayAnswer: "Yes. Higher plans include <strong>more active engagements</strong>, and closed or deleted engagements <strong>never count</strong> toward your limit. Need more than your plan allows? Contact us for custom capacity.",
    category: "Billing",
  },
  {
    question: "What if I need more than one firm?",
    answer: "Each plan includes a set number of firm workspaces. For additional firms beyond your plan's included count, add another subscription — or talk to us about Enterprise for custom multi-firm arrangements and consolidated billing.",
    category: "Billing",
  },
  {
    question: "Are there per-user charges?",
    answer: "No. Paid plans include unlimited members. Add as many team members, clients, and collaborators as you need without additional charges. The free plan includes 2 users.",
    displayAnswer: "<strong>No.</strong> Paid plans include <strong>unlimited members</strong>. Add as many team members, clients, and collaborators as you need without additional charges. The free plan includes 2 users.",
    category: "Billing",
  },
  {
    question: "What happens if I exceed my engagement limit?",
    answer: "Your plan includes a set number of active engagements per firm. Close engagements you no longer need to free up slots, upgrade tiers, or contact us for higher capacity.",
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
    answer: `Yes. ${BRAND_NAME} includes a free plan for your first client, with a Demo firm to explore — no credit card required. When you're ready to remove limits, upgrade to Standard. All checkout details are shown in Polar before you confirm.`,
    displayAnswer: `Yes. ${brandNameInlineHtml()} includes a <strong>free plan</strong> for your first client, with a Demo firm to explore — no credit card required. When you're ready to remove limits, <strong>upgrade to Standard and take off the training wheels</strong>. All checkout details are shown in [[POLAR_LINK]] before you confirm.`,
    category: "Billing",
  },
  {
    question: `What does "bring your own Storage Drive" mean?`,
    answer: `Your files stay in your own storage — Google Drive, or Microsoft OneDrive/SharePoint (Beta). ${BRAND_NAME} adds the client portal, engagement structure, and permissions on top without storing a second copy of your documents. There's no bulk migration: you keep working from your existing Drive with a professional delivery layer.`,
    displayAnswer: `Your files stay in your own storage — <strong>Google Drive</strong>, or <strong>Microsoft OneDrive/SharePoint (Beta)</strong>. ${brandNameInlineHtml()} adds the client portal, engagement structure, and permissions on top without storing a second copy of your documents. <strong>No bulk migration</strong>: you keep working from your existing Drive with a professional delivery layer.`,
    category: "Billing",
  },
  {
    question: "What's included in the free plan?",
    answer: "The free plan includes 1 client, 2 users, and 25 AI credits a month, plus a Demo firm with sample data to explore — no credit card required. Paid plans raise those limits and add features such as audit history, templates, custom domains, and SSO, depending on the tier.",
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