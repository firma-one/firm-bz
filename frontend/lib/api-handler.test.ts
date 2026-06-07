import { describe, it, expect, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from './api-handler'
import { ApiError } from './errors/api-error'

// Mock logger to prevent console noise
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}))

describe('apiHandler', () => {
    it('should return successful response', async () => {
        const handler = apiHandler(async () => {
            return NextResponse.json({ success: true })
        })

        const req = new NextRequest('http://localhost/api/test')
        const response = await handler(req)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toEqual({ success: true })
    })

    it('should handle thrown errors', async () => {
        const handler = apiHandler(async () => {
            throw new Error('Test Error')
        })

        const req = new NextRequest('http://localhost/api/test')
        const response = await handler(req)

        expect(response.status).toBe(500)
        const data = await response.json()
        expect(data.error.message).toBe('An unexpected error occurred') // sanitised in non-development envs (NODE_ENV=test fails the dev check)
    })

    it('should handle ApiError', async () => {
        const handler = apiHandler(async () => {
            throw new ApiError('Custom Error', 400)
        })

        const req = new NextRequest('http://localhost/api/test')
        const response = await handler(req)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.error.message).toBe('Custom Error')
    })
})
