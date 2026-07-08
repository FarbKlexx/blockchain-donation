// The two RAW data sources for the COUPON subsystem, kept separate so each maps
// 1:1 onto a future API — mirrors the donation system's split (see
// types/sources.ts). couponsService merges them into the `Coupon` UI model
// (see types/coupon.ts).
//
//   ContractCoupon  ← SOURCE 1: smart contract (ethers.js reads)
//   CouponSecret    ← SOURCE 2: backend REST API (off-chain secrets)
//
// Join key: `id` (the on-chain coupon id; the backend stores it too).
//
// This subsystem is INDEPENDENT of the donation system — its own contract, its
// own data, its own service. It only shares the app shell (navbar, wallet
// login, design tokens).
//
// CREATION MODEL (important): coupons are NOT issued by the site. ANY wallet-
// connected user creates their OWN coupons and PAYS the contract for them (the
// discount value is escrowed on-chain, plus a creation fee). The creator then
// gets the private keys and distributes them however they like — OFF the site.
// There is no newsletter, no e-mail, and no claim link: the creator holds the
// keys from the moment of creation. So a coupon is bound to its `creator`, not
// to a later "owner".
//
// THE CRYPTO MODEL (important): a coupon is an ECDSA keypair.
//   • the PUBLIC side — the keypair's ADDRESS (an address IS the hash of the
//     public key) — lives ON-CHAIN as `couponAddress`. It is what redemption is
//     verified against.
//   • the PRIVATE side — the keypair's PRIVATE KEY — is the secret "coupon code"
//     (part 2 of the code; part 1 is the `id`). It lives OFF-CHAIN, encrypted,
//     and is revealed only to the coupon's `creator` after authentication.
//   Redeeming proves possession of the private key WITHOUT transmitting it: the
//   holder signs a challenge with the coupon key and the contract recovers the
//   signer via `ecrecover`, checking it equals `couponAddress`. So whoever holds
//   the key can redeem (whoever the creator gave it to), but the key itself is
//   never exposed on-chain. The frontend mock reproduces this with sign +
//   verifyMessage.

// ── Source 1: on-chain (mirrors the planned Coupon / CouponFactory contract) ──
//
// There is no `Coupon.sol` yet — this subsystem is frontend-only for now. These
// field names are chosen to map 1:1 onto a future contract's public getters, so
// a later ethers read drops straight onto this shape with no translation (the
// same discipline types/sources.ts applies to the live `Donation` contract).

/** A coupon as read from its on-chain record — the PUBLIC, authoritative state.
 *  No PII, no secret: only what may safely live on a public ledger. */
export interface ContractCoupon {
  /** On-chain coupon id — the identity AND the join key to the backend secret.
   *  (A `CouponFactory` index / mapping key.) */
  id: number
  /** The coupon keypair's ADDRESS — the "public key" shown in the UI. Redemption
   *  verifies a signature against THIS via `ecrecover`. Never reveals the key. */
  couponAddress: string
  /** Wallet that CREATED (and paid for) the coupon — the on-chain `creator`
   *  (`msg.sender` at creation). Only the creator can (re-)retrieve the private
   *  key; the contract checks `creator == msg.sender`. There is no "owner"
   *  binding — the creator distributes the key off-chain to whoever they wish. */
  creator: string
  /** Discount value in the chain's NATIVE coin. Shown here as a human-readable
   *  whole-coin number (on-chain it is wei, converted via parseEther/formatEther
   *  at the ethers boundary) — exactly the donation mock's convention. The "5 €"
   *  nominal is a marketing figure derived in the frontend (utils/coupon.ts),
   *  NOT stored on-chain. The creator escrows this value at creation so a redeem
   *  can pay it out. */
  value: number
  /** Whether the coupon has been redeemed (used at a checkout). Flips at redeem;
   *  the UI's "Eingelöst" status derives from this. */
  redeemed: boolean
  /** When it was redeemed, Unix seconds. 0 unless `redeemed`. */
  redeemedAt: number
  /** Creation time, Unix seconds (`block.timestamp` at mint). The "Erstellt"
   *  date is DERIVED/formatted from this — the contract stores only the stamp. */
  createdAt: number
}

// ── Source 2: off-chain backend (secrets — NEVER on-chain) ───────────────────
//
// The coupon's PRIVATE KEY (the secret code) is deliberately kept OFF the public
// ledger. The backend reveals it only AFTER it has authenticated the caller as
// the coupon's `creator` (e.g. a SIWE session proving control of that wallet);
// the frontend mock simulates that gate.

/** The off-chain secret record for one coupon, keyed by `id`. */
export interface CouponSecret {
  /** Join key onto the on-chain coupon (`ContractCoupon.id`). */
  id: number
  /** The coupon keypair's PRIVATE KEY — the secret "coupon code" (part 2).
   *  Revealed to the creator only after authentication; would be encrypted at
   *  rest in a real backend. */
  privateKey: string
}
