import { logger } from '@/lib/logger'
import { ZodError } from 'zod'
import { ApiError } from './errors/api-error'

export type ActionResponse<T> = {
    success: boolean
    data?: T
    error?: string
    validationErrors?: Record<string, string[]>
}

/**
 * Wraps a server action with standardized error handling and logging
 * 
 * @param action The async function to execute
 * @param context The context name for logging
 * @returns Standardized ActionResponse
 */
export async function serverActionWrapper<T>(
    action: () => Promise<T>,
    context: string
): Promise<ActionResponse<T>> {
    const startTime = Date.now()

    try {
        const data = await action()

        logger.info(`${context} completed`, context, {
            duration: `${Date.now() - startTime}ms`,
            success: true
        })

        return { success: true, data }
    } catch (error) {
        const duration = Date.now() - startTime

        // Handle Zod validation errors
        if (error instanceof ZodError) {
            const validationErrors: Record<string, string[]> = {}
                ; (error as any).errors.forEach((err: any) => {
                    const path = err.path.join('.')
                    if (!validationErrors[path]) validationErrors[path] = []
                    validationErrors[path].push(err.message)
                })

            logger.warn(`Validation error: ${context}`, context, {
                duration: `${duration}ms`,
                errors: validationErrors
            })

            return {
                success: false,
                error: 'Validation failed',
                validationErrors
            }
        }

        // Handle known API errors
        if (error instanceof ApiError) {
            logger.warn(`${context} failed with ApiError`, context, {
                duration: `${duration}ms`,
                code: error.code,
                statusCode: error.statusCode,
                message: error.message
            })

            return {
                success: false,
                error: error.message
            }
        }

        // Handle generic errors
        logger.error(
            `Error in ${context}`,
            error instanceof Error ? error : new Error(String(error)),
            context,
            { duration: `${duration}ms` }
        )

        return {
            success: false,
            error: userFacingMessage(error)
        }
    }
}

/** Prisma error codes for "the database could not be reached", as opposed to a query that failed. */
const DATABASE_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

/**
 * The message a generic failure shows the user.
 *
 * Messages that actions throw on purpose ("Captcha validation failed. Please try again.") are written
 * for people and pass through. A Prisma error is not: it carries the query, the database host and
 * port, and the driver's wording, which mean nothing to a user and describe the infrastructure to
 * anyone who looks. Those are replaced; the full error is already in the log above.
 */
export function userFacingMessage(error: unknown): string {
    if (!(error instanceof Error)) return 'An unexpected error occurred'
    if (error.name.startsWith('PrismaClient')) {
        const code = (error as Error & { code?: unknown; errorCode?: unknown }).code
            ?? (error as Error & { errorCode?: unknown }).errorCode
        if (error.name === 'PrismaClientInitializationError' || (typeof code === 'string' && DATABASE_UNREACHABLE_CODES.has(code))) {
            return 'We couldn’t reach our servers just now. Please try again in a moment.'
        }
        return 'Something went wrong on our side. Please try again.'
    }
    return error.message
}
