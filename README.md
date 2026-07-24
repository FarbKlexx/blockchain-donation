# blockchain-donation

Spenden-dApp als **npm-Workspaces-Monorepo**: Smart Contracts (Hardhat 3 +
ethers v6) in [`packages/contracts`](packages/contracts), Vue-3-Frontend in
[`packages/frontend`](packages/frontend), Flask/SQLite-Backend für Off-Chain-
Metadaten in [`packages/backend`](packages/backend). Die Contracts erzeugen
beim Kompilieren ABIs und typsichere TypeScript-Bindings, die automatisch ins
Frontend gespiegelt werden — so „zeigt" das Frontend per ethers.js auf den
deployten Contract.

Die Spenden-Logik (`Donation`/`DonationFactory`: Spende / Stimme / Auszahlung,
siehe Diagramme unten) ist implementiert und im Frontend verdrahtet
([`projectsService.ts`](packages/frontend/src/services/projectsService.ts)).
Für eine lokale Demo mit Beispielkampagnen siehe
[Demo lokal starten](#demo-lokal-starten).

---

## Voraussetzungen

- **Node.js 22 LTS** (≥ 22.13.0). Hardhat 3 verlangt diese Version; auf Node 24/25
  scheitert der Solidity-Test-Reporter (siehe [Troubleshooting](#troubleshooting)).
  Das Repo pinnt die Version in `.nvmrc` / `.node-version`. Mit nvm/fnm/Volta:

  ```sh
  nvm use        # oder: fnm use   → liest .nvmrc / .node-version
  ```

  Ohne Versionsmanager einfach Node 22 LTS verwenden. Die `engines`-Felder sind
  ein Hinweis (npm **warnt**, blockiert die Installation aber nicht).
- **Python 3** (für [`packages/backend`](packages/backend), das Off-Chain-
  Metadaten über eine Flask-API + SQLite bereitstellt).

---

## Erste Schritte

```sh
git clone https://github.com/FarbKlexx/blockchain-donation.git && cd blockchain-donation
nvm use                 # Node 22 aktivieren
npm install              # installiert alle Node-Workspaces (contracts + frontend) auf einmal
npm run compile          # Contracts kompilieren + ABIs/Typen ins Frontend spiegeln
pip install -r packages/backend/requirements.txt
```

> `npm install` einmal im Root genügt — npm Workspaces installiert beide
> Node-Pakete gemeinsam und teilt Dependencies über das Root-`node_modules`.
> Das Backend ist ein eigenständiges Python-Paket, daher `pip install` separat.

Danach entweder direkt die Demo starten (nächster Abschnitt) oder mit
`npm run dev` nur das Frontend gegen eine bereits laufende Node/Backend
starten.

---

## Demo lokal starten

Baut eine lokale Blockchain mit **8 Beispielkampagnen** auf (dieselben
Kampagnen wie in [`packages/frontend/src/data/contractData.json`](packages/frontend/src/data/contractData.json),
aber mit echten Hardhat-Accounts statt Fake-Adressen — inkl. Spenden,
Auszahlungen und Validator-Stimmen). Abgedeckte Status-Varianten:

| Kampagne | Status | Demo-Zweck |
| --- | --- | --- |
| `burger-restaurant` | Funding | Spenden möglich, Ziel noch nicht erreicht |
| `mesh-netzwerk-festivals` | Funding | dito |
| `wiederaufforstung-eifel` | Funding | dito |
| `gemeinschaftsgarten-lindenau` | ToBeApproved | Setup-Vote **offen** — die Stimme der Validator-Persona entscheidet |
| `mobile-suppenkueche-berlin` | Payout | Meilenstein-Vote **offen**, danach Owner-Auszahlung möglich |
| `roguelike-aetherbound` | Closed | vollständig durchgelaufen |
| `lastenrad-kollektiv` | Failed | Meilenstein abgelehnt → Rückerstattung für Spender:innen |
| `open-air-kino-hinterhof` | Failed | Förderzeit abgelaufen unter Ziel → Rückerstattung |

Vier Terminals:

```sh
# Terminal 1 — lokale Chain
npm run node -w contracts

# Terminal 2 — Factory + 8 Kampagnen deployen, Spenden/Votes/Payouts nachspielen.
# Schreibt automatisch VITE_CONTRACT_ADDRESS in packages/frontend/.env, aktualisiert
# die Adressen in projectMetadata.json und setzt packages/backend/data.db zurück (siehe unten).
npm run deploy:donations -w contracts

# Terminal 2 (optional) — Gutschein-System (GiftCardProject) deployen. Gibt die
# Adresse aus; diese manuell als VITE_GIFTCARD_ADDRESS in packages/frontend/.env eintragen.
npm run deploy:giftcard -w contracts

# Terminal 3 — Backend (reseedet data.db aus dem aktualisierten projectMetadata.json)
cd packages/backend && python app.py

# Terminal 4 — Frontend
npm run dev -w frontend
```

App unter `http://localhost:5173`. Terminal 2 muss **nach** Terminal 1 und
**vor** Terminal 3 laufen — die Reihenfolge ist wichtig, weil es Adressen
schreibt, die Backend und Frontend beim Start lesen. Erneut ausführbar: jeder
Lauf von Terminal 2 deployt frische Contracts auf die aktuell laufende Node
und überschreibt die Adressen erneut (z. B. nach einem Neustart von Terminal 1).

**Rollen der 20 Standard-Hardhat-Accounts** (`npx hardhat node` gibt alle
Adressen + Private Keys aus):

| Accounts | Rolle |
| --- | --- |
| #0 | Deployer der Factory — in keiner Kampagne eine Rolle (neutraler Zuschauer) |
| #1–#5 | Owner, zyklisch über die 8 Kampagnen verteilt — #1, #2 und #3 besitzen je zwei, #4 und #5 je eine |
| #6–#19 | Spender-Pool, rotierend über die Kampagnen |

> **Validatoren werden NICHT fest zugeteilt.** Sobald eine Kampagne ihr
> Förderziel erreicht, wählt der Contract sie zufällig aus den Spender:innen
> dieser Kampagne, die mindestens `validatorMinimumDonation` (0.01 ETH) gegeben
> haben. Wer Validator ist, unterscheidet sich also pro Kampagne und ist erst
> nach dem Seeding bekannt (`getValidators()`). Ein Account kann Spender **und**
> Validator derselben Kampagne sein.

**Anmelden:** Im Dev-Build (`npm run dev`) bietet der Login-Dialog eine Liste
fertiger Personas an ([`mockUsers.ts`](packages/frontend/src/services/mockUsers.ts))
— Spender, Validator, Owner, Shop usw. Die Auswahl setzt zugleich den
signierenden Key, d. h. die angezeigte Adresse ist auch die sendende. Das ist
der bequeme Weg; `VITE_DEV_PRIVATE_KEY` in `.env` dient nur noch als Fallback,
wenn keine Persona angemeldet ist. Die Personas sind auf
`import.meta.env.DEV` beschränkt und landen nie in einem Production-Build — kein
Wallet/MetaMask nötig für die lokale Demo.

Für das **Gutschein-System** (`deploy:giftcard`, optional): Owner ist der Deployer
(#0), als Institutionen sind per Default die Accounts #1, #6 und #7 freigeschaltet
(#7 ist die „Beispiel-Shop"-Persona) — anpassbar im Frontend als Owner oder über
[`ignition/modules/GiftCard.ts`](packages/contracts/ignition/modules/GiftCard.ts).

---

## Architektur

### Monorepo-Aufbau

```
blockchain-donation/
├─ .nvmrc / .node-version          # Node-Version-Pin (22 LTS)
├─ package.json                    # Root: Workspaces + Orchestrierungs-Scripts
├─ docs/                           # Architektur-Diagramme (SVG)
└─ packages/
   ├─ contracts/                   # Hardhat 3 · Solidity · ethers v6 · TypeChain
   │  ├─ contracts/                #   Donation.sol, DonationFactory.sol, GiftCard.sol (+ Counter.sol Sample, *.t.sol)
   │  ├─ test/                     #   TS-Integrationstests (mocha + ethers)
   │  ├─ ignition/modules/         #   Ignition-Deploy-Module (Counter-Sample, GiftCard)
   │  ├─ scripts/                  #   copy-artifacts.js, deploy-donations.ts, write-giftcard-env.js, send-op-tx.ts
   │  ├─ hardhat.config.ts         #   Netzwerke, solidity-Profile, typechain
   │  ├─ types/ethers-contracts/   #   generierte TypeChain-Typen   (gitignored)
   │  └─ artifacts/                #   Bytecode + ABI               (gitignored)
   ├─ backend/                     # Flask · SQLite — Off-Chain-Metadaten (/api/projects)
   │  ├─ app.py / database.py / models.py
   │  └─ data.db                   #   generiert/reseedet, siehe Demo-Abschnitt oben
   └─ frontend/                    # Vue 3 · Vite · ethers v6
      └─ src/
         ├─ contracts/             #   generiert via copy-artifacts (gitignored)
         │  ├─ abi/*.json          #     reine ABIs
         │  └─ typechain/          #     typsichere Contract-Factories
         ├─ components/ views/ stores/ router/
         └─ main.ts
```

### Tech-Stack

| Bereich | Tools |
| --- | --- |
| Contracts | Hardhat **3.8**, Solidity **0.8.28**, ethers **v6**, TypeChain, Hardhat **Ignition**, Mocha + chai |
| Frontend | Vue **3.5**, Vite **8**, TypeScript, Pinia, Vue Router, ethers **v6**, Vitest |
| Monorepo | npm Workspaces, Node **22 LTS** |

### Wie Contracts und Frontend zusammenspielen

Zwei Abläufe (Diagramme in [`docs/`](docs/)):

**1. Einmalig — schreiben, kompilieren, deployen**

<p align="center">
  <img src="docs/ablauf_einmaliges_setup_deployment.svg" width="430"
       alt="Smart Contract schreiben → Kompilieren (Bytecode + ABI) → Deployen → feste Contract-Adresse → Adresse + ABI ins Frontend" />
</p>

Jeder Schritt konkret im Projekt:

| Schritt im Diagramm | Im Repo |
| --- | --- |
| Smart Contract schreiben (`.sol`) | [`packages/contracts/contracts/`](packages/contracts/contracts) |
| Kompilieren → Bytecode + ABI | `npm run compile` → `artifacts/` + `types/` |
| Deployen (einmalige Transaktion) | `npm run deploy:local` / `deploy:sepolia` (Hardhat Ignition) |
| Contract-Adresse (fest auf der Kette) | Ausgabe von Ignition → ins Frontend als `VITE_CONTRACT_ADDRESS` |
| Adresse + ABI ins Frontend | `postcompile` spiegelt ABI/Typen nach `frontend/src/contracts/` |

**2. Laufzeit — pro Spende** (Schritte 2–8 wiederholen sich pro Aktion: Spende, Stimme, Auszahlung)

<p align="center">
  <img src="docs/ablauf_laufzeit_eine_spende.svg" width="470"
       alt="Wallet verbinden → Stand lesen → Eingabe + Gas-Schätzung → Transaktion bauen → Wallet signiert → Node führt aus → Contract prüft + speichert → Frontend liest neu" />
</p>

Die Farben markieren die beteiligte Schicht — **Frontend**, **Wallet**, **Node**,
**Contract** — und so sieht das mit ethers v6 aus:

| Schritt im Diagramm | Schicht | ethers v6 |
| --- | --- | --- |
| Wallet verbinden *(optional, später)* | Frontend → Wallet | echte Wallet: `new BrowserProvider(window.ethereum)` · **Projekt jetzt:** entfällt |
| Stand lesen (gratis) | Frontend → Node | `await contract.<view>()` — read-only, keine Gas-Kosten |
| Eingabe + Gas-Schätzung | Frontend | `await contract.<fn>.estimateGas(...)` |
| Transaktion bauen + übergeben | Frontend → (Wallet) | `await contract.<fn>(...)` |
| Wallet signiert *(optional)* | Wallet | echte Wallet: Popup · **Projekt jetzt:** Test-Key signiert automatisch |
| Node führt aus (EVM) | Node | Transaktion wird ausgeführt/gemined |
| Contract prüft + speichert | Contract | `require`, Zustandsänderung, `emit` Event |
| Frontend liest neu | Frontend | `await tx.wait()`, dann erneut lesen |

> **Im Projektrahmen vorerst (kein Wallet-Connect):** Statt MetaMask zu verbinden
> und Popups zu bestätigen, signiert das Frontend direkt mit einem **Hardhat-
> Test-Private-Key** gegen die lokale Node (`JsonRpcProvider` + `Wallet`). Die
> braune „Wallet"-Schicht entfällt damit — der restliche Ablauf bleibt identisch.
> Echte Wallet-Anbindung (`BrowserProvider`) lässt sich später ergänzen.
> ⚠️ Nur Hardhat-**Test**-Keys (öffentlich/deterministisch) verwenden — Vite
> backt `VITE_*` ins Client-Bundle, also niemals einen echten/finanzierten Key.

**Die ABI-/Typen-Brücke (automatisch beim `compile`):**

```
hardhat compile
  ├─ erzeugt  artifacts/…/<Name>.json        (ABI + Bytecode)
  ├─ erzeugt  types/ethers-contracts/…        (TypeChain, target ethers-v6)
  └─ postcompile: scripts/copy-artifacts.js
        ├─ ABIs            → packages/frontend/src/contracts/abi/<Name>.json
        └─ TypeChain-Typen → packages/frontend/src/contracts/typechain/
           (ohne hardhat.d.ts; mit // @ts-nocheck, damit vue-tsc nicht bricht)
```

`packages/frontend/src/contracts/` ist **generiert und gitignored** — es entsteht
neu bei jedem `compile`. Deshalb kompilieren die Root-Scripts `dev`/`build` immer
zuerst die Contracts. Secrets stehen **nicht** in `.env`, sondern im
verschlüsselten Hardhat-Keystore (siehe [Deployment](#deployment)).

---

## Entwickeln: Contracts (`packages/contracts`)

Typischer Loop: Contract in `contracts/*.sol` ändern → Test in `test/*.ts` (oder
Solidity-Test `*.t.sol`) anpassen → `compile` → `test`.

```sh
npm run compile -w contracts        # kompiliert + erzeugt Typen + kopiert ins Frontend
npm run test -w contracts           # alle Tests
# alternativ direkt im Paket:
cd packages/contracts
npx hardhat test mocha              # nur die TS/mocha-Tests
npx hardhat test solidity           # nur die Solidity-Tests (*.t.sol)
```

| Script (`-w contracts`) | Befehl | Zweck |
| --- | --- | --- |
| `compile` | `hardhat compile` | Kompiliert, erzeugt TypeChain-Typen, triggert `postcompile` |
| `test` | `hardhat test` | Solidity- **und** mocha-Tests |
| `node` | `hardhat node` | Persistente lokale Chain (HTTP-JSON-RPC auf `127.0.0.1:8545`) |
| `deploy:local` | `hardhat ignition deploy …/Counter.ts --network localhost` | Deployt gegen die laufende lokale Node |
| `deploy:sepolia` | `hardhat ignition deploy …/Counter.ts --network sepolia` | Deployt nach Sepolia |
| `postcompile` | `node scripts/copy-artifacts.js` | Läuft automatisch nach `compile`: spiegelt ABIs/Typen ins Frontend |

**Wissenswert**
- **Typsicherheit:** Die Toolbox generiert TypeChain-Bindings (`Counter`,
  `Counter__factory`) nach `types/ethers-contracts/`. In Tests sind die
  ethers-Helfer automatisch typisiert: `await ethers.deployContract("Counter")`
  liefert ein getyptes `Counter`. Beispiel siehe [test/Counter.ts](packages/contracts/test/Counter.ts).
- **Neuen Contract hinzufügen:** `.sol` unter `contracts/` anlegen, ein
  Ignition-Modul unter `ignition/modules/` (mit `m.contract("…")`) schreiben und
  in `deploy:local`/`deploy:sepolia` (in [package.json](packages/contracts/package.json))
  auf das neue Modul zeigen.
- **Profile:** `compile`/`test` nutzen das `default`-Solidity-Profil, ein Ignition-
  Deployment standardmäßig das optimierte `production`-Profil (siehe
  [hardhat.config.ts](packages/contracts/hardhat.config.ts)).

---

## Entwickeln: Frontend (`packages/frontend`)

```sh
npm run dev -w frontend       # Vite-Dev-Server (Hot Reload)
npm run build -w frontend     # Type-Check + Production-Build
```

> Damit die generierten Contract-Typen existieren, vorher mindestens einmal
> `npm run compile` ausführen. Die Root-Scripts `npm run dev` / `npm run build`
> erledigen das automatisch.

| Script (`-w frontend`) | Befehl | Zweck |
| --- | --- | --- |
| `dev` | `vite` | Dev-Server mit Hot-Module-Reload |
| `build` | type-check **+** `build-only` | Produktions-Build (parallel) |
| `build-only` | `vite build` | Nur bauen, ohne Type-Check |
| `preview` | `vite preview` | Production-Build lokal ansehen |
| `type-check` | `vue-tsc --build` | TypeScript-/Vue-Typprüfung |
| `test:unit` | `vitest` | Unit-Tests (Vitest) |
| `lint` | `oxlint` + `eslint` (`--fix`) | Linten & autofixen |
| `format` | `prettier --write src/` | Formatieren |

**Contract im Frontend ansprechen (ethers v6)**
Die generierten Typen/ABIs liegen unter `src/contracts/`. Im Projektrahmen
arbeiten wir mit einem **Hardhat-Test-Key** direkt gegen die lokale Node — RPC-URL,
Test-Key und Contract-Adresse kommen aus `.env` (siehe
[`.env.example`](packages/frontend/.env.example)). Skizze:

```ts
import { JsonRpcProvider, Wallet } from 'ethers'
import { Counter__factory } from '@/contracts/typechain'

// Dev-Setup: Test-Key aus `npx hardhat node`, direkt gegen die lokale Chain.
const provider = new JsonRpcProvider(import.meta.env.VITE_RPC_URL)          // http://127.0.0.1:8545
const signer   = new Wallet(import.meta.env.VITE_DEV_PRIVATE_KEY, provider)
const contract = Counter__factory.connect(import.meta.env.VITE_CONTRACT_ADDRESS, signer)

const value = await contract.x()        // Read: einfach awaiten (Rückgabe = BigInt)
const tx    = await contract.inc()      // Write: Transaktion …
await tx.wait()                         // … und auf Bestätigung warten
```

> **Test-Key statt Wallet:** `npx hardhat node` gibt 20 vorfinanzierte Accounts
> mit privaten Schlüsseln aus — einen davon in `.env` als `VITE_DEV_PRIVATE_KEY`
> setzen. ⚠️ Das sind öffentliche, deterministische **Test**-Keys, und Vite backt
> `VITE_*` ins Client-Bundle — also niemals einen echten/finanzierten Key so nutzen.
>
> **Später (echte Nutzer):** `new BrowserProvider(window.ethereum)` +
> `await provider.getSigner()` statt des Test-Keys — der Rest bleibt gleich.

> ethers **v6**-Besonderheiten: Zahlen sind **BigInt** (nicht `BigNumber`),
> `parseEther`/`formatEther` sind Top-Level-Importe, Adresse via
> `await contract.getAddress()`; bei `BrowserProvider` ist `getSigner()` **async**.

> Das obige ist die minimale ethers-v6-Skizze mit dem `Counter`-Sample. Die
> echte, vollständige Anbindung (Reads ohne Wallet, Writes mit Dev-Key/Wallet,
> Re-Read nach jeder Transaktion) steht in
> [`projectsService.ts`](packages/frontend/src/services/projectsService.ts).

---

## Deployment

**Lokal, `Counter`-Sample** (zwei Terminals) — der generische Hardhat-3-Beispiel-Contract:

```sh
npm run node            # Terminal 1: lokale Chain starten
npm run deploy:local    # Terminal 2: Ignition-Modul dagegen deployen
```

**Lokal, Spenden-Kampagnen** — `DonationFactory` + 5 Beispielkampagnen deployen
und Adressen automatisch verdrahten: siehe [Demo lokal starten](#demo-lokal-starten)
(`npm run deploy:donations`).

**Sepolia** — Secrets liegen im verschlüsselten Keystore (Hardhat 3 hat **keinen**
`.env`-Loader; `configVariable` liest aus Keystore bzw. Env-Variablen):

```sh
cd packages/contracts
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npm run deploy:sepolia -w contracts
```

In CI wird der Keystore umgangen → dort die Werte als **Umgebungsvariablen**
setzen. Referenz: [`packages/contracts/.env.example`](packages/contracts/.env.example).
Ignition merkt sich den Deployment-Status (idempotent) und gibt die deployte
Adresse aus — diese ins Frontend-`.env` als `VITE_CONTRACT_ADDRESS` eintragen.

---

## Script-Referenz (Root)

Im Repo-Root ausführbar; delegieren an die passenden Workspaces:

| Script | Zweck |
| --- | --- |
| `npm run compile` | Contracts kompilieren (Typen + ABIs ins Frontend) |
| `npm run test:contracts` | Hardhat-Tests |
| `npm run node` | Lokale Hardhat-Node starten |
| `npm run deploy:local` | Ignition-Deployment (`Counter`-Sample) gegen die lokale Node |
| `npm run deploy:sepolia` | Ignition-Deployment (`Counter`-Sample) nach Sepolia |
| `npm run deploy:donations` | `DonationFactory` + 8 Beispielkampagnen deployen, siehe [Demo lokal starten](#demo-lokal-starten) |
| `npm run deploy:giftcard` | `GiftCardProject` deployen (unabhängig vom Spenden-System); schreibt `VITE_GIFTCARD_ADDRESS` |
| `npm run dev` | Contracts kompilieren **+** Frontend-Dev-Server |
| `npm run build` | Contracts kompilieren **+** Frontend-Production-Build |

Einzelne Workspace-Scripts gezielt: `npm run <script> -w contracts` bzw.
`-w frontend` (oder `cd packages/<paket> && npm run <script>`).

---

## Troubleshooting

- **`npm run test:contracts` crasht mit `ERR_INVALID_ARG_VALUE … 'grey'`**
  Du bist auf Node 24/25. Hardhat 3.8.0's Solidity-Test-Reporter nutzt eine
  Farbe (`grey`), die neuere Node-Versionen nicht mehr akzeptieren. → **Node 22
  LTS verwenden** (`nvm use`). Übergangsweise laufen die TS-Tests via
  `npx hardhat test mocha`.
- **`Cannot find module '@/contracts/typechain'`**
  Die generierten Typen fehlen → einmal `npm run compile` ausführen (sie sind
  gitignored und entstehen erst beim Kompilieren).
- **`"GiftCardProject__factory" is not exported by ".../typechain/index.ts"`**
  Die gespiegelten Typen sind älter als die Contracts (typisch nach einem Pull,
  der einen neuen Contract mitbringt) → `npm run compile -w contracts`. Meldet
  Hardhat dabei „No contracts to compile", greift der Cache; dann reicht
  `node scripts/copy-artifacts.js` in `packages/contracts`, um nur neu zu
  spiegeln. Schlägt das mit `EBUSY` auf `typechain` fehl, hält ein laufender
  Vite-Dev-Server oder Editor das Verzeichnis — kurz stoppen und wiederholen.
- **`HHE902: The package "@openzeppelin/contracts" is not installed`**
  Eine Dependency wurde in `packages/contracts/package.json` ergänzt, aber nie
  installiert → `npm install` im Repo-Root (Workspaces installieren alles
  gemeinsam). Folgefehler beachten: solange die Contracts nicht kompilieren,
  werden auch die TypeChain-Typen fürs Frontend nicht neu erzeugt (siehe oben).
- **`npm warn EBADENGINE … required: { node: '^22.13.0' }`**
  Nur ein Hinweis, dass du nicht auf Node 22 bist. Die Installation läuft
  trotzdem durch.
- **`deploy:donations` bricht mit `EADDRINUSE :8545` ab**
  Es läuft schon eine Node auf dem Port (z. B. ein alter, nicht sauber beendeter
  `npm run node`-Prozess). Prozess beenden (Windows: `netstat -ano | findstr :8545`,
  dann `taskkill /F /PID <pid>`; Unix: `lsof -i :8545`, dann `kill <pid>`) und
  `npm run node` neu starten.
- **`deploy:donations` meldet `EBUSY` beim Löschen von `data.db`**
  Kurzzeitige Dateisperre (z. B. Windows-Indexierung); das Skript versucht es
  automatisch mehrmals. Bleibt es bestehen: `packages/backend/data.db` manuell
  löschen, dann das Backend neu starten (reseedet automatisch).
- **Projekt-Grid bleibt leer ("Keine Projekte in dieser Ansicht"), obwohl deployt wurde**
  Meist läuft eines der drei Teile (Node/Backend/Frontend) nicht, oder
  `VITE_CONTRACT_ADDRESS` in `packages/frontend/.env` ist leer/veraltet — nach
  jedem `deploy:donations`-Lauf wird sie neu geschrieben. Falls das Grid bei
  einem bereits laufenden `npm run dev` leer bleibt, den Dev-Server neu starten,
  damit die aktuelle `.env` sicher geladen ist.
- **Gutschein-Seiten melden `VITE_GIFTCARD_ADDRESS ist nicht gesetzt`**
  Das Gutschein-System wird separat deployt → `npm run deploy:giftcard -w contracts`
  (setzt die Variable selbst), danach Vite neu starten. `deploy:donations` ändert
  daran nichts — beide Systeme laufen unabhängig auf derselben Node.
- **Weiße Seite / App reagiert nicht, Konsole zeigt einen Compile-Fehler**
  Ein Template- oder Import-Fehler bricht den ganzen Client-Build ab, nicht nur
  die betroffene Seite. `npm run build -w frontend` gibt Datei und Zeile deutlich
  aus — schneller zu lesen als der Overlay im Browser.

## HardHat Adressen

Account #0:  0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1:  0x70997970c51812dc3a010c7d01b50e0d17dc79c8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Account #2:  0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc (10000 ETH)
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

Account #3:  0x90f79bf6eb2c4f870365e785982e1f101e93b906 (10000 ETH)
Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

Account #4:  0x15d34aaf54267db7d7c367839aaf71a00a2c6a65 (10000 ETH)
Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

Account #5:  0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc (10000 ETH)
Private Key: 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba

Account #6:  0x976ea74026e726554db657fa54763abd0c3a0aa9 (10000 ETH)
Private Key: 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e

Account #7:  0x14dc79964da2c08b23698b3d3cc7ca32193d9955 (10000 ETH)
Private Key: 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356

Account #8:  0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f (10000 ETH)
Private Key: 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

Account #9:  0xa0ee7a142d267c1f36714e4a8f75612f20a79720 (10000 ETH)
Private Key: 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6

Account #10: 0xbcd4042de499d14e55001ccbb24a551f3b954096 (10000 ETH)
Private Key: 0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897

Account #11: 0x71be63f3384f5fb98995898a86b02fb2426c5788 (10000 ETH)
Private Key: 0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82

Account #12: 0xfabb0ac9d68b0b445fb7357272ff202c5651694a (10000 ETH)
Private Key: 0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1

Account #13: 0x1cbd3b2770909d4e10f157cabc84c7264073c9ec (10000 ETH)
Private Key: 0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd

Account #14: 0xdf3e18d64bc6a983f673ab319ccae4f1a57c7097 (10000 ETH)
Private Key: 0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa

Account #15: 0xcd3b766ccdd6ae721141f452c550ca635964ce71 (10000 ETH)
Private Key: 0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61

Account #16: 0x2546bcd3c84621e976d8185a91a922ae77ecec30 (10000 ETH)
Private Key: 0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0

Account #17: 0xbda5747bfd65f08deb54cb465eb87d40e51b197e (10000 ETH)
Private Key: 0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd

Account #18: 0xdd2fd4581271e230360230f9337d5c0430bf44c0 (10000 ETH)
Private Key: 0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0

Account #19: 0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199 (10000 ETH)
Private Key: 0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e
