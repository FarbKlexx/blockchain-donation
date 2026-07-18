// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM — COUPON / gift-card subsystem.
//
// SINGLE SOURCE OF TRUTH: the `GiftCardProject` smart contract
// (packages/contracts/contracts/GiftCard.sol). Every coupon screen reads/writes
// the chain through THIS module via ethers.js and nothing else. It is
// independent of the donation system (its own contract); it only shares the app
// shell and — importantly — the wallet/signer plumbing from projectsService, so
// both subsystems transact as the ONE logged-in account.
//
// THE CONTRACT MODEL (what the UI must mirror):
//   • ONE deployed GiftCardProject manages ALL cards (not a per-card factory).
//   • CREATE — the contract OWNER or a WHITELISTED INSTITUTION funds a card with
//     `msg.value` (the redeemable amount, ≥ giftCardValueMinimum) and a validity
//     `duration` (≥ validityDurationMinimum). A card is an ECDSA keypair whose
//     ADDRESS is the on-chain `redemptionKey`; its PRIVATE KEY is the secret code,
//     generated client-side and never sent on-chain.
//   • REDEEM — a whitelisted institution takes the code from a customer, signs an
//     EIP-712 message binding {redemptionKey, institution=msg.sender, amount} with
//     it, and calls redeemGiftCard; the contract recovers the signer, requires it
//     to equal `redemptionKey`, and pays the institution.
//   • REFUND — after a card EXPIRES unredeemed, its `creator` reclaims the funds
//     with refundGiftCard (needs only the public `redemptionKey`).
//   • The owner manages the institution whitelist (add/remove).
//
// The contract has no "get all cards" view and no length getters, so the list is
// enumerated from `GiftCardCreated` events and the whitelist by probing the
// public `whiteList` array. See types/coupon-sources.ts for the raw shape.
// ─────────────────────────────────────────────────────────────────────────

import { ethers } from 'ethers'
import { GiftCardProject__factory } from '@/contracts/typechain'
import {
  assertLocalSigner,
  buildGasEstimate,
  getBlockchainContext,
  getReadProvider,
  type TxGasEstimate,
} from '@/services/projectsService'
import { MOCK_USERS } from '@/services/mockUsers'
import type { ContractCoupon } from '@/types/coupon-sources'
import type { Coupon } from '@/types/coupon'
import { explorerAddressUrl } from '@/utils/address'
import { NATIVE_CURRENCY } from '@/utils/amount'
import { deriveCouponStatus, ethToEur, secondsToDays } from '@/utils/coupon'
import { signRedemption } from '@/utils/giftCardEip712'

const GIFTCARD_ADDRESS = import.meta.env.VITE_GIFTCARD_ADDRESS

function requireGiftCardAddress(): string {
  if (!GIFTCARD_ADDRESS) {
    throw new Error(
      'VITE_GIFTCARD_ADDRESS ist nicht gesetzt. Bitte den GiftCardProject-Contract ' +
        'deployen und die Adresse in packages/frontend/.env eintragen.',
    )
  }
  return GIFTCARD_ADDRESS
}

/** Read-only contract handle (no signer — for lists, config, role scans). */
function readContract() {
  return GiftCardProject__factory.connect(requireGiftCardAddress(), getReadProvider())
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

// ── SOURCE 1: smart contract reads (ethers.js) ───────────────────────────────

/**
 * Enumerate every gift card's current on-chain state. The contract exposes no
 * "get all" view, so we count `GiftCardCreated` events (one per card, never
 * removed → event order == array order) and read each `giftCards(i)` struct for
 * its authoritative current state. Per-card read errors are skipped, not fatal.
 */
async function fetchContractCoupons(): Promise<ContractCoupon[]> {
  const gc = readContract()
  const created = await gc.queryFilter(gc.filters.GiftCardCreated())

  const results = await Promise.all(
    created.map(async (_event, index) => {
      try {
        const c = await gc.giftCards(index)
        return {
          index,
          redemptionKey: c.redemptionKey,
          creator: c.creator,
          amountWei: c.amount.toString(),
          redeemed: c.redeemed,
          expirationDate: Number(c.expirationDate),
        } satisfies ContractCoupon
      } catch (error) {
        console.error(`Fehler beim Laden von Gutschein #${index}:`, error)
        return null
      }
    }),
  )
  return results.filter((c): c is ContractCoupon => c !== null)
}

/** Locate one card by its `redemptionKey` (there is no on-chain key→index
 *  getter, so this scans the enumerated list). */
async function findContractCoupon(redemptionKey: string): Promise<ContractCoupon | null> {
  const key = redemptionKey.toLowerCase()
  const all = await fetchContractCoupons()
  return all.find((c) => c.redemptionKey.toLowerCase() === key) ?? null
}

/** The current institution whitelist. `whiteList` is a public array with no
 *  length getter (and the constructor's initial set emits no events), so we
 *  probe indices until the getter reverts (out-of-bounds = past the end). */
async function fetchWhitelist(): Promise<string[]> {
  const gc = readContract()
  const list: string[] = []
  // Cap the probe so a transient error can never spin forever; real whitelists
  // are tiny.
  for (let i = 0; i < 1000; i++) {
    try {
      list.push(await gc.whiteList(i))
    } catch {
      break // out-of-bounds → end of the array
    }
  }
  return list
}

// ── Derivations: raw on-chain fields → the UI model ──────────────────────────

function mergeCoupon(c: ContractCoupon, now: number): Coupon {
  const amount = Number(ethers.formatEther(c.amountWei))
  return {
    redemptionKey: c.redemptionKey,
    creator: c.creator,
    status: deriveCouponStatus(c.redeemed, c.expirationDate, now),
    amount,
    amountWei: c.amountWei,
    amountEur: ethToEur(amount),
    currency: NATIVE_CURRENCY,
    redeemed: c.redeemed,
    expirationDate: c.expirationDate,
    explorerUrl: explorerAddressUrl(c.redemptionKey),
  }
}

// ── Public reads consumed by the views ───────────────────────────────────────

/** List all gift cards for the public table — purely on-chain. Newest first
 *  (creation order is the array index, so highest index == newest). */
export async function listCoupons(): Promise<Coupon[]> {
  const now = nowSeconds()
  const list = await fetchContractCoupons()
  return list
    .slice()
    .sort((a, b) => b.index - a.index)
    .map((c) => mergeCoupon(c, now))
}

/** Load a single gift card by its redemption key (public state). */
export async function getCoupon(redemptionKey: string): Promise<Coupon | null> {
  const c = await findContractCoupon(redemptionKey)
  return c ? mergeCoupon(c, nowSeconds()) : null
}

/**
 * List the cards CREATED by one wallet — the "Meine Gutscheine" data. PUBLIC
 * state only (from chain): the secret code is NEVER stored or re-shown — it is
 * displayed once at creation and the creator must keep it themselves. Newest first.
 */
export async function listMyCoupons(creatorAddress: string): Promise<Coupon[]> {
  const a = creatorAddress.toLowerCase()
  const now = nowSeconds()
  const list = await fetchContractCoupons()
  return list
    .filter((c) => c.creator.toLowerCase() === a)
    .sort((c1, c2) => c2.index - c1.index)
    .map((c) => mergeCoupon(c, now))
}

// ── Contract config + account roles ──────────────────────────────────────────

/** The contract's immutable rules, for the create form + info copy. */
export interface GiftCardConfig {
  owner: string
  /** Minimum card value in the native coin (e.g. ETH). */
  minAmount: number
  /** Minimum card value in wei (exact string) — the precise validation bound. */
  minAmountWei: string
  /** Minimum card value as its EUR nominal. */
  minAmountEur: number
  /** Minimum validity in whole days (friendly form of the seconds minimum). */
  minValidityDays: number
  /** Minimum validity in seconds — the precise `duration` lower bound. */
  minDurationSeconds: number
}

export async function getGiftCardConfig(): Promise<GiftCardConfig> {
  const gc = readContract()
  const [owner, minAmountWei, minDuration] = await Promise.all([
    gc.owner(),
    gc.giftCardValueMinimum(),
    gc.validityDurationMinimum(),
  ])
  const minAmount = Number(ethers.formatEther(minAmountWei))
  return {
    owner,
    minAmount,
    minAmountWei: minAmountWei.toString(),
    minAmountEur: ethToEur(minAmount),
    minValidityDays: secondsToDays(Number(minDuration)),
    minDurationSeconds: Number(minDuration),
  }
}

/** What one account may do in the gift-card system, derived from chain. The
 *  contract is the sole authority (it re-checks owner/whitelist on every write);
 *  these are UI hints only. */
export interface GiftCardAccount {
  address: string
  /** The deploying account — may create cards and manage the whitelist. */
  isOwner: boolean
  /** A whitelisted institution — may create AND redeem cards. */
  isInstitution: boolean
  /** owner OR institution (createGiftCard's `isAllowedToCreateGiftCard`). */
  canCreate: boolean
  /** institution only — the owner cannot redeem unless also whitelisted. */
  canRedeem: boolean
}

export async function loadGiftCardAccount(address: string): Promise<GiftCardAccount> {
  const gc = readContract()
  const [owner, whitelist] = await Promise.all([gc.owner(), fetchWhitelist()])
  const a = address.toLowerCase()
  const isOwner = owner.toLowerCase() === a
  const isInstitution = whitelist.some((w) => w.toLowerCase() === a)
  return {
    address,
    isOwner,
    isInstitution,
    canCreate: isOwner || isInstitution,
    canRedeem: isInstitution,
  }
}

/** The current institution whitelist + owner — for the owner's management panel
 *  and the public "who can redeem" info. */
export interface GiftCardOperators {
  owner: string
  institutions: string[]
}

export async function getGiftCardOperators(): Promise<GiftCardOperators> {
  const gc = readContract()
  const [owner, institutions] = await Promise.all([gc.owner(), fetchWhitelist()])
  return { owner, institutions }
}

// ── Mutations (write transactions) ───────────────────────────────────────────

/** One freshly created card, returned to its creator WITH the private key so
 *  they can copy/distribute it immediately. */
export interface CreatedCoupon {
  redemptionKey: string
  /** The secret code (the keypair's private key). Shown ONCE to the creator to
   *  copy — never stored anywhere and not recoverable afterwards. */
  privateKey: string
  amount: number
  amountEur: number
  amountWei: string
  expirationDate: number
  txHash: string
}

export interface CreateCouponParams {
  /** Card value as a validated decimal STRING (native coin) → parseEther. Must
   *  clear the contract minimum. */
  amountEth: string
  /** Validity in seconds (`duration`). Must clear the contract minimum. */
  durationSeconds: number
}

/** Parse one named event out of a mined receipt into a plain object of its named
 *  args (tolerant of unrelated logs). */
function readEventArgs(
  receipt: ethers.TransactionReceipt,
  eventName: string,
): Record<string, unknown> | null {
  const iface = GiftCardProject__factory.createInterface()
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed && parsed.name === eventName) return parsed.args.toObject()
    } catch {
      continue
    }
  }
  return null
}

/**
 * Create ONE gift card as the connected wallet (owner or whitelisted
 * institution — the contract enforces `isAllowedToCreateGiftCard`). A fresh
 * keypair is generated client-side: its address becomes the on-chain
 * `redemptionKey`, its private key is the secret code — returned ONCE for the
 * creator to copy, never stored and never sent on-chain. The funded value is
 * `msg.value`.
 */
export async function createCoupon(params: CreateCouponParams): Promise<CreatedCoupon> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)

  const card = ethers.Wallet.createRandom()
  const amountWei = ethers.parseEther(params.amountEth)

  const tx = await gc.createGiftCard(card.address, params.durationSeconds, { value: amountWei })
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Die Erstellung auf der Blockchain ist fehlgeschlagen.')

  // The private key is returned ONCE below for the creator to copy — it is never
  // stored (no localStorage, no backend). If they lose it, it is unrecoverable.

  const args = readEventArgs(receipt, 'GiftCardCreated')
  const expirationDate = args ? Number(args.expirationDate) : nowSeconds() + params.durationSeconds
  const amount = Number(ethers.formatEther(amountWei))

  return {
    redemptionKey: card.address,
    privateKey: card.privateKey,
    amount,
    amountEur: ethToEur(amount),
    amountWei: amountWei.toString(),
    expirationDate,
    txHash: tx.hash,
  }
}

/** Estimate the cost of creating a card WITHOUT sending it. Gas is independent
 *  of the (random) redemption key, so a throwaway address gives an accurate
 *  figure; the funded value is included in the total. Throws (with a revert
 *  reason, e.g. "Not allowed to create gift cards") if the create itself would
 *  fail. */
export async function estimateCreateCouponGas(params: CreateCouponParams): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  const amountWei = ethers.parseEther(params.amountEth)
  const probeKey = ethers.Wallet.createRandom().address
  return buildGasEstimate(
    provider,
    () => gc.createGiftCard.estimateGas(probeKey, params.durationSeconds, { value: amountWei }),
    amountWei,
  )
}

function normalizePrivateKey(key: string): string {
  const k = key.trim()
  // Strip any case of the 0x/0X prefix, then re-apply a canonical lowercase one
  // (ethers' Wallet rejects an uppercase "0X" prefix).
  const bare = /^0x/i.test(k) ? k.slice(2) : k
  return `0x${bare}`
}

/** Resolve the entered secret code to its card: derive the redemption key from
 *  the private key, then find the on-chain record. Throws friendly errors. */
async function resolveCardByCode(
  privateKey: string,
): Promise<{ key: string; redemptionKey: string; card: ContractCoupon }> {
  const key = normalizePrivateKey(privateKey)
  let redemptionKey: string
  try {
    redemptionKey = new ethers.Wallet(key).address
  } catch {
    throw new Error('Ungültiger Gutschein-Code (Schlüssel).')
  }
  const card = await findContractCoupon(redemptionKey)
  if (!card) throw new Error('Zu diesem Code wurde kein Gutschein gefunden.')
  return { key, redemptionKey, card }
}

/**
 * Look up a card by its secret code and confirm it is redeemable — for the
 * checkout preview (shows the discount before signing). Reuses the same
 * derivation the redeem uses, so what is previewed is exactly what is redeemed.
 */
export async function previewRedeemCoupon(privateKey: string): Promise<Coupon> {
  const { card } = await resolveCardByCode(privateKey)
  const now = nowSeconds()
  if (card.redeemed) throw new Error('Dieser Gutschein wurde bereits eingelöst oder erstattet.')
  if (now >= card.expirationDate) {
    throw new Error('Dieser Gutschein ist abgelaufen und kann nicht mehr eingelöst werden.')
  }
  return mergeCoupon(card, now)
}

// ── The "shop" (redeeming institution) ───────────────────────────────────────
// The contract pays whoever submits redeemGiftCard (`msg.sender`), and that
// sender MUST be a whitelisted institution. So the redemption is submitted BY the
// shop's institution wallet — which also receives the funds — NOT by the customer.
// The customer only supplies the gift-card code; they never sign or pay anything.
//
// In this frontend-only demo there is no institution backend, so the checkout
// must hold a whitelisted institution's signing key. We source it from the DEV
// personas (mockUsers) that are on the on-chain whitelist — these are the
// selectable "shops". In production the institution's own system would submit
// this transaction; the browser never would.

export interface RedeemShop {
  /** The institution's on-chain address (receives the funds, is `msg.sender`). */
  address: string
  /** Human label for the picker (the persona label in dev). */
  label: string
}

/** The shops a customer can redeem at: whitelisted institutions we also hold a
 *  signing key for (DEV personas). Empty outside dev — there the institution's
 *  backend performs the redeem, not this browser. */
export async function listRedeemShops(): Promise<RedeemShop[]> {
  if (!import.meta.env.DEV) return []
  const whitelist = await fetchWhitelist()
  const onWhitelist = new Set(whitelist.map((a) => a.toLowerCase()))
  return MOCK_USERS.filter((u) => onWhitelist.has(u.address.toLowerCase())).map((u) => ({
    address: u.address,
    label: u.label,
  }))
}

/** Refuse to use a baked-in shop key against anything but a local node (the shop
 *  keys are public Hardhat test keys — never let them sign on a real chain). */
function assertLocalRpc(): void {
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
      'Abgebrochen: Der Shop-Schlüssel darf nur gegen eine lokale Node verwendet ' +
        'werden (VITE_RPC_URL muss localhost sein).',
    )
  }
}

/** A signer for the chosen shop (institution), built from its DEV key. Separate
 *  from the logged-in signer — the customer is not the one submitting. */
function shopSigner(shopAddress: string): { provider: ethers.JsonRpcProvider; signer: ethers.Wallet } {
  assertLocalRpc()
  const rpcUrl = import.meta.env.VITE_RPC_URL
  if (!rpcUrl) throw new Error('VITE_RPC_URL ist nicht gesetzt.')
  const shop = MOCK_USERS.find((u) => u.address.toLowerCase() === shopAddress.toLowerCase())
  if (!shop) throw new Error('Für diesen Shop ist kein Signaturschlüssel hinterlegt.')
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return { provider, signer: new ethers.Wallet(shop.privateKey, provider) }
}

/** Prepare a redemption: resolve the card, validate it, and produce the EIP-712
 *  signature — signed client-side with the CARD key, binding the SHOP as the
 *  institution (msg.sender). The shop, not the customer, submits and is paid.
 *  Shared by the estimate and the send so they never diverge. */
async function buildRedemption(privateKey: string, shopAddress: string) {
  const { key, redemptionKey, card } = await resolveCardByCode(privateKey)
  const now = nowSeconds()
  if (card.redeemed) throw new Error('Dieser Gutschein wurde bereits eingelöst oder erstattet.')
  if (now >= card.expirationDate) {
    throw new Error('Dieser Gutschein ist abgelaufen und kann nicht mehr eingelöst werden.')
  }

  const { signer, provider } = shopSigner(shopAddress)
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  const network = await provider.getNetwork()
  const institution = await signer.getAddress() // the shop — bound into the signature
  const amountWei = BigInt(card.amountWei)
  const signature = signRedemption(
    key,
    network.chainId,
    requireGiftCardAddress(),
    redemptionKey,
    institution,
    amountWei,
  )
  return { gc, provider, card, amountWei, signature }
}

export interface RedeemResult {
  redemptionKey: string
  /** Discount applied, native coin. */
  discount: number
  /** Discount applied, EUR nominal. */
  discountEur: number
  txHash: string
}

/**
 * Redeem a card at a shop's checkout. The CUSTOMER supplies the code
 * (`privateKey`); the chosen SHOP (`shopAddress`, a whitelisted institution)
 * submits the transaction and receives the funds. The card key signs an EIP-712
 * message binding the shop + the exact amount; only the signature is submitted
 * (the key never touches the chain). The contract recovers the signer, checks it
 * equals `redemptionKey`, and pays the shop.
 */
export async function redeemCoupon(privateKey: string, shopAddress: string): Promise<RedeemResult> {
  const { gc, card, amountWei, signature } = await buildRedemption(privateKey, shopAddress)
  const tx = await gc.redeemGiftCard(card.redemptionKey, amountWei, signature)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Die Einlösung auf der Blockchain ist fehlgeschlagen.')

  const amount = Number(ethers.formatEther(amountWei))
  return {
    redemptionKey: card.redemptionKey,
    discount: amount,
    discountEur: ethToEur(amount),
    txHash: tx.hash,
  }
}

/** Estimate the gas of a redemption (the shop receives funds, so no value is sent
 *  → amount = 0). Runs the same lookup + signing as the redeem, so it also
 *  surfaces a revert reason (e.g. "Not a white listed institution."). */
export async function estimateRedeemCouponGas(
  privateKey: string,
  shopAddress: string,
): Promise<TxGasEstimate> {
  const { gc, provider, card, amountWei, signature } = await buildRedemption(privateKey, shopAddress)
  return buildGasEstimate(
    provider,
    () => gc.redeemGiftCard.estimateGas(card.redemptionKey, amountWei, signature),
    0n,
  )
}

export interface RefundResult {
  redemptionKey: string
  amount: number
  amountEur: number
  txHash: string
}

/**
 * Reclaim an EXPIRED, unredeemed card's funds as its CREATOR (`refundGiftCard`).
 * Needs only the public redemption key. The contract enforces isCreator +
 * not-redeemed + expired.
 */
export async function refundCoupon(redemptionKey: string): Promise<RefundResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  const tx = await gc.refundGiftCard(redemptionKey)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Die Erstattung auf der Blockchain ist fehlgeschlagen.')

  const args = readEventArgs(receipt, 'GiftcardRefunded')
  const amount = args ? Number(ethers.formatEther(args.amount as bigint)) : 0
  return { redemptionKey, amount, amountEur: ethToEur(amount), txHash: tx.hash }
}

export async function estimateRefundCouponGas(redemptionKey: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  return buildGasEstimate(provider, () => gc.refundGiftCard.estimateGas(redemptionKey), 0n)
}

export interface InstitutionTxResult {
  txHash: string
  institution: string
}

/** Owner-only: add an institution to the redeem whitelist. */
export async function addInstitution(institution: string): Promise<InstitutionTxResult> {
  assertLocalSigner()
  if (!ethers.isAddress(institution)) throw new Error('Bitte eine gültige Wallet-Adresse eingeben.')
  const { signer } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  const tx = await gc.addInstitution(institution)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Die Aktion auf der Blockchain ist fehlgeschlagen.')
  return { txHash: tx.hash, institution }
}

export async function estimateAddInstitutionGas(institution: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  if (!ethers.isAddress(institution)) throw new Error('Bitte eine gültige Wallet-Adresse eingeben.')
  const { signer, provider } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  return buildGasEstimate(provider, () => gc.addInstitution.estimateGas(institution), 0n)
}

/** Owner-only: remove an institution from the redeem whitelist. */
export async function removeInstitution(institution: string): Promise<InstitutionTxResult> {
  assertLocalSigner()
  if (!ethers.isAddress(institution)) throw new Error('Bitte eine gültige Wallet-Adresse eingeben.')
  const { signer } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  const tx = await gc.removeInstitution(institution)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Die Aktion auf der Blockchain ist fehlgeschlagen.')
  return { txHash: tx.hash, institution }
}

export async function estimateRemoveInstitutionGas(institution: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  if (!ethers.isAddress(institution)) throw new Error('Bitte eine gültige Wallet-Adresse eingeben.')
  const { signer, provider } = await getBlockchainContext()
  const gc = GiftCardProject__factory.connect(requireGiftCardAddress(), signer)
  return buildGasEstimate(provider, () => gc.removeInstitution.estimateGas(institution), 0n)
}
