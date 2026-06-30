# Gutschein-Subsystem (Coupons) — Integration & Datenaufteilung

Ein **zweites, eigenständiges Subsystem** neben dem Spenden-System. Es ist
funktional **nicht** mit den Spenden verbunden (eigener Contract, eigene Daten,
eigener Service) — geteilt wird nur die App-Hülle: Navbar, Wallet-Login,
Design-Tokens, Footer. Aktuell läuft alles über **Frontend-Mocks**; es gibt
**keine** Anbindung über das Frontend hinaus (Backend folgt später).

## Idee in einem Satz

Wer den Newsletter abonniert, bekommt per E-Mail einen **Gutschein** = ein
ECDSA-Schlüsselpaar. Der **öffentliche** Teil (die Adresse) liegt on-chain, der
**private** Schlüssel ist der geheime Code. Nur der rechtmäßige Inhaber kann den
Gutschein **freischalten** (Link + Wallet), aber **jeder mit dem Schlüssel kann
ihn einlösen** — verifiziert per Signatur, ohne den Schlüssel je preiszugeben.

## Das Krypto-Modell (wichtig)

Ein Gutschein ist ein **Schlüsselpaar** (`ethers.Wallet`):

- **Öffentlich → on-chain:** die **Adresse** des Paars (`couponAddress`). Eine
  Adresse *ist* der Hash des Public Keys. Das ist der „öffentliche Schlüssel" in
  der UI.
- **Privat → off-chain:** der **Private Key** ist der geheime Gutscheincode
  (Teil 2; Teil 1 ist die `id`). Er liegt off-chain (verschlüsselt) und wird
  dem Inhaber **erst nach Authentifizierung** gezeigt.

**Einlösen ohne den Schlüssel preiszugeben:** Der Einlöser **signiert eine
Challenge** mit dem Gutschein-Schlüssel; der Contract rekonstruiert per
`ecrecover` den Signierer und prüft, ob er gleich `couponAddress` ist. So kann
jeder mit dem Schlüssel einlösen, der Schlüssel landet aber **nie** on-chain /
im Mempool. Der Mock reproduziert das clientseitig mit `signMessage` +
`verifyMessage` (siehe [`couponsService.ts`](src/services/couponsService.ts),
`redeemCoupon`).

> Bewusst **nicht** so umgesetzt wie „privaten Schlüssel an den Contract
> schicken, der ihn gegen den Public Key prüft": Alles in einer Transaktion ist
> öffentlich — der Schlüssel wäre beim ersten Einlösen gestohlen. Das
> Signatur-/`ecrecover`-Verfahren erreicht dasselbe Ziel sicher.

## Prinzip: eine Naht, zwei Quellen

Jede Komponente liest/schreibt ausschließlich über
**[`src/services/couponsService.ts`](src/services/couponsService.ts)** — dieselbe
Naht-Architektur wie `projectsService.ts`:

```
                                ┌─ couponContractData.json  (SOURCE 1: Smart Contract / ethers.js)
View/Komponente ─> couponsService.ts ─┤
                                └─ couponSecrets.mock.ts    (SOURCE 2: Backend REST API)

  HEUTE:  beide aus Frontend-Mocks         SPÄTER: SOURCE 1 → ethers couponContract.<view>(),
                                                   SOURCE 2 → fetch('/api/coupons/...')
```

- **SOURCE 1 — Contract** ([`src/data/couponContractData.json`](src/data/couponContractData.json),
  Typ `ContractCoupon` in [`types/coupon-sources.ts`](src/types/coupon-sources.ts)):
  **öffentlicher** On-chain-State. Es gibt noch **kein** `Coupon.sol` — die
  Feldnamen sind so gewählt, dass sie 1:1 auf einen späteren
  `Coupon`/`CouponFactory`-Contract passen (gleiche Disziplin wie
  `types/sources.ts` beim `Donation`-Contract). `value` ist die **native Coin**
  (on-chain Wei, hier als gut lesbare Ganz-Coin-Zahl — wie `contractData.json`).
- **SOURCE 2 — Backend** ([`src/data/couponSecrets.mock.ts`](src/data/couponSecrets.mock.ts),
  Typ `CouponSecret`): **PII + Geheimnisse**, die **niemals** on-chain dürfen —
  E-Mail, der **Private Key** und das rohe Claim-Token (nur dessen Hash steht
  on-chain). In Produktion liegt das in der Backend-DB (Private Keys
  verschlüsselt) hinter **authentifizierten** Endpunkten.

Join über `id` (die On-chain-Gutschein-ID; das Backend speichert sie ebenfalls).

## Datenaufteilung (gleiche Entscheidungsbasis wie beim Spenden-System)

| Feld | 🔗 On-chain `Coupon` | 🗄️ Off-chain DB | 🧮 Frontend abgeleitet |
| --- | --- | --- | --- |
| `id` (Identität / Join-Key) | ✅ | als Join-Key | — |
| `couponAddress` („öffentl. Schlüssel") | ✅ Prüf-Anker für Einlösen | — | Kurzform `0x…`, Explorer-URL |
| `owner` (beim Claim gebunden) | ✅ „rechtmäßiger Inhaber" | — | `null` wenn Nulladresse |
| `value` (ETH-Rabatt) | ✅ autoritativer Wert | — | EUR-Nominal (× Kurs) |
| `redeemed` / `redeemedAt` | ✅ kippt beim Einlösen | — | Status-Label |
| `claimTokenHash` | ✅ macht Claim vertrauenslos | — | — |
| `createdAt` | ✅ (block.timestamp) | — | „12. März 2026" |
| **`email`** (PII) | ❌ nie | ✅ | — |
| **`privateKey`** (Geheimnis) | ❌ nie | ✅ erst nach Auth gezeigt | — |
| rohes Claim-Token | ❌ (nur Hash) | ✅ Token → Gutschein | — |
| Nominal „5 EUR" | ❌ | ❌ | ✅ Frontend-Konstante (`COUPON_NOMINAL_EUR`) → `value × Kurs` |
| Status (Ausstehend/Aktiv/Eingelöst) | ❌ | ❌ | ✅ aus `owner` + `redeemed` |

**Begründung (parallel zum Spenden-System):** Der Contract ist autoritativ für
State/Identität/Wert/Berechtigung; das Backend hält PII, Geheimnisse und
Anzeige-Texte; Geheimnisse/PII liegen **nie** on-chain; alles Berechenbare
(Status, EUR-Anzeige, Explorer-URL, Datum) wird im Frontend **abgeleitet**.

> **Bewusst NICHT on-chain:** E-Mail (PII), der Private Key (Geheimnis), das rohe
> Token. Die Explorer-URL wird — wie beim Spenden-System — im Frontend aus
> `couponAddress` gebaut (kein backend-kontrollierter `href`).

## Die drei Flows

| Flow | Seite / Komponente | Heute (Mock) | Später einzubauen |
| --- | --- | --- | --- |
| **1 · Abonnieren** | [`CouponHero.vue`](src/components/coupon/CouponHero.vue) → `subscribeNewsletter(email)` | erzeugt clientseitig ein Schlüsselpaar + Mock-Gutschein; zeigt den „verschickten" Link inline | `POST /api/newsletter/subscribe`; Backend erzeugt Keypair, `CouponFactory.createCoupon(addr, value, claimTokenHash)`, mailt den Link |
| **2 · Freischalten** | [`CouponClaimView.vue`](src/views/CouponClaimView.vue) (`/gutschein/:token`) → `claimCoupon(token, wallet)` | prüft Token-Hash, bindet/prüft Owner im Speicher, gibt den Code frei | `coupon.claim(token)` (bindet `owner = msg.sender`); Backend gibt den Private Key erst nach Owner-Auth (SIWE) heraus |
| **3 · Einlösen** | [`CouponRedeemView.vue`](src/views/CouponRedeemView.vue) (`/gutschein-einloesen`) → `redeemCoupon(id, key)` | signiert Challenge lokal, prüft `recover == couponAddress`, kippt `redeemed` | `coupon.redeem(nonce, sig)` mit on-chain `ecrecover`; Challenge **replay-sicher** (Nonce/Merchant/Deadline) |

**Zwei-Faktor beim Freischalten:** der **Link** (Token → muss zum on-chain
`claimTokenHash` passen) beweist „richtige Seite", die **Wallet** beweist
„rechtmäßiger Inhaber" (bindet `owner` beim ersten Claim, muss danach
übereinstimmen). Erst dann wird der Code (`id` + Private Key) gezeigt.

## Schreibend — Sicherheits-Guard

`subscribe`/`claim`/`redeem` rufen wie die Spenden-Mutationen
`assertLocalSigner()` auf: ein im Bundle hinterlegter `VITE_DEV_PRIVATE_KEY` darf
nur gegen eine **lokale** Node laufen. (Lokale Kopie, damit das Subsystem
eigenständig bleibt.)

## Demo

1. `/gutscheine` öffnen → E-Mail eintragen → „Gutschein anfordern" → der
   Claim-Link erscheint inline.
2. Link öffnen → mit Wallet einloggen (Beispiel-Konto) → Code (ID + Private Key)
   wird freigeschaltet.
3. „Jetzt beim Kauf einlösen" → `/gutschein-einloesen` (vorausgefüllt) →
   „Gutschein einlösen" → Rabatt wird auf den Demo-Warenkorb angewandt.

Vorgefertigt: der **ausstehende** Gutschein #5 hat das feste Demo-Token
`DEMO-CLAIM-TOKEN-5` (`/gutschein/DEMO-CLAIM-TOKEN-5`). Die Gutscheine #1–#4 sind
bereits Aktiv/Eingelöst; ihre Schlüssel stehen in
[`couponSecrets.mock.ts`](src/data/couponSecrets.mock.ts), falls man das Einlösen
direkt testen will.

## Konkreter erster Schritt zum Verdrahten (später)

1. `Coupon`/`CouponFactory`-Contract schreiben + deployen; Adresse +
   `VITE_COUPON_FACTORY` in `.env`.
2. In `couponsService.ts` nur die `fetch*`-Funktionen ersetzen: **SOURCE 1**
   (`fetchCoupons`/`fetchCouponById`) → ethers `couponContract.<view>()`,
   **SOURCE 2** (`fetchSecretByToken`) → authentifizierter
   `fetch('/api/coupons/...')`, dann `subscribe`/`claim`/`redeem` (Writes).
   `mergeCoupon`, Typen, Komponenten und Views bleiben unverändert.
