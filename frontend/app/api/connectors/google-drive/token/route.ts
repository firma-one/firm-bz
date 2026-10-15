import { NextRequest, NextResponse } from 'next/server'
import { ConnectorStatus } from '@prisma/client'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { accessErrorResponse, requireConnectorManager, requireRequestUser } from '@/lib/connectors/connector-access'

/** Same Web client ID the user authorized (picker + OAuth must match). */
function resolvePickerClientId(): string | undefined {
  const a = config.googleDrive.clientId?.trim()
  if (a) return a
  const b = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID?.trim()
  if (b) return b
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Missing connectionId', code: 'BAD_REQUEST' }, { status: 400 })
    }

    // This hands out a live Google access token, so only the account that connected it or a firm
    // admin of its firm — never anyone who merely knows the connector id.
    const user = await requireRequestUser(request)
    await requireConnectorManager(user.id, connectionId, { ownerOrFirmAdmin: true })

    const connector = await prisma.connector.findUnique({
      where: { id: connectionId },
      select: { status: true },
    })

    if (!connector) {
      return NextResponse.json({ error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (connector.status === ConnectorStatus.REVOKED) {
      return NextResponse.json(
        {
          error:
            'This Google Drive connection was disconnected. Reconnect your account, then try again.',
          code: 'REVOKED',
        },
        { status: 401 }
      )
    }

    const accessToken = await googleDriveConnector.getAccessToken(connectionId)
    const clientId = resolvePickerClientId()

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            'Google Drive client ID is not configured. Set GOOGLE_DRIVE_CLIENT_ID (and NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID if you rely on the public env name).',
          code: 'MISSING_CLIENT_ID',
        },
        { status: 503 }
      )
    }

    if (!accessToken) {
      const hint =
        connector.status === ConnectorStatus.EXPIRED
          ? 'Your Google session expired. Reconnect Google Drive.'
          : 'Could not obtain a Google access token. Reconnect Google Drive and try again.'
      return NextResponse.json({ error: hint, code: 'TOKEN_UNAVAILABLE' }, { status: 401 })
    }

    return NextResponse.json({ accessToken, clientId })
  } catch (error) {
    const denied = accessErrorResponse(error)
    if (denied) return NextResponse.json(denied.body, { status: denied.status })
    console.error('Token fetch error:', error)
    return NextResponse.json({ error: 'Internal Error', code: 'INTERNAL' }, { status: 500 })
  }
}
