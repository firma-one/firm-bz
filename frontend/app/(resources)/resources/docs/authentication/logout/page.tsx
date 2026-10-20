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
} from "@/components/marketing/v2/docs/docs-blocks"

export default function LogoutPage() {
    return (
        <>
            <DocsHeader section="Authentication" title="Logout">
                Securely end your {BRAND_NAME} session and protect your account.
            </DocsHeader>

            {/* Logout Process */}
            <DocsSection title="How to Logout">
                <p>Logging out is quick and ensures your account remains secure.</p>
                <DocsSteps
                    title="Steps to logout:"
                    steps={[
                        "Click on your profile picture or name in the top-right corner",
                        <>Select <strong>&quot;Logout&quot;</strong> from the dropdown menu</>,
                        "You'll be immediately signed out and redirected to the homepage",
                    ]}
                />
            </DocsSection>

            {/* What Happens */}
            <DocsSection title="What Happens When You Logout">
                <p>When you logout, we ensure your session is completely terminated.</p>
                <DocsBox title="Session cleanup:">
                    <DocsList
                        items={[
                            "Your authentication session is terminated",
                            "Session cookies are cleared from your browser",
                            "You're redirected to the public homepage",
                            "Any cached data in your browser remains (for faster re-login)",
                        ]}
                    />
                </DocsBox>
                <DocsNote type="info" title="Multi-Device Sessions">
                    <p>
                        Logging out on one device <strong>does not</strong> automatically log you out on other devices.
                        Each device maintains its own session.
                    </p>
                    <p>If you want to log out of all devices, you&apos;ll need to manually log out on each one.</p>
                </DocsNote>
            </DocsSection>

            {/* Security Best Practices */}
            <DocsSection title="Security Best Practices">
                <p>Follow these best practices to keep your account secure.</p>
                <DocsGrid cols={2}>
                    <DocsBox tone="green" title="Always Logout When:">
                        <DocsList
                            items={[
                                "Using a shared or public computer",
                                "Finishing work on a borrowed device",
                                "Leaving your computer unattended",
                                "Switching between multiple accounts",
                            ]}
                        />
                    </DocsBox>
                    <DocsBox tone="amber" title="Be Cautious:">
                        <DocsList
                            items={[
                                "Don't save passwords on shared devices",
                                "Clear browser data after using public computers",
                                "Close all browser tabs after logging out",
                                "Don't leave your session open overnight",
                            ]}
                        />
                    </DocsBox>
                </DocsGrid>
            </DocsSection>

            {/* Automatic Logout */}
            <DocsSection title="Automatic Session Expiration">
                <p>For security, sessions automatically expire after a period of inactivity.</p>
                <DocsBox title="Session expiration:">
                    <DocsList
                        items={[
                            <><strong>Maximum session duration:</strong> 7 days</>,
                            <><strong>Inactivity timeout:</strong> Sessions remain active as long as you use the app</>,
                            <><strong>Auto-renewal:</strong> Sessions automatically renew with each interaction</>,
                        ]}
                    />
                </DocsBox>
                <DocsNote type="warning" title="Session Expired">
                    <p>
                        If your session expires, you&apos;ll be automatically redirected to the signin page.
                        Simply sign in again to continue where you left off.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Quick Tips */}
            <DocsPanel title="Quick Tips">
                <DocsGrid cols={2}>
                    <DocsMiniCard title="Keyboard Shortcut">
                        You can quickly access the logout option by clicking your profile picture in the header.
                    </DocsMiniCard>
                    <DocsMiniCard title="Stay Signed In">
                        On your personal devices, you can stay signed in for convenience. Sessions auto-renew with use.
                    </DocsMiniCard>
                    <DocsMiniCard title="Forgot to Logout?">
                        If you forgot to logout on a public computer, you can remotely end that session by changing your password (coming soon).
                    </DocsMiniCard>
                    <DocsMiniCard title="Re-login">
                        After logging out, you can sign back in anytime using the same authentication method you used during signup.
                    </DocsMiniCard>
                </DocsGrid>
            </DocsPanel>
        </>
    )
}
