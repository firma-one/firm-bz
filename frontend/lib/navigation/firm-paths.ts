/**
 * Centralized builders for the authenticated app's group/firm-scoped URLs:
 *   /d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]/[...rest]
 *
 * Every one of these paths is group-scoped now that groups are a real routing tier
 * (see .claude/plans/sandbox-firm-removal.md, Step 0) — the group segment is required,
 * not optional, since /d/f/... no longer exists as a route.
 *
 * Use these instead of hand-writing template literals so a future URL-shape change is a
 * one-file edit, not a repo-wide grep.
 */

const ENGAGEMENT_TABS = ['files', 'shares', 'comments', 'members', 'analytics', 'sources', 'audit', 'settings', 'wiki'] as const
export type EngagementTab = (typeof ENGAGEMENT_TABS)[number]

/** /d/[groupSlug]/f/ — the group-scoped firm picker. */
export function groupFirmListPath(groupSlug: string): string {
    return `/d/${groupSlug}/f/`
}

/** /d/[groupSlug]/f/[firmSlug] */
export function firmPath(groupSlug: string, firmSlug: string): string {
    return `/d/${groupSlug}/f/${firmSlug}`
}

/** /d/[groupSlug]/f/[firmSlug]?tab=X (firm-level tabs: overview, clients, calendar, doc-search, members, audit, settings) */
export function firmTabPath(groupSlug: string, firmSlug: string, tab: string): string {
    return `${firmPath(groupSlug, firmSlug)}?tab=${tab}`
}

/** /d/[groupSlug]/f/[firmSlug]?tab=settings&section=X */
export function firmSettingsPath(groupSlug: string, firmSlug: string, section?: string): string {
    const base = `${firmPath(groupSlug, firmSlug)}?tab=settings`
    return section ? `${base}&section=${section}` : base
}

/** /d/[groupSlug]/f/[firmSlug]/c */
export function clientListPath(groupSlug: string, firmSlug: string): string {
    return `${firmPath(groupSlug, firmSlug)}/c`
}

/** /d/[groupSlug]/f/[firmSlug]/c/[clientSlug] */
export function clientPath(groupSlug: string, firmSlug: string, clientSlug: string): string {
    return `${firmPath(groupSlug, firmSlug)}/c/${clientSlug}`
}

/** /d/[groupSlug]/f/[firmSlug]/c/[clientSlug]?tab=X (client-level tabs: projects, contacts, settings) */
export function clientTabPath(groupSlug: string, firmSlug: string, clientSlug: string, tab: string): string {
    return `${clientPath(groupSlug, firmSlug, clientSlug)}?tab=${tab}`
}

/**
 * /d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug][/tab][/subpath][#hash]
 * Engagement sub-tabs are path segments (catch-all [[...rest]]), not query params — e.g.
 * `files`, `shares`, `shares/board`, `members`, `settings`. Pass `tab` and optional `subpath`
 * for those; omit both for the default (files) tab.
 */
export function engagementPath(
    groupSlug: string,
    firmSlug: string,
    clientSlug: string,
    engagementSlug: string,
    opts?: { tab?: EngagementTab; subpath?: string; hash?: string },
): string {
    let path = `${clientPath(groupSlug, firmSlug, clientSlug)}/e/${engagementSlug}`
    if (opts?.tab) path += `/${opts.tab}`
    if (opts?.subpath) path += `/${opts.subpath}`
    if (opts?.hash) path += `#${opts.hash}`
    return path
}

/** Doc-comment deep link: .../files#doc-comment:{documentId}:{commentId} */
export function engagementDocCommentPath(
    groupSlug: string,
    firmSlug: string,
    clientSlug: string,
    engagementSlug: string,
    documentId: string,
    commentId: string,
): string {
    return engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug, {
        tab: 'files',
        hash: `doc-comment:${documentId}:${commentId}`,
    })
}

/** Doc-file deep link: .../files#doc-file:{documentId} */
export function engagementDocFilePath(
    groupSlug: string,
    firmSlug: string,
    clientSlug: string,
    engagementSlug: string,
    documentId: string,
): string {
    return engagementPath(groupSlug, firmSlug, clientSlug, engagementSlug, {
        tab: 'files',
        hash: `doc-file:${documentId}`,
    })
}
