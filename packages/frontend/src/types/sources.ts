// The two RAW data sources, kept separate so each maps 1:1 onto a future API.
// projectsService merges them into the `Project` UI model (see types/project.ts).
//
//   ContractCampaign  ← SOURCE 1: smart contract (ethers.js reads)
//   ProjectMetadata   ← SOURCE 2: backend REST API (off-chain content)
//
// Join key: `address` (the on-chain contract address is the unique project id;
// the backend stores it too). Milestones join by array position (index 0..n-1).
//
// These mirror the actual `Donation` / `DonationFactory` contracts. Field names
// match the contract's public getters 1:1, so a future ethers read maps straight
// onto these shapes with no translation. The contract stores only primitives —
// anything the UI shows that looks computed (days left, milestone "status",
// approvals-needed) is DERIVED in projectsService, NOT stored on-chain.
//
// TEXT LIVES OFF-CHAIN (by design): the contract ALSO stores a project
// `description` (string) and a per-milestone `description` (string) ON-CHAIN, but
// the frontend deliberately does NOT read them — ALL human-readable text (the
// project description, milestone titles and descriptions) comes from the
// off-chain metadata below. Those on-chain string getters are therefore
// intentionally omitted from the Source-1 shapes here.

// ── Source 1: on-chain (mirrors Donation.sol) ────────────────────────────────

/** On-chain campaign lifecycle — the contract's `Status` enum (read as a uint8
 *  index 0..3 via ethers, mapped to this string in projectsService). */
export type ContractStatus = 'Funding' | 'ToBeApproved' | 'Payout' | 'Failed' | 'Closed'

/** Per-milestone state — the on-chain `Milestone` struct (one entry per index
 *  0..milestoneCount-1, in order), minus the on-chain `description` string the
 *  frontend ignores (see the header note). No "status" string is stored on-chain;
 *  it is derived (see projectsService.deriveMilestoneStatus).
 *
 *  VOTING MODEL (important): once funding succeeds, EVERY milestone — including
 *  the first — must be APPROVED by the validators before its funds are released.
 *  A milestone's `approvedCount`/`rejectedCount` are the votes cast on THAT
 *  milestone while it is up for a vote (before it is paid), and their approval is
 *  what releases ITS OWN payout. The milestone being voted on is always the one
 *  to be paid next, `currentMilestoneIndex` (still unpaid). */
export interface ContractMilestone {
  /** Absolute funds allocated to this milestone, native coin (`amount`). All
   *  milestone amounts sum to `donationGoal`. */
  amount: number
  /** Validators who voted YES on this milestone (`approvedCount`). */
  approvedCount: number
  /** Validators who voted NO on this milestone (`rejectedCount`). */
  rejectedCount: number
  /** The vote on this milestone has been decided — approved or rejected
   *  (`votingFinished`). Once true the result is final. */
  votingFinished: boolean
  /** Whether this milestone's funds have been released (`paid`). */
  paid: boolean
}

/** A campaign as read from its `Donation` contract — financials + release state,
 *  no prose. `address` comes from `DonationFactory.getProjects()`. */
export interface ContractCampaign {
  // Field names below match the contract's public getters 1:1 (no renaming),
  // so a future ethers read maps straight onto this shape with no translation.
  /** Deployed contract address — the on-chain identity AND the join key to the
   *  backend metadata. Not a stored variable (`address(this)` / the factory
   *  list entry); the frontend derives the short form + explorer URL. */
  address: string
  /** Campaign owner (`contractOwner`). */
  contractOwner: string
  /** Funding goal in the chain's native coin (`donationGoal`). Equals the SUM of
   *  all milestone `amount`s — the contract computes it from them at
   *  construction; there is no independent goal variable to set. */
  donationGoal: number
  /** Total raised so far in native coin (`totalDonations`). */
  totalDonations: number
  /** Donor addresses (`getDonors()` — the key set of the on-chain `donations`
   *  mapping, which can't be enumerated directly). The displayed donor COUNT is
   *  DERIVED as `donors.length` — there is no count field on-chain. Per-donor
   *  amounts remain available via `donations(addr)`. */
  donors: string[]
  /** Campaign start, Unix seconds (`start`). */
  start: number
  /** Campaign end, Unix seconds (`end`). "Days left" / "time left" are DERIVED
   *  from this — the contract stores only the timestamps. */
  end: number
  /** Lifecycle state (`currentStatus`). The UI's laufend/abgelaufen is derived. */
  currentStatus: ContractStatus
  /** Index of the milestone to be paid NEXT (`currentMilestoneIndex`). The
   *  milestone currently up for a vote is the LAST PAID one,
   *  `currentMilestoneIndex - 1`: a milestone is voted on AFTER it is paid, and
   *  its approval unlocks THIS one's payout. */
  currentMilestoneIndex: number
  /** Project-setup approval vote (`projectSetup`) — validators' vote to move the
   *  campaign from ToBeApproved into Payout (must pass before ANY milestone is
   *  paid). `approvedCount`/`rejectedCount` are votes cast; `votingFinished` once
   *  decided. Only meaningful while `currentStatus === 'ToBeApproved'`. */
  projectSetup: {
    approvedCount: number
    rejectedCount: number
    votingFinished: boolean
  }
  /** Funds released across all milestones so far (`totalPayout`). */
  totalPayout: number
  /** Unix seconds until which the open milestone vote runs
   *  (`votingDeadline`). 0 = no vote currently open; a future value =
   *  validators may still vote on `currentMilestoneIndex`. */
  votingDeadline: number
  /** Amount set aside for proportional donor refunds, fixed at the moment the
   *  project fails (`refundableBalance`). 0 unless `currentStatus === 'Failed'`. */
  refundableBalance: number
  /** Validator addresses (`getValidators()`). Anonymous — address is the only
   *  identity. */
  validators: string[]
  /** Milestone state, ordered by index 0..milestoneCount-1 (`getMilestones()`). */
  milestones: ContractMilestone[]
}

// The approval threshold (66.66% of the validator set) is the contract's
// `neededVoteMajorityInBps` — but that is a non-public `constant`, so it has NO
// getter and cannot be read on-chain. It therefore is NOT a campaign field here;
// projectsService mirrors the literal as a frontend constant.

// ── Source 2: off-chain backend ──────────────────────────────────────────────

export interface MetadataMilestone {
  index: string
  title: string
  description: string
}

export interface MetadataNews {
  date: string
  title: string
  body: string
  /** Image URLs for this entry. Multiple → rendered as a slider in the UI. */
  images: string[]
}

/** Human-readable content for a project, served by the backend. */
// Note: no explorer URL here — the frontend derives it from the on-chain
// address (utils/address.ts). No validators here either — they are anonymous
// on-chain addresses (no user system), so they come purely from the contract.
// All display text lives here, including the project description and the
// milestone titles/descriptions, even though the contract also stores a
// description on-chain (which the frontend ignores — see types/sources header).
export interface ProjectMetadata {
  /** Deployed contract address — the join key onto the on-chain campaign. The
   *  backend stores it as the project's unique identifier. */
  address: string
  /** Human-readable slug used in routes (/projects/:id). A backend convenience;
   *  the on-chain identity is `address`. */
  id: string
  title: string
  summary: string
  description: string[]
  image: string
  category: string
  /** Whether the contract/project is "verified". This is a backend assertion,
   *  NOT on-chain state — there is no `verified` field in the contract. */
  verified: boolean
  milestones: MetadataMilestone[]
  news: MetadataNews[]
}
