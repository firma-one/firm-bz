"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { WorkspaceLoader } from '@/components/app/workspace-loader'
import { logger } from '@/lib/logger'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    logger.debug('AuthGuard: checking auth state', 'AuthGuard', { loading, hasUser: !!user, userId: user?.id })

    if (!loading && !user) {
      logger.debug('AuthGuard: No user found, redirecting to /signin')
      router.push('/signin')
    } else if (!loading && user) {
      logger.debug('AuthGuard: User authenticated, allowing access to protected route')
    }
  }, [user, loading, router])

  // Full-page loader while checking authentication: the same screen as /d's landing loader, so
  // sign-in reads as one continuous loading moment.
  if (loading) {
    return <WorkspaceLoader />
  }

  // Don't render children if not authenticated (will redirect)
  if (!user) {
    return null
  }

  return <>{children}</>
}
