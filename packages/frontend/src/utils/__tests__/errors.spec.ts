import { describe, it, expect, vi, afterEach } from 'vitest'
import { toUserMessage, ApiError } from '../errors'

// Silence the intentional console.error calls (unmapped revert / unhandled).
vi.spyOn(console, 'error').mockImplementation(() => {})
afterEach(() => vi.clearAllMocks())

describe('toUserMessage — backend (ApiError)', () => {
  it('maps HTTP statuses to readable German (never raw status text)', () => {
    expect(toUserMessage(new ApiError(404, 'NOT FOUND'))).toMatch(/nicht gefunden/i)
    expect(toUserMessage(new ApiError(400))).toMatch(/ungültig/i)
    expect(toUserMessage(new ApiError(403))).toMatch(/berechtigt/i)
    expect(toUserMessage(new ApiError(500))).toMatch(/Server/i)
  })

  it('maps a network failure (status 0) to a server-unreachable message', () => {
    expect(toUserMessage(new ApiError(0))).toMatch(/nicht erreichbar/i)
  })

  it('never leaks the raw "HTTP 500 ..." message', () => {
    expect(toUserMessage(new ApiError(500, 'INTERNAL SERVER ERROR'))).not.toMatch(/HTTP|500/)
  })
})

describe('toUserMessage — wallet / ethers codes', () => {
  it('explains a user-rejected transaction', () => {
    expect(toUserMessage({ code: 'ACTION_REJECTED', message: 'user rejected' })).toMatch(
      /abgebrochen/i,
    )
  })

  it('explains insufficient funds', () => {
    expect(toUserMessage({ code: 'INSUFFICIENT_FUNDS' })).toMatch(/Guthaben/i)
  })

  it('explains a network error', () => {
    expect(toUserMessage({ code: 'NETWORK_ERROR' })).toMatch(/Verbindung zur Blockchain/i)
  })
})

describe('toUserMessage — contract reverts', () => {
  it('maps a known revert reason (from .reason) to friendly text', () => {
    const err = { code: 'CALL_EXCEPTION', reason: 'Same Vote was already made' }
    const msg = toUserMessage(err)
    expect(msg).toMatch(/bereits genau so abgestimmt/i)
    expect(msg).not.toMatch(/Same Vote/) // raw string not shown
  })

  it('extracts a revert reason from a nested Hardhat message', () => {
    const err = {
      code: 'CALL_EXCEPTION',
      info: { error: { message: "reverted with reason string 'Only Owner is allowed to do this'" } },
    }
    expect(toUserMessage(err)).toMatch(/Eigentümer/i)
  })

  it('falls back to a generic "rejected by chain" for an unmapped reason', () => {
    const err = { code: 'CALL_EXCEPTION', reason: 'Some internal invariant' }
    const msg = toUserMessage(err)
    expect(msg).toMatch(/von der Blockchain abgelehnt/i)
    expect(msg).not.toMatch(/internal invariant/)
  })
})

describe('toUserMessage — plain errors', () => {
  it('passes through our own friendly German messages', () => {
    const msg = 'Projekt-Metadaten nicht gefunden.'
    expect(toUserMessage(new Error(msg))).toBe(msg)
  })

  it('replaces a raw technical dump with the fallback', () => {
    const technical = new Error(
      'could not coalesce error (error={ "code": -32000 }, code=CALL_EXCEPTION, version=6.0.0)',
    )
    expect(toUserMessage(technical, 'Aktion fehlgeschlagen.')).toBe('Aktion fehlgeschlagen.')
  })

  it('returns a string error as-is and falls back for unknown values', () => {
    expect(toUserMessage('Bitte einen Betrag eingeben.')).toBe('Bitte einen Betrag eingeben.')
    expect(toUserMessage(null, 'Fallback.')).toBe('Fallback.')
    expect(toUserMessage(undefined, 'Fallback.')).toBe('Fallback.')
  })
})
