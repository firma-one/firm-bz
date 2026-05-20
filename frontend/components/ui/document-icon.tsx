"use client"

import {
  Folder,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  FileArchive,
  FileVideo,
  FileAudio,
  FileCode,
  File
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoogleDriveIcon } from '@/components/ui/google-drive-icon'

// Google Docs – blue, three horizontal lines
function GoogleDocIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#4285F4" fillOpacity={0.2} stroke="#4285F4" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="#4285F4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13h8M8 16h8M8 10h4" stroke="#4285F4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Google Sheets – green, grid
function GoogleSheetsIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#0F9D58" fillOpacity={0.2} stroke="#0F9D58" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="#0F9D58" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10v8h3v-8H8zm5 0v8h3v-8h-3zm5 0v8h3v-8h-3zM8 7h3V4H8v3zm5 0h3V4h-3v3zm5 0h3V4h-3v3z" fill="#0F9D58" />
    </svg>
  )
}

// Google Slides – yellow/amber
function GoogleSlidesIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#F4B400" fillOpacity={0.3} stroke="#F4B400" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="#F4B400" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 14h8v-4H8v4z" fill="#F4B400" />
      <path d="M8 10h8" stroke="#F4B400" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  )
}

interface DocumentIconProps {
  mimeType?: string
  size?: number
  className?: string
  name?: string
}

export function DocumentIcon({ mimeType, size = 20, className = "", name = "" }: DocumentIconProps) {
  // Handle undefined or null mimeType
  if (!mimeType) {
    return <File className={`text-gray-600 ${className}`} size={size} />
  }

  // Special case: Google Drive folder gets the Google Drive icon
  if (name === 'Google Drive') {
    return <GoogleDriveIcon size={size} className={className} />
  }

  // Handle folder types - use Google Drive mimeType for all folders
  if (mimeType === 'application/vnd.google-apps.folder') {
    return <Folder className={cn("fill-primary/20 text-primary", className)} size={size} />
  }

  const m = (mimeType || '').toLowerCase()

  // Google Workspace types — early-return custom SVGs (incompatible with Lucide's ForwardRefExoticComponent type)
  if (m === 'application/vnd.google-apps.spreadsheet') {
    return <GoogleSheetsIcon size={size} className={className} />
  }
  if (m === 'application/vnd.google-apps.presentation') {
    return <GoogleSlidesIcon size={size} className={className} />
  }
  if (m === 'application/vnd.google-apps.document') {
    return <GoogleDocIcon size={size} className={className} />
  }

  // All remaining types use Lucide icons (type-safe assignment)
  let IconComponent: React.ComponentType<{ className?: string; size?: number }> = File
  let iconColor = 'text-gray-600'

  if (m.includes('pdf')) {
    IconComponent = File
    iconColor = 'text-red-600'
  } else if (m.includes('excel') || m.includes('spreadsheetml') || m.includes('spreadsheet')) {
    IconComponent = FileSpreadsheet
    iconColor = 'text-green-600'
  } else if (m.includes('powerpoint') || m.includes('presentationml') || m.includes('presentation')) {
    IconComponent = Presentation
    iconColor = 'text-orange-600'
  } else if (m.includes('word') || m.includes('wordprocessingml') || m.includes('document')) {
    IconComponent = FileText
    iconColor = 'text-blue-600'
  } else if (m.includes('image')) {
    IconComponent = FileImage
    iconColor = 'text-primary'
  } else if (mimeType.includes('video')) {
    IconComponent = FileVideo
    iconColor = 'text-red-500'
  } else if (mimeType.includes('audio')) {
    IconComponent = FileAudio
    iconColor = 'text-blue-500'
  } else if (m.includes('archive') || m.includes('zip')) {
    IconComponent = FileArchive
    iconColor = 'text-yellow-600'
  } else if (m.includes('code') || m.includes('text')) {
    IconComponent = FileCode
    iconColor = 'text-gray-700'
  }

  return (
    <IconComponent
      className={`${iconColor} ${className}`}
      size={size}
    />
  )
}

