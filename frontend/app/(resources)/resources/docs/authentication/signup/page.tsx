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

export default function SignupPage() {
    return (
        <>
            <DocsHeader section="Authentication" title="Signup">
                Create your {BRAND_NAME} account and start securing your Google Drive documents.
                Our signup process is quick, secure, and offers multiple authentication options.
            </DocsHeader>

            {/* Signup Flow Overview */}
            <DocsSection title="Signup Flow">
                <p>The signup process consists of three simple steps:</p>
                <DocsGrid cols={3}>
                    <DocsStepCard n={1} title="Enter Details">
                        Provide your email, first name, and last name
                    </DocsStepCard>
                    <DocsStepCard n={2} title="Choose Auth Method">
                        Choose Email Code or Sign in with Google
                    </DocsStepCard>
                    <DocsStepCard n={3} title="Verify & Create">
                        Complete verification and create your organization
                    </DocsStepCard>
                </DocsGrid>
            </DocsSection>

            {/* Email Code Authentication */}
            <DocsSection title="Email Code (Passwordless)">
                <p>Sign up without creating a password using a one-time code sent to your email.</p>
                <DocsSteps
                    title="How it works:"
                    steps={[
                        "Enter your email, first name, and last name",
                        <>Click <strong>&quot;Continue with Email Code&quot;</strong></>,
                        <>Complete the <strong>Turnstile CAPTCHA</strong> to verify you&apos;re human</>,
                        "Check your email for a 6-digit verification code",
                        "Enter the code to verify your email",
                        "Your account and organization are automatically created",
                    ]}
                />
                <DocsNote type="tip" title="Why Passwordless?">
                    <p>Passwordless authentication is more secure than traditional passwords because:</p>
                    <DocsList
                        items={[
                            "No password to remember or forget",
                            "No password to be stolen or leaked",
                            "Each code is single-use and expires quickly",
                            "More secure against unauthorized access",
                        ]}
                    />
                </DocsNote>
            </DocsSection>

            {/* Sign in with Google */}
            <DocsSection title="Sign in with Google">
                <p>Sign up instantly using your existing Google account.</p>
                <DocsSteps
                    title="How it works:"
                    steps={[
                        "Enter your email, first name, and last name",
                        <>Click <strong>&quot;Continue with Google&quot;</strong></>,
                        "You'll be redirected to Google's secure login page",
                        "Sign in with your Google account",
                        `Grant ${BRAND_NAME} the necessary permissions`,
                        "You'll be redirected back and your account is created",
                    ]}
                />
                <DocsNote type="info" title="Permissions Required">
                    <p>When signing up with Google, {BRAND_NAME} requests permission to:</p>
                    <DocsList items={["View your basic profile information (name, email)", "Authenticate your identity"]} />
                    <p>
                        We <strong>do not</strong> access your Google Drive during signup.
                        Drive access is only requested when you connect a Google Drive account in the Connectors page.
                    </p>
                </DocsNote>
            </DocsSection>

            {/* Turnstile Protection */}
            <DocsSection title="Bot Protection">
                <p>We use Cloudflare Turnstile to protect against automated bot signups and email spam.</p>
                <DocsBox title="When you'll see Turnstile:">
                    <DocsList
                        items={[
                            'When clicking "Continue with Email Code" during signup',
                            "When requesting a new verification code (resend)",
                        ]}
                    />
                    <p className="mk-docs-small">
                        <strong>Note:</strong> The verification step is not shown when signing up with Google,
                        as Google handles bot protection automatically.
                    </p>
                </DocsBox>
                <DocsNote type="tip" title="Why Turnstile?">
                    <p>Turnstile protects our email sending infrastructure from abuse by:</p>
                    <DocsList
                        items={[
                            "Preventing bots from exhausting our email quota",
                            "Stopping spam signups with fake emails",
                            "Ensuring service availability for legitimate users",
                        ]}
                    />
                    <p>Most users will complete Turnstile instantly without any interaction.</p>
                </DocsNote>
            </DocsSection>

            {/* Organization Creation */}
            <DocsSection title="Organization Setup">
                <p>After verifying your email or signing in with Google, your account is automatically created.</p>
                <DocsBox title="What happens automatically:">
                    <DocsList
                        items={[
                            "Organization created with a unique slug based on your email",
                            "You're added as the organization owner",
                            "Your profile is populated with your name and email",
                            "You're redirected to the dashboard",
                        ]}
                    />
                </DocsBox>
                <DocsNote type="info" title="Next Steps">
                    <p>After signup, you&apos;ll be taken to the dashboard where you can:</p>
                    <DocsList
                        items={[
                            "Connect your Google Drive account",
                            "Start monitoring your documents",
                            "View security insights",
                            "Invite team members (coming soon)",
                        ]}
                    />
                </DocsNote>
            </DocsSection>

            {/* Troubleshooting */}
            <DocsPanel title="Troubleshooting">
                <DocsQa q="Didn't receive the verification code?">
                    Check your spam folder. If still not received, click &quot;Resend code&quot; and complete the Turnstile verification again.
                </DocsQa>
                <DocsQa q="Turnstile not loading?">
                    Ensure you&apos;re not using an ad blocker that might block Cloudflare Turnstile. Try disabling it temporarily.
                </DocsQa>
                <DocsQa q="Email already exists?">
                    If you already have an account, use the signin page instead. Click the &quot;Sign in&quot; link at the bottom of the signup form.
                </DocsQa>
            </DocsPanel>
        </>
    )
}
