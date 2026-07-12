// ─────────────────────────────────────────────────────────────────────────
// THE INTEGRATION SEAM.
//
// Every screen reads its data through this module and nothing else. The data
// comes from TWO independent sources:
//
//   SOURCE 1  the Donation/DonationFactory contracts (ethers.js, on-chain)
//             financials, milestone release state, validators
//   SOURCE 2  backend REST API (/api/projects)  → off-chain metadata
//             texts, images, news, display names/avatars
//
// The service fetches both (in parallel), then `mergeProject()` joins them into
// the `Project` UI model — by id (project), index (milestones), address
// (validators).
//
// See projectsService_mock.ts for the earlier mock this replaced (still used
// as a reference for the pure off-chain prototype), and INTEGRATION.md for
// the UI-element → data-source mapping.
// ─────────────────────────────────────────────────────────────────────────

import { ethers, type Eip1193Provider } from 'ethers'
import { DonationFactory__factory, Donation__factory } from '@/contracts/typechain'
import type { Funding, MilestoneStatus, NewsEntry, Project, ProjectFilter, ProjectSort, ProjectStatus } from '@/types/project'
import type { ContractCampaign, ProjectMetadata } from '@/types/sources'
import { daysLeftUntil, hasEnded, percentFunded, timeLeftShort } from '@/utils/format'
import { NATIVE_CURRENCY, trimTrailingZeros } from '@/utils/amount'
import { explorerAddressUrl, explorerLabel } from '@/utils/address'
import { ApiError } from '@/utils/errors'

const FACTORY_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS

function requireFactoryAddress(): string {
  if (!FACTORY_ADDRESS) throw new Error('VITE_CONTRACT_ADDRESS ist nicht gesetzt.')
  return FACTORY_ADDRESS
}

// Mapping uint8 from the chain to String for the frontend
const STATUS_MAP = ['Funding', 'ToBeApproved', 'Payout', 'Failed', 'Closed'] as const;

// The injected wallet (MetaMask et al.) exposes an EIP-1193 provider on
// `window.ethereum`. Typed locally so we never reach for `any`.
type WindowWithEthereum = { ethereum?: Eip1193Provider }

// Reads (listing campaigns, role scans) never need a wallet — only writes do.
// Prefers the local RPC endpoint so the project grid works with no wallet
// installed at all; falls back to the injected wallet's provider otherwise.
function getReadProvider(): ethers.Provider {
  const rpcUrl = import.meta.env.VITE_RPC_URL
  if (rpcUrl) return new ethers.JsonRpcProvider(rpcUrl)
  const injected = (window as WindowWithEthereum).ethereum
  if (injected) return new ethers.BrowserProvider(injected)
  throw new Error('Keine RPC-Verbindung verfügbar (weder VITE_RPC_URL noch eine Krypto-Wallet).')
}

// ── Active dev signer ────────────────────────────────────────────────────────
// The signer MUST be the logged-in account, otherwise the UI identity and the
// transaction sender diverge (donations credited to the .env key's address
// instead of the persona). The wallet store sets this on login/logout with the
// persona's Hardhat TEST key; when unset, writes fall back to
// VITE_DEV_PRIVATE_KEY (and the connect path then logs in as that key's
// address, so address and signer stay in sync on every path).
let activeDevKey: string | null = null

/** Switch the dev signing key to the logged-in account (null = fall back to
 *  VITE_DEV_PRIVATE_KEY / injected wallet). `forAddress` guards against a
 *  persona whose key and address drifted apart — fail loudly, not with a
 *  silently wrong sender. */
export function setActiveSignerKey(key: string | null, forAddress?: string): void {
  if (key && forAddress) {
    const derived = new ethers.Wallet(key).address
    if (derived.toLowerCase() !== forAddress.toLowerCase()) {
      throw new Error(
        `Signer-Key passt nicht zur Adresse: Key gehört zu ${derived}, angemeldet ist ${forAddress}.`,
      )
    }
  }
  activeDevKey = key
}

function currentDevKey(): string | undefined {
  return activeDevKey ?? import.meta.env.VITE_DEV_PRIVATE_KEY
}

async function getBlockchainContext() {
  // The logged-in persona's key, else the .env dev key, else the injected wallet:
  const devKey = currentDevKey()
  const rpcUrl = import.meta.env.VITE_RPC_URL
  if (devKey && rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    return { provider, signer: new ethers.Wallet(devKey, provider) }
  }

  const injected = (window as WindowWithEthereum).ethereum
  if (!injected) throw new Error('Keine Krypto-Wallet gefunden.')
  const provider = new ethers.BrowserProvider(injected)
  const signer = await provider.getSigner()
  return { provider, signer }
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    // Network failure — the server could not be reached at all (no HTTP status).
    throw new ApiError(0)
  }
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText)
  }
  return response.json() as Promise<T>
}

// ── SOURCE 1: smart contract (ethers.js) ────────────────────────────────────
// Campaigns are keyed by their contract address: the list comes from
// `DonationFactory.getProjects()`, then each campaign's fields are read from
// its own `Donation` contract.

async function fetchCampaigns(): Promise<ContractCampaign[]> {
  try {
    const provider = getReadProvider()
    const factory = DonationFactory__factory.connect(requireFactoryAddress(), provider)

    // fetch address[] from factory
    const projectAddresses = await factory.getProjects()

    const campaigns = await Promise.all(
      projectAddresses.map((addr: string) => fetchCampaignByAddress(addr))
    )
    
    // filter failed campaigns
    return campaigns.filter((c: ContractCampaign | null): c is ContractCampaign => c !== null)
  } catch (error) {
    console.error('Fehler beim Abrufen der Projektliste aus der Factory:', error)
    return []
  }
}

async function fetchCampaignByAddress(address: string): Promise<ContractCampaign | null> {
  try {
    const provider = getReadProvider()
    const contract = Donation__factory.connect(address, provider)

    const [
      contractOwner,
      donationGoal,
      totalDonations,
      start,
      end,
      currentMilestoneIndex,
      rawStatus,
      validators,
      rawMilestones,
      votingDeadline,
      donors,
      rawProjectSetup
    ] = await Promise.all([
      contract.contractOwner(),
      contract.donationGoal(),
      contract.totalDonations(),
      contract.start(),
      contract.end(),
      contract.currentMilestoneIndex(),
      contract.currentStatus(),
      contract.getValidators(),
      contract.getMilestones(),
      contract.votingDeadline(),
      contract.getDonors(),
      contract.projectSetup()
    ])

    return {
      address,
      contractOwner,
      donationGoal: Number(ethers.formatEther(donationGoal)),
      totalDonations: Number(ethers.formatEther(totalDonations)),
      start: Number(start),
      end: Number(end),
      currentMilestoneIndex: Number(currentMilestoneIndex),
      currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Funding',
      totalPayout: Number(ethers.formatEther(await contract.totalPayout())),
      votingDeadline: Number(votingDeadline),
      refundableBalance: Number(ethers.formatEther(await contract.refundableBalance())),
      validators: [...validators],
      donors: [...donors],
      projectSetup: {
        approvedCount: Number(rawProjectSetup.approvedCount),
        rejectedCount: Number(rawProjectSetup.rejectedCount),
        votingFinished: rawProjectSetup.votingFinished
      },
      milestones: rawMilestones.map((ms) => ({
        amount: Number(ethers.formatEther(ms.amount)),
        approvedCount: Number(ms.approvedCount),
        rejectedCount: Number(ms.rejectedCount),
        votingFinished: ms.votingFinished,
        paid: ms.paid
      }))
    }
  } catch (error) {
    console.error(`Fehler beim Laden des Contracts unter ${address}:`, error)
    return null
  }
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

export interface ProjectNewsCreateResult extends NewsEntry {
  id: number
  project_id: string
}

// The backend wraps the persisted row in an envelope: { status, news }.
interface CreateNewsResponse {
  status: string
  news: ProjectNewsCreateResult
}

/**
 * Append a single news entry to an existing project (POST /api/projects/:id/news).
 * Unlike the bulk metadata PUT (updateProjectMetadata), this only inserts the one
 * entry — it never rewrites the project's other news. Returns the persisted row
 * (with its backend-assigned id), unwrapped from the response envelope.
 */
export async function createProjectNews(projectId: string, news: NewsEntry): Promise<ProjectNewsCreateResult> {
  const response = await fetchJson<CreateNewsResponse>(`/api/projects/${projectId}/news`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(news),
  })
  return response.news
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
 * Scan every campaign once and resolve the caller's memberships/roles, via a
 * per-campaign contract read (`donations(addr) > 0`, `isValidator(addr)`,
 * `contractOwner() === addr`). Could be batched into a single multicall if
 * the campaign count grows enough for N sequential-per-campaign reads to matter.
 */
export async function loadAccountSession(address: string): Promise<AccountSession> {
  const provider = getReadProvider()
  const factory = DonationFactory__factory.connect(requireFactoryAddress(), provider)

  // fetch all existing project addresses from factory
  const projectAddresses = await factory.getProjects()

  const donorOf: string[] = []
  const validatorOf: string[] = []
  const ownerOf: string[] = []

  // read campaign contracts in parallel
  await Promise.all(
    projectAddresses.map(async (contractAddress: string) => {
      try {
        const contract = Donation__factory.connect(contractAddress, provider)
        
        const [userDonation, isVal, owner] = await Promise.all([
          contract.donations(address),  // (address => uint256)
          contract.isValidator(address), // (address => bool)
          contract.contractOwner()
        ])

        // donation check
        if (userDonation > 0n) {
          donorOf.push(contractAddress)
        }
        if (isVal) {
          validatorOf.push(contractAddress)
        }
        if (owner.toLowerCase() === address.toLowerCase()) {
          ownerOf.push(contractAddress)
        }
      } catch (err) {
        console.error(`Fehler beim Rollen-Scan für Contract ${contractAddress}:`, err)
      }
    })
  )

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

// ── This account's votes on ONE project (derived from chain) ─────────────────
// The contract records each validator's vote per poll (hasVotedForProjectSetup /
// hasVotedForMilestone, plus the votesFor… value). Reading it here means the
// UI's "you voted X" state is DERIVED FROM CHAIN — it survives a page reload and
// reflects a changed vote, instead of living only in session memory (which would
// vanish on reload, re-enable the button, and revert on-chain as a duplicate).

export type VoteChoice = 'approve' | 'reject'

export interface MyProjectVotes {
  /** The account's project-setup vote, or null if it hasn't voted. */
  setup: VoteChoice | null
  /** The account's vote per milestone index (only indices it has voted on). */
  milestones: Record<number, VoteChoice>
}

/**
 * Read the connected account's votes for a project straight from the contract,
 * so the detail view can show them consistently across reloads and know which
 * choice is already cast. The contract lets a validator CHANGE their vote while a
 * poll is open, but reverts a vote identical to the current one ("Same Vote was
 * already made") — so the UI needs the current choice to disable exactly that one.
 */
export async function getMyProjectVotes(
  projectAddress: string,
  account: string,
): Promise<MyProjectVotes> {
  const provider = getReadProvider()
  const contract = Donation__factory.connect(projectAddress, provider)

  const [hasSetupVote, milestoneCount] = await Promise.all([
    contract.hasVotedForProjectSetup(account),
    contract.getMilestoneCount(),
  ])

  let setup: VoteChoice | null = null
  if (hasSetupVote) {
    setup = (await contract.votesForProjectSetup(account)) ? 'approve' : 'reject'
  }

  const count = Number(milestoneCount)
  const perMilestone = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      if (!(await contract.hasVotedForMilestone(i, account))) return null
      const choice: VoteChoice = (await contract.votesForMilestone(i, account)) ? 'approve' : 'reject'
      return { index: i, choice }
    }),
  )

  const milestones: Record<number, VoteChoice> = {}
  for (const entry of perMilestone) {
    if (entry) milestones[entry.index] = entry.choice
  }

  return { setup, milestones }
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

/** Approvals needed to release a milestone: the smallest integer count that
 *  meets the majority `approvedCount/validators.length >= bps/10000`. */
function requiredApprovals(validatorCount: number, majorityBps: number): number {
  if (validatorCount <= 0) return 0
  return Math.ceil((validatorCount * majorityBps) / 10000)
}

/** Milestone presentation status, derived from the struct + lifecycle. Milestone
 *  funds are absolute on-chain (`amount`), so there is no allocation maths.
 *
 *  Voting model (matches the contract — voting is RETROSPECTIVE): `payout(k)`
 *  releases milestone k's funds AND opens the validator vote on milestone k;
 *  `currentMilestoneIndex` then points at k+1. Approving milestone k is what
 *  unlocks the payout of the NEXT milestone (approving the final one closes the
 *  project). So the milestone currently up for a vote is the LAST PAID one,
 *  `currentMilestoneIndex - 1`, while the project is in Payout and its vote is
 *  still open (`!votingFinished`) — that one is "in_progress". Any paid milestone
 *  whose vote has finished is "completed"; an unpaid milestone is "pending"
 *  (awaiting the previous milestone's approval, then an owner payout). */
function deriveMilestoneStatus(
  ms: ContractCampaign['milestones'][number],
  index: number,
  c: ContractCampaign,
): MilestoneStatus {
  const votableIndex = c.currentMilestoneIndex - 1
  const beingVotedOn =
    c.currentStatus === 'Payout' && index === votableIndex && ms.paid && !ms.votingFinished
  if (beingVotedOn) return 'in_progress'
  if (ms.paid) return 'completed'
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
      ? m.description.map((d) => (typeof d === 'string' ? d : String((d as { description?: unknown }).description ?? '')))
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
    // Authoritative lifecycle passed straight through — the view derives which
    // milestone the owner may pay / validators may vote on from these.
    contractStatus: c.currentStatus,
    currentMilestoneIndex: c.currentMilestoneIndex,
    // Failure/refund state, passed straight through for the failed-project UI.
    refundableBalance: c.refundableBalance,
    votingDeadline: c.votingDeadline,
    projectSetup: {
      approvedCount: c.projectSetup.approvedCount,
      rejectedCount: c.projectSetup.rejectedCount,
      votingFinished: c.projectSetup.votingFinished,
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
    // Every milestone, the first included, must then be approved before its funds
    // are released. The detail view also gates this on the presentation side
    // (`goalReached`).
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
      // Falls back to on-chain listing order (factory.getProjects(), i.e.
      // creation order — oldest first). `Project` has no created-at field to
      // sort by, so this isn't actually newest-first yet.
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
 * No key set (real wallet flow, e.g. MetaMask) → no-op.
 */
function assertLocalSigner(): void {
  // Covers BOTH inlined key sources: the persona key set at login and the
  // .env fallback — either one must never sign against a non-local chain.
  const key = currentDevKey()
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

/** A full, display-ready breakdown of what a transaction will cost — any value
 *  it transfers (0 for non-payable calls like votes) plus the estimated network
 *  (gas) fee, and their sum. Strings are formatted in the native coin, except
 *  `gasPriceGwei` (Gwei). Shown in the checkout overlay BEFORE the user signs. */
export interface TxGasEstimate {
  /** Value transferred with the tx (native coin), "0" for non-payable calls. */
  amount: string
  /** Estimated gas units the tx will consume, grouped for display, e.g. "68.912". */
  gasUnits: string
  /** Gas price used for the estimate (Gwei), e.g. "1.5". */
  gasPriceGwei: string
  /** Estimated gas fee = gasUnits × gasPrice, in the native coin. */
  gasFee: string
  /** amount + gasFee — the maximum this interaction costs the user. */
  total: string
  currency: string
}

/**
 * Turn a gas-units estimator + the current fee data into a display-ready cost
 * breakdown. `estimateGasUnits` runs a real EVM simulation of the exact call
 * (so contract preconditions are checked and the figure is accurate), and
 * throws with a revert reason if the call itself would fail. `valueWei` is any
 * coin sent with the tx (0 for non-payable calls like votes).
 */
async function buildGasEstimate(
  provider: ethers.Provider,
  estimateGasUnits: () => Promise<bigint>,
  valueWei: bigint,
): Promise<TxGasEstimate> {
  const [gasLimit, feeData] = await Promise.all([estimateGasUnits(), provider.getFeeData()])

  // EIP-1559 upper bound if available, else the legacy gas price. This is the
  // MAX fee; the actual cost is usually lower — the overlay says so.
  const gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n
  const gasCostWei = gasLimit * gasPriceWei

  return {
    amount: trimTrailingZeros(ethers.formatEther(valueWei)),
    gasUnits: gasLimit.toLocaleString('de-DE'),
    gasPriceGwei: trimTrailingZeros(ethers.formatUnits(gasPriceWei, 'gwei')),
    gasFee: trimTrailingZeros(ethers.formatEther(gasCostWei)),
    total: trimTrailingZeros(ethers.formatEther(valueWei + gasCostWei)),
    currency: NATIVE_CURRENCY,
  }
}

/**
 * Estimate the full cost of a donation WITHOUT sending it — used by the checkout
 * overlay. Same signer/RPC as the real donation, so the estimate matches what
 * will be sent. Throws (with a revert reason) if the donation itself would fail.
 */
export async function estimateDonationGas(projectId: string, amount: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  const meta = await fetchMetadataById(projectId)
  if (!meta) throw new Error('Projekt-Metadaten nicht gefunden.')

  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(meta.address, signer)
  const amountWei = ethers.parseEther(amount)
  return buildGasEstimate(provider, () => contract.donate.estimateGas({ value: amountWei }), amountWei)
}

/** Estimate the gas cost of a milestone vote (non-payable → no value, only gas). */
export async function estimateVoteMilestoneGas(
  projectAddress: string,
  milestoneIndex: number,
  approve: boolean,
): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.voteMilestone.estimateGas(milestoneIndex, approve), 0n)
}

/** Estimate the gas cost of a project-setup vote (non-payable → no value, only gas). */
export async function estimateVoteSetupGas(
  projectAddress: string,
  approve: boolean,
): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.voteProjectSetup.estimateGas(approve), 0n)
}

export interface DonationResult {
  /** Transaction hash once the donation is mined. */
  txHash: string
  /** Authoritative funding state AFTER the tx confirmed (a fresh chain read). */
  funding: Funding
}

/**
 * Make a donation to a project. `amount` is the validated decimal STRING the
 * user typed (never a float) — it is what `parseEther(amount)` converts to
 * wei on-chain. Donations are the native coin, so it's a single
 * value-bearing call (no ERC-20 approve step).
 */
export async function donate(projectId: string, amount: string): Promise<DonationResult> {
  assertLocalSigner()
  const meta = await fetchMetadataById(projectId)
  if (!meta) throw new Error('Projekt-Metadaten nicht gefunden.')

  const { signer } = await getBlockchainContext()
  const donationContract = Donation__factory.connect(meta.address, signer)

  // parse validated string as wei
  const valueInWei = ethers.parseEther(amount)

  // send transaction
  const tx = await donationContract.donate({ value: valueInWei })
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Transaktion fehlgeschlagen.')

  // Re-Read from the chain
  const updatedCampaign = await fetchCampaignByAddress(meta.address)
  if (!updatedCampaign) throw new Error('Fehler beim Aktualisieren der Daten.')

  return {
    txHash: tx.hash,
    funding: toFunding(updatedCampaign)
  }
}

export interface VoteResult {
  /** Transaction hash once the vote is mined. */
  txHash: string
}

/**
 * Cast a validator's vote on the milestone currently up for a vote — the LAST
 * PAID milestone, `currentMilestoneIndex - 1` (approve = true, reject = false).
 * In this contract a milestone is voted on AFTER it is paid; approving it
 * unlocks the payout of the NEXT milestone (approving the final one closes the
 * project). `milestoneIndex` must therefore be `currentMilestoneIndex - 1` — the
 * UI passes the array index of the milestone it renders as `in_progress`, which
 * is exactly that one. Validator-only and only while voting is open — the
 * contract enforces every precondition (isValidator, Payout phase, isLastMilestone
 * i.e. index == currentMilestoneIndex - 1, voting not finished, deadline not
 * passed, no duplicate vote); the UI only mirrors them. A single approval can
 * flip the project to Failed or unlock the next payout, so the milestone/status
 * are re-read from chain after the tx confirms rather than computed client-side.
 */
export interface VoteMilestoneResult {
  txHash: string
  currentStatus: string
  updatedMilestone: {
    approvedCount: number
    rejectedCount: number
    votingFinished: boolean
    paid: boolean
  }
}

export async function voteOnMilestone(
  projectAddress: string,
  milestoneIndex: number,
  approve: boolean
): Promise<VoteMilestoneResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const donationContract = Donation__factory.connect(projectAddress, signer)

  const tx = await donationContract.voteMilestone(milestoneIndex, approve)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Abstimmung auf der Blockchain ist fehlgeschlagen.')
  }

  // Authoritative re-read
  const [rawMilestones, rawStatus] = await Promise.all([
    donationContract.getMilestones(),
    donationContract.currentStatus()
  ])

  const milestone = rawMilestones[milestoneIndex]
  if (!milestone) throw new Error('Meilenstein nach Update nicht gefunden.')

  return {
    txHash: tx.hash,
    currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Funding',
    updatedMilestone: {
      approvedCount: Number(milestone.approvedCount),
      rejectedCount: Number(milestone.rejectedCount),
      votingFinished: milestone.votingFinished,
      paid: milestone.paid
    }
  }
}

export interface VoteSetupResult {
  txHash: string
  currentStatus: string
  projectSetup: { approvedCount: number; rejectedCount: number; votingFinished: boolean }
}

/**
 * Cast a validator's vote on the PROJECT SETUP (approve = true, reject = false) —
 * the one-time vote, while the campaign is in ToBeApproved, that confirms the
 * project may start. A 66.66% majority moves it to Payout (enabling the first
 * milestone payout); a blocking majority fails the project. Validator-only and
 * only while the setup vote is open — the contract enforces every precondition
 * (isValidator, ToBeApproved phase, voting not finished, deadline not passed, no
 * duplicate vote); the UI only mirrors them. State is re-read after the tx.
 */
export async function voteProjectSetup(
  projectAddress: string,
  approve: boolean,
): Promise<VoteSetupResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const donationContract = Donation__factory.connect(projectAddress, signer)

  const tx = await donationContract.voteProjectSetup(approve)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Abstimmung auf der Blockchain ist fehlgeschlagen.')
  }

  const [rawStatus, rawSetup] = await Promise.all([
    donationContract.currentStatus(),
    donationContract.projectSetup(),
  ])

  return {
    txHash: tx.hash,
    currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Funding',
    projectSetup: {
      approvedCount: Number(rawSetup.approvedCount),
      rejectedCount: Number(rawSetup.rejectedCount),
      votingFinished: rawSetup.votingFinished,
    },
  }
}

export interface PayoutResult {
  txHash: string
  /** Lifecycle after the tx (paying the final milestone's vote can later close
   *  the project; the payout itself keeps it in Payout). */
  currentStatus: string
  /** `currentMilestoneIndex` after the tx (incremented by one). */
  currentMilestoneIndex: number
}

/**
 * Owner-only: pay out the NEXT milestone (`currentMilestoneIndex`). This releases
 * that milestone's funds AND opens the validator vote on it — whose approval then
 * unlocks the following payout (approving the final milestone closes the project).
 * Only in the Payout phase, and only once the PREVIOUS milestone has been approved
 * (milestone 0 is gated instead by the project-setup vote). The contract enforces
 * every precondition (isOwner, onlyDuringPayout, isCurrentMilestone,
 * lastMilestoneApproved); the UI only mirrors them. Authoritative state is re-read
 * after the tx confirms.
 */
export async function payoutMilestone(
  projectAddress: string,
  milestoneIndex: number,
): Promise<PayoutResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const donationContract = Donation__factory.connect(projectAddress, signer)

  const tx = await donationContract.payout(milestoneIndex)
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Auszahlung auf der Blockchain ist fehlgeschlagen.')
  }

  const [rawStatus, curIndex] = await Promise.all([
    donationContract.currentStatus(),
    donationContract.currentMilestoneIndex(),
  ])

  return {
    txHash: tx.hash,
    currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Funding',
    currentMilestoneIndex: Number(curIndex),
  }
}

/** Estimate the gas cost of a milestone payout (non-payable → owner receives the
 *  funds, only pays gas). No value is sent, so amount = 0. */
export async function estimatePayoutMilestoneGas(
  projectAddress: string,
  milestoneIndex: number,
): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.payout.estimateGas(milestoneIndex), 0n)
}

export interface PayoutRestResult {
  txHash: string
  currentStatus: string
}

/**
 * Owner-only: pay out any funds left in the contract after the project is CLOSED
 * (all milestones released). A safety net for a residual balance; the contract
 * enforces `onlyWhenClosed` and isOwner. Authoritative status is re-read after.
 */
export async function payoutRest(projectAddress: string): Promise<PayoutRestResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)

  const tx = await contract.payoutRest()
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Auszahlung auf der Blockchain ist fehlgeschlagen.')
  }

  const rawStatus = await contract.currentStatus()
  return { txHash: tx.hash, currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Closed' }
}

/** Estimate the gas cost of the rest payout (non-payable → gas only, amount = 0). */
export async function estimatePayoutRestGas(projectAddress: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.payoutRest.estimateGas(), 0n)
}

/** The funds currently held by the contract (the amount `payoutRest` would send
 *  to the owner), as a clean decimal string in the native coin. Read-only. */
export async function getRemainingBalance(projectAddress: string): Promise<string> {
  const provider = getReadProvider()
  const contract = Donation__factory.connect(projectAddress, provider)
  return trimTrailingZeros(ethers.formatEther(await contract.getContractBalance()))
}

/** The connected account's on-chain native-coin balance (e.g. ETH), as a number.
 *  Read-only (no signer needed) — shown next to the account chip in the navbar. */
export async function getWalletBalance(account: string): Promise<number> {
  const provider = getReadProvider()
  return Number(ethers.formatEther(await provider.getBalance(account)))
}

// ── Failure & refunds (donor payback) ────────────────────────────────────────

export interface RefundInfo {
  /** The account's total contribution to this project (native coin); "0" if it
   *  never donated or has already been refunded. */
  donated: string
  /** The proportional share it can reclaim now from the refundable balance
   *  (native coin) — mirrors the contract's `donated × refundable / total`. */
  refundable: string
}

/**
 * Read the connected account's refund position for a (failed) project: how much
 * it donated and the share it can reclaim. Read-only. `donated === "0"` means
 * nothing to reclaim (never donated, or already refunded — the contract zeroes
 * the balance on refund).
 */
export async function getRefundInfo(projectAddress: string, account: string): Promise<RefundInfo> {
  const provider = getReadProvider()
  const contract = Donation__factory.connect(projectAddress, provider)
  const [donatedWei, refundableWei, totalWei] = await Promise.all([
    contract.donations(account),
    contract.refundableBalance(),
    contract.totalDonations(),
  ])
  const shareWei = totalWei > 0n ? (donatedWei * refundableWei) / totalWei : 0n
  return {
    donated: trimTrailingZeros(ethers.formatEther(donatedWei)),
    refundable: trimTrailingZeros(ethers.formatEther(shareWei)),
  }
}

export interface TxResult {
  txHash: string
  currentStatus: string
}

/**
 * Donor-only: reclaim this account's proportional share of a FAILED project's
 * funds (`refund()`). Only valid while `Failed`; the contract zeroes the donor's
 * balance so it can't be claimed twice. Authoritative status re-read after.
 */
export async function refund(projectAddress: string): Promise<TxResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  const tx = await contract.refund()
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Rückzahlung auf der Blockchain ist fehlgeschlagen.')
  }
  const rawStatus = await contract.currentStatus()
  return { txHash: tx.hash, currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Failed' }
}

/** Estimate the gas cost of a refund (donor receives funds, pays only gas). */
export async function estimateRefundGas(projectAddress: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.refund.estimateGas(), 0n)
}

/**
 * Flip a campaign whose funding period ended WITHOUT reaching the goal to Failed
 * (`markAsFailedFunding`) — which fixes the refundable balance so donors can
 * reclaim. Callable by anyone once the conditions hold (the contract checks
 * onlyDuringFunding, past `end`, goal not reached).
 */
export async function markAsFailedFunding(projectAddress: string): Promise<TxResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  const tx = await contract.markAsFailedFunding()
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Aktion auf der Blockchain ist fehlgeschlagen.')
  }
  const rawStatus = await contract.currentStatus()
  return { txHash: tx.hash, currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Failed' }
}

export async function estimateMarkAsFailedFundingGas(projectAddress: string): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.markAsFailedFunding.estimateGas(), 0n)
}

/**
 * Flip a campaign stuck in ToBeApproved/Payout whose vote deadline has passed to
 * Failed (`markAsFailedDueToExpiredVoting`), enabling refunds. Callable by anyone
 * once the deadline is exceeded (the contract enforces the conditions).
 */
export async function markAsFailedDueToExpiredVoting(projectAddress: string): Promise<TxResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  const tx = await contract.markAsFailedDueToExpiredVoting()
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) {
    throw new Error('Die Aktion auf der Blockchain ist fehlgeschlagen.')
  }
  const rawStatus = await contract.currentStatus()
  return { txHash: tx.hash, currentStatus: STATUS_MAP[Number(rawStatus)] ?? 'Failed' }
}

export async function estimateMarkAsFailedExpiredVotingGas(
  projectAddress: string,
): Promise<TxGasEstimate> {
  assertLocalSigner()
  const { signer, provider } = await getBlockchainContext()
  const contract = Donation__factory.connect(projectAddress, signer)
  return buildGasEstimate(provider, () => contract.markAsFailedDueToExpiredVoting.estimateGas(), 0n)
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
 * SECURITY GAP: the backend does not yet authorize this PUT — it should verify
 * the caller actually controls the project's `contractOwner` (e.g. a SIWE
 * session) before accepting. The frontend owner-check is UX only and must
 * never be the security boundary. Contract data is never sent here; it cannot
 * be changed off-chain.
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
    //validators: string[]
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
  address: string // Address of the newly deployed Donation contract
  txHash: string // Creation transaction hash
  id: string // Newly created project id
}

/**
 * Create a project. Available to ANY connected account (no role required) — the
 * creator becomes the on-chain owner. Two steps: deploy via the factory, then
 * store the off-chain metadata keyed by the new address. On-chain milestone
 * descriptions are left blank — display text is off-chain; the contract only
 * needs the array length to match milestoneAmounts. Note this does not yet
 * handle partial failure (contract deployed but the metadata POST failing).
 */
export async function createProject(payload: CreateProjectPayload): Promise<CreateProjectResult> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  const factory = DonationFactory__factory.connect(requireFactoryAddress(), signer)

  // convert into wei
  const milestoneWeiAmounts = payload.contract.milestoneAmounts.map((amt) => ethers.parseEther(amt))
  // description provided by source 2
  const blankDescriptions = payload.contract.milestoneAmounts.map(() => '')

  // deploy on chain
  const tx = await factory.createDonation(
    payload.contract.description,
    payload.contract.durationSeconds,
    milestoneWeiAmounts,
    blankDescriptions
  )
  const receipt = await tx.wait()
  if (!receipt || receipt.status === 0) throw new Error('Deployment auf der Blockchain fehlgeschlagen.')

  // extract new address from event logs
  let deployedAddress = ''
  const factoryInterface = DonationFactory__factory.createInterface()
  
  for (const log of receipt.logs) {
    try {
      const parsed = factoryInterface.parseLog(log)
      if (parsed && parsed.name === 'DonationContractCreated') {
        deployedAddress = parsed.args.donationContract
        break
      }
    } catch { continue }
  }

  if (!deployedAddress) throw new Error('Contract wurde aufgestellt, aber Adresse konnte nicht aus den Logs ermittelt werden.')

  // prepare milestone structure for backend
  const milestones = payload.metadata.milestones.map((m, i) => ({
    index: String(i + 1).padStart(2, '0'),
    title: m.title,
    description: m.description,
  }))

  const descriptionArray = typeof payload.metadata.description === 'string' 
    ? [payload.metadata.description] 
    : payload.metadata.description

  // POST to backend
  const response = await fetchJson<{ status: string; project_id: string }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: deployedAddress,
      title: payload.metadata.title,
      summary: payload.metadata.summary,
      category: payload.metadata.category,
      image: payload.metadata.image,
      description: descriptionArray, // as array
      verified: false,
      milestones,
      news: [],
    }),
  })

  for (const newsEntry of payload.metadata.news) {
    await createProjectNews(response.project_id, newsEntry)
  }

  return { 
    address: deployedAddress, 
    txHash: tx.hash, 
    id: response.project_id
  }
}

export interface WalletConnection {
  address: string
}

/**
 * Connect a wallet (the navbar / hero buttons).
 *
 */
export async function connectWallet(): Promise<WalletConnection> {
  assertLocalSigner()
  const { signer } = await getBlockchainContext()
  return { address: signer.address }
}
