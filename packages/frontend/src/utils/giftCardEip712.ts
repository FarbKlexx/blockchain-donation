// EIP-712 redemption signing for the GiftCardProject contract.
//
// A gift card is redeemed by proving possession of its keypair PRIVATE KEY: the
// holder signs a typed message binding {redemptionKey, institution, amount}, and
// the contract recovers the signer and requires it to equal `redemptionKey`
// (see GiftCardProject.verify / redeemGiftCard). The institution address bound
// into the signature is the redeeming caller (`msg.sender`), so a signature is
// only usable by the one institution it was made for.
//
// ⚠️ WHY WE BUILD THE DIGEST BY HAND (not signer.signTypedData):
// the contract's on-chain type string is
//   "GiftCard(address redemptionKey,address institution, uint256 amount)"
// — note the STRAY SPACE before "uint256". EIP-712's canonical encoding removes
// spaces, so ethers' signTypedData hashes a DIFFERENT type string and its
// signature FAILS the contract's verify(). We therefore reconstruct exactly what
// `_hashTypedDataV4` hashes on-chain, using the contract's literal (non-canonical)
// type string, and sign that digest directly with the card's key. This is
// validated against the deployed contract — do not "canonicalise" the string.

import { AbiCoder, concat, keccak256, SigningKey, toUtf8Bytes } from 'ethers'

// The contract's literal typehash string — the stray space is intentional.
const GIFTCARD_TYPEHASH = keccak256(
  toUtf8Bytes('GiftCard(address redemptionKey,address institution, uint256 amount)'),
)
const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
)
// The domain the contract sets: EIP712("GiftCard", "1").
const DOMAIN_NAME_HASH = keccak256(toUtf8Bytes('GiftCard'))
const DOMAIN_VERSION_HASH = keccak256(toUtf8Bytes('1'))

/** The EIP-712 domain separator for a GiftCardProject deployment, matching
 *  OpenZeppelin's `_domainSeparatorV4()`. */
function domainSeparator(chainId: bigint, verifyingContract: string): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [EIP712_DOMAIN_TYPEHASH, DOMAIN_NAME_HASH, DOMAIN_VERSION_HASH, chainId, verifyingContract],
    ),
  )
}

/**
 * The exact 32-byte digest the contract hashes for a redemption — i.e.
 * `_hashTypedDataV4(keccak256(abi.encode(GIFTCARD_TYPEHASH, redemptionKey,
 * institution, amount)))`. Recover on this and you get `redemptionKey` back.
 *
 * @param chainId           the deployment chain id (bind the signature to it)
 * @param verifyingContract the GiftCardProject address
 * @param redemptionKey     the card's keypair address (its identity)
 * @param institution       the redeeming caller (msg.sender) bound in
 * @param amountWei         the card's exact value in wei
 */
export function redemptionDigest(
  chainId: bigint,
  verifyingContract: string,
  redemptionKey: string,
  institution: string,
  amountWei: bigint,
): string {
  const structHash = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256'],
      [GIFTCARD_TYPEHASH, redemptionKey, institution, amountWei],
    ),
  )
  // abi.encodePacked("\x19\x01", domainSeparator, structHash)
  return keccak256(concat(['0x1901', domainSeparator(chainId, verifyingContract), structHash]))
}

/**
 * Sign a redemption with the gift card's PRIVATE KEY. Returns the 65-byte hex
 * signature the contract's `redeemGiftCard(redemptionKey, amount, signature)`
 * expects. The key never leaves the client — only the signature is submitted.
 *
 * Throws if `privateKey` is not a valid key (the caller surfaces a friendly
 * "invalid code" message).
 */
export function signRedemption(
  privateKey: string,
  chainId: bigint,
  verifyingContract: string,
  redemptionKey: string,
  institution: string,
  amountWei: bigint,
): string {
  const digest = redemptionDigest(chainId, verifyingContract, redemptionKey, institution, amountWei)
  // Sign the raw digest directly (NOT signMessage, which would EIP-191 prefix it).
  return new SigningKey(privateKey).sign(digest).serialized
}
