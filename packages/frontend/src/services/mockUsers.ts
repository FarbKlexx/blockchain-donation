// DEV-ONLY login personas for the prototype's "pick a user" overlay.
//
// SECURITY: this is impersonation — it must never reach production. The only
// consumer (LoginDialog) renders these solely under `import.meta.env.DEV`, so a
// production build connects a real wallet instead. Nothing here grants any
// capability: roles are re-derived from chain (loadAccountSession) and every
// real action is enforced on-chain regardless of which persona is selected.
//
// Each persona is a REAL Hardhat test account (mnemonic "test test … junk" —
// addresses/keys are printed by `npx hardhat node` and listed in the README).
// The private key is carried along so logging in also switches the SIGNER
// (projectsService.setActiveSignerKey) — the account shown in the UI is the
// account that signs, otherwise donations/votes would be credited to whatever
// key sits in .env instead of the persona. These keys are publicly known
// test keys; they hold no real funds anywhere, ever.
//
// The roles below assume `npm run deploy:donations` seeded the local chain.
// That script is deterministic: owners are accounts #1–#5 (one per campaign)
// and donors rotate through #6–#19 in fixed order. Validators are picked
// on-chain from each funded campaign's donors — and since each campaign has
// exactly 4 donors (≤ validatorCount 5), ALL of them get selected:
//   burger-restaurant   (Funding) donors #6–#9,   owner #1
//   mesh-netzwerk       (Funding) donors #10–#13, owner #2
//   roguelike           (Closed)  donors #14–#17 → all validators, owner #3
//   suppenkueche        (Payout)  donors #18,#19,#6,#7 → all validators, owner #4
//   wiederaufforstung   (Funding) donors #8–#11,  owner #5
// The refund demo `lastenrad-kollektiv` (Failed after a milestone rejection) is
// funded from a FIXED set #10–#13 — so the "Beispiel-Spender" persona (#10) can
// reclaim its share in the UI — and does NOT consume the rotating cursor above.

export interface MockUser {
  /** Stable key for the option. */
  key: string
  /** Button label in the overlay. */
  label: string
  /** One-line hint about the roles this persona resolves to. */
  description: string
  /** The address logged in as — roles are derived from it, not declared here. */
  address: string
  /** Hardhat TEST private key for this address (public test mnemonic). Passed
   *  to the wallet store so the persona also becomes the active signer. */
  privateKey: string
}

export const MOCK_USERS: MockUser[] = [
  {
    key: 'donor',
    label: 'Beispiel-Spender',
    description:
      'Unterstützt mehrere Projekte, darunter ein gescheitertes — kann dort seine Spende zurückfordern. (Account #10)',
    address: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
    privateKey: '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
  },
  {
    key: 'validator',
    label: 'Beispiel-Validator',
    description: 'Spender & Validator im abgeschlossenen Roguelike-Projekt. (Account #14)',
    address: '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',
    privateKey: '0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa',
  },
  {
    key: 'both',
    label: 'Spender & Validator',
    description: 'Spender im Burger-Projekt, Validator in der Suppenküche. (Account #6)',
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  },
  {
    key: 'owner',
    label: 'Projektersteller',
    description: 'Eigentümer des Burger-Projekts — sieht „Von mir erstellt". (Account #1)',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    key: 'normal',
    label: 'Normaler Nutzer',
    description: 'Keine Rollen (nur Factory-Deployer) — sieht keine zusätzlichen Bereiche. (Account #0)',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    // Gift-card system only: the SHOP customers redeem their gift cards at. It is
    // a whitelisted institution (see ignition/modules/GiftCard.ts), so it shows up
    // as a selectable shop in the redeem checkout and receives the gift-card value.
    // Account #7 is not used by any other persona here (its donation-side role, if
    // any, is incidental — the two systems are independent).
    key: 'shop',
    label: 'Beispiel-Shop',
    description:
      'Freigeschalteter Shop im Gutschein-System — hier lösen Kund:innen Gutscheine ein; der Shop erhält den Betrag. (Account #7)',
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  },
]
