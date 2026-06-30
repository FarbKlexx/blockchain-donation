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
//             PUBLIC on-chain state: couponAddress, owner, value, redeemed, …
//   SOURCE 2  src/data/couponSecrets.mock.ts     → backend REST API (off-chain)
//             PII + SECRETS: e-mail, the private key, the raw claim token
//
// HEUTE (today): SOURCE 1 = JSON mock; SOURCE 2 = a DEV mock the user will swap
// for a real backend later. The reads/writes below are already async/parallel
// and fetch-shaped, so wiring the backend is a one-function change.
//
// SPÄTER (later): SOURCE 1 → ethers `couponContract.<view>()`; SOURCE 2 →
// AUTHENTICATED `fetch('/api/coupons/...')`. The merge, types, components and
// views stay put. All swap points are tagged `TODO(integration)`.
//
// THE CRYPTO MODEL (see types/coupon-sources.ts): a coupon is an ECDSA keypair.
// The keypair ADDRESS is public (on-chain `couponAddress`); the PRIVATE KEY is
// the secret code, off-chain, revealed only after auth. Redemption proves
// possession of the key WITHOUT transmitting it: sign a challenge, recover the
// signer (`ecrecover`), require it to equal `couponAddress`. `redeemCoupon`
// below does exactly that client-side (sign + verifyMessage) as a faithful mock.
// ─────────────────────────────────────────────────────────────────────────

import { Wallet, keccak256, toUtf8Bytes, verifyMessage } from 'ethers'
import couponContractData from '@/data/couponContractData.json'
import { COUPON_SECRETS } from '@/data/couponSecrets.mock'
import type { ContractCoupon, CouponSecret } from '@/types/coupon-sources'
import type { Coupon, CouponStatus } from '@/types/coupon'
import { explorerAddressUrl } from '@/utils/address'
import { NATIVE_CURRENCY } from '@/utils/amount'
import { COUPON_NOMINAL_EUR, ethToEur, eurToEth } from '@/utils/coupon'

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// In-memory copy of the on-chain coupon state (mutated by subscribe/claim/redeem
// to simulate confirmed transactions changing chain state).
const coupons = (couponContractData as { coupons: ContractCoupon[] }).coupons
// In-memory copy of the off-chain secret store (subscribe appends to it).
const secrets: CouponSecret[] = [...COUPON_SECRETS]

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function isZero(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}

// ── SOURCE 1: smart contract (ethers.js) ────────────────────────────────────
// TODO(integration): replace these with ethers reads. The coupon list is
// `CouponFactory.getCoupons()`; per coupon read the `Coupon` getters
// (couponAddress/owner/value/redeemed/redeemedAt/claimTokenHash/createdAt).
// Coupons are keyed by their on-chain `id`.

async function fetchCoupons(): Promise<ContractCoupon[]> {
  return delay(coupons)
}

async function fetchCouponById(id: number): Promise<ContractCoupon | null> {
  return delay(coupons.find((c) => c.id === id) ?? null)
}

// ── SOURCE 2: backend REST API (off-chain PII + secrets) ─────────────────────
// AUTHENTICATED endpoints in production — the backend must verify the caller
// before returning a secret (the frontend checks here are UX only). Today these
// resolve from the DEV mock; the shapes match the planned routes 1:1.

async function fetchSecretByToken(token: string): Promise<CouponSecret | null> {
  // TODO(integration): GET /api/coupons/by-token/:token — the backend stores the
  // raw token and resolves it to the coupon's secret record.
  return delay(secrets.find((s) => s.token === token) ?? null)
}

// ── Derivations: raw on-chain fields → the UI model ──────────────────────────

/** Status from the on-chain `owner` + `redeemed` — never stored as a field. */
function deriveCouponStatus(c: ContractCoupon): CouponStatus {
  if (c.redeemed) return 'redeemed'
  if (!isZero(c.owner)) return 'active'
  return 'pending'
}

function mergeCoupon(c: ContractCoupon): Coupon {
  return {
    id: c.id,
    couponAddress: c.couponAddress,
    owner: isZero(c.owner) ? null : c.owner,
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

export interface SubscribeResult {
  /** New on-chain coupon id (part 1 of the eventual code). */
  couponId: number
  /** The hashed claim link the backend would e-mail (the ClaimView route). */
  claimUrl: string
  /** [demo only] echoed so the prototype can surface the link without an inbox. */
  email: string
}

/**
 * Subscribe to the newsletter → mint a coupon.
 *
 * TODO(integration): this is a BACKEND-orchestrated write. The backend would:
 *   1) generate the coupon keypair (address + private key);
 *   2) deploy/register it on-chain, e.g.
 *        const factory = CouponFactory__factory.connect(VITE_COUPON_FACTORY, signer)
 *        const token = crypto secret
 *        await (await factory.createCoupon(
 *          couponWallet.address,            // the public key
 *          parseEther(valueEth),            // the discount value (wei)
 *          keccak256(toUtf8Bytes(token)),   // claimTokenHash
 *        )).wait()
 *   3) persist { id, email, privateKey (encrypted), token } off-chain;
 *   4) e-mail the subscriber a link to /gutschein/<token>.
 * The private key is NOT returned here — it is revealed only after the owner
 * authenticates (claimCoupon).
 *
 * [mock] Generates a real keypair client-side and appends to both in-memory
 * stores so the claim → redeem demo works end to end.
 */
export async function subscribeNewsletter(email: string): Promise<SubscribeResult> {
  assertLocalSigner()

  const trimmed = email.trim()
  if (!EMAIL_RE.test(trimmed)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')

  const couponWallet = Wallet.createRandom()
  const id = coupons.reduce((max, c) => Math.max(max, c.id), 0) + 1
  const token = crypto.randomUUID()

  const newCoupon: ContractCoupon = {
    id,
    couponAddress: couponWallet.address,
    owner: ZERO_ADDRESS, // unclaimed until the link + wallet bind an owner
    value: eurToEth(COUPON_NOMINAL_EUR),
    redeemed: false,
    redeemedAt: 0,
    claimTokenHash: keccak256(toUtf8Bytes(token)),
    createdAt: Math.floor(Date.now() / 1000),
  }
  coupons.push(newCoupon)
  secrets.push({ id, email: trimmed, privateKey: couponWallet.privateKey, token })

  return delay({ couponId: id, claimUrl: `/gutschein/${token}`, email: trimmed })
}

export interface ClaimResult {
  /** Part 1 of the redeem code. */
  couponId: number
  /** Part 2 of the redeem code — the secret private key (revealed only now). */
  privateKey: string
  /** The public coupon address (for display / verification). */
  couponAddress: string
  value: number
  valueEur: number
  /** Whether the coupon is already spent — the reveal UI shows it as redeemed
   *  (no live "einlösen" CTA) instead of as freshly usable. */
  redeemed: boolean
}

/**
 * Claim a coupon from an e-mail link: authenticate, bind the owner, reveal code.
 *
 * Authentication is TWO factors, exactly as specified:
 *   • the LINK proves "right page" — its token must hash to the on-chain
 *     `claimTokenHash`;
 *   • the WALLET proves "rightful owner" — on first claim the link authorizes
 *     binding `owner = msg.sender`; on later visits the wallet must equal the
 *     already-bound owner.
 * Only then is the private key revealed.
 *
 * TODO(integration):
 *   // on-chain: bind the owner trustlessly (the contract checks the token hash)
 *   const coupon = Coupon__factory.connect(VITE_COUPON_ADDRESS, signer)
 *   await (await coupon.claim(token)).wait()   // sets owner = msg.sender if unbound
 *   // off-chain: the AUTHENTICATED backend returns the private key only after
 *   // verifying the caller controls `owner` (e.g. a SIWE session):
 *   const { privateKey } = await fetch(`/api/coupons/${id}/reveal`, { ... }).then(r => r.json())
 * The frontend checks here are UX only; the contract + backend are the authority.
 *
 * [mock] Verifies the token hash, binds/checks the owner in memory, returns the
 * secret from the SOURCE 2 mock.
 */
export async function claimCoupon(token: string, walletAddress: string): Promise<ClaimResult> {
  assertLocalSigner()

  // 1) resolve the link's token → its coupon (SOURCE 2, then SOURCE 1).
  const secret = await fetchSecretByToken(token)
  const coupon = secret && coupons.find((c) => c.id === secret.id)
  if (!secret || !coupon) throw new Error('Ungültiger oder abgelaufener Gutschein-Link.')

  // 2) the LINK proves "right page": its token must match the on-chain hash.
  if (keccak256(toUtf8Bytes(token)) !== coupon.claimTokenHash) {
    throw new Error('Der Link ist ungültig.')
  }

  // 3) the WALLET proves "rightful owner".
  if (isZero(coupon.owner)) {
    // First claim — the link authorizes binding this wallet as the owner.
    coupon.owner = walletAddress
  } else if (coupon.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Dieser Gutschein gehört bereits einer anderen Wallet.')
  }

  // 4) reveal the code (private key) — only now, after both factors passed. A
  // spent coupon still reveals (the owner may want their code) but is flagged
  // redeemed so the UI does not present it as usable.
  return delay({
    couponId: coupon.id,
    privateKey: secret.privateKey,
    couponAddress: coupon.couponAddress,
    value: coupon.value,
    valueEur: ethToEur(coupon.value),
    redeemed: coupon.redeemed,
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
