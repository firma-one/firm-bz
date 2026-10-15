import { NextRequest, NextResponse } from 'next/server'
import { getManageableConnector } from '@/lib/connectors/connector-access'
import { createClient } from '@supabase/supabase-js'
import { googleDriveConnector } from '@/lib/google-drive-connector'

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Get the current user from the session
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get organization ID from query params
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID required' }, { status: 400 })
    }
    // Returns the Drive account's email, name, quota and recent file names — connector managers only.
    if (!(await getManageableConnector(user.id, connectionId))) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Test the Google Drive connection by getting user info
    const userInfo = await googleDriveConnector.getUserInfo(connectionId)
    
    // Also get some files to verify file access
    const filesData = await googleDriveConnector.getFiles(connectionId)

    return NextResponse.json({
      success: true,
      userInfo,
      files: filesData.files.slice(0, 5), // Return first 5 files
      totalFiles: filesData.files.length,
      hasMoreFiles: !!filesData.nextPageToken
    })
  } catch (error) {
    console.error('Google Drive test error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to test Google Drive connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

