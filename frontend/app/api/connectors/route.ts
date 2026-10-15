import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getConnections, disconnectConnection } from '@/lib/connectors/registry'
import { removeConnector } from '@/lib/actions/connectors'
import { apiHandler, successResponse } from '@/lib/api-handler'
import { AuthError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors/api-error'
import { getManageableConnector, isFirmAdmin } from '@/lib/connectors/connector-access'

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
  const user = await authenticate(request)

  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    throw new ValidationError('Organization ID required')
  }
  // Connector ids, account emails and status are the firm's Storage settings — firm admins only.
  // The ids also unlock connector routes, so they must not reach anyone who can name a firm.
  if (!(await isFirmAdmin(user.id, organizationId))) {
    throw new ForbiddenError('Only firm admins can list storage connectors')
  }

  const connections = await getConnections(organizationId)
  return successResponse(connections)
}, { context: 'GetConnectors' })

export const DELETE = apiHandler(async (request: NextRequest) => {
  const user = await authenticate(request)

  const body = await request.json()
  const { connectionId, action = 'disconnect' } = body

  if (!connectionId) {
    throw new ValidationError('Connection ID required')
  }

  // Disconnecting revokes the Google token and wipes it — the firm's storage goes down — so the
  // same rights as removal: owner, firm admin, or a manager of a client using it.
  if (!(await getManageableConnector(user.id, connectionId))) {
    throw new NotFoundError('Connection')
  }

  if (action === 'remove') {
    await removeConnector({ connectorId: connectionId })
  } else {
    await disconnectConnection(connectionId)
  }

  return successResponse({ success: true })
}, { context: 'DeleteConnector' })



