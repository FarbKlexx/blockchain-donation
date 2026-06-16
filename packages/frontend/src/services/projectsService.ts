// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM.
//
// Every screen reads its data through this module and nothing else. Today it
// returns data from src/data/mockdata.json. When the dApp is wired to the
// chain, ONLY this file changes: reads become ethers `contract.<view>()` calls
// (+ an off-chain metadata source for text/images), and the mutating functions
// (`donate`, `connectWallet`) build and send transactions. The components,
// views and types stay exactly as they are.
//
// The functions are already async and return Promises so the UI's await/
// loading/error handling is correct ahead of the real network calls.
//
// See INTEGRATION.md for the full UI-element → contract-call mapping.
// ─────────────────────────────────────────────────────────────────────────

import mockdata from '@/data/mockdata.json'
import type { Funding, Project, ProjectFilter, ProjectSort } from '@/types/project'
import { percentFunded } from '@/utils/format'
import { decimalsFor, validateAmount } from '@/utils/amount'

const projects = mockdata.projects as Project[]

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * FAIL-CLOSED GUARD for the inlined signing key.
 *
 * The frontend signs with a key baked into the bundle (VITE_DEV_PRIVATE_KEY).
 * That is only acceptable against a local Hardhat node with a throwaway test
 * key. This guard refuses to act when a key is present but the RPC endpoint is
 * not localhost — turning the README's comment-only warning into a mechanism,
 * so a real/funded key can never silently send a transaction to a public chain.
 *
 * No key set (pure read-only / current mock) → no-op.
 */
function assertLocalSigner(): void {
  const key = import.meta.env.VITE_DEV_PRIVATE_KEY
  if (!key) return

  const rpc = import.meta.env.VITE_RPC_URL
  let host = ''
  try {
    host = rpc ? new URL(rpc).hostname : ''
  } catch {
    host = ''
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  if (!isLocal) {
    throw new Error(
      'Abgebrochen: Ein im Bundle hinterlegter Signing-Key darf nur gegen eine ' +
        'lokale Node verwendet werden (VITE_RPC_URL muss localhost sein). ' +
        'Dieses Frontend ist ausschließlich für die lokale Entwicklung gedacht.',
    )
  }
}

export interface ListOptions {
  filter?: ProjectFilter
  sort?: ProjectSort
}

/**
 * List projects for the overview grid.
 *
 * TODO(integration): replace with a read of the platform registry contract
 * (e.g. `registry.getCampaigns()`), then hydrate each campaign's text/image
 * from the off-chain metadata source. Filtering/sorting can stay client-side.
 */
export async function listProjects(options: ListOptions = {}): Promise<Project[]> {
  const { filter = 'laufend', sort = 'neuste' } = options

  let result = projects.slice()

  if (filter !== 'alle') {
    result = result.filter((p) => p.status === filter)
  }

  switch (sort) {
    case 'fortschritt':
      result.sort(
        (a, b) =>
          percentFunded(b.funding.raised, b.funding.goal) -
          percentFunded(a.funding.raised, a.funding.goal),
      )
      break
    case 'endet_bald':
      result.sort((a, b) => a.funding.daysLeft - b.funding.daysLeft)
      break
    case 'neuste':
    default:
      // Mock order = newest first.
      break
  }

  return delay(result)
}

/**
 * Load a single project for the detail page.
 *
 * TODO(integration): replace with reads of the campaign's escrow contract
 * (`raised()`, `goal()`, `donorCount()`, `deadline()`, milestone state,
 * validator attestations) + off-chain metadata for description/news.
 */
export async function getProject(id: string): Promise<Project | null> {
  return delay(projects.find((p) => p.id === id) ?? null)
}

export interface DonationResult {
  /** Transaction hash once the donation is mined. */
  txHash: string
  /** Authoritative funding state AFTER the tx confirmed (a fresh chain read). */
  funding: Funding
}

/**
 * Make a donation to a project.
 *
 * `amount` is the validated decimal STRING the user typed (never a float) — it
 * is what `parseUnits(amount, decimals)` consumes on-chain.
 *
 * TODO(integration): this is where the write transaction goes. With ethers v6
 * and an ERC-20 like USDC this is a two-step flow:
 *   const units = parseUnits(amount, decimalsFor(currency))
 *   await (await token.approve(escrow, units)).wait()   // step 1 (allowance)
 *   await (await escrow.donate(units)).wait()           // step 2 (donate)
 * Handle the partial-failure case (approve ok, donate reverts) explicitly.
 * After confirmation, RE-READ funding from chain — do not trust a client value.
 */
export async function donate(projectId: string, amount: string): Promise<DonationResult> {
  assertLocalSigner()

  const project = projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Projekt nicht gefunden.')

  // Defense in depth: re-validate at the seam, not just in the UI.
  const check = validateAmount(amount, decimalsFor(project.currency))
  if (!check.ok) throw new Error(check.error)

  // [mock] Simulate a confirmed transaction mutating on-chain state. After a
  // real tx.wait(), the new figures would come from re-reading the contract.
  project.funding.raised += Number(check.value)
  project.funding.donors += 1

  return delay({ txHash: '0xMOCK_TX_HASH', funding: { ...project.funding } })
}

export interface WalletConnection {
  address: string
}

/**
 * Connect a wallet (the navbar / hero buttons).
 *
 * TODO(integration): in the project's dev scope this returns the Hardhat test
 * account derived from VITE_DEV_PRIVATE_KEY; for real users swap in
 * `new BrowserProvider(window.ethereum)` + `await provider.getSigner()`.
 */
export async function connectWallet(): Promise<WalletConnection> {
  assertLocalSigner()
  return delay({ address: '0x0000...0000' })
}
