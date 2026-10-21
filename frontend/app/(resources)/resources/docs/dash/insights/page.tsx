import { AlertTriangle } from "lucide-react"
import { BRAND_NAME } from "@/config/brand"
import {
    DocsBox,
    DocsGrid,
    DocsH3,
    DocsHeader,
    DocsList,
    DocsMiniCard,
    DocsNote,
    DocsPanel,
    DocsSection,
    DocsTile,
} from "@/components/marketing/v2/docs/docs-blocks"
import { ActivityHubPreview, SummaryStoragePreview } from "@/components/marketing/v2/docs/docs-insights-previews"

const ICON = { size: 18, strokeWidth: 2.2, "aria-hidden": true } as const

export default function InsightsPage() {
    return (
        <>
            <DocsHeader section="Dashboard" title="Insights">
                Get real-time security insights and analytics about your Google Drive documents.
                Identify risks, track sharing patterns, and ensure compliance.
            </DocsHeader>

            {/* Overview */}
            <DocsSection title="Drive Insights Overview">
                <p>
                    The Insights page provides a comprehensive view of your Google Drive security posture and document sharing patterns.
                </p>

                {/* Live Preview for Stats & Storage */}
                <SummaryStoragePreview />

                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Summary Cards:">
                        <DocsList
                            items={[
                                <><strong>Stale Documents:</strong> Files not accessed in &gt;90 days. Candidates for cleanup.</>,
                                <><strong>Large Files:</strong> Files larger than 100MB taking up significant quota.</>,
                                <><strong>Sensitive Content:</strong> Files flagged with potential sensitive info (PII, Financial).</>,
                                <><strong>Risky Shares:</strong> Publicly accessible files or external shares to unsecured domains.</>,
                            ]}
                        />
                    </DocsBox>
                    <DocsBox tone="white" title="Storage Analysis:">
                        <p>Visual breakdown of your storage usage by file type.</p>
                        <DocsList
                            items={[
                                "Track quota usage across Video, Image, Document, and Audio files",
                                "Identify which file types are consuming the most space",
                                "Direct link to Google One storage management",
                            ]}
                        />
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Activity Hub (New Feature) */}
            <DocsSection title="Activity Hub">
                <p>
                    The Activity Hub is your central command center for file operations. It aggregates activity from various sources to give you a complete picture of what&apos;s happening in your Drive.
                </p>

                {/* Live Preview Component */}
                <ActivityHubPreview />

                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Tabs Breakdown:">
                        <DocsList
                            items={[
                                <><strong>Recent:</strong> Time-based feed of files you&apos;ve interacted with (Viewed, Edited, Created). Perfect for resuming work.</>,
                                <><strong>Trending:</strong> High-activity files sorted by engagement volume. See what&apos;s hot in your organization.</>,
                                <><strong>Storage:</strong> Identify large and stale files. Use the &quot;Cleanup Candidate&quot; badge to reclaim space efficiently.</>,
                                <><strong>Sharing:</strong> Comprehensive view of sharing relationships. &quot;Shared With You&quot; vs &quot;Shared By You&quot;.</>,
                            ]}
                        />
                    </DocsBox>
                    <DocsBox tone="white" title="Smart Badges:">
                        <ul className="mk-docs-badges">
                            <li>
                                <span className="mk-docs-badge mk-docs-badge--risk">RISK</span>
                                Critical issues like &quot;Public Link&quot; or sensitive content exposure.
                            </li>
                            <li>
                                <span className="mk-docs-badge mk-docs-badge--attention">ATTENTION</span>
                                Warnings like &quot;External Share&quot; or &quot;Stale Access&quot;.
                            </li>
                            <li>
                                <span className="mk-docs-badge mk-docs-badge--shared">SHARED</span>
                                Indicates files that have active sharing permissions.
                            </li>
                        </ul>
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Security Alerts */}
            <DocsSection title="Security Alerts & Risk Detection">
                <p>{BRAND_NAME} automatically scans your Drive for security risks and alerts you to potential issues.</p>
                <DocsGrid cols={2}>
                    <DocsTile tone="red" icon={<AlertTriangle {...ICON} />} title="High-Risk Alerts">
                        <p>Critical security issues that need immediate attention:</p>
                        <DocsList
                            items={[
                                'Files shared publicly with "Anyone with the link"',
                                "Sensitive documents with broad access",
                                "Files with external domain sharing",
                                "Documents with edit permissions to unknown users",
                            ]}
                        />
                    </DocsTile>
                    <DocsTile tone="amber" icon={<AlertTriangle {...ICON} />} title="Medium-Risk Alerts">
                        <p>Issues that should be reviewed:</p>
                        <DocsList
                            items={[
                                "Files shared with large groups",
                                "Documents with many collaborators",
                                "Stale share links (not accessed in 90+ days)",
                                "Files in shared drives with broad permissions",
                            ]}
                        />
                    </DocsTile>
                </DocsGrid>
                <DocsNote type="tip" title="Taking Action">
                    <p>
                        Click on any alert to see the affected files. You can then review permissions
                        and make changes directly in Google Drive by clicking &quot;Open in Google Drive&quot;.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* File Sharing Analytics */}
            <DocsSection title="File Sharing Analytics">
                <p>Understand how your files are being shared and who has access.</p>
                <DocsBox title="Sharing Metrics:">
                    <DocsList
                        items={[
                            <><strong>Total shared files:</strong> Number of files with sharing enabled</>,
                            <><strong>Public files:</strong> Files accessible to anyone with the link</>,
                            <><strong>External shares:</strong> Files shared outside your organization</>,
                            <><strong>Internal shares:</strong> Files shared within your organization</>,
                            <><strong>Most shared files:</strong> Documents with the most collaborators</>,
                        ]}
                    />
                </DocsBox>
                <DocsGrid cols={2}>
                    <DocsBox tone="white" title="Sharing Trends">
                        <p>
                            Track how sharing patterns change over time. Identify spikes in external
                            sharing or increases in public file exposure.
                        </p>
                    </DocsBox>
                    <DocsBox tone="white" title="Collaboration Insights">
                        <p>
                            See which teams or individuals are most active in sharing and collaborating
                            on documents.
                        </p>
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Expiring Shares */}
            <DocsSection title="Expiring Share Links">
                <p>Track share links that are about to expire or have recently expired.</p>
                <DocsBox title="What's tracked:">
                    <DocsList
                        items={[
                            "Share links expiring in the next 7 days",
                            "Recently expired links (last 30 days)",
                            "Files with time-limited access",
                            "Temporary collaborator permissions",
                        ]}
                    />
                </DocsBox>
                <DocsNote type="info" title="Proactive Management">
                    <p>
                        Get notified before share links expire so you can renew them if needed or
                        ensure access is properly removed for security.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Public Files */}
            <DocsSection title="Public File Detection">
                <p>Identify files that are publicly accessible and may pose a security risk.</p>
                <DocsBox tone="red" title="Public file categories:">
                    <DocsList
                        items={[
                            <><strong>&quot;Anyone with the link&quot;:</strong> Files accessible to anyone who has the URL</>,
                            <><strong>&quot;Public on the web&quot;:</strong> Files indexed by search engines</>,
                            <><strong>Domain-wide sharing:</strong> Files shared with entire organization</>,
                        ]}
                    />
                </DocsBox>
                <DocsNote type="warning" title="Security Risk">
                    <p>
                        Public files can be accessed by anyone, including competitors, malicious actors,
                        or search engines. Review these files regularly and restrict access when appropriate.
                    </p>
                    <p>
                        <strong>Best practice:</strong> Only make files public if they&apos;re intended for
                        public consumption (e.g., marketing materials, public documentation).
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Sensitive Data */}
            <DocsSection title="Sensitive Data Identification">
                <p>{BRAND_NAME} helps identify files that may contain sensitive information.</p>
                <DocsBox>
                    <DocsH3>Detection patterns:</DocsH3>
                    <DocsList
                        items={[
                            'Files with keywords like "confidential", "private", "internal"',
                            "Financial documents (invoices, budgets, reports)",
                            "HR documents (resumes, contracts, reviews)",
                            "Legal documents (agreements, NDAs, contracts)",
                        ]}
                    />
                </DocsBox>
                <DocsNote type="tip" title="Coming Soon">
                    <p>
                        Advanced content scanning to detect PII (personally identifiable information),
                        credit card numbers, social security numbers, and other sensitive data patterns.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* How to Use Insights */}
            <DocsPanel title="How to Use Insights">
                <DocsGrid cols={2}>
                    <DocsMiniCard title="Regular Reviews">
                        Check your Insights dashboard weekly to stay on top of security risks and sharing patterns.
                    </DocsMiniCard>
                    <DocsMiniCard title="Act on Alerts">
                        Address high-risk alerts immediately. Review and update file permissions as needed.
                    </DocsMiniCard>
                    <DocsMiniCard title="Track Trends">
                        Monitor how your sharing patterns change over time. Look for unusual spikes or patterns.
                    </DocsMiniCard>
                    <DocsMiniCard title="Educate Your Team">
                        Use insights to educate your team about secure file sharing practices and policies.
                    </DocsMiniCard>
                </DocsGrid>
            </DocsPanel>
        </>
    )
}
