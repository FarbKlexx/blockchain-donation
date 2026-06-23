// DEV-ONLY login personas for the prototype's "pick a user" overlay.
//
// SECURITY: this is impersonation — it must never reach production. The only
// consumer (LoginDialog) renders these solely under `import.meta.env.DEV`, so a
// production build connects a real wallet instead. Nothing here grants any
// capability: roles are re-derived from chain (loadAccountSession) and every
// real action is enforced on-chain regardless of which persona is selected.
//
// Each address is wired into src/data/contractData.json so the persona has a
// meaningful "Meine Projekte" view:
//   donor      → donor in "burger" + "mesh"
//   validator  → validator in all campaigns
//   both       → validator in all + donor in "roguelike"
//   owner      → contractOwner of "burger"
//   normal     → in nothing (sees no extra sections)

export interface MockUser {
  /** Stable key for the option. */
  key: string
  /** Button label in the overlay. */
  label: string
  /** One-line hint about the roles this persona resolves to. */
  description: string
  /** The address logged in as — roles are derived from it, not declared here. */
  address: string
}

export const MOCK_USERS: MockUser[] = [
  {
    key: 'donor',
    label: 'Beispiel-Spender',
    description: 'Hat zwei Projekte unterstützt — sieht „Von mir unterstützt".',
    address: '0xd0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0',
  },
  {
    key: 'validator',
    label: 'Beispiel-Validator',
    description: 'Validator in allen Projekten — sieht „Ich bin Validator".',
    address: '0x88f2d4b6a8c0e2f4b6d8a0c2e4f6b8d0a2c4e610',
  },
  {
    key: 'both',
    label: 'Spender & Validator',
    description: 'Beide Rollen gleichzeitig — sieht beide Listen.',
    address: '0x12b9f3a7c1e5d8b04a6f2c9e7b1d3a5f8c0e2b34',
  },
  {
    key: 'owner',
    label: 'Projektersteller',
    description: 'Hat ein Projekt erstellt — sieht „Von mir erstellt".',
    address: '0xd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d',
  },
  {
    key: 'normal',
    label: 'Normaler Nutzer',
    description: 'Keine Rollen — sieht keine zusätzlichen Bereiche.',
    address: '0x0000000000000000000000000000000000000001',
  },
]
