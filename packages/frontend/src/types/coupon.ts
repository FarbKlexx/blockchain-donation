// Merged domain model for the COUPON subsystem. couponsService builds these by
// reading the on-chain coupon record (SOURCE 1) and deriving everything the UI
// shows that is not stored raw. The off-chain secret (SOURCE 2) is NOT part of
// this public model — it is fetched separately, only after authentication, and
// surfaced only to the coupon's creator (see `MyCoupon`). See
// types/coupon-sources.ts for the raw shapes and COUPONS.md for the per-field
// data origin.

/** Coupon lifecycle as shown in the UI:
 *  - `active`   (Aktiv):      created and usable — whoever holds the key can redeem.
 *  - `redeemed` (Eingelöst):  used at a checkout — spent.
 *  DERIVED from the on-chain `redeemed` flag — not stored as a field. There is no
 *  "pending"/"unclaimed" state: a coupon is usable from the moment it is created. */
export type CouponStatus = 'active' | 'redeemed'

/** A coupon for display — the public on-chain state plus frontend derivations.
 *  Never carries the private key (that lives off-chain, revealed only to the
 *  creator — see `MyCoupon`). */
export interface Coupon {
  /** On-chain coupon id — part 1 of the redeem code, and the route/join key. */
  id: number
  /** The coupon keypair's address ("öffentlicher Schlüssel"). The view shortens
   *  it for display (utils/address.ts). */
  couponAddress: string
  /** Wallet that created (and paid for) the coupon. */
  creator: string
  /** Derived from `redeemed`. */
  status: CouponStatus
  /** Discount in the native coin (e.g. ETH). */
  value: number
  /** Discount nominal in EUR — DERIVED from `value` × the placeholder rate
   *  (utils/coupon.ts). The "5 €" shown in the UI. */
  valueEur: number
  /** Currency label for `value` — the chain's native coin (single coin, like
   *  donations). */
  currency: string
  /** Creation time, Unix seconds (the "Erstellt" column derives its date). */
  createdAt: number
  /** Redemption time, Unix seconds, or null if not redeemed. */
  redeemedAt: number | null
  /** Explorer page for `couponAddress` — DERIVED in the frontend from the
   *  address (utils/address.ts), never a backend-supplied href. */
  explorerUrl: string
}

/** A coupon as shown to its CREATOR on the "Meine Gutscheine" page: the public
 *  `Coupon` plus the secret private key (part 2 of the redeem code). Returned
 *  only by the authenticated `listMyCoupons` — never part of the public model. */
export interface MyCoupon extends Coupon {
  /** The coupon keypair's PRIVATE KEY — the secret code the creator distributes. */
  privateKey: string
}
