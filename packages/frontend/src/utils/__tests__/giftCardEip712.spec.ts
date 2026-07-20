import { describe, it, expect } from 'vitest'
import { computeAddress, recoverAddress } from 'ethers'
import { redemptionDigest, signRedemption } from '../giftCardEip712'

// Deterministic Hardhat test keys (public, well-known — safe to hardcode).
const PRIV = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const OTHER_PRIV = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const CARD_ADDRESS = computeAddress(PRIV) // the redemptionKey identity

const CHAIN_ID = 31337n
const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const INSTITUTION = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const AMOUNT_WEI = 10_000_000_000_000_000n // 0.01 ETH

describe('redemptionDigest', () => {
  it('is a 32-byte hex string', () => {
    const d = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(d).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is deterministic for identical inputs', () => {
    const a = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(a).toBe(b)
  })

  it('changes when the chain id changes (signature bound to chain)', () => {
    const a = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = redemptionDigest(1n, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(a).not.toBe(b)
  })

  it('changes when the verifying contract changes (bound to deployment)', () => {
    const a = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = redemptionDigest(
      CHAIN_ID,
      '0x0000000000000000000000000000000000000001',
      CARD_ADDRESS,
      INSTITUTION,
      AMOUNT_WEI,
    )
    expect(a).not.toBe(b)
  })

  it('changes when the institution changes (a sig is usable by one institution only)', () => {
    const a = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = redemptionDigest(
      CHAIN_ID,
      CONTRACT,
      CARD_ADDRESS,
      '0x0000000000000000000000000000000000000002',
      AMOUNT_WEI,
    )
    expect(a).not.toBe(b)
  })

  it('changes when the amount changes (exact-amount binding)', () => {
    const a = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI + 1n)
    expect(a).not.toBe(b)
  })

  it('accepts an amount of 0 and the max uint256 without throwing', () => {
    const MAX_UINT256 = (1n << 256n) - 1n
    expect(() => redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, 0n)).not.toThrow()
    expect(() =>
      redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, MAX_UINT256),
    ).not.toThrow()
  })
})

describe('signRedemption', () => {
  it('produces a 65-byte (0x + 130 hex) signature', () => {
    const sig = signRedemption(PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/)
  })

  it('recovers to the card address — the property the contract verify() enforces', () => {
    const digest = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const sig = signRedemption(PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(recoverAddress(digest, sig)).toBe(CARD_ADDRESS)
  })

  it('a signature made for one institution does NOT verify for another', () => {
    const other = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
    // signed binding INSTITUTION ...
    const sig = signRedemption(PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    // ... but the contract would recover against the digest for `other`
    const otherDigest = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, other, AMOUNT_WEI)
    expect(recoverAddress(otherDigest, sig)).not.toBe(CARD_ADDRESS)
  })

  it('is deterministic (ECDSA over a fixed digest with RFC-6979 k)', () => {
    const a = signRedemption(PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const b = signRedemption(PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(a).toBe(b)
  })

  it('requires the 0x prefix — normalization is the caller/service concern, not this util', () => {
    // couponsService.normalizePrivateKey adds the prefix before this is reached;
    // the raw util rejects a bare (un-prefixed) key.
    expect(() =>
      signRedemption(PRIV.slice(2), CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI),
    ).toThrow()
  })

  it('throws on an invalid private key (caller surfaces "invalid code")', () => {
    expect(() =>
      signRedemption('not-a-key', CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI),
    ).toThrow()
    expect(() =>
      signRedemption('0x1234', CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI),
    ).toThrow()
  })

  it('an unrelated key never recovers to the card address', () => {
    const digest = redemptionDigest(CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    const sig = signRedemption(OTHER_PRIV, CHAIN_ID, CONTRACT, CARD_ADDRESS, INSTITUTION, AMOUNT_WEI)
    expect(recoverAddress(digest, sig)).not.toBe(CARD_ADDRESS)
  })
})
