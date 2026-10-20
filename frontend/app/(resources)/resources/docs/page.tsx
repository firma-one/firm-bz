import { BarChart3, LogIn, Menu, Plug, Shield, UserPlus } from "lucide-react"
import { BRAND_NAME } from "@/config/brand"
import { platformEmail } from "@/config/platform-domain"
import { ChevronLink, PillLink } from "@/components/marketing/v2/primitives"
import {
    DocsGrid,
    DocsHeader,
    DocsLinkCard,
    DocsPanel,
    DocsSection,
} from "@/components/marketing/v2/docs/docs-blocks"

const ICON = { size: 18, strokeWidth: 2.2, "aria-hidden": true } as const

export default function DocsPage() {
    const infoEmail = platformEmail("info")
    return (
        <>
            <DocsHeader title={`Welcome to ${BRAND_NAME}`}>
                Learn how to use {BRAND_NAME} to secure your Google Drive, monitor document sharing,
                and gain insights into your organization&apos;s data.
            </DocsHeader>

            {/* Getting Started */}
            <DocsSection title="Getting Started">
                <DocsGrid cols={3}>
                    <DocsLinkCard href="/resources/docs/authentication/signup" icon={<UserPlus {...ICON} />} title="1. Create Account">
                        Sign up with email OTP or Google OAuth
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/dash/connectors" icon={<Plug {...ICON} />} title="2. Connect Drive">
                        Link your Google Drive account securely
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/dash/insights" icon={<BarChart3 {...ICON} />} title="3. View Insights">
                        Monitor security risks and sharing patterns
                    </DocsLinkCard>
                </DocsGrid>
            </DocsSection>

            {/* Authentication */}
            <DocsSection title="Authentication">
                <p>Learn about {BRAND_NAME}&apos;s secure authentication methods and account management.</p>
                <DocsGrid cols={3}>
                    <DocsLinkCard href="/resources/docs/authentication/signup" icon={<UserPlus {...ICON} />} title="Signup">
                        Create your account with email OTP or Google OAuth
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/authentication/signin" icon={<LogIn {...ICON} />} title="Signin">
                        Access your account securely with multiple auth methods
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/authentication/logout" icon={<Shield {...ICON} />} title="Logout">
                        End your session securely and manage account access
                    </DocsLinkCard>
                </DocsGrid>
            </DocsSection>

            {/* Dashboard */}
            <DocsSection title="Dashboard Features">
                <p>Explore powerful features for managing and securing your Google Drive documents.</p>
                <DocsGrid cols={3}>
                    <DocsLinkCard href="/resources/docs/dash/connectors" icon={<Plug {...ICON} />} title="Connectors">
                        Connect and manage your Google Drive accounts
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/dash/insights" icon={<BarChart3 {...ICON} />} title="Insights">
                        Security alerts, sharing analytics, and risk detection
                    </DocsLinkCard>
                    <DocsLinkCard href="/resources/docs/dash/document-actions" icon={<Menu {...ICON} />} title="Document Actions">
                        Preview, download, and manage your documents
                    </DocsLinkCard>
                </DocsGrid>
            </DocsSection>

            {/* Security */}
            <DocsSection title="Security & Privacy">
                <p>Learn about how {BRAND_NAME} protects your data and maintains your privacy.</p>
                <ChevronLink href="/resources/docs/security" className="text-[16px]">
                    Read our security documentation
                </ChevronLink>
            </DocsSection>

            {/* Need Help */}
            <DocsPanel title="Need Help?">
                <p>Can&apos;t find what you&apos;re looking for? We&apos;re here to help!</p>
                <div className="mk-docs-panel-actions">
                    <PillLink href="/contact" size="sm">
                        Contact Support
                    </PillLink>
                    <PillLink href={`mailto:${infoEmail}`} variant="secondary" size="sm">
                        Email Us
                    </PillLink>
                </div>
            </DocsPanel>
        </>
    )
}
