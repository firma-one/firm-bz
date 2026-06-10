/**
 * Tests for resolveClientConnector — the new client-level connector resolver.
 * Verifies no firm-level fallback occurs and that all edge cases return cleanly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockClientFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findUnique: (...a: unknown[]) => mockClientFindUnique(...a) },
  },
}))

// ── Subject ────────────────────────────────────────────────────────────────

import { resolveClientConnector } from './resolve-client-connector'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('resolveClientConnector', () => {
  beforeEach(() => {
    mockClientFindUnique.mockReset()
  })

  it('returns connectorId and firmId when client has a connector', async () => {
    mockClientFindUnique.mockResolvedValue({
      firmId: 'firm-1',
      connectorId: 'conn-abc',
    })

    const result = await resolveClientConnector('client-1')

    expect(result).toEqual({ connectorId: 'conn-abc', firmId: 'firm-1' })
    expect(mockClientFindUnique).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      select: { firmId: true, connectorId: true },
    })
  })

  it('returns connectorId: null when client has no connector (no firm fallback)', async () => {
    mockClientFindUnique.mockResolvedValue({
      firmId: 'firm-1',
      connectorId: null,
    })

    const result = await resolveClientConnector('client-1')

    expect(result.connectorId).toBeNull()
    expect(result.firmId).toBe('firm-1')
  })

  it('throws when client is not found', async () => {
    mockClientFindUnique.mockResolvedValue(null)

    await expect(resolveClientConnector('nonexistent')).rejects.toThrow('Client not found')
  })

  it('does NOT query firm.connectorId — resolver is purely client-scoped', async () => {
    // If the implementation accidentally queries the firm table, it would need a firm mock.
    // This test ensures only prisma.client is called.
    mockClientFindUnique.mockResolvedValue({ firmId: 'firm-2', connectorId: 'conn-xyz' })

    await resolveClientConnector('client-2')

    // Only client.findUnique should be called; no firm query
    expect(mockClientFindUnique).toHaveBeenCalledOnce()
  })

  it('returns the correct firmId alongside a null connectorId', async () => {
    mockClientFindUnique.mockResolvedValue({ firmId: 'firm-3', connectorId: null })

    const { firmId, connectorId } = await resolveClientConnector('client-3')

    expect(firmId).toBe('firm-3')
    expect(connectorId).toBeNull()
  })
})
