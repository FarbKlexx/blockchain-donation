// Merged domain model for the COUPON / gift-card subsystem. couponsService
// builds these by reading the on-chain gift-card record (SOURCE 1, the
// GiftCardProject contract) and deriving everything the UI shows that is not
// stored raw. The secret (the private key) is NOT part of any model here: it is
// shown ONCE at creation (as `CreatedCoupon` from createCoupon) for the creator
// to copy, and never stored or re-shown. See types/coupon-sources.ts for the raw
// on-chain shape.

/** Gift-card lifecycle as shown in the UI, DERIVED from the on-chain `redeemed`
 *  flag and `expirationDate` (never stored as a field):
 *  - `active`   (Aktiv):      not redeemed and not yet expired — a whitelisted
 *                             institution holding the key can redeem it.
 *  - `redeemed` (Eingelöst):  already spent (or refunded) — settled, terminal.
 *  - `expired`  (Abgelaufen): past its validity while unredeemed — no longer
 *                             redeemable, but the creator can now refund it. */
export type CouponStatus = 'active' | 'redeemed' | 'expired'

/** A gift card for display — the public on-chain state plus frontend
 *  derivations. Never carries the private key: the code is shown once at
 *  creation and never stored. */
export interface Coupon {
  /** The gift-card keypair's ADDRESS — the on-chain identity and route/join key.
   *  The view shortens it for display (utils/address.ts). */
  redemptionKey: string
  /** Wallet that created and funded the card. */
  creator: string
  /** Derived from `redeemed` + `expirationDate`. */
  status: CouponStatus
  /** Redeemable value in the native coin (e.g. ETH), human-readable. */
  amount: number
  /** Exact on-chain value in wei (string) — carried through for a precise
   *  redeem/refund (the contract compares the amount exactly). */
  amountWei: string
  /** Value nominal in EUR — DERIVED from `amount` × the placeholder rate
   *  (utils/coupon.ts). The "5 €" shown in the UI. */
  amountEur: number
  /** Currency label for `amount` — the chain's native coin. */
  currency: string
  /** Raw redeemed/settled flag (true also after a refund). */
  redeemed: boolean
  /** Expiry, Unix seconds — the "Gültig bis" date derives from this. */
  expirationDate: number
  /** Explorer page for `redemptionKey` — DERIVED in the frontend, never a
   *  backend-supplied href. */
  explorerUrl: string
}
