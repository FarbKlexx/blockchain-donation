// ─────────────────────────────────────────────────────────────────────────
// ERROR NORMALIZATION — the single place that turns raw failures into readable,
// user-facing German messages.
//
// Errors reach the UI from three sources, none of which is presentable as-is:
//   1. the backend REST API  → HTTP status / "Failed to fetch"
//   2. the smart contract    → ethers error codes + Solidity require() strings
//   3. our own service guards → already-friendly Error messages (pass through)
//
// Views should NEVER show `error.message` directly. They call `toUserMessage(e)`
// and surface the result (as a toast — see stores/notifications.ts).
// ─────────────────────────────────────────────────────────────────────────

/** A structured backend error carrying the HTTP status (thrown by the service's
 *  fetch helper instead of a raw "Request failed: 500" string). status 0 = the
 *  server could not be reached at all. */
export class ApiError extends Error {
  status: number
  constructor(status: number, statusText = '') {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`)
    this.name = 'ApiError'
    this.status = status
  }
}

const GENERIC = 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.'

// Solidity require() strings from the Donation AND GiftCardProject contracts →
// user-facing German. Only the reverts a normal user can actually hit through
// the UI are mapped; anything unmapped falls back to a generic "rejected by the
// chain" message (the raw reason is never shown, but it is logged for devs).
const REVERT_MESSAGES: Record<string, string> = {
  // ── GiftCardProject ──
  // (Creation is open to any wallet — no create-permission revert to map.)
  'Not a white listed institution.':
    'Nur freigeschaltete Institutionen können Gutscheine einlösen.',
  'Amount does not fulfill minimum requirement.':
    'Der Gutscheinwert liegt unter dem vom Vertrag geforderten Mindestwert.',
  'Duration is too short.':
    'Die Gültigkeitsdauer liegt unter dem geforderten Mindestzeitraum.',
  'GiftCard with Key already exists.':
    'Für diesen Schlüssel existiert bereits ein Gutschein. Bitte erneut versuchen.',
  'GiftCard with Key does not exist.': 'Zu diesem Code wurde kein Gutschein gefunden.',
  'GiftCard is already redeemed.':
    'Dieser Gutschein wurde bereits eingelöst oder erstattet.',
  'Given amount does not match actual amount.':
    'Der Betrag stimmt nicht mit dem hinterlegten Gutscheinwert überein.',
  'Verification not successful':
    'Der Gutschein-Code konnte nicht verifiziert werden. Bitte prüfe den Schlüssel.',
  'Gift card has expired.': 'Dieser Gutschein ist abgelaufen.',
  'Gift card has not yet expired.':
    'Eine Erstattung ist erst nach Ablauf des Gutscheins möglich.',
  'Sender is not the Creator.': 'Nur der Ersteller des Gutscheins kann diese Aktion ausführen.',
  'Zero Address not allowed.': 'Ungültige Adresse.',
  'Empty address institution not allowed': 'Bitte eine gültige Adresse angeben.',
  'Institution already whitelisted': 'Diese Institution ist bereits freigeschaltet.',
  'Sender is not the Owner': 'Nur der Betreiber des Gutschein-Systems kann das tun.',
  // ── Donation ──
  'Same Vote was already made':
    'Du hast bereits genau so abgestimmt. Wähle die andere Option, um deine Stimme zu ändern.',
  'Address is not a validator': 'Nur ausgewählte Validatoren dieses Projekts können abstimmen.',
  'Only Owner is allowed to do this':
    'Nur der Eigentümer des Projekts kann diese Aktion ausführen.',
  'only positive values can be donated': 'Bitte gib einen Betrag größer als 0 ein.',
  'not in time frame': 'Die Finanzierungsphase dieses Projekts ist nicht (mehr) aktiv.',
  'They payment would exceed the needed amount':
    'Dieser Betrag übersteigt die noch benötigte Summe. Bitte wähle einen kleineren Betrag.',
  'Only possible while Funding': 'Das ist nur während der Finanzierungsphase möglich.',
  'Only possible while Project Approval': 'Das ist nur während der Projektfreigabe möglich.',
  'Only possible in Payout Phase': 'Das ist nur während der Auszahlungsphase möglich.',
  'Only possible when project is closed':
    'Das ist nur möglich, wenn das Projekt abgeschlossen ist.',
  'Only possible when project has failed':
    'Das ist nur möglich, wenn das Projekt fehlgeschlagen ist.',
  'Sender has not donated anything': 'Du hast zu diesem Projekt noch nichts beigetragen.',
  'Project setup Voting has already finished':
    'Die Abstimmung über den Projektstart ist bereits abgeschlossen.',
  'Milestone Voting has already finished':
    'Die Abstimmung über diesen Meilenstein ist bereits abgeschlossen.',
  'Project setup Voting Deadline exceeded': 'Die Frist für diese Abstimmung ist abgelaufen.',
  'Milestone Voting Deadline exceeded': 'Die Frist für diese Abstimmung ist abgelaufen.',
  'This Milestone has already been paid': 'Dieser Meilenstein wurde bereits ausgezahlt.',
  'Chosen Milestone is not the current Milestone':
    'Dieser Meilenstein ist aktuell nicht zur Auszahlung an der Reihe.',
  'Not enough funds for payout': 'Im Vertrag sind nicht genügend Mittel für diese Auszahlung.',
  'The donation goal has not yet been reached': 'Das Finanzierungsziel ist noch nicht erreicht.',
  'Funding duration is not over yet': 'Die Finanzierungsphase ist noch nicht beendet.',
  'The donation Goal has been reached': 'Das Finanzierungsziel wurde bereits erreicht.',
}

function mapApiError(status: number): string {
  if (status === 0) return 'Der Server ist zurzeit nicht erreichbar. Bitte versuche es später erneut.'
  if (status === 400) return 'Die Anfrage war ungültig. Bitte überprüfe deine Eingaben.'
  if (status === 401 || status === 403) return 'Dazu bist du nicht berechtigt.'
  if (status === 404) return 'Der angeforderte Eintrag wurde nicht gefunden.'
  if (status === 409) return 'Dieser Eintrag existiert bereits oder wurde zwischenzeitlich geändert.'
  if (status >= 500) return 'Der Server hat einen Fehler gemeldet. Bitte versuche es später erneut.'
  return GENERIC
}

/** Pull a Solidity revert reason out of an ethers error, if present. */
function extractRevertReason(error: { [k: string]: unknown }): string | null {
  const reason = error.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()

  // Fall back to scanning the message fields ethers/Hardhat populate.
  const nestedError = error.error as { message?: unknown } | undefined
  const info = error.info as { error?: { message?: unknown } } | undefined
  const candidates = [error.shortMessage, info?.error?.message, nestedError?.message, error.message]
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue
    const match =
      raw.match(/reverted with reason string ['"](.+?)['"]/i) ||
      raw.match(/reverted with custom error ['"](.+?)['"]/i) ||
      raw.match(/execution reverted:?\s*["'](.+?)["']/i)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

// A message that looks like a raw technical dump (ethers/RPC/HTML) — never shown
// to the user; we fall back to a friendly generic instead.
function looksTechnical(message: string): boolean {
  if (message.length > 240) return true
  return /0x[0-9a-f]{6,}|CALL_EXCEPTION|json-?rpc|execution reverted|reverted with|gas required|cannot estimate gas|missing revert data|could not coalesce|\bcode=|version=\d|Failed to fetch|NetworkError|ECONN|ETIMEDOUT|<!doctype|<html/i.test(
    message,
  )
}

/**
 * Turn any thrown value into a readable German message for the user.
 *
 * @param error    the caught value (unknown)
 * @param fallback context-specific fallback, e.g. "Spende fehlgeschlagen."
 */
export function toUserMessage(error: unknown, fallback: string = GENERIC): string {
  if (typeof error === 'string') return error

  // 1. Backend errors → status-based message.
  if (error instanceof ApiError) return mapApiError(error.status)

  if (error && typeof error === 'object') {
    const err = error as { [k: string]: unknown }
    const code = typeof err.code === 'string' ? err.code : undefined

    // 2. Wallet: the user dismissed the transaction prompt.
    if (code === 'ACTION_REJECTED') return 'Du hast die Transaktion in deiner Wallet abgebrochen.'

    // 3. Contract revert reason → friendly text (raw reason logged for devs).
    const reason = extractRevertReason(err)
    if (reason) {
      const mapped = REVERT_MESSAGES[reason]
      if (mapped) return mapped
      console.error('[unmapped contract revert]', reason, error)
      return 'Die Aktion wurde von der Blockchain abgelehnt. Bitte prüfe die Voraussetzungen und versuche es erneut.'
    }

    // 4. Other ethers / network codes.
    switch (code) {
      case 'INSUFFICIENT_FUNDS':
        return 'Dein Guthaben reicht für diese Transaktion (inklusive Netzwerkgebühren) nicht aus.'
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
      case 'TIMEOUT':
        return 'Keine Verbindung zur Blockchain. Bitte prüfe deine Verbindung und versuche es erneut.'
      case 'NONCE_EXPIRED':
      case 'REPLACEMENT_UNDERPRICED':
        return 'Diese Transaktion ist nicht mehr aktuell. Bitte lade die Seite neu und versuche es erneut.'
      case 'CALL_EXCEPTION':
        return 'Die Aktion wurde von der Blockchain abgelehnt. Bitte prüfe die Voraussetzungen und versuche es erneut.'
    }
  }

  // 5. Our own service guards throw curated German messages — pass those through;
  //    only fall back when the message looks like a raw technical dump.
  if (error instanceof Error && error.message && !looksTechnical(error.message)) {
    return error.message
  }

  if (error) console.error('[unhandled error]', error)
  return fallback
}
