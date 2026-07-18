// Gift-card display helpers — the EUR↔native-coin conversion, validity/expiry
// helpers, and the status vocabulary. No on-chain logic (that lives in
// couponsService); these are pure and reused by the coupon components/views.

import type { CouponStatus } from '@/types/coupon'
import { NATIVE_CURRENCY } from '@/utils/amount'

// ── EUR ↔ native coin ─────────────────────────────────────────────────────────
// The on-chain gift-card value is the native coin (e.g. ETH); the "5 €" is a
// marketing nominal. Converting between them needs a price — on-chain that would
// come from a price ORACLE; here it is a fixed placeholder.
//
// TODO(integration): replace EUR_PER_ETH with a live rate (price oracle such as
// Chainlink, read at mint/redeem time) instead of a baked-in constant.
export const EUR_PER_ETH = 2000

/** The DEFAULT gift-card value, in EUR, pre-filled in the create form. The
 *  creator may choose a different value; the on-chain amount is that EUR figure
 *  converted as `eur / EUR_PER_ETH` (and must clear the contract minimum). */
export const COUPON_NOMINAL_EUR = 20

/** Default validity offered in the create form, in days. The contract enforces a
 *  minimum of 365 days (`validityDurationMinimum`); this is the pre-filled value. */
export const DEFAULT_VALIDITY_DAYS = 365

const SECONDS_PER_DAY = 86_400

/** Whole days → seconds (the `duration` the contract's createGiftCard expects). */
export function daysToSeconds(days: number): number {
  return Math.round(days * SECONDS_PER_DAY)
}

/** Seconds → whole days (rounded down), for showing the contract's minimum
 *  validity as a friendly "X Tage". */
export function secondsToDays(seconds: number): number {
  return Math.floor(seconds / SECONDS_PER_DAY)
}

/** Native-coin amount → its EUR nominal. */
export function ethToEur(value: number): number {
  return value * EUR_PER_ETH
}

/** EUR nominal → native-coin amount (used when creating a card). */
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

// ── Status ─────────────────────────────────────────────────────────────────

/** Derive the UI status from the raw on-chain fields. Pure (takes `nowSeconds`
 *  so it is testable and callers control the clock). `redeemed` is terminal;
 *  otherwise the validity window decides active vs. expired. */
export function deriveCouponStatus(
  redeemed: boolean,
  expirationDate: number,
  nowSeconds: number,
): CouponStatus {
  if (redeemed) return 'redeemed'
  return nowSeconds >= expirationDate ? 'expired' : 'active'
}

/** German labels for the derived gift-card status. */
export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: 'Aktiv',
  redeemed: 'Eingelöst',
  expired: 'Abgelaufen',
}

// ── Misc display ──────────────────────────────────────────────────────────────

/** "12. März 2026" from a Unix-seconds timestamp (e.g. the on-chain
 *  `expirationDate`). */
export function formatUnixDate(seconds: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
