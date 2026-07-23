import { SignupView } from './signup-view'

export default function OnboardingPage() {
    // Hidden until Microsoft publisher verification is resolved — see
    // .claude/plans/connector-abstraction-document-lifecycle.md Phase 1a-signin.
    const microsoftSignInEnabled = process.env.MICROSOFT_SIGNIN_ENABLED === 'true'
    return <SignupView microsoftSignInEnabled={microsoftSignInEnabled} />
}
