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

// ── Time-left derivations ────────────────────────────────────────────────────
// The contract stores only `start` / `end` (Unix seconds). "Days left" and the
// countdown label are NOT on-chain — they are computed here against the current
// time. `nowMs` is injectable so these stay pure and testable.

const SECONDS_PER_DAY = 86_400

/** Whole days remaining until `end` (Unix seconds), clamped at 0. */
export function daysLeftUntil(end: number, nowMs: number = Date.now()): number {
  const remaining = end - Math.floor(nowMs / 1000)
  return remaining <= 0 ? 0 : Math.floor(remaining / SECONDS_PER_DAY)
}

/** Whether the campaign's `end` (Unix seconds) has passed. */
export function hasEnded(end: number, nowMs: number = Date.now()): boolean {
  return Math.floor(nowMs / 1000) >= end
}

/** Compact countdown for cards, e.g. "11d, 3 Std." — or "Beendet" once over. */
export function timeLeftShort(end: number, nowMs: number = Date.now()): string {
  const remaining = end - Math.floor(nowMs / 1000)
  if (remaining <= 0) return 'Beendet'
  const days = Math.floor(remaining / SECONDS_PER_DAY)
  const hours = Math.floor((remaining % SECONDS_PER_DAY) / 3600)
  return `${days}d, ${hours} Std.`
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
