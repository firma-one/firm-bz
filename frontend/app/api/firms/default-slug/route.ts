import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { FirmService } from '@/lib/firm-service'
import { isWorkspaceOnboardingComplete } from '@/lib/onboarding/workspace-onboarding-complete'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ slug: null, onboardingComplete: false }, { status: 200 })

    const defaultFirm = await FirmService.getDefaultFirm(user.id)
    const slug = defaultFirm?.slug ?? null
    const onboardingComplete = defaultFirm
        ? await isWorkspaceOnboardingComplete({
              id: defaultFirm.id,
              settings: defaultFirm.settings,
              connectorId: defaultFirm.connectorId ?? null,
              sandboxOnly: defaultFirm.sandboxOnly ?? false,
          })
        : false
    const isFirmAdmin = defaultFirm
        ? defaultFirm.members.some((m: any) => m.userId === user.id && m.role === 'firm_admin')
        : false

    return NextResponse.json({ slug, onboardingComplete, isFirmAdmin })
  } catch {
    return NextResponse.json({ slug: null, onboardingComplete: false }, { status: 200 })
  }
}

