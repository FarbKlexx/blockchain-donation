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

/** The DEFAULT coupon value, in EUR, pre-filled in the create form. The creator
 *  may choose a different value per batch; the on-chain `value` is that EUR
 *  figure converted as `eur / EUR_PER_ETH`. */
export const COUPON_NOMINAL_EUR = 5

/** Flat fee (native coin) the contract charges PER coupon at creation, on top of
 *  the escrowed discount value — this is what makes creating coupons "cost money"
 *  beyond the funds locked to back the discounts. A frontend constant mirroring a
 *  future contract constant (no getter), exactly like the donation majority BPS.
 *  TODO(integration): read/confirm against the deployed contract's fee. */
export const COUPON_CREATION_FEE_ETH = 0.0002

/** Native-coin amount → its EUR nominal. */
export function ethToEur(value: number): number {
  return value * EUR_PER_ETH
}

/** EUR nominal → native-coin amount (used when minting a coupon). */
export function eurToEth(eur: number): number {
  return eur / EUR_PER_ETH
}

/** What creating a batch of coupons costs the creator, broken down. The creator
 *  pays, per coupon, the escrowed discount `value` (funds the eventual redeem)
 *  PLUS a flat creation fee — the whole `total` is sent to the contract. Pure
 *  helper so the create form can show a live quote and the service can charge it.
 *
 * @param count      number of coupons to create (>= 1)
 * @param valueEth   discount value per coupon, native coin
 */
export function couponCreationCost(count: number, valueEth: number) {
  const escrowEth = count * valueEth
  const feeEth = count * COUPON_CREATION_FEE_ETH
  const totalEth = escrowEth + feeEth
  return {
    count,
    valueEth,
    escrowEth,
    feeEth,
    totalEth,
    escrowEur: ethToEur(escrowEth),
    feeEur: ethToEur(feeEth),
    totalEur: ethToEur(totalEth),
  }
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

/** German labels for the derived coupon status. */
export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
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
