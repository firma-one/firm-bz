import { redirect } from 'next/navigation'

// OAuth lands here after /auth/callback processes the code exchange.
// New users have no firm yet, so send them to onboarding.
export default function SignupCallbackPage() {
    redirect('/d/onboarding')
}
