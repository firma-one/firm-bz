import { NextRequest, NextResponse } from 'next/server'
import { FirmService } from '@/lib/firm-service'
import { createClient } from '@supabase/supabase-js'
import {
  requireNonSandboxFirmCreationAccess,
  resolveBillingAnchorForNewSatelliteFirm,
} from '@/lib/billing/firm-creation-gate'

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'),
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, firstName, lastName, firmName, allowDomainAccess, allowedEmailDomain } = body

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await requireNonSandboxFirmCreationAccess(user.id)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Upgrade required' },
        { status: 402 }
      )
    }

    const billingAnchorId = await resolveBillingAnchorForNewSatelliteFirm(user.id)
    if (!billingAnchorId) {
      return NextResponse.json({ error: 'Could not resolve billing subscription' }, { status: 500 })
    }

    const firm = await FirmService.createFirmWithMember({
      userId: user.id,
      email,
      firstName,
      lastName,
      firmName,
      allowDomainAccess,
      allowedEmailDomain,
      anchorFirmId: billingAnchorId,
    })

    return NextResponse.json({ firm })
  } catch (error) {
    console.error('Failed to create firm:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create firm' },
      { status: 500 }
    )
  }
}

