// The RAW data source for the COUPON / gift-card subsystem.
//
// SINGLE SOURCE OF TRUTH is the `GiftCardProject` smart contract
// (contracts/GiftCard.sol). couponsService reads it via ethers.js and merges it
// into the `Coupon` UI model (see types/coupon.ts). This file describes the
// shape of ONE on-chain gift-card record exactly as the contract stores it.
//
// This subsystem is INDEPENDENT of the donation system — its own contract, its
// own service. It only shares the app shell (navbar, wallet login, design
// tokens) and the wallet/signer plumbing.
//
// THE MODEL (from the contract):
//   • A single deployed `GiftCardProject` manages ALL gift cards (it is NOT a
//     per-card factory like the donation system).
//   • A gift card is created by the contract OWNER or a WHITELISTED INSTITUTION,
//     who funds it with `msg.value` (the redeemable amount) and sets a validity
//     `duration`. Random users cannot create cards.
//   • A gift card IS an ECDSA keypair. The keypair ADDRESS is the on-chain
//     `redemptionKey` (public, the card's identity). The PRIVATE KEY is the
//     secret "gift-card code" — generated client-side, never sent on-chain, and
//     handed to the buyer off-site.
//   • REDEMPTION: a whitelisted institution takes the code (private key) from a
//     customer, signs an EIP-712 message binding {redemptionKey, institution,
//     amount} with it, and submits it. The contract recovers the signer and
//     requires it to equal `redemptionKey` — so possession of the key (never the
//     key itself) authorizes the payout to that institution.
//   • REFUND: after a card EXPIRES unredeemed, its `creator` can reclaim the
//     escrowed funds (needs only the public `redemptionKey`).

// ── SOURCE 1: on-chain (mirrors the GiftCardProject `GiftCard` struct) ────────
//
// Read via `giftCards(i)` (the auto-generated array getter). The contract has no
// "get all" view and no length getter, so couponsService enumerates the array by
// counting `GiftCardCreated` events, then reads each index for its current state.

/** One gift card as read from its on-chain record — the PUBLIC, authoritative
 *  state. No secret (the private key is never on-chain). */
export interface ContractCoupon {
  /** Position in the on-chain `giftCards` array (creation order). Not used as an
   *  identity for writes — the contract addresses cards by `redemptionKey` — but
   *  it is how the record is read back (`giftCards(index)`). */
  index: number
  /** The gift-card keypair's ADDRESS — the card's identity and the value signed
   *  against at redemption (`ECDSA.recover(...) == redemptionKey`). The join key
   *  to the off-chain secret (the matching private key). */
  redemptionKey: string
  /** Wallet that CREATED and funded the card (`msg.sender` at creation; owner or
   *  a whitelisted institution). Only this address may `refundGiftCard` it. */
  creator: string
  /** Redeemable value in wei, as an EXACT decimal string (never a JS float). The
   *  contract requires `amount == giftCard.amount` at redeem, so precision must be
   *  preserved; the human-readable coin/EUR figures are derived in the service. */
  amountWei: string
  /** Whether the card has been spent (redeemed) OR refunded — the contract sets
   *  `redeemed = true` in both cases, so this being true means "settled". */
  redeemed: boolean
  /** Expiry, Unix seconds (`block.timestamp + duration` at creation). Before it,
   *  the card is redeemable; at/after it (while unredeemed) it is refundable. */
  expirationDate: number
}

/** The contract's immutable configuration, read once and reused by the create
 *  form (validation) and the info copy. All values come from public getters. */
export interface ContractConfig {
  /** The deploying account — may create cards and manage the whitelist. */
  owner: string
  /** Minimum value a card must carry, in wei (exact string). `giftCardValueMinimum`. */
  minAmountWei: string
  /** Minimum validity a card must have, in seconds. `validityDurationMinimum`. */
  minDurationSeconds: number
}
