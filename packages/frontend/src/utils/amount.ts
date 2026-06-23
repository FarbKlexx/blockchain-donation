// Token-amount parsing/validation for the donation input.
//
// On-chain values must NEVER be JS floats. The validated decimal STRING that
// these helpers return is exactly what later goes to ethers
// `parseEther(amount)` → bigint wei. We never do float math on the value
// that becomes a transaction.

// Donations are the chain's NATIVE coin (the contract's `donate()` takes
// `msg.value` — there is no ERC-20 token), so there is a single currency for
// every campaign. Keyed to the deployment chain alongside the explorer config
// in utils/address.ts (Polygon → POL/18). Change both together per chain.
export const NATIVE_CURRENCY = 'POL'
export const NATIVE_DECIMALS = 18
export const DEFAULT_DECIMALS = NATIVE_DECIMALS

/** Decimals for an amount. All campaigns use the native coin, so the argument
 *  is accepted for call-site symmetry but the result is always the native
 *  precision. (Becomes a real lookup only if ERC-20 support is ever added.) */
export function decimalsFor(_currency?: string): number {
  return NATIVE_DECIMALS
}

export type AmountValidation = { ok: true; value: string } | { ok: false; error: string }

/**
 * Validate a user-entered amount against a token's decimals.
 *
 * Rejects empty, non-numeric, negative, zero, and exponent/Infinity/NaN inputs
 * (the regex allows only plain decimals), as well as more fractional digits
 * than the token supports. Returns the normalized string on success.
 */
export function validateAmount(input: string, decimals: number): AmountValidation {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Betrag eingeben.' }

  // Plain decimal only — no sign, no exponent. Blocks "Infinity", "NaN",
  // "1e9", "-5", "0x..." etc. before they can reach parseUnits.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, error: 'Ungültiger Betrag.' }
  }

  const fraction = trimmed.split('.')[1] ?? ''
  if (fraction.length > decimals) {
    return { ok: false, error: `Maximal ${decimals} Nachkommastellen erlaubt.` }
  }

  if (Number(trimmed) <= 0) {
    return { ok: false, error: 'Betrag muss größer als 0 sein.' }
  }

  return { ok: true, value: trimmed }
}
