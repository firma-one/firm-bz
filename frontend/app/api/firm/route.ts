import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FirmService } from '@/lib/firm-service'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'No authorization header' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    let firm: any
    if (slug) {
      const memberships = await FirmService.getUserFirms(user.id)
      firm = memberships.find((f) => f.slug === slug)
    } else {
      firm = await FirmService.getDefaultFirm(user.id)
    }

    if (!firm) return NextResponse.json({ firm: null })

    let creatorEmail: string | null = null
    if (firm.createdBy) {
      const { data: creatorUser } = await supabase.auth.admin.getUserById(firm.createdBy)
      creatorEmail = creatorUser?.user?.email ?? null
    }

    return NextResponse.json({ firm: { ...firm, creatorEmail } })
  } catch (error) {
    console.error('Firm API error:', error)
    return NextResponse.json({ error: 'Failed to load firm' }, { status: 500 })
  }
}

