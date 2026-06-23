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
import type { Funding, MilestoneStatus, Project, ProjectFilter, ProjectSort, ProjectStatus } from '@/types/project'
import type { ContractCampaign, ProjectMetadata } from '@/types/sources'
import { daysLeftUntil, hasEnded, percentFunded, timeLeftShort } from '@/utils/format'
import { NATIVE_CURRENCY, decimalsFor, validateAmount } from '@/utils/amount'
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
// TODO(integration): replace these with ethers reads. The campaign list is
// `DonationFactory.getDonations()` (an address[]); per campaign, read the
// `Donation` getters (donationGoal/totalDonations/start/end/currentStatus/
// validators/milestones/...). Campaigns are keyed by their contract address.

async function fetchCampaigns(): Promise<ContractCampaign[]> {
  return delay(campaigns)
}

async function fetchCampaignByAddress(address: string): Promise<ContractCampaign | null> {
  return delay(campaigns.find((c) => c.address === address) ?? null)
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

// ── Derivations: raw on-chain fields → the UI model ──────────────────────────
// The contract stores only primitives; everything the UI shows that looks
// "computed" (days left, milestone amounts, milestone/project status, the
// confirmation threshold) is derived here, once, at the merge seam.

/** UI status (laufend/abgelaufen) from the on-chain `Status` enum + `end`.
 *  Funding (within time) and Payout are active; a Funding campaign past its end
 *  (awaiting markAsFailedFunding), Failed and Closed are all "abgelaufen". */
function deriveProjectStatus(c: ContractCampaign): ProjectStatus {
  if (c.currentStatus === 'Closed' || c.currentStatus === 'Failed') return 'abgelaufen'
  if (c.currentStatus === 'Funding' && hasEnded(c.end)) return 'abgelaufen'
  return 'laufend'
}

/** Approvals needed to release a milestone: the smallest integer count that
 *  meets the on-chain majority `approvedCount/validators.length >= bps/10000`. */
function requiredApprovals(validatorCount: number, majorityBps: number): number {
  if (validatorCount <= 0) return 0
  return Math.ceil((validatorCount * majorityBps) / 10000)
}

/** Absolute funds for a milestone: its basis-point share of the goal. On-chain
 *  the payout is `totalDonations * percentage / 10000`; since donations cap at
 *  the goal, the planned allocation against the goal is shown here. */
function milestoneAllocated(percentageBps: number, goal: number): number {
  return Math.round((goal * percentageBps) / 10000)
}

/** Milestone presentation status, derived from the struct + lifecycle. Only the
 *  current milestone, while the project is in Payout with voting opened, is
 *  "in_progress"; a paid milestone is "completed"; everything else "pending". */
function deriveMilestoneStatus(
  ms: ContractCampaign['milestones'][number],
  index: number,
  c: ContractCampaign,
): MilestoneStatus {
  if (ms.paid) return 'completed'
  if (c.currentStatus === 'Payout' && index === c.currentMilestone && ms.readyToBeApproved) {
    return 'in_progress'
  }
  return 'pending'
}

// ── Merge: contract state (authoritative) enriched with backend metadata ─────

function toFunding(c: ContractCampaign): Funding {
  return {
    raised: c.totalDonations,
    goal: c.donationGoal,
    // Derived: a mapping has no count, so it comes from the donor list's length.
    donors: c.donors.length,
    // Derived from the on-chain end timestamp (the contract has no "days left").
    daysLeft: daysLeftUntil(c.end),
    timeLeftShort: timeLeftShort(c.end),
  }
}

function mergeProject(c: ContractCampaign, m: ProjectMetadata): Project {
  const required = requiredApprovals(c.validators.length, c.neededVoteMajorityInBps)

  return {
    // Route id is the human slug (metadata); the on-chain identity is `address`.
    id: m.id,
    // ── from backend metadata ──
    title: m.title,
    summary: m.summary,
    description: m.description,
    image: m.image,
    category: m.category,
    news: m.news,
    // `verified` is a backend assertion — there is no on-chain verified flag.
    verified: m.verified,
    // ── from the contract (on-chain authoritative) ──
    // Single native coin for every campaign (donations are msg.value).
    currency: NATIVE_CURRENCY,
    status: deriveProjectStatus(c),
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
    validators: c.validators.map((address) => ({ address })),
    // Milestones: contract owns state/order (joined by position); metadata
    // supplies title/desc. Lifecycle invariant (Spende → Stimme → Auszahlung):
    // a milestone's confirmations/status are only meaningful once raised >= goal
    // (Status === Payout) — validators cannot vote before the goal is reached.
    // The detail view also gates this on the presentation side (`goalReached`).
    milestones: c.milestones.map((ms, i) => {
      const meta = m.milestones[i]
      return {
        index: String(i + 1).padStart(2, '0'),
        allocated: milestoneAllocated(ms.percentage, c.donationGoal),
        status: deriveMilestoneStatus(ms, i, c),
        confirmations: ms.approvedCount,
        totalValidators: c.validators.length,
        requiredApprovals: required,
        title: meta?.title ?? `Meilenstein ${i + 1}`,
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
  // Join on the on-chain contract address (the project's unique identifier).
  const metaByAddress = new Map(metadataList.map((m) => [m.address, m]))

  let result = campaignList.flatMap((c) => {
    const meta = metaByAddress.get(c.address)
    if (!meta) {
      console.warn(`[projectsService] no metadata for campaign "${c.address}" — skipped.`)
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
 * Load a single project for the detail page. The route id is the human slug, so
 * we resolve it to the on-chain contract address via the backend metadata, then
 * read that campaign. Returns null if either the metadata or the campaign is
 * missing.
 */
export async function getProject(id: string): Promise<Project | null> {
  const meta = await fetchMetadataById(id)
  if (!meta) return null
  const campaign = await fetchCampaignByAddress(meta.address)
  if (!campaign) return null
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
 * is what `parseEther(amount)` converts to wei on-chain.
 *
 * TODO(integration): this is where the write transaction goes. Donations are
 * the native coin, so it is a single value-bearing call (no ERC-20 approve):
 *   const value = parseEther(amount)
 *   await (await donation.donate({ value })).wait()
 * After confirmation, RE-READ funding from chain — do not trust a client value.
 */
export async function donate(projectId: string, amount: string): Promise<DonationResult> {
  assertLocalSigner()

  // Route id is the slug → resolve to the on-chain address, then the campaign.
  const meta = metadata.find((m) => m.id === projectId)
  const campaign = meta && campaigns.find((c) => c.address === meta.address)
  if (!campaign) throw new Error('Projekt nicht gefunden.')

  // Defense in depth: re-validate at the seam, not just in the UI.
  const check = validateAmount(amount, decimalsFor(NATIVE_CURRENCY))
  if (!check.ok) throw new Error(check.error)

  // [mock] Simulate a confirmed transaction mutating on-chain state. After a
  // real tx.wait(), the new figures would come from re-reading the contract.
  // Append a donor so the derived count (donors.length) grows; on-chain a repeat
  // donor would NOT add a new key — the re-read from chain settles that.
  campaign.totalDonations += Number(check.value)
  campaign.donors.push('0x' + '0'.repeat(40))

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
