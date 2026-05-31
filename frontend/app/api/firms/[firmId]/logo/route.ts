/**
 * Firm logo: upload (POST) and serve (GET).
 * Logo file is stored in Google Drive under /[Firm]/.meta/assets.
 * Stored URL in DB is /api/firms/[firmId]/logo (not a direct Drive URL).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ConnectorType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { getStorageAdapter } from '@/lib/connectors/registry'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'

const ASSETS_FOLDER = 'assets'
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg']

function getSupabaseAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env for storage')
  return createClient(url, key)
}

function extFromMime(type: string): 'svg' | 'jpg' | 'png' {
  if (type === 'image/svg+xml') return 'svg'
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg'
  return 'png'
}

async function getFirmDriveContext(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      id: true,
      settings: true,
      firmFolderId: true,
      connector: { select: { id: true, type: true, status: true } },
    },
  })
  if (!firm) throw new Error('Firm not found')
  if (!firm.connector || firm.connector.type !== ConnectorType.GOOGLE_DRIVE) {
    throw new Error('Firm has no active Google Drive connector')
  }
  if (firm.connector.status !== 'ACTIVE') {
    throw new Error('Google Drive connector is not active')
  }

  const settings = (firm.settings as Record<string, unknown>) ?? {}
  const orgSettings =
    (settings.organizations as Record<string, Record<string, unknown>> | undefined)?.[firm.id] ?? {}
  const firmFolderId =
    (firm.firmFolderId as string | null) ??
    (orgSettings.orgFolderId as string | undefined) ??
    (settings.orgFolderId as string | undefined)
  if (!firmFolderId) throw new Error('Firm folder not configured')

  return {
    firm,
    connectorId: firm.connector.id,
    firmFolderId,
  }
}

async function ensureAssetsFolderId(connectorId: string, firmFolderId: string): Promise<string> {
  const adapter = await getStorageAdapter(connectorId)
  const metaFolderId = await adapter.findOrCreateFolder(connectorId, firmFolderId, METADATA_FOLDER_NAME)
  return adapter.findOrCreateFolder(connectorId, metaFolderId, ASSETS_FOLDER)
}

async function getAssetsFolderIdIfExists(connectorId: string, firmFolderId: string): Promise<string | null> {
  try {
    // Use findOrCreateFolder (targeted name query, same as POST) rather than listFolderChildren
    // (which lists all children and misses items beyond the API's default page size)
    return await ensureAssetsFolderId(connectorId, firmFolderId)
  } catch {
    return null
  }
}

async function findLogoFile(connectorId: string, assetsFolderId: string) {
  const adapter = await getStorageAdapter(connectorId)
  // assets folder only ever contains a handful of files — listing is safe
  const files = await adapter.listFolderChildren(connectorId, assetsFolderId)
  return files.find((f) => f.name?.startsWith('logo.')) ?? null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
  try {
    const { firmId } = await params
    console.log('[logo GET] firmId:', firmId)

    const { connectorId, firmFolderId } = await getFirmDriveContext(firmId)
    console.log('[logo GET] connectorId:', connectorId, 'firmFolderId:', firmFolderId)

    const assetsFolderId = await getAssetsFolderIdIfExists(connectorId, firmFolderId)
    console.log('[logo GET] assetsFolderId:', assetsFolderId)
    if (!assetsFolderId) return NextResponse.json({ error: 'Logo not found — assets folder missing' }, { status: 404 })

    const logo = await findLogoFile(connectorId, assetsFolderId)
    console.log('[logo GET] logo file:', logo)
    if (!logo) return NextResponse.json({ error: 'Logo not found — no logo file in assets' }, { status: 404 })

    const file = await googleDriveConnector.downloadFile(connectorId, logo.id)
    const buffer = await new Response(file.stream).arrayBuffer()
    console.log('[logo GET] serving', file.mimeType, buffer.byteLength, 'bytes')
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('[logo GET] error:', e)
    return NextResponse.json({ error: 'Failed to load logo', detail: String(e) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const { firmId } = await params
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAuth = getSupabaseAdmin()
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { connectorId, firmFolderId } = await getFirmDriveContext(firmId)

    const membership = await (prisma as any).firmMember.findFirst({
      where: { firmId, userId: user.id },
      select: { role: true },
    })
    if (membership?.role !== 'firm_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    const type = file.type?.toLowerCase()
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Use JPG, PNG, or SVG.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Max 5 MB.' },
        { status: 400 }
      )
    }

    const ext = extFromMime(type)
    const fileName = `logo.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const adapter = await getStorageAdapter(connectorId)
    const assetsFolderId = await ensureAssetsFolderId(connectorId, firmFolderId)
    if (adapter.writeFileBinary) {
      await adapter.writeFileBinary(connectorId, assetsFolderId, fileName, buffer, file.type)
    } else {
      await adapter.writeFile(connectorId, assetsFolderId, fileName, buffer.toString('base64'), file.type)
    }

    const pockettLogoUrl = `/api/firms/${firmId}/logo?v=${Date.now()}`
    const firmWithSettings = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    })
    const current = (firmWithSettings?.settings as Record<string, unknown>) ?? {}
    const existingBranding = (current.branding as Record<string, unknown>) ?? {}
    const branding = {
      logoUrl: pockettLogoUrl,
      subtext: existingBranding.subtext ?? null,
      primaryColor: existingBranding.primaryColor ?? null,
      secondaryColor: existingBranding.secondaryColor ?? null,
    }
    await prisma.firm.update({
      where: { id: firmId },
      data: { logoUrl: pockettLogoUrl, settings: { ...current, branding } },
    })

    return NextResponse.json({ logoUrl: pockettLogoUrl })
  } catch (e) {
    console.error('POST firm logo error', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

async function requireFirmAdmin(request: NextRequest, firmId: string) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabaseAuth = getSupabaseAdmin()
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const membership = await (prisma as any).firmMember.findFirst({
    where: { firmId, userId: user.id },
    select: { role: true },
  })
  if (membership?.role !== 'firm_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const { firmId } = await params
  try {
    const auth = await requireFirmAdmin(request, firmId)
    if (auth.error) return auth.error

    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { id: true, settings: true, firmFolderId: true, connector: { select: { id: true, type: true, status: true } } },
    })
    if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })
    if (!firm.connector || firm.connector.type !== ConnectorType.GOOGLE_DRIVE) {
      return NextResponse.json({ error: 'Firm has no active Google Drive connector' }, { status: 400 })
    }
    if (firm.connector.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Google Drive connector is not active' }, { status: 400 })
    }

    const settings = (firm.settings as Record<string, unknown>) ?? {}
    const orgSettings =
      (settings.organizations as Record<string, Record<string, unknown>> | undefined)?.[firmId] ?? {}
    const firmFolderId =
      (firm.firmFolderId as string | null) ??
      (orgSettings.orgFolderId as string | undefined) ??
      (settings.orgFolderId as string | undefined)
    if (!firmFolderId) {
      return NextResponse.json({ error: 'Firm folder not configured' }, { status: 400 })
    }

    const assetsFolderId = await getAssetsFolderIdIfExists(firm.connector.id, firmFolderId)
    if (assetsFolderId) {
      const logo = await findLogoFile(firm.connector.id, assetsFolderId)
      if (logo) {
        await googleDriveConnector.trashFile(firm.connector.id, logo.id)
      }
    }

    const current = (firm.settings as Record<string, unknown>) ?? {}
    const existingBranding = (current.branding as Record<string, unknown>) ?? {}
    const branding = {
      logoUrl: null,
      subtext: existingBranding.subtext ?? null,
      primaryColor: existingBranding.primaryColor ?? null,
      secondaryColor: existingBranding.secondaryColor ?? null,
    }
    await prisma.firm.update({
      where: { id: firmId },
      data: { logoUrl: null, settings: { ...current, branding } },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE firm logo error', e)
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
  }
}

