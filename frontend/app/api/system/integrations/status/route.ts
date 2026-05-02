import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { inngest } from '@/lib/inngest/client'
import { fetchBillingCatalogPlans } from '@/lib/billing/polar-catalog'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { logger } from '@/lib/logger'

interface HealthCheckResult {
  status: 'up' | 'down'
  latencyMs?: number
  error?: string
}

interface SmtpStatus {
  status: 'configured' | 'unconfigured'
  host?: string
}

interface StatusResponse {
  database: HealthCheckResult
  inngest: HealthCheckResult & { mode?: 'dev' | 'production' }
  polar: HealthCheckResult
  smtp: SmtpStatus
  checkedAt: string
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1 as ok`
    return {
      status: 'up',
      latencyMs: Date.now() - startTime,
    }
  } catch (error) {
    logger.error('Database health check failed', error as Error)
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkInngest(): Promise<HealthCheckResult & { mode?: 'dev' | 'production' }> {
  const startTime = Date.now()
  const mode = process.env.INNGEST_DEV === '1' ? 'dev' : 'production'

  try {
    // Send a test event directly (not via safeInngestSend so we can catch errors)
    await Promise.race([
      inngest.send({ name: 'system.health.check', data: { ts: Date.now() } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    return {
      status: 'up',
      mode,
      latencyMs: Date.now() - startTime,
    }
  } catch (error) {
    logger.error('Inngest health check failed', error as Error)
    return {
      status: 'down',
      mode,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkPolar(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  try {
    await fetchBillingCatalogPlans()
    return {
      status: 'up',
      latencyMs: Date.now() - startTime,
    }
  } catch (error) {
    logger.error('Polar health check failed', error as Error)
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkSmtp(): Promise<SmtpStatus> {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return {
      status: 'unconfigured',
      host: undefined,
    }
  }

  try {
    // Attempt SMTP connection with authentication
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    })

    await transporter.verify()
    return {
      status: 'configured',
      host,
    }
  } catch (error) {
    logger.error('SMTP health check failed', error as Error)
    return {
      status: 'unconfigured',
      host,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify SYS_ADMIN access
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)

    if (!user?.id || !(await isSysAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden: SYS_ADMIN role required' }, { status: 403 })
    }

    // Run all checks in parallel
    const [database, inngestStatus, polar, smtp] = await Promise.all([
      checkDatabase(),
      checkInngest(),
      checkPolar(),
      checkSmtp(),
    ]) as [HealthCheckResult, HealthCheckResult & { mode?: 'dev' | 'production' }, HealthCheckResult, SmtpStatus]

    const response: StatusResponse = {
      database,
      inngest: inngestStatus,
      polar,
      smtp,
      checkedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Error in integrations status route', error as Error)
    return NextResponse.json(
      { error: 'Failed to check integration status' },
      { status: 500 }
    )
  }
}
