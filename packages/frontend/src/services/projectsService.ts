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
// loading handling is correct ahead of the real network calls.
//
// See INTEGRATION.md for the full UI-element → contract-call mapping.
// ─────────────────────────────────────────────────────────────────────────

import mockdata from '@/data/mockdata.json'
import type { Project, ProjectFilter, ProjectSort } from '@/types/project'
import { percentFunded } from '@/utils/format'

const projects = mockdata.projects as Project[]

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
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
  newRaised: number
}

/**
 * Make a donation to a project.
 *
 * TODO(integration): this is where the write transaction goes. With ethers v6:
 *   const tx = await contract.donate({ value: parseUnits(amount, decimals) })
 *   await tx.wait()
 * For an ERC-20 like USDC this is `approve` + `donate(amount)`. Until then this
 * is a no-op stub that the "Jetzt unterstützen" button calls.
 */
export async function donate(projectId: string, amount: number): Promise<DonationResult> {
  console.warn(
    `[mock] donate(${projectId}, ${amount}) — no transaction sent. Wire this to the escrow contract.`,
  )
  const project = projects.find((p) => p.id === projectId)
  const newRaised = (project?.funding.raised ?? 0) + amount
  return delay({ txHash: '0xMOCK_TX_HASH', newRaised })
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
  console.warn('[mock] connectWallet() — no wallet connected. Wire this to ethers signer setup.')
  return delay({ address: '0x0000...0000' })
}
