import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  percentFunded,
  formatAmount,
  formatCurrency,
  daysLeftUntil,
  hasEnded,
  timeLeftShort,
  formatDate,
} from '../format'
import {
  validateAmount,
  decimalsFor,
  NATIVE_CURRENCY,
  remainingAmountString,
  trimTrailingZeros,
} from '../amount'
import { shortenAddress, explorerAddressUrl, addressGradient } from '../address'
import { mediaUrl } from '../media'

describe('remainingAmountString', () => {
  it('returns the clean difference for whole numbers', () => {
    expect(remainingAmountString(66000, 47520)).toBe('18480')
  })
  it('avoids float artifacts by subtracting in wei', () => {
    // Plain float subtraction would give 0.06999999999999999.
    expect(remainingAmountString(0.1, 0.03)).toBe('0.07')
  })
  it('returns the full goal when nothing is raised yet', () => {
    expect(remainingAmountString(0.05, 0)).toBe('0.05')
  })
  it('returns "" once the goal is met or exceeded', () => {
    expect(remainingAmountString(100, 100)).toBe('')
    expect(remainingAmountString(100, 120)).toBe('')
  })

  it('returns "" when an input cannot be parsed into wei (NaN/Infinity)', () => {
    expect(remainingAmountString(NaN, 0)).toBe('')
    expect(remainingAmountString(Infinity, 0)).toBe('')
    expect(remainingAmountString(0.05, NaN)).toBe('')
  })

  it('keeps precision for a small plain-decimal remainder (wei subtraction, no float drift)', () => {
    expect(remainingAmountString(0.000001, 0)).toBe('0.000001')
  })

  it('returns "" for a value JS stringifies in exponent form (parseEther footgun)', () => {
    // 1e-16 → String() is "1e-16", which parseEther rejects → caught → "".
    expect(remainingAmountString(0.0000000000000001, 0)).toBe('')
  })
})

describe('percentFunded', () => {
  it('rounds and clamps to 0–100', () => {
    expect(percentFunded(47520, 66000)).toBe(72)
    expect(percentFunded(0, 66000)).toBe(0)
    expect(percentFunded(99999, 66000)).toBe(100) // clamped
  })

  it('guards divide-by-zero', () => {
    expect(percentFunded(100, 0)).toBe(0)
  })

  it('guards a negative goal (treated like non-positive → 0)', () => {
    expect(percentFunded(100, -50)).toBe(0)
  })

  it('rounds to the nearest whole percent', () => {
    expect(percentFunded(1, 3)).toBe(33) // 33.33 → 33
    expect(percentFunded(2, 3)).toBe(67) // 66.67 → 67
  })
})

describe('formatAmount', () => {
  it('groups thousands (de-DE)', () => {
    expect(formatAmount(47520)).toBe('47.520')
  })

  it('caps at 2 fractional digits and rounds', () => {
    expect(formatAmount(1.005)).toBe('1,01') // rounded up to 2 dp
    expect(formatAmount(1234.5)).toBe('1.234,5')
  })

  it('handles zero and negatives', () => {
    expect(formatAmount(0)).toBe('0')
    expect(formatAmount(-1000)).toBe('-1.000')
  })
})

describe('formatCurrency', () => {
  it('joins the grouped amount and the currency code', () => {
    expect(formatCurrency(47520, 'USDC')).toBe('47.520 USDC')
    expect(formatCurrency(0, 'ETH')).toBe('0 ETH')
  })
})

describe('formatDate', () => {
  it('renders a long German date from an ISO date', () => {
    expect(formatDate('2026-05-28')).toBe('28. Mai 2026')
  })

  it('returns the raw input unchanged when it is not a valid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatDate('')).toBe('')
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

  it('rejects whitespace-only, a bare dot, and leading-dot / trailing-dot forms', () => {
    expect(validateAmount('   ', decimals).ok).toBe(false)
    expect(validateAmount('.', decimals).ok).toBe(false)
    expect(validateAmount('.5', decimals).ok).toBe(false) // regex requires a leading digit
    expect(validateAmount('5.', decimals).ok).toBe(false)
  })

  it('rejects comma decimals and thousands separators (German input footgun)', () => {
    expect(validateAmount('0,5', decimals).ok).toBe(false)
    expect(validateAmount('1.000.000', decimals).ok).toBe(false)
  })

  it('accepts a value with exactly-zero fractional part and preserves the string', () => {
    expect(validateAmount('10.0', decimals)).toEqual({ ok: true, value: '10.0' })
  })

  it('trims surrounding whitespace before validating', () => {
    expect(validateAmount('\t 0.5 \n', decimals)).toEqual({ ok: true, value: '0.5' })
  })

  it('carries a helpful error message on each rejection', () => {
    const empty = validateAmount('', decimals)
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error).toMatch(/eingeben/i)
  })
})

describe('trimTrailingZeros', () => {
  it('drops trailing fractional zeros', () => {
    expect(trimTrailingZeros('18480.0')).toBe('18480')
    expect(trimTrailingZeros('0.070')).toBe('0.07')
    expect(trimTrailingZeros('1.2300')).toBe('1.23')
  })

  it('leaves integers (no dot) untouched', () => {
    expect(trimTrailingZeros('18480')).toBe('18480')
    expect(trimTrailingZeros('1000')).toBe('1000')
  })

  it('collapses an all-zero fraction and the bare trailing dot', () => {
    expect(trimTrailingZeros('5.000')).toBe('5')
  })

  it('does not strip significant trailing digits', () => {
    expect(trimTrailingZeros('0.105')).toBe('0.105')
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

describe('mediaUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('turns a relative key into a root-relative URL (default base)', () => {
    expect(mediaUrl('uploads/p/cover.jpg')).toBe('/uploads/p/cover.jpg')
  })

  it('collapses a leading slash on the key (no double slash)', () => {
    expect(mediaUrl('/uploads/p/cover.jpg')).toBe('/uploads/p/cover.jpg')
  })

  it('prepends a configured media base, without doubling slashes', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.example.com/')
    expect(mediaUrl('uploads/p/cover.jpg')).toBe('https://cdn.example.com/uploads/p/cover.jpg')
  })

  it('leaves an already-absolute URL untouched', () => {
    expect(mediaUrl('https://x.com/a.jpg')).toBe('https://x.com/a.jpg')
    expect(mediaUrl('//x.com/a.jpg')).toBe('//x.com/a.jpg')
  })

  it('returns empty string for an empty ref', () => {
    expect(mediaUrl('')).toBe('')
  })
})

describe('address helpers', () => {
  const full = '0x7f4b2c9d1e3a5f7c8b0d2e4a6c8f1b3d5e7089a2'

  it('shortens a full address for display', () => {
    expect(shortenAddress(full)).toBe('0x7f4...89a2')
  })

  it('derives the explorer URL from the address (fixed https scheme)', () => {
    expect(explorerAddressUrl(full)).toBe(`https://etherscan.io/address/${full}`)
    expect(explorerAddressUrl(full).startsWith('https://')).toBe(true)
  })

  it('url-encodes the address segment (no injection via a crafted value)', () => {
    const evil = '0xabc/../../evil?x=1'
    const url = explorerAddressUrl(evil)
    expect(url).toBe(`https://etherscan.io/address/${encodeURIComponent(evil)}`)
    expect(url).not.toMatch(/\?x=1$/) // the query char is percent-encoded, not live
  })

  it('leaves a short address untouched (nothing to shorten)', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
    expect(shortenAddress('')).toBe('')
  })

  it('respects custom lead/tail lengths', () => {
    expect(shortenAddress(full, 4, 6)).toBe('0x7f4b...7089a2')
  })
})

describe('addressGradient', () => {
  const full = '0x7f4b2c9d1e3a5f7c8b0d2e4a6c8f1b3d5e7089a2'

  it('is deterministic — same address → same gradient', () => {
    expect(addressGradient(full)).toBe(addressGradient(full))
  })

  it('produces a valid CSS linear-gradient with two hsl stops', () => {
    const g = addressGradient(full)
    expect(g).toMatch(/^linear-gradient\(135deg, hsl\(\d{1,3} 65% 55%\), hsl\(\d{1,3} 60% 42%\)\)$/)
  })

  it('keeps both hues within 0–359', () => {
    const hues = [...addressGradient(full).matchAll(/hsl\((\d{1,3})/g)].map((m) => Number(m[1]))
    for (const h of hues) {
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('differs for different addresses (avatar disambiguates wallets)', () => {
    expect(addressGradient(full)).not.toBe(addressGradient('0x0000000000000000000000000000000000000000'))
  })

  it('does not throw on an empty string', () => {
    expect(() => addressGradient('')).not.toThrow()
  })
})
