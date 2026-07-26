import { SigninView } from './signin-view'

export default function SignInPage() {
  // Hidden until Microsoft publisher verification is resolved — see
  // .claude/plans/connector-abstraction-document-lifecycle.md Phase 1a-signin.
  const microsoftSignInEnabled = process.env.MICROSOFT_SIGNIN_ENABLED === 'true'
  return <SigninView microsoftSignInEnabled={microsoftSignInEnabled} />
}
