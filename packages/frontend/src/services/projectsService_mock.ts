// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM.
//
// Every screen reads its data through this module and nothing else. The data
// comes from TWO independent sources that mirror the production architecture:
//
//   SOURCE 1  src/data/contractData.json     → the smart contract (ethers.js)
//             on-chain state: financials, milestone release state, validators
//   SOURCE 2  backend REST API (/api/projects)  → off-chain metadata
//             texts, images, news, display names/avatars
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
import type { Funding, MilestoneStatus, Project, ProjectFilter, ProjectSort, ProjectStatus } from '@/types/project'
import type { ContractCampaign, ProjectMetadata } from '@/types/sources'
import { daysLeftUntil, hasEnded, percentFunded, timeLeftShort } from '@/utils/format'
import { NATIVE_CURRENCY, decimalsFor, validateAmount } from '@/utils/amount'
import { explorerAddressUrl, explorerLabel } from '@/utils/address'

// In-memory copy of the on-chain campaign data (mutated by donate() to simulate state changes).
const campaigns = contractData.campaigns as ContractCampaign[]

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

/** Simulates network/RPC latency so loading states behave like production. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// ── SOURCE 1: smart contract (ethers.js) ────────────────────────────────────
// TODO(integration): replace these with ethers reads. The campaign list is
// `DonationFactory.getProjects()` (an address[]); per campaign, read the
// `Donation` getters (donationGoal/totalDonations/getDonors()/start/end/
// currentStatus/currentMilestoneIndex/getValidators()/getMilestones()/...).
// Campaigns are keyed by their contract address.

async function fetchCampaigns(): Promise<ContractCampaign[]> {
  return delay(campaigns)
}

async function fetchCampaignByAddress(address: string): Promise<ContractCampaign | null> {
  return delay(campaigns.find((c) => c.address === address) ?? null)
}

// ── SOURCE 2: backend REST API (off-chain metadata) ─────────────────────────

async function fetchMetadata(): Promise<ProjectMetadata[]> {
  return fetchJson<ProjectMetadata[]>('/api/projects')
}

async function fetchMetadataById(id: string): Promise<ProjectMetadata | null> {
  try {
    return await fetchJson<ProjectMetadata>(`/api/projects/${id}`)
  } catch {
    return null
  }
}

// ── Account roles (one-time scan at login) ───────────────────────────────────
// Roles are PRESENTATION state only — the contract is the sole authority (it
// checks isValidator[msg.sender] / donations[msg.sender] / contractOwner on
// every write). So these are untrusted hints, always re-derived from chain,
// never persisted as a permission grant.

export type Role = 'donor' | 'validator' | 'owner'

/** What an address is across all campaigns — derived once at login from the
 *  same on-chain data the grid uses. `donorOf`/`validatorOf`/`ownerOf` hold the
 *  campaign addresses (the memberships that power "Meine Projekte" and, later,
 *  per-project capabilities); the booleans are just `…Of.length > 0`. */
export interface AccountSession {
  address: string
  donorOf: string[]
  validatorOf: string[]
  ownerOf: string[]
  roles: Record<Role, boolean>
}

/**
 * Scan every campaign once and resolve the caller's memberships/roles.
 *
 * TODO(integration): replace the array scans with per-campaign contract reads —
 * `donations(addr) > 0`, `isValidator(addr)`, `contractOwner() === addr` —
 * ideally batched in a single multicall. The returned shape stays identical, so
 * the store and UI are untouched.
 */
export async function loadAccountSession(address: string): Promise<AccountSession> {
  const a = address.toLowerCase()
  const campaignList = await fetchCampaigns()
  const includesAddr = (list: string[]) => list.some((x) => x.toLowerCase() === a)

  const donorOf = campaignList.filter((c) => includesAddr(c.donors)).map((c) => c.address)
  const validatorOf = campaignList.filter((c) => includesAddr(c.validators)).map((c) => c.address)
  const ownerOf = campaignList
    .filter((c) => c.contractOwner.toLowerCase() === a)
    .map((c) => c.address)

  return {
    address,
    donorOf,
    validatorOf,
    ownerOf,
    roles: {
      donor: donorOf.length > 0,
      validator: validatorOf.length > 0,
      owner: ownerOf.length > 0,
    },
  }
}

// ── Derivations: raw on-chain fields → the UI model ──────────────────────────
// The contract stores only primitives; everything the UI shows that looks
// "computed" (days left, milestone/project status, the confirmation threshold)
// is derived here, once, at the merge seam.

// The release threshold: a 66.66% majority of the validator set. This mirrors
// the contract's `neededVoteMajorityInBps` — which is a non-public `constant`
// (no getter), so it cannot be read on-chain; the literal here IS the contract's
// single source of truth for the frontend.
const NEEDED_VOTE_MAJORITY_BPS = 6666

/** UI status (laufend/abgelaufen) from the on-chain `Status` enum + `end`.
 *  Funding (within time) and Payout are active; a Funding campaign past its end
 *  (awaiting markAsFailedFunding), Failed and Closed are all "abgelaufen". */
function deriveProjectStatus(c: ContractCampaign): ProjectStatus {
  if (c.currentStatus === 'Closed' || c.currentStatus === 'Failed') return 'abgelaufen'
  if (c.currentStatus === 'Funding' && hasEnded(c.end)) return 'abgelaufen'
  return 'laufend'
}

/** Approvals needed to release the NEXT milestone: the smallest integer count
 *  that meets the majority `approvedCount/validators.length >= bps/10000`. */
function requiredApprovals(validatorCount: number, majorityBps: number): number {
  if (validatorCount <= 0) return 0
  return Math.ceil((validatorCount * majorityBps) / 10000)
}

/** Milestone presentation status, derived from the struct + lifecycle. Milestone
 *  funds are absolute on-chain (`amount`), so there is no allocation maths.
 *  Per the contract's voting model, the milestone validators are CURRENTLY
 *  voting on is the just-paid one (`currentMilestoneIndex - 1`), whose vote is
 *  not yet finished while the project is in Payout — that one is "in_progress".
 *  Any other paid milestone has its funds released → "completed"; an unpaid
 *  milestone is "pending". */
function deriveMilestoneStatus(
  ms: ContractCampaign['milestones'][number],
  index: number,
  c: ContractCampaign,
): MilestoneStatus {
  if (ms.paid) {
    const beingVotedOn =
      c.currentStatus === 'Payout' && index === c.currentMilestoneIndex - 1 && !ms.votingFinished
    return beingVotedOn ? 'in_progress' : 'completed'
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
  const required = requiredApprovals(c.validators.length, NEEDED_VOTE_MAJORITY_BPS)

  return {
    // Route id is the human slug (metadata); the on-chain identity is `address`.
    id: m.id,
    // ── from backend metadata ──
    title: m.title,
    summary: m.summary,
    // Normalize description: backend may return a string, an array of strings,
    // or an array of objects with a `description` field. Ensure the UI always
    // receives `description: string[]`.
    description: Array.isArray(m.description)
      ? m.description.map((d) => (typeof d === 'string' ? d : String((d as any).description ?? '')))
      : [String(m.description ?? '')],
    image: m.image,
    category: m.category,
    news: m.news,
    // `verified` is a backend assertion — there is no on-chain verified flag.
    verified: m.verified,
    // ── from the contract (on-chain authoritative) ──
    // Single native coin for every campaign (donations are msg.value).
    currency: NATIVE_CURRENCY,
    status: deriveProjectStatus(c),
    contractStatus: c.currentStatus,
    currentMilestoneIndex: c.currentMilestoneIndex,
    projectSetup: {
      approvedCount: c.projectSetup?.approvedCount ?? 0,
      rejectedCount: c.projectSetup?.rejectedCount ?? 0,
      votingFinished: c.projectSetup?.votingFinished ?? false,
      requiredApprovals: required,
      totalValidators: c.validators.length,
    },
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
        // Milestone funds are absolute on-chain — no share-of-goal maths.
        allocated: ms.amount,
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
  const meta = await fetchMetadataById(projectId)
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

export interface VoteResult {
  /** Transaction hash once the vote is mined. */
  txHash: string
}

/**
 * Cast a validator's vote on the milestone currently up for a vote — the
 * just-paid one, `currentMilestoneIndex - 1` (approve = true, reject = false).
 * Approving it is what releases the NEXT milestone's payout. Validator-only and
 * only while voting is open — the contract enforces every precondition
 * (isValidator, Payout phase, milestone == currentMilestoneIndex - 1, voting not
 * finished, deadline not passed, no duplicate vote); the UI only mirrors them.
 *
 * TODO(integration): the real write —
 *   const donation = Donation__factory.connect(projectAddress, signer)
 *   await (await donation.voteMilestone(milestoneIndex, approve)).wait()
 * then RE-READ that milestone (approvedCount/rejectedCount/votingFinished) and
 * the project's currentStatus from chain — a single approval can flip the
 * project to Failed or unlock the next payout. The contract is the authority;
 * the frontend validator check is UX only.
 *
 * [mock] Placeholder: no transaction is sent and no state is mutated.
 */
export async function voteOnMilestone(
  projectAddress: string,
  milestoneIndex: number,
  approve: boolean,
): Promise<VoteResult> {
  assertLocalSigner()
  if (import.meta.env.DEV) {
    console.info('[projectsService] voteOnMilestone — mock no-op (no tx sent):', {
      projectAddress,
      milestoneIndex,
      approve,
    })
  }
  return delay({ txHash: '0xMOCK_VOTE_TX_HASH' })
}

/** The editable, OFF-CHAIN slice of a project — exactly the metadata an owner
 *  may change. Mirrors the backend `ProjectMetadata` payload (minus the join
 *  keys). Nothing contract-owned (goal/donations/validators/milestone funds,
 *  order or status) appears here — those are immutable after deployment. */
export interface ProjectMetadataPatch {
  title: string
  summary: string
  category: string
  image: string
  description: string[]
  milestones: { index: string; title: string; description: string }[]
  news: { date: string; title: string; body: string; images: string[] }[]
}

/**
 * Save edited project metadata (owner-only, off-chain).
 *
 * TODO(integration): PUT/POST the patch to the backend, e.g.
 *   await fetch(`/api/projects/${id}`, {
 *     method: 'PUT', headers: { 'content-type': 'application/json' },
 *     body: JSON.stringify(patch),
 *   })
 * AUTHORIZE ON THE BACKEND: verify the caller actually controls the project's
 * `contractOwner` (e.g. a SIWE session) before accepting — the frontend
 * owner-check is UX only and must never be the security boundary. Contract data
 * is never sent here; it cannot be changed off-chain.
 *
 * [mock] Prototype no-op: intentionally does NOT mutate the in-memory metadata,
 * so "Speichern" persists nothing yet.
 */
export async function updateProjectMetadata(
  id: string,
  patch: ProjectMetadataPatch,
): Promise<void> {
  await fetchJson<ProjectMetadata>(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

/** Everything needed to create a project, split along the contract boundary.
 *  `contract` → DonationFactory.createDonation (the creator becomes owner);
 *  `metadata` → the backend, keyed by the new contract address once known. */
export interface CreateProjectPayload {
  contract: {
    /** Campaign length in seconds (`duration`). */
    durationSeconds: number
    /** On-chain description (set once at creation, then immutable). */
    description: string
    /** Validator addresses — distinct, non-empty, none equal to the creator. */
    validators: string[]
    /** Per-milestone funding amounts as validated decimal STRINGS (native coin)
     *  → parseEther each. The funding goal is their SUM — the contract derives it
     *  from these; there is no separate goal field. At least one, each > 0. */
    milestoneAmounts: string[]
  }
  metadata: {
    title: string
    summary: string
    category: string
    image: string
    description: string[]
    /** Milestone display texts, in the same order as the amounts above. */
    milestones: { title: string; description: string }[]
    news: { date: string; title: string; body: string; images: string[] }[]
  }
}

export interface CreateProjectResult {
  /** Address of the newly deployed Donation contract. */
  address: string
  /** Creation transaction hash. */
  txHash: string
}

function mockContractAddress(): string {
  const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `0x${hex}`
}

/**
 * Create a project. Available to ANY connected account (no role required) — the
 * creator becomes the on-chain owner. Two steps: deploy via the factory, then
 * store the off-chain metadata keyed by the new address.
 *
 * TODO(integration):
 *   // 1) on-chain — owner = msg.sender (the connected signer):
 *   const factory = DonationFactory__factory.connect(VITE_FACTORY_ADDRESS, signer)
 *   const tx = await factory.createDonation(
 *     payload.contract.validators,
 *     payload.contract.description,
 *     payload.contract.durationSeconds,
 *     payload.contract.milestoneAmounts.map((a) => parseEther(a)),
 *     // on-chain milestone descriptions stay empty — display text is off-chain;
 *     // the contract only needs the array length to match milestoneAmounts:
 *     payload.contract.milestoneAmounts.map(() => ''),
 *   )
 *   const receipt = await tx.wait()
 *   const address = <read the DonationContractCreated event from receipt>
 *   // 2) off-chain — POST the metadata keyed by that address:
 *   await fetch('/api/projects', {
 *     method: 'POST', headers: { 'content-type': 'application/json' },
 *     body: JSON.stringify({ address, ...payload.metadata }),
 *   })
 * Handle partial failure (contract deployed but metadata POST failed) explicitly.
 *
 * [mock] Placeholder: deploys nothing, POSTs nothing, mutates nothing.
 */
export async function createProject(payload: CreateProjectPayload): Promise<CreateProjectResult> {
  assertLocalSigner()

  const address = mockContractAddress()
  const txHash = '0xMOCK_CREATE_TX_HASH'

  const milestones = payload.metadata.milestones.map((m, i) => ({
    index: String(i + 1).padStart(2, '0'),
    title: m.title,
    description: m.description,
  }))

  await fetchJson<{ status: string; project_id: string }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      title: payload.metadata.title,
      summary: payload.metadata.summary,
      category: payload.metadata.category,
      image: payload.metadata.image,
      description: payload.metadata.description,
      verified: false,
      milestones,
      news: payload.metadata.news,
    }),
  })

  return { address, txHash }
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
