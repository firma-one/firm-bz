/**
 * An absolute link on Firma's main address (NEXT_PUBLIC_APP_URL): for pages that belong to the platform
 * rather than a workspace, such as /system, Billing, support requests, sign-up and invites to create an
 * account. Links about a workspace use `appLink` (lib/navigation/app-link.ts), which prefers the
 * workspace's approved custom domain.
 */
export function platformLink(path: string): string {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${path}`
}
