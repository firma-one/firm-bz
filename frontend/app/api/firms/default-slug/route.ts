import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { FirmService } from '@/lib/firm-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ slug: null, onboardingComplete: false }, { status: 200 })

    const defaultFirm = await FirmService.getDefaultFirm(user.id)
    const slug = defaultFirm?.slug ?? null
    // Having any firm at all is now the onboarding-complete signal — see
    // resolveDefaultFirmLandingPath's identical reasoning in lib/actions/firms.ts.
    const onboardingComplete = defaultFirm !== null
    const isFirmAdmin = defaultFirm
        ? defaultFirm.members.some((m: any) => m.userId === user.id && m.role === 'firm_admin')
        : false

    return NextResponse.json({ slug, onboardingComplete, isFirmAdmin })
  } catch {
    return NextResponse.json({ slug: null, onboardingComplete: false }, { status: 200 })
  }
}

