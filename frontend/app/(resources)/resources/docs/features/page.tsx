import Link from "next/link"
import { BRAND_NAME } from "@/config/brand"
import {
    DocsBox,
    DocsCode,
    DocsGrid,
    DocsH3,
    DocsHeader,
    DocsList,
    DocsMiniCard,
    DocsPanel,
    DocsPre,
    DocsSection,
    DocsSteps,
} from "@/components/marketing/v2/docs/docs-blocks"

export default function FeaturesDocsPage() {
    return (
        <>
            <DocsHeader title="Features">
                {BRAND_NAME} provides powerful tools to manage, preview, and track your Google Drive documents
                with an intuitive interface and advanced filtering capabilities.
            </DocsHeader>

            {/* Document Preview */}
            <DocsSection title="Document Preview">
                <p>Preview your Google Docs, Sheets, and Slides directly within {BRAND_NAME} without leaving the dashboard.</p>
                <DocsSteps
                    title="How to use:"
                    steps={[
                        "Navigate to your dashboard and locate any document",
                        "Click the three-dot menu (⋮) next to the document",
                        <>Select <strong>&quot;Preview&quot;</strong> from the dropdown</>,
                        "The document opens in a side drawer with full Google Docs viewer",
                    ]}
                />
                <p className="mk-docs-aside">
                    <strong>Note:</strong> Preview mode is read-only. To edit, click &quot;Open in Google Docs&quot; from the preview drawer.
                </p>
            </DocsSection>

            {/* Activity & Version History */}
            <DocsSection title="Activity & Version History">
                <p>Track all changes to your documents with a comprehensive activity timeline and version history.</p>
                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Activity Tab">
                        <p>See a chronological timeline of all document events:</p>
                        <DocsList
                            items={[
                                "Document creation",
                                "Edits and modifications",
                                "Renames and moves",
                                "Sharing permission changes",
                            ]}
                        />
                        <p className="mk-docs-small">Shows actual user names who performed each action.</p>
                    </DocsBox>
                    <DocsBox tone="white" title="Version History">
                        <p>Access and restore previous versions:</p>
                        <DocsList
                            items={[
                                "View all saved revisions",
                                "See who made each change",
                                "Download specific versions",
                                "Compare changes over time",
                            ]}
                        />
                        <p className="mk-docs-small">Supports both text documents and binary files.</p>
                    </DocsBox>
                </DocsGrid>
                <DocsSteps
                    title="How to access:"
                    steps={[
                        "Click the three-dot menu (⋮) next to any document",
                        <>Select <strong>&quot;Version History&quot;</strong></>,
                        <>Use the tabs to switch between <strong>Activity</strong> and <strong>History</strong></>,
                    ]}
                />
                <DocsBox tone="amber" title="Setup Required">
                    <p>To see actual user names in the Activity tab (instead of &quot;User&quot;), you must:</p>
                    <ol className="mk-docs-steps">
                        <li>Enable the <strong>Google People API</strong> in your Google Cloud Console</li>
                        <li>Disconnect and reconnect your Google Drive account in {BRAND_NAME}</li>
                    </ol>
                    <p className="mk-docs-small">This grants the necessary permissions to resolve user identities.</p>
                </DocsBox>
            </DocsSection>

            {/* Smart Filtering */}
            <DocsSection title="Smart Filtering with .appignore">
                <p>
                    Control which files appear in your {BRAND_NAME} dashboard using a <DocsCode>.appignore</DocsCode> file
                    in the <strong>application server root</strong> (the Next.js app working directory), similar to <DocsCode>.gitignore</DocsCode>.
                </p>
                <DocsBox title="How it works:">
                    <p>
                        Add a file named <DocsCode>.appignore</DocsCode> next to your deployed app (e.g. <DocsCode>frontend/.appignore</DocsCode> in this repo when running locally).
                        Non-comment lines are treated as folder name patterns to exclude from Google Drive listings in {BRAND_NAME}.
                    </p>
                    <DocsH3>Example .appignore:</DocsH3>
                    <DocsPre>{`# Hide app metadata folders (matches repo default)
/.meta/**

# Exclude all files in the Archive folder
Archive/

# Exclude all PDFs
*.pdf

# Exclude specific file by ID
file:1a2b3c4d5e6f7g8h9i0j

# Exclude temporary files
*~
*.tmp`}</DocsPre>
                    <DocsH3>Supported patterns:</DocsH3>
                    <DocsList
                        items={[
                            <><DocsCode>FolderName/</DocsCode> - Exclude entire folder</>,
                            <><DocsCode>*.extension</DocsCode> - Exclude by file type</>,
                            <><DocsCode>file:FILE_ID</DocsCode> - Exclude specific file by Google Drive ID</>,
                            <><DocsCode># comment</DocsCode> - Add comments</>,
                        ]}
                    />
                    <p className="mk-docs-small">
                        <strong>Tip:</strong> Changes to <DocsCode>.appignore</DocsCode> take effect after the server reloads patterns (short cache).
                        Refresh your dashboard to see updated results.
                    </p>
                </DocsBox>
            </DocsSection>

            {/* Document Downloads */}
            <DocsSection title="Secure Downloads">
                <p>Download documents and specific versions directly through {BRAND_NAME}&apos;s secure proxy.</p>
                <DocsBox title="Download options:">
                    <DocsList
                        items={[
                            <><strong>Current version:</strong> Click the three-dot menu → &quot;Download&quot;</>,
                            <><strong>Specific version:</strong> Open Version History → Click download icon next to any revision</>,
                            <>
                                <strong>Format conversion:</strong> Google Docs are automatically converted to appropriate formats
                                (Docs → .docx, Sheets → .xlsx, Slides → .pptx)
                            </>,
                        ]}
                    />
                    <p className="mk-docs-small">
                        All downloads are streamed through our secure infrastructure. See our{" "}
                        <Link href="/resources/docs/security">Security & Privacy</Link>{" "}
                        page for details.
                    </p>
                </DocsBox>
            </DocsSection>

            {/* Quick Reference */}
            <DocsPanel title="Quick Reference">
                <DocsGrid cols={2}>
                    <DocsMiniCard title="Document Actions Menu">
                        Click the <strong>⋮</strong> icon next to any document to access Preview, Version History, and Download options.
                    </DocsMiniCard>
                    <DocsMiniCard title="Filter Documents">
                        Use the filter dropdown in the dashboard to show only specific file types (Docs, Sheets, Slides, PDFs, etc.).
                    </DocsMiniCard>
                    <DocsMiniCard title="Search">
                        Use the search bar to find documents by name. Supports real-time filtering as you type.
                    </DocsMiniCard>
                    <DocsMiniCard title="Manage Connections">
                        Visit the Connectors page to add, remove, or reconnect your Google Drive accounts.
                    </DocsMiniCard>
                </DocsGrid>
            </DocsPanel>
        </>
    )
}
