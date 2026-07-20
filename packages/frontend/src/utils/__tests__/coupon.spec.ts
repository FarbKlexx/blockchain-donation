import { describe, it, expect } from 'vitest'
import {
  daysToSeconds,
  secondsToDays,
  ethToEur,
  eurToEth,
  formatEur,
  formatEth,
  deriveCouponStatus,
  formatUnixDate,
  EUR_PER_ETH,
} from '../coupon'

const SECONDS_PER_DAY = 86_400

describe('daysToSeconds', () => {
  it('converts whole days to seconds', () => {
    expect(daysToSeconds(1)).toBe(SECONDS_PER_DAY)
    expect(daysToSeconds(365)).toBe(365 * SECONDS_PER_DAY)
  })

  it('handles zero and rounds fractional days', () => {
    expect(daysToSeconds(0)).toBe(0)
    expect(daysToSeconds(0.5)).toBe(43_200) // half a day
    expect(daysToSeconds(1.4)).toBe(Math.round(1.4 * SECONDS_PER_DAY))
  })

  it('round-trips with secondsToDays for whole days', () => {
    expect(secondsToDays(daysToSeconds(365))).toBe(365)
  })
})

describe('secondsToDays', () => {
  it('floors to whole days', () => {
    expect(secondsToDays(SECONDS_PER_DAY)).toBe(1)
    expect(secondsToDays(SECONDS_PER_DAY * 365)).toBe(365)
  })

  it('floors a partial day down (no rounding up)', () => {
    expect(secondsToDays(SECONDS_PER_DAY - 1)).toBe(0)
    expect(secondsToDays(SECONDS_PER_DAY * 1.9)).toBe(1)
  })

  it('handles zero', () => {
    expect(secondsToDays(0)).toBe(0)
  })
})

describe('ethToEur / eurToEth', () => {
  it('converts using the placeholder rate', () => {
    expect(ethToEur(1)).toBe(EUR_PER_ETH)
    expect(eurToEth(EUR_PER_ETH)).toBe(1)
  })

  it('handles zero', () => {
    expect(ethToEur(0)).toBe(0)
    expect(eurToEth(0)).toBe(0)
  })

  it('round-trips a small nominal value', () => {
    expect(ethToEur(eurToEth(20))).toBeCloseTo(20, 10)
  })

  it('produces the tiny native amount for a typical 20 EUR card', () => {
    expect(eurToEth(20)).toBeCloseTo(0.01, 10)
  })
})

describe('formatEur', () => {
  it('appends the EUR code and drops fractional cents', () => {
    expect(formatEur(5)).toBe('5 EUR')
    expect(formatEur(20)).toBe('20 EUR')
  })

  it('groups thousands (de-DE) and rounds to whole EUR', () => {
    expect(formatEur(1000)).toBe('1.000 EUR')
    expect(formatEur(19.6)).toBe('20 EUR') // maximumFractionDigits: 0
  })

  it('handles zero', () => {
    expect(formatEur(0)).toBe('0 EUR')
  })
})

describe('formatEth', () => {
  it('formats with German decimal comma and the native code', () => {
    expect(formatEth(0.0025)).toBe('0,0025 ETH')
  })

  it('caps at 6 fractional digits', () => {
    // 7 significant fractional digits → rounded to 6
    expect(formatEth(0.0000001)).toBe('0 ETH')
    expect(formatEth(0.0000005)).toBe('0,000001 ETH')
  })

  it('handles whole numbers and zero', () => {
    expect(formatEth(1)).toBe('1 ETH')
    expect(formatEth(0)).toBe('0 ETH')
  })
})

describe('deriveCouponStatus', () => {
  const now = 1_000_000
  const future = now + SECONDS_PER_DAY
  const past = now - SECONDS_PER_DAY

  it('is "redeemed" whenever the redeemed flag is set — terminal, ignores expiry', () => {
    expect(deriveCouponStatus(true, future, now)).toBe('redeemed')
    expect(deriveCouponStatus(true, past, now)).toBe('redeemed') // redeemed wins over expired
  })

  it('is "active" while unredeemed and before expiry', () => {
    expect(deriveCouponStatus(false, future, now)).toBe('active')
  })

  it('is "expired" once past expiry and unredeemed', () => {
    expect(deriveCouponStatus(false, past, now)).toBe('expired')
  })

  it('treats the exact expiry instant as expired (>= boundary)', () => {
    expect(deriveCouponStatus(false, now, now)).toBe('expired')
  })
})

describe('formatUnixDate', () => {
  it('renders a long German date from Unix seconds', () => {
    // 2026-03-12T00:00:00Z
    const seconds = Math.floor(Date.UTC(2026, 2, 12) / 1000)
    // Rendered in the runner's locale time zone; assert the parts are present.
    const out = formatUnixDate(seconds)
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/März|April|Feb/) // day may shift ±1 by TZ, but month is stable-ish
  })

  it('returns an em dash for a falsy/zero timestamp (no epoch date leak)', () => {
    expect(formatUnixDate(0)).toBe('—')
  })
})
