import { describe, it, expect } from 'vitest'
import { percentFunded, formatAmount } from '../format'
import { validateAmount, decimalsFor } from '../amount'

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
  const decimals = decimalsFor('USDC') // 6

  it('accepts valid decimals', () => {
    expect(validateAmount('10', decimals)).toEqual({ ok: true, value: '10' })
    expect(validateAmount(' 0.5 ', decimals)).toEqual({ ok: true, value: '0.5' })
  })

  it('rejects empty, zero and negative', () => {
    expect(validateAmount('', decimals).ok).toBe(false)
    expect(validateAmount('0', decimals).ok).toBe(false)
    expect(validateAmount('-5', decimals).ok).toBe(false)
  })

  it('rejects non-finite / exponent / garbage (parseUnits footguns)', () => {
    expect(validateAmount('Infinity', decimals).ok).toBe(false)
    expect(validateAmount('NaN', decimals).ok).toBe(false)
    expect(validateAmount('1e9', decimals).ok).toBe(false)
    expect(validateAmount('0x10', decimals).ok).toBe(false)
  })

  it('rejects more fractional digits than the token supports', () => {
    expect(validateAmount('1.1234567', decimals).ok).toBe(false) // 7 > 6
    expect(validateAmount('1.123456', decimals).ok).toBe(true)
  })
})
