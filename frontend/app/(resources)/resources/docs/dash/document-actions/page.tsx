import { BRAND_NAME } from "@/config/brand"
import {
    DocsBox,
    DocsGrid,
    DocsHeader,
    DocsList,
    DocsMiniCard,
    DocsNote,
    DocsPanel,
    DocsSection,
    DocsSteps,
    DocsTile,
} from "@/components/marketing/v2/docs/docs-blocks"

/** File-type chips: soft tints from the site's avatar palette, one per type. */
const FILE_TYPES = [
    { label: "DOC", name: "Google Docs", bg: "#E3EDFB", fg: "#2C4A9A" },
    { label: "XLS", name: "Google Sheets", bg: "#E2F2E7", fg: "#2F7A46" },
    { label: "PPT", name: "Google Slides", bg: "#FFF1D6", fg: "#8A5A00" },
    { label: "PDF", name: "PDF Files", bg: "#FBE4E1", fg: "#A3291B" },
    { label: "IMG", name: "Images", bg: "rgba(46, 230, 197, 0.2)", fg: "#00775F" },
    { label: "FILE", name: "Other Files", bg: "#EEF2F0", fg: "#4F625B" },
]

export default function DocumentActionsPage() {
    return (
        <>
            <DocsHeader section="Dashboard" title="Document Actions">
                Access powerful document management features through the action menu. Preview files,
                track changes, download documents, and view detailed metadata.
            </DocsHeader>

            {/* Action Menu Overview */}
            <DocsSection title="Document Action Menu">
                <p>Every document in your dashboard has an action menu (⋮) that provides quick access to common operations.</p>
                <DocsSteps
                    title="How to access:"
                    steps={[
                        "Navigate to your dashboard",
                        "Find any document in the list",
                        <>Click the <strong>three-dot menu (⋮)</strong> icon</>,
                        "Select the action you want to perform",
                    ]}
                />
                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Available Actions:">
                        <DocsList
                            items={[
                                "Preview document",
                                "View version history & activity",
                                "Download document",
                                "Open in Google Docs",
                                "Copy filename",
                                "View file information",
                            ]}
                        />
                    </DocsBox>
                    <DocsBox tone="white" title="Quick Info:">
                        <DocsList
                            items={[
                                "File type icon (color-coded)",
                                "Created date & author",
                                "Last modified date & author",
                                "File size",
                                "Sharing status",
                            ]}
                        />
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Document Preview */}
            <DocsSection title="Document Preview">
                <p>Preview Google Docs, Sheets, and Slides directly within {BRAND_NAME} without leaving the dashboard.</p>
                <DocsSteps
                    title="How to preview:"
                    steps={[
                        "Click the three-dot menu (⋮) next to any document",
                        <>Select <strong>&quot;Preview&quot;</strong></>,
                        "The document opens in a side drawer with full Google Docs viewer",
                        "Use the toolbar to zoom, navigate pages, or open in Google Docs",
                    ]}
                />
                <DocsNote type="info" title="Preview Limitations">
                    <p>
                        Preview mode is <strong>read-only</strong>. To edit the document, click
                        &quot;Open in Google Docs&quot; from the preview drawer.
                    </p>
                    <p>
                        Some file types (PDFs, images) may have limited preview functionality depending
                        on Google Drive&apos;s viewer capabilities.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Version History & Activity */}
            <DocsSection title="Version History & Activity">
                <p>Track all changes to your documents with comprehensive activity timeline and version history.</p>
                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Activity Tab">
                        <p>Chronological timeline of all document events:</p>
                        <DocsList
                            items={[
                                "Document creation",
                                "Edits and modifications",
                                "Renames and moves",
                                "Sharing permission changes",
                            ]}
                        />
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
                <DocsNote type="warning" title="Setup Required for User Names">
                    <p>
                        To see actual user names in the Activity tab (instead of &quot;User&quot;), you&apos;ll need to
                        reconnect your Google Drive with additional permissions.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Downloads */}
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
                </DocsBox>
                <DocsNote type="tip" title="Bulk Downloads">
                    <p>Coming soon: Ability to download multiple documents at once as a ZIP archive.</p>
                </DocsNote>
            </DocsSection>

            {/* File Information */}
            <DocsSection title="File Information">
                <p>View detailed information about each document directly from the action menu.</p>
                <DocsBox title="Information displayed:">
                    <DocsList
                        items={[
                            <><strong>File type:</strong> Color-coded icon indicating document type</>,
                            <><strong>Created:</strong> Date and author who created the document</>,
                            <><strong>Modified:</strong> Last modification date and author</>,
                            <><strong>File size:</strong> Document size in human-readable format</>,
                            <><strong>Sharing status:</strong> Public, shared, or private</>,
                            <><strong>Full filename:</strong> Hover to see complete filename, click to copy</>,
                        ]}
                    />
                </DocsBox>
                <DocsBox tone="white" title="Copy Filename">
                    <p>
                        Click the filename in the action menu to copy it to your clipboard.
                        Useful for referencing documents in other tools or documentation.
                    </p>
                </DocsBox>
            </DocsSection>

            {/* File Type Icons */}
            <DocsSection title="File Type Icons">
                <p>Documents are color-coded by type for easy identification.</p>
                <DocsGrid cols={3}>
                    {FILE_TYPES.map((t) => (
                        <DocsTile
                            key={t.label}
                            icon={<span className="mk-docs-filetype">{t.label}</span>}
                            iconStyle={{ background: t.bg, color: t.fg, boxShadow: "none" }}
                            title={t.name}
                        />
                    ))}
                </DocsGrid>
            </DocsSection>

            {/* Quick Reference */}
            <DocsPanel title="Quick Reference">
                <DocsGrid cols={2}>
                    <DocsMiniCard title="Filter Documents">
                        Use the filter dropdown in the dashboard to show only specific file types (Docs, Sheets, Slides, PDFs, etc.).
                    </DocsMiniCard>
                    <DocsMiniCard title="Search">
                        Use the search bar to find documents by name. Supports real-time filtering as you type.
                    </DocsMiniCard>
                    <DocsMiniCard title="Keyboard Shortcuts">
                        Press <kbd className="mk-docs-kbd">Esc</kbd> to close preview or version history drawers.
                    </DocsMiniCard>
                    <DocsMiniCard title="Bulk Actions">
                        Coming soon: Select multiple documents and perform actions on all of them at once.
                    </DocsMiniCard>
                </DocsGrid>
            </DocsPanel>
        </>
    )
}
