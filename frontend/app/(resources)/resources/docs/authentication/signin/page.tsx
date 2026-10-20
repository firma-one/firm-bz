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
    DocsStepCard,
    DocsSteps,
} from "@/components/marketing/v2/docs/docs-blocks"

export default function SigninPage() {
    return (
        <>
            <DocsHeader section="Authentication" title="Signin">
                Access your {BRAND_NAME} account using your preferred authentication method.
                Our signin process is secure, fast, and offers multiple options.
            </DocsHeader>

            {/* Signin Flow Overview */}
            <DocsSection title="Signin Flow">
                <p>The signin process is simple and secure:</p>
                <DocsGrid cols={2}>
                    <DocsStepCard n={1} title="Enter Email">
                        Provide the email address associated with your account
                    </DocsStepCard>
                    <DocsStepCard n={2} title="Verify & Access">
                        Complete verification via Email Code or Sign in with Google
                    </DocsStepCard>
                </DocsGrid>
            </DocsSection>

            {/* Email Code Signin */}
            <DocsSection title="Email Code Signin">
                <p>Sign in without a password using a one-time code sent to your email.</p>
                <DocsSteps
                    title="How it works:"
                    steps={[
                        "Enter your email address",
                        <>Click <strong>&quot;Continue with Email&quot;</strong></>,
                        <>Complete the <strong>Turnstile CAPTCHA</strong> verification</>,
                        "Check your email for a 6-digit verification code",
                        "Enter the code to sign in",
                        "You'll be redirected to your dashboard",
                    ]}
                />
                <DocsNote type="info" title="Code Expiration">
                    <p>
                        Verification codes expire after <strong>10 minutes</strong> for security.
                        If your code expires, simply request a new one by clicking &quot;Resend code&quot;.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Sign in with Google */}
            <DocsSection title="Sign in with Google">
                <p>Sign in instantly using your Google account.</p>
                <DocsSteps
                    title="How it works:"
                    steps={[
                        "Enter your email address",
                        <>Click <strong>&quot;Continue with Google&quot;</strong></>,
                        "You'll be redirected to Google's secure login page",
                        "Sign in with your Google account",
                        `You'll be redirected back to your ${BRAND_NAME} dashboard`,
                    ]}
                />
                <DocsNote type="tip" title="Faster Signin">
                    <p>
                        If you&apos;re already signed in to Google in your browser, the signin process
                        is nearly instant - just one click!
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Session Management */}
            <DocsSection title="Session Management">
                <p>Your {BRAND_NAME} session is managed securely using industry-standard practices.</p>
                <DocsBox title="Session Details:">
                    <DocsList
                        items={[
                            <><strong>Duration:</strong> Sessions remain active for 7 days</>,
                            <><strong>Auto-renewal:</strong> Sessions automatically renew when you use the app</>,
                            <><strong>Security:</strong> Sessions are encrypted and stored securely</>,
                            <><strong>Multi-device:</strong> You can be signed in on multiple devices</>,
                        ]}
                    />
                </DocsBox>
                <DocsNote type="warning" title="Shared Devices">
                    <p>
                        If you&apos;re using a shared or public computer, always remember to sign out when you&apos;re done.
                        This prevents others from accessing your account.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Turnstile Protection */}
            <DocsSection title="Bot Protection">
                <p>Email OTP signin is protected by Cloudflare Turnstile to prevent automated attacks.</p>
                <DocsBox title="When you'll see Turnstile:">
                    <DocsList
                        items={[
                            'When clicking "Continue with Email" during signin',
                            "When requesting a new verification code (resend)",
                        ]}
                    />
                    <p className="mk-docs-small">
                        <strong>Note:</strong> The verification step is not shown when signing in with Google.
                    </p>
                </DocsBox>
            </DocsSection>

            {/* Troubleshooting */}
            <DocsPanel title="Troubleshooting">
                <DocsQa q="Didn't receive the verification code?">
                    Check your spam folder. If still not received, click &quot;Resend code&quot; and complete the Turnstile verification again.
                </DocsQa>
                <DocsQa q="Code expired?">
                    Verification codes expire after 10 minutes. Request a new code by clicking &quot;Resend code&quot;.
                </DocsQa>
                <DocsQa q="Email not recognized?">
                    Make sure you&apos;re using the email address you signed up with. If you don&apos;t have an account yet,
                    click &quot;Sign up&quot; to create one.
                </DocsQa>
                <DocsQa q="Google OAuth not working?">
                    Ensure pop-ups are enabled for {BRAND_NAME} in your browser. Google OAuth requires opening a new window.
                </DocsQa>
            </DocsPanel>
        </>
    )
}
