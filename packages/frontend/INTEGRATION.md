# Integration: UI ↔ Logik (Mock → Backend/Contract)

Diese Übersicht listet **alle Stellen, an denen später echte Logik (Smart
Contract / Backend) eingehängt werden muss**. Aktuell laufen beide Screens
(Übersicht + Detail) vollständig über **Mock-Daten** — es gibt **keine**
Anbindung über das Frontend hinaus.

## Prinzip: eine einzige Naht

Jede Komponente liest/schreibt ausschließlich über
**[`src/services/projectsService.ts`](src/services/projectsService.ts)**. Dieser
Service liest heute aus **[`src/data/mockdata.json`](src/data/mockdata.json)**.

```
View / Komponente ──> projectsService.ts ──> mockdata.json   (HEUTE)
View / Komponente ──> projectsService.ts ──> ethers v6 + Contract / Metadaten  (SPÄTER)
```

Beim Verdrahten ändert sich **nur der Service** (und ggf. die `.env`-Werte). Die
Typen in [`src/types/project.ts`](src/types/project.ts), alle Komponenten und
Views bleiben unangetastet. Die Service-Funktionen sind bereits `async` und
geben Promises zurück, damit Lade-/Fehlerzustände schon korrekt sind.

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
| **Smart Contract Details** (Adresse + Explorer-Link) | [`components/project/SmartContractCard.vue`](src/components/project/SmartContractCard.vue) | `project.contract` | echte Contract-Adresse + Explorer-URL (Polygonscan o. ä.) |
| **Validatoren** (Liste, Adresse, Uptime, „Aktiv") | [`components/project/ValidatorsCard.vue`](src/components/project/ValidatorsCard.vue) | `project.validators` | On-chain Validator-Set / Attestations |
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

Alle Formen sind in [`src/types/project.ts`](src/types/project.ts) definiert und
in jedem Feld kommentiert (Herkunft). `mockdata.json` füllt exakt diese Typen —
die Chain-/Backend-Quelle muss später nur dieselben Objekte liefern.

## Konkreter erster Schritt zum Verdrahten

1. Contracts kompilieren/deployen (siehe Repo-`README.md`), Adresse +
   `VITE_RPC_URL` / `VITE_DEV_PRIVATE_KEY` / `VITE_CONTRACT_ADDRESS` in
   `packages/frontend/.env` setzen.
2. In `projectsService.ts` die `TODO(integration)`-Blöcke ersetzen:
   `listProjects` / `getProject` (Reads) zuerst, dann `donate` / `connectWallet`
   (Writes). Mehr ist nicht nötig — die UI bleibt unverändert.
