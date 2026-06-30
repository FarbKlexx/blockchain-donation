// Coupon-specific display helpers — the EUR↔native-coin conversion and the
// status vocabulary. No domain logic (that lives in couponsService); these are
// pure and reused by the coupon components.

import type { CouponStatus } from '@/types/coupon'
import { NATIVE_CURRENCY } from '@/utils/amount'

// ── EUR ↔ native coin ─────────────────────────────────────────────────────────
// The on-chain coupon value is the native coin (e.g. ETH); the "5 €" is a
// marketing nominal. Converting between them needs a price — on-chain that would
// come from a price ORACLE; here it is a fixed placeholder.
//
// TODO(integration): replace EUR_PER_ETH with a live rate (price oracle such as
// Chainlink, read at mint/redeem time) instead of a baked-in constant.
export const EUR_PER_ETH = 2000

/** The nominal coupon value, in EUR ("5 € for now"). The on-chain `value` is
 *  derived from this at mint time as `COUPON_NOMINAL_EUR / EUR_PER_ETH`. */
export const COUPON_NOMINAL_EUR = 5

/** Native-coin amount → its EUR nominal. */
export function ethToEur(value: number): number {
  return value * EUR_PER_ETH
}

/** EUR nominal → native-coin amount (used when minting a coupon). */
export function eurToEth(eur: number): number {
  return eur / EUR_PER_ETH
}

const eurFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 0,
})

/** "5" → "5 EUR" (matches the Figma label + the donation `formatCurrency`
 *  convention of "<amount> <code>"). */
export function formatEur(eur: number): string {
  return `${eurFormatter.format(eur)} EUR`
}

const ethFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 6,
})

/** "0.0025" → "0,0025 ETH" (native coin, German grouping). */
export function formatEth(value: number): string {
  return `${ethFormatter.format(value)} ${NATIVE_CURRENCY}`
}

// ── Status vocabulary ─────────────────────────────────────────────────────────

/** German labels for the derived coupon status (matches the Figma). */
export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  pending: 'Ausstehend',
  active: 'Aktiv',
  redeemed: 'Eingelöst',
}

// ── Misc display ──────────────────────────────────────────────────────────────

/** "12. März 2026" from a Unix-seconds timestamp (the on-chain `createdAt`). */
export function formatUnixDate(seconds: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
