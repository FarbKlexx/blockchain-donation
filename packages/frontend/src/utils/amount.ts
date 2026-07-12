// Token-amount parsing/validation for the donation input.
//
// On-chain values must NEVER be JS floats. The validated decimal STRING that
// these helpers return is exactly what later goes to ethers
// `parseEther(amount)` → bigint wei. We never do float math on the value
// that becomes a transaction.

import { parseEther, formatEther } from 'ethers'

// Donations are the chain's NATIVE coin (the contract's `donate()` takes
// `msg.value` — there is no ERC-20 token), so there is a single currency for
// every campaign. Keyed to the deployment chain alongside the explorer config
// in utils/address.ts (Ethereum → ETH/18). Change both together per chain.
export const NATIVE_CURRENCY = 'ETH'
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
  const trimmed = input.toString().trim()
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

/** Drop trailing fractional zeros (and a bare trailing dot) from a decimal
 *  string, so "18480.0" → "18480" and "0.070" → "0.07". Integers are untouched. */
function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * The amount still needed to reach the goal (`goal − raised`), as a clean
 * decimal STRING for the donation input — exactly what the "Restbetrag" button
 * fills in, and what `parseEther` then consumes.
 *
 * Computed in wei (bigint), NOT by subtracting the display floats, so it never
 * yields artifacts like `0.1 − 0.03 = 0.06999999999999999`. Returns '' when the
 * goal is already met (nothing to add) or the inputs can't be parsed. Native-coin
 * (18-decimal) amounts, matching donate()'s `parseEther`.
 */
export function remainingAmountString(goal: number, raised: number): string {
  let remainingWei: bigint
  try {
    remainingWei = parseEther(String(goal)) - parseEther(String(raised))
  } catch {
    return ''
  }
  if (remainingWei <= 0n) return ''
  return trimTrailingZeros(formatEther(remainingWei))
}
