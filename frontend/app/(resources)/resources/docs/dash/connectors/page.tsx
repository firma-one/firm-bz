import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { BRAND_NAME } from "@/config/brand"
import {
    DocsBox,
    DocsGrid,
    DocsHeader,
    DocsList,
    DocsNote,
    DocsPanel,
    DocsQa,
    DocsSection,
    DocsSteps,
    DocsTile,
} from "@/components/marketing/v2/docs/docs-blocks"

const ICON = { size: 18, strokeWidth: 2.2, "aria-hidden": true } as const

export default function ConnectorsPage() {
    return (
        <>
            <DocsHeader section="Dashboard" title="Connectors">
                Connect your Google Drive to {BRAND_NAME} and start monitoring your documents for security risks,
                sharing patterns, and compliance issues.
            </DocsHeader>

            {/* Overview */}
            <DocsSection title="What are Connectors?">
                <p>
                    Connectors allow {BRAND_NAME} to securely access your Google Drive and provide insights into your documents.
                    Each connector represents a connection to a specific Google account.
                </p>
                <DocsGrid cols={2}>
                    <DocsBox title="What Connectors Enable:">
                        <DocsList
                            items={[
                                "View all your Google Drive documents",
                                "Monitor file sharing and permissions",
                                "Track document activity and changes",
                                "Identify security risks and compliance issues",
                            ]}
                        />
                    </DocsBox>
                    <DocsBox tone="green" title="Security & Privacy:">
                        <DocsList
                            items={[
                                "Secure authentication with Google",
                                "Secure connection to your Drive",
                                "No data stored on our servers",
                                "Revoke access anytime",
                            ]}
                        />
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Connecting Google Drive */}
            <DocsSection title="Connecting Google Drive">
                <p>Connect your Google Drive account in just a few clicks.</p>
                <DocsSteps
                    title="How to connect:"
                    steps={[
                        <>Navigate to the <strong>Connectors</strong> page from the dashboard</>,
                        <>Click <strong>&quot;Connect Google Drive&quot;</strong></>,
                        "You'll be redirected to Google's secure login page",
                        "Select the Google account you want to connect",
                        `Review the permissions ${BRAND_NAME} is requesting`,
                        <>Click <strong>&quot;Allow&quot;</strong> to grant access</>,
                        `You'll be redirected back to ${BRAND_NAME} with your Drive connected`,
                    ]}
                />
                <DocsNote type="info" title="Multiple Accounts">
                    <p>
                        You can connect multiple Google Drive accounts to the same {BRAND_NAME} organization.
                        This is useful if you manage documents across multiple Google accounts.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Permissions Required */}
            <DocsSection title="Permissions Required">
                <p>{BRAND_NAME} requests specific permissions to provide you with comprehensive insights.</p>
                <DocsBox title={`What ${BRAND_NAME} can access:`}>
                    <DocsList
                        items={[
                            <><strong>View files and folders:</strong> Access to see your documents</>,
                            <><strong>View file details:</strong> Access to creation dates, modification dates, and sharing settings</>,
                            <><strong>View sharing permissions:</strong> See who has access to your files</>,
                            <><strong>View activity:</strong> Track changes and version history</>,
                            <><strong>View user information:</strong> Identify who made changes</>,
                        ]}
                    />
                </DocsBox>
                <DocsNote type="warning" title={`What ${BRAND_NAME} CANNOT Do`}>
                    <p>{BRAND_NAME} cannot:</p>
                    <DocsList items={["Delete files", "Share files on your behalf"]} />
                </DocsNote>
            </DocsSection>

            {/* Connector Status */}
            <DocsSection title="Connector Status">
                <p>Each connector has a status that indicates its current state.</p>
                <DocsGrid cols={3}>
                    <DocsTile tone="green" icon={<CheckCircle2 {...ICON} />} title="Active">
                        Connector is working properly and syncing data
                    </DocsTile>
                    <DocsTile tone="amber" icon={<AlertTriangle {...ICON} />} title="Warning">
                        Connector needs attention (e.g., permissions revoked)
                    </DocsTile>
                    <DocsTile tone="gray" icon={<RefreshCw {...ICON} />} title="Syncing">
                        Connector is currently fetching data from Google Drive
                    </DocsTile>
                </DocsGrid>
            </DocsSection>

            {/* Managing Connectors */}
            <DocsSection title="Managing Connectors">
                <p>You can manage your connected Google Drive accounts from the Connectors page.</p>
                <DocsBox title="Available actions:">
                    <DocsList
                        items={[
                            <><strong>Reconnect:</strong> If permissions are revoked, reconnect to restore access</>,
                            <><strong>Refresh:</strong> Manually trigger a sync to fetch latest data</>,
                            <><strong>Disconnect:</strong> Remove the connector and stop syncing data</>,
                            <><strong>View details:</strong> See connector status, last sync time, and account info</>,
                        ]}
                    />
                </DocsBox>
                <DocsNote type="tip" title="Automatic Syncing">
                    <p>
                        {BRAND_NAME} automatically syncs your Google Drive data periodically. You don&apos;t need to manually
                        refresh unless you want to see the latest changes immediately.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Troubleshooting */}
            <DocsPanel title="Troubleshooting">
                <DocsQa q='Connector shows "Warning" status?'>
                    This usually means permissions were revoked. Click &quot;Reconnect&quot; to re-authorize {BRAND_NAME}.
                </DocsQa>
                <DocsQa q="Not seeing all my files?">
                    Ensure the connector has finished its initial sync. Large Google Drives may take some time to fully sync.
                </DocsQa>
                <DocsQa q='Activity shows "User" instead of names?'>
                    You&apos;ll need to reconnect your Google Drive to enable this feature.
                    See the Document Actions documentation for details.
                </DocsQa>
                <DocsQa q="How do I revoke access?">
                    Click &quot;Disconnect&quot; on the connector, or visit{" "}
                    <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                        Google Account Permissions
                    </a>{" "}
                    to revoke access directly from Google.
                </DocsQa>
            </DocsPanel>
        </>
    )
}
