// Pure display helpers — no domain logic, safe to reuse everywhere.

const amountFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 2,
})

/** "47520" -> "47.520" (German grouping). */
export function formatAmount(value: number): string {
  return amountFormatter.format(value)
}

/** "47520", "USDC" -> "47.520 USDC". */
export function formatCurrency(value: number, currency: string): string {
  return `${formatAmount(value)} ${currency}`
}

/** Funded ratio in whole percent, clamped to 0–100. */
export function percentFunded(raised: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(100, Math.round((raised / goal) * 100))
}

/** "2026-05-28" -> "28. Mai 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
