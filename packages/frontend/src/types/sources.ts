// The two RAW data sources, kept separate so each maps 1:1 onto a future API.
// projectsService merges them into the `Project` UI model (see types/project.ts).
//
//   ContractCampaign  ← SOURCE 1: smart contract (ethers.js reads)
//   ProjectMetadata   ← SOURCE 2: backend REST API (off-chain content)
//
// Join key: `address` (the on-chain contract address is the unique project id;
// the backend stores it too). Milestones join by array position (index 0..n-1).
//
// These mirror the actual `Donation` / `DonationFactory` contracts. Every field
// below is a real on-chain getter — the contract does NOT store derived values
// like "days left", milestone "allocated amounts" or a milestone "status"
// string. Those are computed in projectsService from the raw fields here.

// ── Source 1: on-chain (mirrors Donation.sol) ────────────────────────────────

/** On-chain campaign lifecycle — the contract's `Status` enum. */
export type ContractStatus = 'Funding' | 'Payout' | 'Failed' | 'Closed'

/** Per-milestone state, exactly the `Milestone` struct (one entry per index
 *  0..milestoneCount-1, in order). No absolute amount and no "status" string is
 *  stored on-chain — both are derived (see projectsService). */
export interface ContractMilestone {
  /** Share of the raised total in basis points; all milestones sum to 10000.
   *  The payout amount is `totalDonations * percentage / 10000`. */
  percentage: number
  /** Owner has opened this milestone for validator voting (`readyToBeApproved`). */
  readyToBeApproved: boolean
  /** Number of validators who voted YES (`approvedCount`). */
  approvedCount: number
  /** Number of validators who voted NO (`rejectedCount`). */
  rejectedCount: number
  /** Whether this milestone's funds have been released (`paid`). */
  paid: boolean
}

/** A campaign as read from its `Donation` contract — financials + release state,
 *  no prose. `address` comes from `DonationFactory.getDonations()`. */
export interface ContractCampaign {
  // Field names below match the contract's public getters 1:1 (no renaming),
  // so a future ethers read maps straight onto this shape with no translation.
  /** Deployed contract address — the on-chain identity AND the join key to the
   *  backend metadata. Not a stored variable (`address(this)` / the factory
   *  list entry); the frontend derives the short form + explorer URL. */
  address: string
  /** Campaign owner (`contractOwner`). */
  contractOwner: string
  /** Funding goal in the chain's native coin (`donationGoal`). */
  donationGoal: number
  /** Total raised so far in native coin (`totalDonations`). */
  totalDonations: number
  /** Donor addresses — the key set of the on-chain `donations` mapping (read via
   *  the list getter the contract exposes; a mapping can't be enumerated). The
   *  displayed donor COUNT is DERIVED as `donors.length` — there is no count
   *  field on-chain. Per-donor amounts remain available via `donations(addr)`. */
  donors: string[]
  /** Campaign start, Unix seconds (`start`). */
  start: number
  /** Campaign end, Unix seconds (`end`). "Days left" / "time left" are DERIVED
   *  from this — the contract stores only the timestamps. */
  end: number
  /** Lifecycle state (`currentStatus`). The UI's laufend/abgelaufen is derived. */
  currentStatus: ContractStatus
  /** Index of the milestone currently being voted on / paid (`currentMilestone`). */
  currentMilestone: number
  /** Funds released across all milestones so far (`totalPayout`). */
  totalPayout: number
  /** Approval threshold in basis points (`neededVoteMajorityInBps`); 6666 = 66.66%.
   *  A milestone releases once `approvedCount / validators.length >= this`. */
  neededVoteMajorityInBps: number
  /** Validator addresses (`validators`). Anonymous — address is the only identity. */
  validators: string[]
  /** Milestone state, ordered by index 0..milestoneCount-1. */
  milestones: ContractMilestone[]
}

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
}

/** Human-readable content for a project, served by the backend. */
// Note: no explorer URL here — the frontend derives it from the on-chain
// address (utils/address.ts). No validators here either — they are anonymous
// on-chain addresses (no user system), so they come purely from the contract.
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
