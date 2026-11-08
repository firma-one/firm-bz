'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { PLATFORM_SUPPORT_EMAIL } from '@/config/platform-emails'

/**
 * Root-level global error handler
 * Catches errors in root layout
 * Must be minimal with no external dependencies
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        logger.error(
            'Root layout error occurred',
            error,
            'RootGlobalError',
            {
                digest: error.digest,
            }
        )
    }, [error])

    const errorDetailsText = `${error.message}${error.digest ? `\nDigest: ${error.digest}` : ''}${error.stack ? `\n\n${error.stack}` : ''}`

    const handleCopyDetails = () => {
        navigator.clipboard.writeText(errorDetailsText).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {})
    }

    return (
        <html>
            <body>
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f9fafb',
                    padding: '1rem',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                    <div style={{
                        maxWidth: '32rem',
                        width: '100%',
                        backgroundColor: 'white',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        padding: '2rem',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '3rem',
                                marginBottom: '1rem',
                            }}>
                                ⚠️
                            </div>

                            <h1 style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: '#111827',
                                marginBottom: '0.5rem',
                            }}>
                                Something went wrong on this page
                            </h1>

                            <p style={{
                                color: '#6b7280',
                                marginBottom: error.digest ? '0.5rem' : '1.5rem',
                            }}>
                                Refresh the page, or go home. If it keeps happening, email {PLATFORM_SUPPORT_EMAIL}
                                {error.digest ? ' and quote the reference below.' : '.'}
                            </p>
                            {/* Next's digest for a server error: the one thing support can look up. */}
                            {error.digest && (
                                <p style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    color: '#6b7280',
                                    marginBottom: '1.5rem',
                                }}>
                                    Reference {error.digest}
                                </p>
                            )}

                            {process.env.NODE_ENV === 'development' && (
                                <details style={{
                                    marginBottom: '1.5rem',
                                    textAlign: 'left',
                                }}>
                                    <summary style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.875rem',
                                        color: '#6b7280',
                                        cursor: 'pointer',
                                        marginBottom: '0.5rem',
                                        listStyle: 'none',
                                    }}>
                                        <span style={{ flex: 1 }}>Error details (development only)</span>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyDetails(); }}
                                            title="Copy error details"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '0.25rem',
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                borderRadius: '0.25rem',
                                                color: '#6b7280',
                                            }}
                                        >
                                            {copied ? (
                                                <span style={{ fontSize: '0.75rem', color: '#059669' }}>Copied!</span>
                                            ) : (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                                    <path d="M4 16V4a2 2 0 0 1 2-2h10" />
                                                </svg>
                                            )}
                                        </button>
                                    </summary>
                                    <div style={{
                                        backgroundColor: '#f9fafb',
                                        padding: '1rem',
                                        borderRadius: '0.25rem',
                                        border: '1px solid #e5e7eb',
                                    }}>
                                        <p style={{
                                            fontSize: '0.75rem',
                                            fontFamily: 'monospace',
                                            color: '#dc2626',
                                            marginBottom: '0.5rem',
                                        }}>
                                            {error.message}
                                        </p>
                                        {error.digest && (
                                            <p style={{
                                                fontSize: '0.75rem',
                                                color: '#6b7280',
                                                marginBottom: '0.5rem',
                                            }}>
                                                Digest: {error.digest}
                                            </p>
                                        )}
                                        <pre style={{
                                            fontSize: '0.75rem',
                                            color: '#374151',
                                            overflow: 'auto',
                                            maxHeight: '10rem',
                                        }}>
                                            {error.stack}
                                        </pre>
                                    </div>
                                </details>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                <button
                                    onClick={reset}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '0.375rem',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                    }}
                                >
                                    Try again
                                </button>
                                <button
                                    onClick={() => window.location.href = '/'}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: 'white',
                                        color: '#374151',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '0.375rem',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                    }}
                                >
                                    Go home
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}
