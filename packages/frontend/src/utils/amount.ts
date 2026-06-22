// Token-amount parsing/validation for the donation input.
//
// On-chain values must NEVER be JS floats. The validated decimal STRING that
// these helpers return is exactly what later goes to ethers
// `parseUnits(amount, decimals)` → bigint. We never do float math on the value
// that becomes a transaction.

/** Decimals per token symbol. USDC uses 6. */
const TOKEN_DECIMALS: Record<string, number> = { USDC: 6 }
export const DEFAULT_DECIMALS = 6

export function decimalsFor(currency: string): number {
  return TOKEN_DECIMALS[currency] ?? DEFAULT_DECIMALS
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
