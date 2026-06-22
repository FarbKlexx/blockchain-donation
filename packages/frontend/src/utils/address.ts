// Block-explorer config is tied to the DEPLOYMENT CHAIN, not to per-project
// backend metadata. The frontend derives the explorer URL from the on-chain
// contract address — so there is no backend-controlled href (an injection
// vector), and the address stays the single on-chain source of truth.
//
// TODO(integration): match this to the deployed chain (ideally keyed by the
// connected chainId). Polygon mainnet → Polygonscan.
const EXPLORER_BASE_URL = 'https://polygonscan.com'
export const EXPLORER_NAME = 'Polygonscan'

/** Explorer page for a contract address (scheme is fixed → not injectable). */
export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/address/${encodeURIComponent(address)}`
}

/** Link label, e.g. "View on Polygonscan". */
export const explorerLabel = `View on ${EXPLORER_NAME}`

/**
 * Display-shorten a full address: `0x7f4b…89a2` → `0x7f4...89a2`.
 * Keeps `lead` leading and `tail` trailing hex chars (matches the design).
 */
export function shortenAddress(address: string, lead = 3, tail = 4): string {
  if (address.length <= 2 + lead + tail) return address
  return `${address.slice(0, 2 + lead)}...${address.slice(-tail)}`
}
