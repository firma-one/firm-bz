import { BRAND_NAME } from '@/config/brand'

/** Product copy: free sandbox vs paid custom firms (single source of truth). */
export const upgradeCopy = {
    sheetTitle: 'Add a custom firm',
    /** Centered upgrade modal title */
    upgradeDialogTitle: 'Add a custom firm',
    upgradeDialogBody: `Your free plan includes a Demo firm and 1 real firm. Pick a plan below to take off the training wheels—you will finish on a secure hosted checkout page, then return to your workspace.`,
    planPickerCta: 'Checkout',
    /** Hosted checkout when changing paid plan without customer portal */
    planPickerSwitchPlanCta: 'Switch plan',
    /** Polar customer portal — shared CTA above plan grid for active subscribers */
    billingPortalManageSubscriptionCta: 'Manage Subscription',
    /** Compact CTA on billing workspace plan strip */
    billingPortalManageShortCta: 'Manage',
    planPickerCurrentPlanBadge: 'Current plan',
    currentPlanSummaryUnavailable: 'Unable to load plan details.',
    /** When `subscriptionPlan` is not yet on the active subscription row / Polar sync (rare). */
    currentPlanNameFallback: 'Free',
    currentPlanLabelPlan: 'Plan',
    currentPlanLabelValidUntil: 'Valid until',
    currentPlanLabelAccessEnds: 'Access ends',
    currentPlanValidUntilUnlimited: 'Unlimited',
    scheduledCancelWarning: 'Subscription cancelled — access to custom firms ends on',
    scheduledCancelWarningTrail: '. Reactivate before this date to keep access.',
    /** https://polar.sh — linked from billing UI */
    polarShUrl: 'https://polar.sh',
    polarLinkLabel: 'Polar',
    polarTooltip: `Polar is a billing and checkout platform. Card payments run on Stripe-backed infrastructure—you never enter card details inside ${BRAND_NAME}.`,
    /** Footnote (Polar link injected between intro and outro in BillingCheckoutFootnote). */
    billingCheckoutIntro: `You'll pay on a secure, encrypted checkout hosted by our billing partner`,
    billingCheckoutOutro: `. Payments run on Stripe-backed infrastructure—${BRAND_NAME} never collects or stores your full card number. When checkout completes, you'll return here automatically.`,
    /** Shown under the Compare plans control (portal pair or top-of-picker link). */
    billingFooterHelp: 'Use Compare plans for tiers and limits.',
    planPickerEmpty:
        'No subscription plans are available here right now. Open the full pricing page or try again later.',
    planPickerMissingFirm: "We couldn't determine which workspace to bill. Select a firm from the list, then open \"How to upgrade\" again.",
    sheetBody: `Your free plan includes a Demo firm and 1 real firm. To add more firms for day-to-day business and client work, upgrade to a paid plan on ${BRAND_NAME}.`,
    sheetAfterCheckout: 'You will finish checkout in the browser, then return to this workspace.',
    dropdownHeadline: 'Add firm',
    dropdownBody:
        'Demo firm is included on the free plan. Each custom firm requires an active subscription.',
    dropdownAction: 'How to upgrade',
    billingTitle: 'Scale as you grow',
    /** Single page `<h1>` for `/d/billing` and onboarding subscribe step (shared). */
    billingPageTitle: 'Billing & plans',
    /** In-card heading above workspace name (avoids duplicating the page title). */
    billingCardWorkspaceHeading: 'Billing Entity',
    billingHeadline: 'Scale as you grow',
    billingBody: `Your current plan includes limits on firms, clients, engagements and documents.`,
    billingBodyLine2: `Your Demo firm is always available on all plans. Upgrade to increase your limits.`,
    billingCheckoutReturnNote: `When checkout completes, you\'ll return to the workspace you started from.`,
    billingTrustLine1: 'Secure Checkout',
    billingTrustLine1Detail: `Your card is entered only on our billing partner's secure page—not inside ${BRAND_NAME}.`,
    billingTrustLine2: 'Workspace stays linked',
    billingTrustLine2Detail: 'This upgrade applies to the workspace shown below.',
    billingTrustLine3: 'Pricing before tax',
    billingTrustLine3Detail:
        'Prices shown exclude local taxes, which are calculated and confirmed at checkout.',
    billingIncludedLabel: 'Included on free tier',
    billingRecommendedBadge: 'Recommended',
    /** react-joyride: onboarding billing — step 1 highlights Skip, then the chosen plan card. */
    checkoutIntentJoyrideSkipTitle: "Skip if you're not ready",
    checkoutIntentJoyrideSkipBody:
        'You can subscribe later from settings. Skip now to continue setup (for example, connect Google Drive).',
    /** Step 2 — plan card spotlight (checkout intent from pricing). */
    checkoutIntentJoyrideTitle: 'Your plan choice',
    checkoutIntentJoyrideLead: 'You picked ',
    checkoutIntentJoyrideTrail:
        ' on our pricing page. Confirm the billing period above, then continue to checkout when you are ready.',
    /** Step 2 — plan card spotlight (no checkout intent — generic first-visit). */
    billingTourGenericTitle: 'Upgrade your limits',
    billingTourGenericBody:
        'Paid plans increase limits on firms, clients, engagements, and documents over the free plan. Pick a billing period above, then continue to checkout when you are ready.',
    /** Step 1 — skip button spotlight when there is no Skip button (standalone billing page). */
    billingTourSkipTitle: 'Come back any time',
    billingTourSkipBody:
        'Billing is always available from your firm settings. No rush—upgrade when you are ready.',
    checkoutIntentJoyridePrimaryCta: 'Got it',
    /** Non-blocking checkout hint strip — short headline (mirrors profile name line). */
    checkoutHintStripTitle: 'Upgrade to Standard to increase your limits',
    /** Verbose subtitle under headline (mirrors profile plan / email line). */
    checkoutHintStripBodyIntent:
        'Upgrade to a Standard plan to ease limits on clients, contacts, engagements, documents & audit history.',
    checkoutHintStripBodyUpgrade:
        'Upgrade to a Standard plan to ease limits on clients, contacts, engagements, documents & audit history.',
freeSandboxFootnote: 'No checkout needed—keep exploring your Demo firm.',
    addFirmModalHint: `The free plan includes your Demo firm. Subscribe to add custom firms for your business.`,
    ctaContinueBilling: 'Continue to billing',
    ctaComparePlans: 'Compare plans',
    /** Onboarding billing step — defer subscribe and continue setup (e.g. connect Drive). */
    billingOnboardingSkipSubscribeCta: 'Skip for now',
    /** Customer portal unified intro (Polar link is inserted between prefix/suffix). */
    billingPortalCombinedIntroPrefix:
        'Manage your subscription on a secure, encrypted billing page hosted by our billing partner',
    billingPortalCombinedIntroSuffix:
        `. Change plans when your provider allows it, update payment details, or cancel. Payments run on Stripe-backed infrastructure—${BRAND_NAME} never collects or stores your full card number.`,
    /** Legacy portal copy key (kept for compatibility if referenced elsewhere). */
    billingPortalSwitchOpensSecurePage:
        'Manage your subscription on a secure billing page—change plans when your provider allows it, update payment details, or cancel.',
    /** Unused on billing page — Polar is named in `billingCheckoutIntro` / `BillingCheckoutFootnote`. */
    billingPortalManagedByPrefix: 'Managed by our billing partner ',
    billingPortalManagedBySuffix: '.',
    /** Shown under Manage Subscription in the portal CTA pair. */
    billingPortalSyncFootnote:
        'When you return, this page refreshes automatically; updates may take a moment while webhooks sync.',
    billingPortalOpening: 'Opening billing portal…',
    billingPortalSwitchUseSharedCtaHint:
        'Use Manage Subscription above to open the secure billing page and change plans when available.',
    billingPortalAdminOnlyHint:
        'Only a firm admin can manage subscription and billing. Ask an admin for access.',
    /** Post-checkout success page — past tense; Polar link inserted via `BillingPolarExplainInline`. */
    checkoutSuccessPolarFootnotePrefix:
        'Your payment was completed on a secure, encrypted checkout hosted by our billing partner',
    checkoutSuccessPolarFootnoteSuffix: `. Payments run on Stripe-backed infrastructure—${BRAND_NAME} never collects or stores your full card number.`,
    checkoutSuccessReceiptLine:
        'A receipt is also emailed to the address you used at checkout. Use Download invoice below if you need a PDF right away.',
    /** Refund policy note shown on billing page */
    billingRefundPolicyNoteIntro: 'For billing issues or accidental duplicate charges,',
    billingRefundPolicyNoteOutro:
        '. Note: valid subscription orders cannot be refunded per Firma\'s billing policy.',
} as const
