import { BRAND_NAME, brandNameInlineHtml } from "@/config/brand"

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