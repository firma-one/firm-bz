/**
 * Standard API error classes and response formatters
 * Provides consistent error handling across all API routes
 */

import { NextResponse } from 'next/server'
import { logger } from '../logger'

/**
 * Base API error class
 */
export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string,
        public details?: any
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ApiError {
    constructor(message: string, details?: any) {
        super(message, 400, 'VALIDATION_ERROR', details)
        this.name = 'ValidationError'
    }
}

/**
 * Authentication error (401)
 */
export class AuthError extends ApiError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401, 'AUTH_ERROR')
        this.name = 'AuthError'
    }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
    constructor(message: string = 'Forbidden') {
        super(message, 403, 'FORBIDDEN_ERROR')
        this.name = 'ForbiddenError'
    }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
    constructor(resource: string = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND_ERROR')
        this.name = 'NotFoundError'
    }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends ApiError {
    constructor(message: string) {
        super(message, 409, 'CONFLICT_ERROR')
        this.name = 'ConflictError'
    }
}

/**
 * Subscription revoked error (403) — firm locked after subscription ended.
 */
export class SubscriptionRevokedError extends ApiError {
    constructor() {
        super('Subscription required — this workspace is locked', 403, 'subscription_revoked')
        this.name = 'SubscriptionRevokedError'
    }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ApiError {
    constructor(message: string = 'Too many requests') {
        super(message, 429, 'RATE_LIMIT_ERROR')
        this.name = 'RateLimitError'
    }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends ApiError {
    constructor(message: string = 'Internal server error') {
        super(message, 500, 'INTERNAL_SERVER_ERROR')
        this.name = 'InternalServerError'
    }
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
    error: {
        message: string
        code?: string
        statusCode: number
        details?: any
        timestamp: string
    }
}

/**
 * Format error for API response
 * Ensures consistent error structure across all endpoints
 */
export function formatErrorResponse(error: Error | ApiError): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development'

    // Subscription revoked is expected business logic (not a server fault) — log at info, not error
    if (error instanceof SubscriptionRevokedError) {
        logger.info('[api] subscription_revoked — workspace locked', { code: error.code })
    } else {
        logger.error(
            error.message,
            error,
            'API',
            {
                statusCode: error instanceof ApiError ? error.statusCode : 500,
                code: error instanceof ApiError ? error.code : undefined,
            }
        )
    }

    // ApiError instances
    if (error instanceof ApiError) {
        return {
            error: {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
                details: error.details,
                timestamp: new Date().toISOString(),
            },
        }
    }

    // Generic errors - hide details in production/preview (only show in development)
    return {
        error: {
            message: isDevelopment
                ? error.message
                : 'An unexpected error occurred',
            code: 'INTERNAL_SERVER_ERROR',
            statusCode: 500,
            details: isDevelopment ? { stack: error.stack } : undefined,
            timestamp: new Date().toISOString(),
        },
    }
}

/**
 * Create a standardized error response with NextResponse
 */
export function createErrorResponse(error: Error | ApiError) {
    const errorResponse = formatErrorResponse(error)
    const statusCode = errorResponse.error.statusCode

    return NextResponse.json(errorResponse, { status: statusCode })
}
