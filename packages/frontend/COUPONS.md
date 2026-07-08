# Gutschein-Subsystem (Coupons) — Integration & Datenaufteilung

Ein **zweites, eigenständiges Subsystem** neben dem Spenden-System. Es ist
funktional **nicht** mit den Spenden verbunden (eigener Contract, eigene Daten,
eigener Service) — geteilt wird nur die App-Hülle: Navbar, Wallet-Login,
Design-Tokens, Footer. Aktuell läuft alles über **Frontend-Mocks**; es gibt
**keine** Anbindung über das Frontend hinaus (Backend folgt später).

## Idee in einem Satz

**Jede angemeldete Wallet erstellt ihre eigenen Gutscheine** und **zahlt dafür
an den Smart Contract** (der Rabattwert wird hinterlegt, plus eine Gebühr). Ein
Gutschein ist ein **ECDSA-Schlüsselpaar**: der **öffentliche** Teil (die Adresse)
liegt on-chain, der **private** Schlüssel ist der geheime Code. Der **Ersteller**
bekommt die privaten Schlüssel und **verteilt sie selbst** — wie und an wen er
möchte, **nicht** über die Seite. **Jeder mit dem Schlüssel kann einlösen** —
verifiziert per Signatur, ohne den Schlüssel je preiszugeben.

## Das Krypto-Modell (wichtig)

Ein Gutschein ist ein **Schlüsselpaar** (`ethers.Wallet`):

- **Öffentlich → on-chain:** die **Adresse** des Paars (`couponAddress`). Eine
  Adresse *ist* der Hash des Public Keys. Das ist der „öffentliche Schlüssel" in
  der UI.
- **Privat → off-chain:** der **Private Key** ist der geheime Gutscheincode
  (Teil 2; Teil 1 ist die `id`). Er liegt off-chain (verschlüsselt) und wird
  **nur dem Ersteller nach Authentifizierung** gezeigt.

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

## Was das Erstellen kostet

Beim Erstellen zahlt der Ersteller pro Gutschein den **hinterlegten Rabattwert**
(deckt die spätere Auszahlung beim Einlösen) **plus eine Erstellungsgebühr**. Die
Summe (`escrow + fee`) geht an den Contract. Die Aufschlüsselung berechnet
[`couponCreationCost()`](src/utils/coupon.ts) rein (Live-Vorschau im Formular +
das, was der Service abbucht). Die Gebühr ist eine **Frontend-Konstante**
(`COUPON_CREATION_FEE_ETH`) — sie spiegelt eine spätere Contract-Konstante, genau
wie die 66,66 %-Mehrheit beim Spenden-System.

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
  Typ `CouponSecret`): das **Geheimnis**, das **niemals** on-chain darf — der
  **Private Key**. In Produktion liegt das in der Backend-DB (verschlüsselt)
  hinter **authentifizierten** Endpunkten, die den Schlüssel nur an den Ersteller
  zurückgeben.

Join über `id` (die On-chain-Gutschein-ID; das Backend speichert sie ebenfalls).

## Datenaufteilung (gleiche Entscheidungsbasis wie beim Spenden-System)

| Feld | 🔗 On-chain `Coupon` | 🗄️ Off-chain DB | 🧮 Frontend abgeleitet |
| --- | --- | --- | --- |
| `id` (Identität / Join-Key) | ✅ | als Join-Key | — |
| `couponAddress` („öffentl. Schlüssel") | ✅ Prüf-Anker für Einlösen | — | Kurzform `0x…`, Explorer-URL |
| `creator` (zahlender Ersteller) | ✅ `msg.sender` beim Erstellen | — | — |
| `value` (ETH-Rabatt) | ✅ autoritativer Wert, hinterlegt | — | EUR-Nominal (× Kurs) |
| `redeemed` / `redeemedAt` | ✅ kippt beim Einlösen | — | Status-Label |
| `createdAt` | ✅ (block.timestamp) | — | „12. März 2026" |
| **`privateKey`** (Geheimnis) | ❌ nie | ✅ nur dem Ersteller nach Auth gezeigt | — |
| Nominal „5 EUR" | ❌ | ❌ | ✅ Frontend-Konstante (`COUPON_NOMINAL_EUR`) → `value × Kurs` |
| Kosten (Rückstellung + Gebühr) | ✅ als `msg.value` | ❌ | ✅ Aufschlüsselung `couponCreationCost()` |
| Status (Aktiv/Eingelöst) | ❌ | ❌ | ✅ aus `redeemed` |

**Begründung (parallel zum Spenden-System):** Der Contract ist autoritativ für
State/Identität/Wert/Berechtigung; das Backend hält das Geheimnis (Private Key);
Geheimnisse liegen **nie** on-chain; alles Berechenbare (Status, EUR-Anzeige,
Explorer-URL, Datum, Kosten) wird im Frontend **abgeleitet**.

> **Bewusst NICHT on-chain:** der Private Key (Geheimnis). Kein „owner"-Feld mehr
> und kein Claim-Token — es gibt keinen Freischalt-Flow: der Ersteller hält die
> Schlüssel ab dem Erstellen. Die Explorer-URL wird — wie beim Spenden-System —
> im Frontend aus `couponAddress` gebaut (kein backend-kontrollierter `href`).

## Die drei Flows

| Flow | Seite / Komponente | Heute (Mock) | Später einzubauen |
| --- | --- | --- | --- |
| **1 · Erstellen** | [`CouponCreateView.vue`](src/views/CouponCreateView.vue) (`/gutscheine-erstellen`) → `createCoupons(creator, {count, valueEur})` | erzeugt clientseitig `count` Schlüsselpaare, hängt sie an beide Mock-Stores (creator = Wallet), zeigt Codes + Kosten | `CouponFactory.createCoupons(addresses, value, { value: kosten })`; Private Keys off-chain (verschlüsselt) speichern, nur an den Ersteller herausgeben |
| **2 · Meine Gutscheine** | [`MyCouponsView.vue`](src/views/MyCouponsView.vue) (`/meine-gutscheine`) → `listMyCoupons(creator)` | filtert nach `creator`, joint Private Keys aus SOURCE 2, zeigt sie an | Coupons des Erstellers vom Contract lesen; Private Keys über **authentifizierten** Endpunkt (SIWE) — das Backend ist die Sicherheitsgrenze |
| **3 · Einlösen** | [`CouponRedeemView.vue`](src/views/CouponRedeemView.vue) (`/gutschein-einloesen`) → `redeemCoupon(id, key)` | signiert Challenge lokal, prüft `recover == couponAddress`, kippt `redeemed` | `coupon.redeem(nonce, sig)` mit on-chain `ecrecover`; Challenge **replay-sicher** (Nonce/Merchant/Deadline) |

Die **öffentliche Tabelle** auf `/gutscheine` ([`CouponTable.vue`](src/components/coupon/CouponTable.vue))
zeigt **alle** Gutscheine (der Ledger ist öffentlich) — nur öffentliche Felder,
nie ein Schlüssel.

## Schreibend — Sicherheits-Guard

`create`/`redeem` rufen wie die Spenden-Mutationen `assertLocalSigner()` auf: ein
im Bundle hinterlegter `VITE_DEV_PRIVATE_KEY` darf nur gegen eine **lokale** Node
laufen. (Lokale Kopie, damit das Subsystem eigenständig bleibt.)

## Demo

1. Einloggen (Beispiel-Konto, z. B. „Projektersteller" oder „Normaler Nutzer").
2. `/gutscheine` öffnen → „Gutscheine erstellen" → Anzahl + Rabattwert wählen →
   die Kosten (Rückstellung + Gebühr) erscheinen live → „Gutscheine erstellen".
3. Die erstellten Codes (ID + Private Key) werden angezeigt → kopieren. Sie
   erscheinen auch dauerhaft unter **Meine Gutscheine** (`/meine-gutscheine`).
4. „Jetzt beim Kauf einlösen" → `/gutschein-einloesen` (vorausgefüllt) →
   „Gutschein einlösen" → Rabatt wird auf den Demo-Warenkorb angewandt.

Vorgefertigt: Die `creator` der Mock-Gutscheine #1–#5 sind auf die
DEV-Login-Personas ([`mockUsers.ts`](src/services/mockUsers.ts)) gemappt, damit
„Meine Gutscheine" sofort gefüllt ist — die Persona **„Projektersteller"**
(`0xd4e5…`) hat #1–#3 erstellt (davon #3 bereits eingelöst), **„Spender &
Validator"** (`0x12b9…`) #4 und **„Normaler Nutzer"** (`0x00…01`) #5. Letzteres
zeigt: Gutscheine erstellen braucht **keine** Spenden-Rolle, nur eine verbundene
Wallet. Gutschein #1 ist aktiv mit bekanntem Schlüssel — der natürliche Kandidat
zum Testen des Einlösens (Schlüssel in
[`couponSecrets.mock.ts`](src/data/couponSecrets.mock.ts)).

## Konkreter erster Schritt zum Verdrahten (später)

1. `Coupon`/`CouponFactory`-Contract schreiben + deployen; Adresse +
   `VITE_COUPON_FACTORY` in `.env`.
2. In `couponsService.ts` nur die `fetch*`-Funktionen ersetzen: **SOURCE 1**
   (`fetchCoupons`/`fetchCouponById`) → ethers `couponContract.<view>()`,
   **SOURCE 2** (`fetchSecretById`) → authentifizierter
   `fetch('/api/coupons/:id/reveal')`, dann `createCoupons`/`redeemCoupon`
   (Writes). `mergeCoupon`, Typen, Komponenten und Views bleiben unverändert.
