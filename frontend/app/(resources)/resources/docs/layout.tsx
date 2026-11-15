import type { Metadata } from "next"

import { DocsShell } from "@/components/marketing/v2/docs/docs-shell"

/**
 * The docs are stale and unlinked, so they stay out of search indexes. They are still served, so old
 * bookmarks keep working. Pages inherit this unless they set their own `robots`.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

/** Docs (not in the sitemap; the in-app user guide is stale): the reading template with a docs sidebar. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return <DocsShell>{children}</DocsShell>
}
