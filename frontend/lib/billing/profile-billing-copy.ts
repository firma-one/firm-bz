/** Copy for Profile → Billing & invoices (and related UI). */
export const profileBillingCopy = {
    pageTitle: 'Profile',
    pageSubtitle: 'Your account and billing preferences.',
    billingSectionTitle: 'Billing & invoices',
    /** Shown under workspace on profile — Billing page holds catalog + Polar portal entry */
    billingSectionPlansOnBillingHint: 'Full plan list and Manage subscription (Polar) are on',
    billingSectionPlansOnBillingLink: 'Billing',
    currentPlanHeading: 'Current plan',
    inclusionsHeading: "What's included",
    upgradeTitle: 'Upgrade',
    upgradeBody: 'Choose a paid plan to unlock custom firms. Checkout is completed securely on Polar.',
    upgradeCta: 'Upgrade plan',
    managePaymentsCta: 'Manage payment methods',
    managePaymentsSectionTitle: 'Payment & invoices',
    managePaymentsHint:
        'Update cards, invoices, and subscription details in Polar’s customer portal (firm admins only).',
    managePaymentsAdminOnlyHint: 'Only firm admins can open the billing portal for this workspace.',
    cancelSubscriptionCta: 'Cancel subscription',
    cancelSubscriptionConfirm:
        'Cancel this subscription at the end of the current period? You will retain access until then.',
    cancelSubscriptionSuccessPrefix: 'Cancellation scheduled for',
    workspaceLabel: 'Workspace',
    statusLabel: 'Status',
    /** Shown before formatted period end when subscription has a renewal date */
    renewsOnLabel: 'Renews on',
    /** Shown before formatted period end when status is trialing */
    trialEndsOnLabel: 'Trial ends on',
    /** Tooltip on the status icon (replaces visible “Status” label). */
    statusIconTooltip: 'Subscription status for this workspace.',
    /** Tooltip on the renewal clock icon (replaces visible “Renews on” label). */
    renewsIconTooltip:
        'Next billing period boundary — your plan renews or the current period ends on this date.',
    trialEndsIconTooltip:
        'Your free trial ends on this date. Cancel before then to avoid starting paid billing.',
    switchPlanTitle: 'Switch plan',
    switchPlanBody: 'Move between paid plans (upgrade or downgrade) from the billing catalog.',
    switchPlanCta: 'Switch plan',
    noBillingAnchor: 'No default workspace found. Open a firm from the sidebar first.',
    portalError: 'Could not open billing portal. Try again or contact support.',
    freePlanFallbackName: 'Free plan',
} as const
