import { describe, it, expect } from 'vitest'
import { percentFunded, formatAmount, daysLeftUntil, hasEnded, timeLeftShort } from '../format'
import { validateAmount, decimalsFor, NATIVE_CURRENCY } from '../amount'
import { shortenAddress, explorerAddressUrl } from '../address'

describe('percentFunded', () => {
  it('rounds and clamps to 0–100', () => {
    expect(percentFunded(47520, 66000)).toBe(72)
    expect(percentFunded(0, 66000)).toBe(0)
    expect(percentFunded(99999, 66000)).toBe(100) // clamped
  })

  it('guards divide-by-zero', () => {
    expect(percentFunded(100, 0)).toBe(0)
  })
})

describe('formatAmount', () => {
  it('groups thousands (de-DE)', () => {
    expect(formatAmount(47520)).toBe('47.520')
  })
})

describe('validateAmount', () => {
  const decimals = decimalsFor(NATIVE_CURRENCY) // 18 (native coin)

  it('accepts valid decimals', () => {
    expect(validateAmount('10', decimals)).toEqual({ ok: true, value: '10' })
    expect(validateAmount(' 0.5 ', decimals)).toEqual({ ok: true, value: '0.5' })
  })

  it('rejects empty, zero and negative', () => {
    expect(validateAmount('', decimals).ok).toBe(false)
    expect(validateAmount('0', decimals).ok).toBe(false)
    expect(validateAmount('-5', decimals).ok).toBe(false)
  })

  it('rejects non-finite / exponent / garbage (parseEther footguns)', () => {
    expect(validateAmount('Infinity', decimals).ok).toBe(false)
    expect(validateAmount('NaN', decimals).ok).toBe(false)
    expect(validateAmount('1e9', decimals).ok).toBe(false)
    expect(validateAmount('0x10', decimals).ok).toBe(false)
  })

  it('rejects more fractional digits than the coin supports', () => {
    expect(validateAmount('1.' + '1'.repeat(19), decimals).ok).toBe(false) // 19 > 18
    expect(validateAmount('1.' + '1'.repeat(18), decimals).ok).toBe(true)
  })
})

describe('time-left derivations', () => {
  // Fixed reference instant so the derivations are deterministic.
  const now = Date.UTC(2026, 5, 23, 12, 0, 0) // 2026-06-23T12:00:00Z (ms)
  const end = Math.floor(now / 1000) + 11 * 86400 + 3 * 3600 // +11d 3h

  it('floors whole days remaining', () => {
    expect(daysLeftUntil(end, now)).toBe(11)
  })

  it('formats the compact countdown', () => {
    expect(timeLeftShort(end, now)).toBe('11d, 3 Std.')
  })

  it('clamps a passed deadline to 0 / "Beendet"', () => {
    const past = Math.floor(now / 1000) - 86400
    expect(daysLeftUntil(past, now)).toBe(0)
    expect(timeLeftShort(past, now)).toBe('Beendet')
    expect(hasEnded(past, now)).toBe(true)
    expect(hasEnded(end, now)).toBe(false)
  })
})

describe('address helpers', () => {
  const full = '0x7f4b2c9d1e3a5f7c8b0d2e4a6c8f1b3d5e7089a2'

  it('shortens a full address for display', () => {
    expect(shortenAddress(full)).toBe('0x7f4...89a2')
  })

  it('derives the explorer URL from the address (fixed https scheme)', () => {
    expect(explorerAddressUrl(full)).toBe(`https://polygonscan.com/address/${full}`)
    expect(explorerAddressUrl(full).startsWith('https://')).toBe(true)
  })
})
