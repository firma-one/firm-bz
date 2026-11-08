'use client'

import React, { Component, ReactNode } from 'react'
import { logger } from '@/lib/logger'
import { AlertCircle, RefreshCw, Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CRASH_TITLE, sendCrashReport } from '@/components/support/crash-report'

interface Props {
    children: ReactNode
    fallback?: ReactNode
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void
    context?: string
}

interface State {
    hasError: boolean
    error: Error | null
    copied: boolean
    feedback: string
    isSubmitting: boolean
    reportSubmitted: boolean
    /** Why the report didn't arrive, when it didn't. */
    reportError: string | null
    /** Incremented on "Try again" so children remount and get a fresh tree. */
    resetKey: number
}

/**
 * Reusable error boundary component
 * Catches rendering errors in component tree and shows fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            copied: false,
            feedback: '',
            isSubmitting: false,
            reportSubmitted: false,
            reportError: null,
            resetKey: 0,
        }
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return {
            hasError: true,
            error,
            copied: false,
            feedback: '',
            isSubmitting: false,
            reportSubmitted: false,
            reportError: null,
        }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log error with context
        logger.error(
            `Error in component tree`,
            error,
            this.props.context || 'ErrorBoundary',
            {
                componentStack: errorInfo.componentStack,
            }
        )

        // Call custom error handler if provided
        this.props.onError?.(error, errorInfo)
    }

    handleReset = () => {
        this.setState((prev) => ({
            hasError: false,
            error: null,
            copied: false,
            resetKey: prev.resetKey + 1,
        }))
    }

    handleCopyDetails = async () => {
        if (!this.state.error) return

        const { message, stack } = this.state.error
        const text = `${message}${stack ? `\n\n${stack}` : ''}`

        try {
            await navigator.clipboard?.writeText(text)
            this.setState({ copied: true })
            window.setTimeout(() => {
                this.setState((prev) =>
                    prev.hasError ? { ...prev, copied: false } : prev
                )
            }, 2000)
        } catch {
            // ignore clipboard errors
        }
    }

    handleSubmitReport = async () => {
        const { error, feedback } = this.state
        if (!error || !feedback.trim()) return

        this.setState({ isSubmitting: true, reportError: null })
        // The firm comes from today's URL (crash-report.ts); a report that didn't arrive says so.
        const sent = await sendCrashReport({
            feedback,
            error: { message: error.message, stack: error.stack },
            context: this.props.context,
        })
        if (sent.ok) {
            this.setState({ reportSubmitted: true, isSubmitting: false })
        } else {
            logger.warn('Error report was not sent', 'ErrorBoundary')
            this.setState({ reportError: sent.message, isSubmitting: false })
        }
    }

    render() {
        if (this.state.hasError) {
            // Use custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback
            }

            // Default fallback UI
            const { reportSubmitted, reportError, feedback, isSubmitting } = this.state
            return (
                <div className="flex items-center justify-center min-h-[400px] p-6">
                    <div className="max-w-lg w-full bg-white rounded-lg border border-red-200 p-6 shadow-sm">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    {CRASH_TITLE}
                                </h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    This part of the page stopped working. Try again, or tell us what
                                    you were doing so we can fix it.
                                </p>

                                {/* Report this error */}
                                {!reportSubmitted ? (
                                    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Report this error
                                        </label>
                                        <p className="text-xs text-gray-500 mb-2">
                                            What were you doing when this happened? We’ll review your report and follow up.
                                        </p>
                                        <textarea
                                            value={feedback}
                                            onChange={(e) => this.setState({ feedback: e.target.value })}
                                            placeholder="E.g., I was opening the Files tab..."
                                            className="w-full h-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                                            disabled={isSubmitting}
                                        />
                                        {reportError && (
                                            <p role="alert" className="mt-2 text-xs text-red-700">{reportError}</p>
                                        )}
                                        <div className="mt-3 flex justify-end">
                                            <Button
                                                onClick={this.handleSubmitReport}
                                                disabled={!feedback.trim() || isSubmitting}
                                                size="sm"
                                                className="gap-2 bg-gray-900 text-white hover:bg-gray-800"
                                            >
                                                {isSubmitting ? (
                                                    'Sending...'
                                                ) : (
                                                    <>
                                                        <Send className="h-3.5 w-3.5" />
                                                        Send report
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                                            <Send className="h-4 w-4 text-green-700" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-green-900">
                                                Thank you! Report submitted.
                                            </p>
                                            <p className="text-xs text-green-700">
                                                We’ll look into it on priority and get back if we need more details.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {process.env.NODE_ENV === 'development' && this.state.error && (
                                    <details className="mb-4">
                                        <summary className="flex items-center justify-between gap-2 text-xs text-gray-500 cursor-pointer hover:text-gray-700 mb-1 select-none list-none">
                                            <span className="flex-1">
                                                Error details (dev only)
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5"
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    this.handleCopyDetails()
                                                }}
                                                title={this.state.copied ? 'Copied!' : 'Copy error details'}
                                            >
                                                {this.state.copied ? (
                                                    <span className="text-[10px] text-green-600 font-medium">
                                                        Copied
                                                    </span>
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </summary>
                                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
                                            {this.state.error.message}
                                            {'\n\n'}
                                            {this.state.error.stack}
                                        </pre>
                                    </details>
                                )}
                                <Button
                                    onClick={this.handleReset}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Try again
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <React.Fragment key={this.state.resetKey}>
                {this.props.children}
            </React.Fragment>
        )
    }
}
