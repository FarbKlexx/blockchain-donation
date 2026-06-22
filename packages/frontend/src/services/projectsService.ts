// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM.
//
// Every screen reads its data through this module and nothing else. The data
// comes from TWO independent sources that mirror the production architecture:
//
//   SOURCE 1  src/data/contractData.json     → the smart contract (ethers.js)
//             on-chain state: financials, milestone release state, validators
//   SOURCE 2  src/data/projectMetadata.json  → the backend REST API
//             off-chain content: texts, images, news, display names/avatars
//
// The service fetches both (in parallel), then `mergeProject()` joins them into
// the `Project` UI model — by id (project), index (milestones), address
// (validators). When the dApp goes live, ONLY the two fetch* groups below
// change: contract reads become ethers `contract.<view>()` calls, metadata
// reads become `fetch('/api/...')`. Components, views and the merge stay put.
//
// The functions are already async/parallel so the UI's await/loading/error
// handling is correct ahead of the real network calls.
//
// See INTEGRATION.md for the full UI-element → data-source mapping.
// ─────────────────────────────────────────────────────────────────────────

import contractData from '@/data/contractData.json'
import projectMetadata from '@/data/projectMetadata.json'
import type { Funding, Project, ProjectFilter, ProjectSort } from '@/types/project'
import type { ContractCampaign, ProjectMetadata } from '@/types/sources'
import { percentFunded } from '@/utils/format'
import { decimalsFor, validateAmount } from '@/utils/amount'
import { explorerAddressUrl, explorerLabel } from '@/utils/address'

// In-memory copies of the two raw sources (the campaigns array is mutated by
// donate() to simulate on-chain state changing).
const campaigns = contractData.campaigns as ContractCampaign[]
const metadata = projectMetadata.projects as ProjectMetadata[]

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// ── SOURCE 1: smart contract (ethers.js) ────────────────────────────────────
// TODO(integration): replace these with ethers reads against the registry +
// per-campaign escrow contracts, e.g. `registry.getCampaigns()` and
// `escrow.raised()/goal()/donorCount()/deadline()/milestones()/validators()`.

async function fetchCampaigns(): Promise<ContractCampaign[]> {
  return delay(campaigns)
}

async function fetchCampaign(id: string): Promise<ContractCampaign | null> {
  return delay(campaigns.find((c) => c.id === id) ?? null)
}

// ── SOURCE 2: backend REST API (off-chain metadata) ─────────────────────────
// TODO(integration): replace these with `fetch('/api/projects')` and
// `fetch('/api/projects/' + id)` (returning the ProjectMetadata shape).

async function fetchMetadata(): Promise<ProjectMetadata[]> {
  return delay(metadata)
}

async function fetchMetadataById(id: string): Promise<ProjectMetadata | null> {
  return delay(metadata.find((m) => m.id === id) ?? null)
}

// ── Merge: contract state (authoritative) enriched with backend metadata ─────

function toFunding(c: ContractCampaign): Funding {
  return {
    raised: c.raised,
    goal: c.goal,
    donors: c.donors,
    daysLeft: c.daysLeft,
    timeLeftShort: c.timeLeftShort,
  }
}

function mergeProject(c: ContractCampaign, m: ProjectMetadata): Project {
  const metaMilestones = new Map(m.milestones.map((x) => [x.index, x]))

  return {
    id: c.id,
    // ── from backend metadata ──
    title: m.title,
    summary: m.summary,
    description: m.description,
    image: m.image,
    category: m.category,
    news: m.news,
    // ── from the contract (on-chain authoritative) ──
    verified: c.verified,
    currency: c.currency,
    status: c.status,
    funding: toFunding(c),
    contract: {
      // Explorer URL/label are derived from the on-chain address here, NOT
      // supplied by the backend — no backend-controlled href.
      address: c.address,
      explorerUrl: explorerAddressUrl(c.address),
      explorerLabel,
    },
    // Validators come straight from the contract — anonymous addresses, no
    // backend join, no activity tracking. The view derives an identicon + short
    // label from each address.
    validators: c.validators.map((v) => ({ address: v.address })),
    // Milestones: contract owns the state/order; metadata supplies title/desc.
    // Lifecycle invariant (Spende → Stimme → Auszahlung): a milestone's
    // confirmations/status are only meaningful once raised >= goal — validators
    // cannot vote before the funding goal is reached. The detail view enforces
    // this on the presentation side (see ProjectDetailView `goalReached`).
    milestones: c.milestones.map((ms) => {
      const meta = metaMilestones.get(ms.index)
      return {
        index: ms.index,
        allocated: ms.allocated,
        status: ms.status,
        confirmations: ms.confirmations,
        totalValidators: ms.totalValidators,
        title: meta?.title ?? `Meilenstein ${ms.index}`,
        description: meta?.description ?? '',
      }
    }),
  }
}

// ── Public API consumed by the views ────────────────────────────────────────

export interface ListOptions {
  filter?: ProjectFilter
  sort?: ProjectSort
}

/**
 * List projects for the overview grid. Reads both sources in parallel and
 * merges; a campaign without matching metadata is skipped (logged).
 */
export async function listProjects(options: ListOptions = {}): Promise<Project[]> {
  const { filter = 'laufend', sort = 'neuste' } = options

  const [campaignList, metadataList] = await Promise.all([fetchCampaigns(), fetchMetadata()])
  const metaById = new Map(metadataList.map((m) => [m.id, m]))

  let result = campaignList.flatMap((c) => {
    const meta = metaById.get(c.id)
    if (!meta) {
      console.warn(`[projectsService] no metadata for campaign "${c.id}" — skipped.`)
      return []
    }
    return [mergeProject(c, meta)]
  })

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

  return result
}

/**
 * Load a single project for the detail page. Reads both sources in parallel;
 * returns null if either the on-chain campaign or its metadata is missing.
 */
export async function getProject(id: string): Promise<Project | null> {
  const [campaign, meta] = await Promise.all([fetchCampaign(id), fetchMetadataById(id)])
  if (!campaign || !meta) return null
  return mergeProject(campaign, meta)
}

// ── Mutations (write transactions) ───────────────────────────────────────────

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

  const campaign = campaigns.find((c) => c.id === projectId)
  if (!campaign) throw new Error('Projekt nicht gefunden.')

  // Defense in depth: re-validate at the seam, not just in the UI.
  const check = validateAmount(amount, decimalsFor(campaign.currency))
  if (!check.ok) throw new Error(check.error)

  // [mock] Simulate a confirmed transaction mutating on-chain state. After a
  // real tx.wait(), the new figures would come from re-reading the contract.
  campaign.raised += Number(check.value)
  campaign.donors += 1

  return delay({ txHash: '0xMOCK_TX_HASH', funding: toFunding(campaign) })
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
