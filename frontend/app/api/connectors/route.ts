import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getConnections, disconnectConnection } from '@/lib/connectors/registry'
import { removeConnector } from '@/lib/actions/connectors'
import { apiHandler, successResponse } from '@/lib/api-handler'
import { AuthError, ValidationError } from '@/lib/errors/api-error'

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "dummy")
)

const authenticate = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    throw new AuthError('No authorization header')
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    throw new AuthError('Invalid token')
  }
  return user
}

export const GET = apiHandler(async (request: NextRequest) => {
  await authenticate(request)

  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    throw new ValidationError('Organization ID required')
  }

  const connections = await getConnections(organizationId)
  return successResponse(connections)
}, { context: 'GetConnectors' })

export const DELETE = apiHandler(async (request: NextRequest) => {
  await authenticate(request)

  const body = await request.json()
  const { connectionId, action = 'disconnect' } = body

  if (!connectionId) {
    throw new ValidationError('Connection ID required')
  }

  if (action === 'remove') {
    await removeConnector({ connectorId: connectionId })
  } else {
    await disconnectConnection(connectionId)
  }

  return successResponse({ success: true })
}, { context: 'DeleteConnector' })



