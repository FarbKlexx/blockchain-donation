// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM — COUPON subsystem.
//
// Independent of the donation system (its own contract, data and service); it
// only shares the app shell (navbar, wallet login, design tokens). Every coupon
// screen reads/writes through THIS module and nothing else.
//
// Two sources mirror the production architecture (same split as projectsService):
//
//   SOURCE 1  src/data/couponContractData.json  → the Coupon contract (ethers.js)
//             PUBLIC on-chain state: couponAddress, creator, value, redeemed, …
//   SOURCE 2  src/data/couponSecrets.mock.ts     → backend REST API (off-chain)
//             SECRETS: the coupon private key (revealed only to its creator)
//
// HEUTE (today): SOURCE 1 = JSON mock; SOURCE 2 = a DEV mock the user will swap
// for a real backend later. The reads/writes below are already async/parallel
// and fetch-shaped, so wiring the backend is a one-function change.
//
// SPÄTER (later): SOURCE 1 → ethers `couponContract.<view>()`; SOURCE 2 →
// AUTHENTICATED `fetch('/api/coupons/...')`. The merge, types, components and
// views stay put. All swap points are tagged `TODO(integration)`.
//
// CREATION MODEL (see types/coupon-sources.ts): coupons are NOT issued by the
// site. ANY wallet-connected user creates their OWN coupons and PAYS the contract
// (escrowed discount value + a creation fee). The creator then holds the private
// keys and distributes them OFF the site however they like — there is no e-mail
// or claim flow. `createCoupons`/`listMyCoupons` below model that.
//
// THE CRYPTO MODEL: a coupon is an ECDSA keypair. The keypair ADDRESS is public
// (on-chain `couponAddress`); the PRIVATE KEY is the secret code, off-chain,
// revealed only to the creator after auth. Redemption proves possession of the
// key WITHOUT transmitting it: sign a challenge, recover the signer
// (`ecrecover`), require it to equal `couponAddress`. `redeemCoupon` below does
// exactly that client-side (sign + verifyMessage) as a faithful mock.
// ─────────────────────────────────────────────────────────────────────────

import { Wallet, verifyMessage } from 'ethers'
import couponContractData from '@/data/couponContractData.json'
import { COUPON_SECRETS } from '@/data/couponSecrets.mock'
import type { ContractCoupon, CouponSecret } from '@/types/coupon-sources'
import type { Coupon, CouponStatus, MyCoupon } from '@/types/coupon'
import { explorerAddressUrl } from '@/utils/address'
import { NATIVE_CURRENCY } from '@/utils/amount'
import { couponCreationCost, ethToEur, eurToEth } from '@/utils/coupon'

// In-memory copy of the on-chain coupon state (mutated by create/redeem to
// simulate confirmed transactions changing chain state).
const coupons = (couponContractData as { coupons: ContractCoupon[] }).coupons
// In-memory copy of the off-chain secret store (create appends to it).
const secrets: CouponSecret[] = [...COUPON_SECRETS]

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// ── SOURCE 1: smart contract (ethers.js) ────────────────────────────────────
// TODO(integration): replace these with ethers reads. The coupon list is
// `CouponFactory.getCoupons()`; per coupon read the `Coupon` getters
// (couponAddress/creator/value/redeemed/redeemedAt/createdAt). Coupons are keyed
// by their on-chain `id`.

async function fetchCoupons(): Promise<ContractCoupon[]> {
  return delay(coupons)
}

async function fetchCouponById(id: number): Promise<ContractCoupon | null> {
  return delay(coupons.find((c) => c.id === id) ?? null)
}

// ── SOURCE 2: backend REST API (off-chain secrets) ───────────────────────────
// AUTHENTICATED endpoints in production — the backend must verify the caller
// controls the coupon's `creator` wallet before returning a private key (the
// frontend checks here are UX only). Today these resolve from the DEV mock; the
// shapes match the planned routes 1:1.

async function fetchSecretById(id: number): Promise<CouponSecret | null> {
  // TODO(integration): GET /api/coupons/:id/reveal (authenticated) — the backend
  // returns the private key only after verifying the caller is the creator.
  return delay(secrets.find((s) => s.id === id) ?? null)
}

// ── Derivations: raw on-chain fields → the UI model ──────────────────────────

/** Status from the on-chain `redeemed` flag — never stored as a field. A coupon
 *  is usable ("active") from creation until it is redeemed. */
function deriveCouponStatus(c: ContractCoupon): CouponStatus {
  return c.redeemed ? 'redeemed' : 'active'
}

function mergeCoupon(c: ContractCoupon): Coupon {
  return {
    id: c.id,
    couponAddress: c.couponAddress,
    creator: c.creator,
    status: deriveCouponStatus(c),
    value: c.value,
    valueEur: ethToEur(c.value),
    currency: NATIVE_CURRENCY,
    createdAt: c.createdAt,
    redeemedAt: c.redeemed ? c.redeemedAt : null,
    // Explorer URL is frontend-derived from the on-chain address — no backend href.
    explorerUrl: explorerAddressUrl(c.couponAddress),
  }
}

// ── Public API consumed by the views ─────────────────────────────────────────

/** List all coupons for the public table — purely on-chain (no secret needed).
 *  Newest first. */
export async function listCoupons(): Promise<Coupon[]> {
  const list = await fetchCoupons()
  return [...list].sort((a, b) => b.createdAt - a.createdAt).map(mergeCoupon)
}

/** Load a single coupon (its public state). */
export async function getCoupon(id: number): Promise<Coupon | null> {
  const c = await fetchCouponById(id)
  return c ? mergeCoupon(c) : null
}

/**
 * List the coupons CREATED by one wallet, WITH their private keys — the data
 * behind the "Meine Gutscheine" page. The creator is authenticated (they control
 * the wallet), so the secret code is joined in and shown; the public `listCoupons`
 * never carries it. Newest first.
 *
 * TODO(integration): read the creator's coupons from chain (filter by `creator`
 * or a `CouponFactory.getCouponsByCreator(addr)` view), then fetch each private
 * key from the AUTHENTICATED backend (`GET /api/coupons/:id/reveal` with a SIWE
 * session proving control of `creator`). The backend — not this filter — is the
 * security boundary.
 */
export async function listMyCoupons(creatorAddress: string): Promise<MyCoupon[]> {
  const a = creatorAddress.toLowerCase()
  const list = await fetchCoupons()
  const mine = [...list]
    .filter((c) => c.creator.toLowerCase() === a)
    .sort((c1, c2) => c2.createdAt - c1.createdAt)
  // Reveal each private key from SOURCE 2 (authenticated per coupon in production).
  const withKeys = await Promise.all(
    mine.map(async (c) => {
      const secret = await fetchSecretById(c.id)
      return { ...mergeCoupon(c), privateKey: secret?.privateKey ?? '' }
    }),
  )
  return withKeys
}

// ── Mutations (write transactions) ───────────────────────────────────────────

/**
 * FAIL-CLOSED GUARD for the inlined signing key (mirrors projectsService — kept
 * local so this subsystem stays self-contained).
 *
 * The frontend signs with a key baked into the bundle (VITE_DEV_PRIVATE_KEY).
 * That is only acceptable against a local Hardhat node with a throwaway test
 * key. This refuses to act when a key is present but the RPC endpoint is not
 * localhost, so a real/funded key can never silently send a transaction to a
 * public chain. No key set (pure mock) → no-op.
 */
function assertLocalSigner(): void {
  const key = import.meta.env.VITE_DEV_PRIVATE_KEY
  if (!key) return

  const rpc = import.meta.env.VITE_RPC_URL
  let host = ''
  try {
    host = rpc ? new URL(rpc).hostname : ''
  } catch {
    host = ''
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  if (!isLocal) {
    throw new Error(
      'Abgebrochen: Ein im Bundle hinterlegter Signing-Key darf nur gegen eine ' +
        'lokale Node verwendet werden (VITE_RPC_URL muss localhost sein). ' +
        'Dieses Frontend ist ausschließlich für die lokale Entwicklung gedacht.',
    )
  }
}

/** One freshly created coupon, returned to its creator WITH the private key so
 *  they can immediately copy/distribute it. */
export interface CreatedCoupon {
  id: number
  couponAddress: string
  /** The secret code (part 2). Shown to the creator now; distributed off-site. */
  privateKey: string
  value: number
  valueEur: number
}

export interface CreateCouponsResult {
  coupons: CreatedCoupon[]
  count: number
  /** What the creator paid the contract, broken down (escrow + fee). */
  cost: ReturnType<typeof couponCreationCost>
}

export interface CreateCouponsParams {
  /** How many coupons to create in this batch (>= 1). */
  count: number
  /** Discount value per coupon, in EUR nominal (converted to native coin). */
  valueEur: number
}

/**
 * Create a batch of coupons as the connected wallet — the CREATION flow. Open to
 * ANY connected account (no role required); the caller becomes the on-chain
 * `creator`. Creating costs money: the contract is paid the escrowed discount
 * value for every coupon PLUS a per-coupon creation fee (see couponCreationCost).
 * The private keys are returned so the creator can distribute them off-site; the
 * site does no distribution.
 *
 * TODO(integration): this is an on-chain write paid by the creator's signer:
 *   const factory = CouponFactory__factory.connect(VITE_COUPON_FACTORY, signer)
 *   const value = parseEther(valueEth)
 *   // one call minting `count` coupons; msg.value = total cost (escrow + fee):
 *   const tx = await factory.createCoupons(
 *     couponWallets.map((w) => w.address),   // the public keys (generated client-side)
 *     value,
 *     { value: parseEther(String(cost.totalEth)) },
 *   )
 *   const ids = <read the CouponCreated events from receipt>
 *   // then persist the private keys off-chain, keyed by id + creator, behind an
 *   // AUTHENTICATED endpoint that only ever reveals them back to that creator.
 * The keypairs are generated CLIENT-SIDE so the private key need never leave the
 * creator; only the addresses go on-chain.
 *
 * [mock] Generates real keypairs client-side and appends to both in-memory stores
 * (creator = the caller) so "Meine Gutscheine" and the redeem demo work end to end.
 */
export async function createCoupons(
  creatorAddress: string,
  params: CreateCouponsParams,
): Promise<CreateCouponsResult> {
  assertLocalSigner()

  const count = Math.trunc(params.count)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Bitte eine gültige Anzahl (mindestens 1) angeben.')
  }
  if (count > 50) {
    throw new Error('Es können höchstens 50 Gutscheine auf einmal erstellt werden.')
  }
  if (!(params.valueEur > 0)) {
    throw new Error('Bitte einen Rabattwert größer als 0 angeben.')
  }

  const valueEth = eurToEth(params.valueEur)
  let nextId = coupons.reduce((max, c) => Math.max(max, c.id), 0) + 1
  const createdAt = Math.floor(Date.now() / 1000)

  const created: CreatedCoupon[] = []
  for (let i = 0; i < count; i++) {
    const couponWallet = Wallet.createRandom()
    const id = nextId++
    const newCoupon: ContractCoupon = {
      id,
      couponAddress: couponWallet.address,
      creator: creatorAddress,
      value: valueEth,
      redeemed: false,
      redeemedAt: 0,
      createdAt,
    }
    coupons.push(newCoupon)
    secrets.push({ id, privateKey: couponWallet.privateKey })
    created.push({
      id,
      couponAddress: couponWallet.address,
      privateKey: couponWallet.privateKey,
      value: valueEth,
      valueEur: params.valueEur,
    })
  }

  return delay({
    coupons: created,
    count,
    cost: couponCreationCost(count, valueEth),
  })
}

export interface RedeemResult {
  couponId: number
  /** Discount applied, native coin. */
  discount: number
  /** Discount applied, EUR nominal. */
  discountEur: number
}

/** The challenge a redeemer signs with the coupon key. In production this MUST
 *  be non-replayable (include a fresh nonce / the merchant / a deadline); here
 *  the on-chain `redeemed` flag already prevents reuse of a coupon. */
function redeemChallenge(id: number, couponAddress: string): string {
  return `Gutschein einlösen | id:${id} | coupon:${couponAddress}`
}

function normalizePrivateKey(key: string): string {
  const k = key.trim()
  // Strip any case of the 0x/0X prefix, then re-apply a canonical lowercase one
  // (ethers' Wallet rejects an uppercase "0X" prefix).
  const bare = /^0x/i.test(k) ? k.slice(2) : k
  return `0x${bare}`
}

/**
 * Redeem a coupon at a checkout — open to ANYONE holding the key (not just the
 * owner). Proves possession of the private key via signature recovery
 * (`ecrecover`), so the key is never transmitted to the chain.
 *
 * TODO(integration):
 *   // build a non-replayable challenge, sign with the coupon key, submit the
 *   // SIGNATURE (never the key) — the contract recovers the signer on-chain:
 *   const coupon = Coupon__factory.connect(VITE_COUPON_ADDRESS, signer)
 *   const sig = await new Wallet(privateKey).signMessage(challenge)
 *   await (await coupon.redeem(challengeNonce, sig)).wait()  // requires ecrecover(sig)==couponAddress
 *   // then RE-READ `redeemed` from chain.
 *
 * [mock] Reproduces the on-chain check entirely client-side: sign the challenge
 * with the supplied key and require the recovered address to equal the coupon's
 * on-chain `couponAddress`.
 */
export async function redeemCoupon(couponId: number, privateKey: string): Promise<RedeemResult> {
  assertLocalSigner()

  const coupon = coupons.find((c) => c.id === couponId)
  if (!coupon) throw new Error('Gutschein-ID nicht gefunden.')
  if (coupon.redeemed) throw new Error('Dieser Gutschein wurde bereits eingelöst.')

  // CRYPTO CHECK (mock of the on-chain ecrecover): prove the holder possesses
  // the private key WITHOUT revealing it — sign a challenge and recover.
  let recovered: string
  try {
    const couponWallet = new Wallet(normalizePrivateKey(privateKey))
    const challenge = redeemChallenge(coupon.id, coupon.couponAddress)
    const signature = await couponWallet.signMessage(challenge)
    recovered = verifyMessage(challenge, signature)
  } catch {
    throw new Error('Ungültiger Schlüssel.')
  }
  if (recovered.toLowerCase() !== coupon.couponAddress.toLowerCase()) {
    throw new Error('Der Schlüssel passt nicht zu diesem Gutschein.')
  }

  // [mock] mark redeemed (the confirmed coupon.redeem(sig) tx would do this).
  coupon.redeemed = true
  coupon.redeemedAt = Math.floor(Date.now() / 1000)

  return delay({ couponId: coupon.id, discount: coupon.value, discountEur: ethToEur(coupon.value) })
}
