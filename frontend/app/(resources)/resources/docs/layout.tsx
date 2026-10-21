import { DocsShell } from "@/components/marketing/v2/docs/docs-shell"

/** Docs (not in the sitemap; the in-app user guide is stale): the reading template with a docs sidebar. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return <DocsShell>{children}</DocsShell>
}
