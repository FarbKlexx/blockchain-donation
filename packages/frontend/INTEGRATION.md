# Integration: UI ↔ Logik (Mock → Backend/Contract)

Diese Übersicht listet **alle Stellen, an denen später echte Logik (Smart
Contract / Backend) eingehängt werden muss**. Aktuell laufen beide Screens
(Übersicht + Detail) vollständig über **Mock-Daten** — es gibt **keine**
Anbindung über das Frontend hinaus.

## Prinzip: eine Naht, zwei Quellen

Jede Komponente liest/schreibt ausschließlich über
**[`src/services/projectsService.ts`](src/services/projectsService.ts)**. Der
Service holt **zwei getrennte Quellen** (parallel) und merged sie zum
`Project`-Modell — die Trennung spiegelt die Produktionsarchitektur:

```
                              ┌─ contractData.json    (SOURCE 1: Smart Contract / ethers.js)
View/Komponente ─> projectsService.ts ─┤
                              └─ projectMetadata.json (SOURCE 2: Backend REST API)

  HEUTE:  beide aus JSON-Mocks            SPÄTER: SOURCE 1 → ethers contract.<view>(),
                                                  SOURCE 2 → fetch('/api/...')
```

- **SOURCE 1 — Contract** ([`src/data/contractData.json`](src/data/contractData.json), Typen in [`types/sources.ts`](src/types/sources.ts) → `ContractCampaign`): on-chain State — `raised`, `goal`, `donors`, `daysLeft`, `verified`, `status`, `currency`, Contract-Adresse, Meilenstein-**State** (`allocated`/`status`/`confirmations`), Validator-**Set** (`address`).
- **SOURCE 2 — Backend** ([`src/data/projectMetadata.json`](src/data/projectMetadata.json) → `ProjectMetadata`): off-chain Inhalte — `title`, `summary`, `description`, `image`, `category`, `news`, sowie Meilenstein-`title`/`description`.

Der Join in `mergeProject()`: Projekt über `id`, Meilensteine über `index`. Validatoren kommen **ausschließlich vom Contract** (kein Join). Der **Contract** ist autoritativ dafür, *welche* Einträge existieren; das Backend liefert nur die Anzeige-Texte.

> **Bewusst NICHT im Backend (Sicherheit / Anonymität):**
> - **Explorer-URL** wird im Frontend aus der On-Chain-Adresse gebaut ([`utils/address.ts`](src/utils/address.ts), `https://polygonscan.com/address/<addr>`) — kein backend-kontrollierter `href` (Injection-Vektor), die Adresse bleibt die einzige Quelle. Anzeige-Kürzung (`0x7f4...89a2`) ebenfalls im Frontend.
> - **Validatoren** sind anonyme Adressen (Wallet-Login, kein User-System, kein Aktivitäts-Tracking) — **keine** Namen, Foto-Avatare oder Uptime/„Aktiv"-Status. Das Set (nur Adressen) kommt vom Contract; Avatar = deterministischer Identicon aus der Adresse, Label = gekürzte Adresse (beides Frontend, aus der Adresse abgeleitet).

Beim Verdrahten ändern sich **nur die `fetch*`-Funktionen im Service** (und ggf.
die `.env`-Werte). Merge, Typen ([`src/types/project.ts`](src/types/project.ts)),
Komponenten und Views bleiben unangetastet. Die Service-Funktionen sind bereits
`async`/parallel, damit Lade-/Fehlerzustände schon korrekt sind.

> Suchhilfe im Code: alle Stellen sind mit `INTEGRATION POINT` bzw.
> `TODO(integration)` kommentiert (`grep -rn "INTEGRATION" src`).

---

## Schreibend (Transaktionen) — das Wesentliche

| UI-Element | Komponente | Heute (Mock) | Später einzubauen |
| --- | --- | --- | --- |
| **„Jetzt unterstützen"** + Betrags-Input (Hero) | [`components/project/ProjectHero.vue`](src/components/project/ProjectHero.vue) | `donate(id, amount)` → Stub, sendet nichts | ERC-20-Spende USDC: `approve()` + `escrow.donate(amount)`, dann `tx.wait()` und Funding neu lesen |
| **„Einloggen mit Wallet"** (Navbar) | [`components/layout/AppNavbar.vue`](src/components/layout/AppNavbar.vue) | `connectWallet()` → Stub | Dev: Signer aus `VITE_DEV_PRIVATE_KEY`; echte Nutzer: `new BrowserProvider(window.ethereum)` + `getSigner()` |

Beide rufen Funktionen in `projectsService.ts` auf — dort steht der genaue
ethers-v6-Skizzencode in den `TODO(integration)`-Kommentaren.

---

## Lesend (Chain-Views / Off-chain-Metadaten)

| UI-Element | Komponente | Service-Aufruf | Datenquelle später |
| --- | --- | --- | --- |
| Projekt-Grid (Übersicht) | [`views/ProjectOverviewView.vue`](src/views/ProjectOverviewView.vue) · [`ProjectCard.vue`](src/components/project/ProjectCard.vue) | `listProjects({filter, sort})` | Campaign-Registry-Contract + Metadaten (Titel/Bild/Text) |
| Filter **Laufend / Abgelaufen** | `ProjectOverviewView.vue` | Param `filter` | Aus `deadline()` / Kampagnen-Status ableiten (Filtern kann client-seitig bleiben) |
| **Sortieren nach** (Neuste/Fortschritt/Endet bald) | `ProjectOverviewView.vue` | Param `sort` | Client-seitig auf den gelesenen Daten — keine Chain-Logik nötig |
| Ergebnis-Zähler („N Ergebnisse") | `ProjectOverviewView.vue` | abgeleitet aus Liste | automatisch |
| Projekt-Detail (gesamt) | [`views/ProjectDetailView.vue`](src/views/ProjectDetailView.vue) | `getProject(id)` | Escrow-Contract des Projekts + Metadaten |
| **Gesammelte Mittel** (Betrag, Ziel, % , Donoren, Tage übrig) | [`components/project/FundingCard.vue`](src/components/project/FundingCard.vue) | `project.funding` | `raised()`, `goal()`, `donorCount()`, `deadline()` |
| Fortschrittsbalken | [`components/ui/ProgressBar.vue`](src/components/ui/ProgressBar.vue) | abgeleitet (`percentFunded`) | aus `raised/goal` berechnet |
| **Smart Contract Details** (Adresse + Explorer-Link) | [`components/project/SmartContractCard.vue`](src/components/project/SmartContractCard.vue) | volle Adresse aus Contract-Quelle; URL frontend-abgeleitet | echte Contract-Adresse (on-chain); Explorer-URL weiterhin im Frontend aus der Adresse gebaut |
| **Validatoren** (Liste anonymer Adressen) | [`components/project/ValidatorsCard.vue`](src/components/project/ValidatorsCard.vue) | `project.validators` | On-chain Validator-Set (nur Adressen) |
| **Meilensteine** (Status, zugeordnete Mittel, „X/3 bestätigt") | [`components/project/MilestoneCard.vue`](src/components/project/MilestoneCard.vue) | `project.milestones` | Milestone-State + Validator-Bestätigungen; (Folgeschritt) Mittel-Freigabe-Tx |
| Tab **Beschreibung** / **Neuigkeiten** | `ProjectDetailView.vue` | `project.description` / `project.news` | Off-chain-Metadaten (kein Chain-Read) |

---

## Statische Platzhalter (noch ohne Ziel/Logik)

- **Footer-Links** (Privacy Policy / Terms of Service / Contact Us) —
  [`AppFooter.vue`](src/components/layout/AppFooter.vue): `href="#"`, kein Ziel.
- **„Verified Smart Contract"**-Badge & Kategorie-Badge im Hero — kommen aus
  `project.verified` / `project.category` (Mock).

---

## Datenmodell

Das gemergte UI-Modell ist in [`src/types/project.ts`](src/types/project.ts)
definiert (Herkunft je Feld kommentiert); die beiden Quell-Shapes in
[`src/types/sources.ts`](src/types/sources.ts) (`ContractCampaign`,
`ProjectMetadata`). Die JSON-Mocks füllen exakt diese Quell-Typen — Chain und
Backend müssen später nur dieselben Objekte liefern.

## Konkreter erster Schritt zum Verdrahten

1. Contracts kompilieren/deployen (siehe Repo-`README.md`), Adresse +
   `VITE_RPC_URL` / `VITE_DEV_PRIVATE_KEY` / `VITE_CONTRACT_ADDRESS` in
   `packages/frontend/.env` setzen.
2. In `projectsService.ts` nur die `fetch*`-Funktionen ersetzen:
   **SOURCE 1** (`fetchCampaigns`/`fetchCampaign`) → ethers `contract.<view>()`,
   **SOURCE 2** (`fetchMetadata`/`fetchMetadataById`) → `fetch('/api/...')`, dann
   `donate`/`connectWallet` (Writes). `mergeProject` und die UI bleiben unverändert.
