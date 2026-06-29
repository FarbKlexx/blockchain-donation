// Block-explorer config is tied to the DEPLOYMENT CHAIN, not to per-project
// backend metadata. The frontend derives the explorer URL from the on-chain
// contract address — so there is no backend-controlled href (an injection
// vector), and the address stays the single on-chain source of truth.
//
// TODO(integration): match this to the deployed chain (ideally keyed by the
// connected chainId). Ethereum mainnet → Etherscan.
const EXPLORER_BASE_URL = 'https://etherscan.io'
export const EXPLORER_NAME = 'Etherscan'

/** Explorer page for a contract address (scheme is fixed → not injectable). */
export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/address/${encodeURIComponent(address)}`
}

/** Link label, e.g. "View on Etherscan". */
export const explorerLabel = `View on ${EXPLORER_NAME}`

/**
 * Display-shorten a full address: `0x7f4b…89a2` → `0x7f4...89a2`.
 * Keeps `lead` leading and `tail` trailing hex chars (matches the design).
 */
export function shortenAddress(address: string, lead = 3, tail = 4): string {
  if (address.length <= 2 + lead + tail) return address
  return `${address.slice(0, 2 + lead)}...${address.slice(-tail)}`
}

/**
 * Deterministic identicon gradient for an anonymous address (no user system,
 * so this is the avatar). Purely derived from the address — same address always
 * yields the same colors; no backend, no identity.
 */
export function addressGradient(address: string): string {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  const hue2 = (hue + 90) % 360
  return `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${hue2} 60% 42%))`
}
