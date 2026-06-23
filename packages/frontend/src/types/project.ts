// Merged domain model for the donation dApp. The projects service builds these
// by joining two sources — contract state (src/data/contractData.json) and
// backend metadata (src/data/projectMetadata.json); see types/sources.ts for
// the raw shapes. Later the same merge runs over on-chain reads + the backend
// API, keeping the UI untouched. See INTEGRATION.md for the per-field data origin.

export type ProjectStatus = 'laufend' | 'abgelaufen'

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending'

/** A validator/attester shown on the project detail page. Anonymous: there is
 *  no user system and no activity tracking, so a validator IS its on-chain
 *  address (the view derives a deterministic identicon + a shortened label). */
export interface Validator {
  /** Full on-chain validator address. */
  address: string
}

/** A funding milestone whose release is gated by validator confirmations. */
export interface Milestone {
  /** Ordinal label as shown in the badge, e.g. "01". */
  index: string
  title: string
  description: string
  /** Funds allocated to this milestone, in the project currency. */
  allocated: number
  status: MilestoneStatus
  /** How many validators have approved this milestone so far (`approvedCount`). */
  confirmations: number
  /** Size of the validator set (denominator for the confirmation display). */
  totalValidators: number
  /** Approvals needed to release funds — a 66.66% majority of the validator set,
   *  derived from the contract's `neededVoteMajorityInBps` (NOT every validator). */
  requiredApprovals: number
}

/** A project update entry shown under the "Neuigkeiten" tab. */
export interface NewsEntry {
  /** ISO date string (YYYY-MM-DD). */
  date: string
  title: string
  body: string
  /** Image URLs for this entry (off-chain metadata). Zero → no media; one →
   *  shown inline; multiple → a slider. */
  images: string[]
}

/** Smart-contract info shown in the sidebar. */
export interface ContractInfo {
  /** Full on-chain contract address (the view shortens it for display). */
  address: string
  /** Explorer page URL — derived by the frontend from `address`, not stored. */
  explorerUrl: string
  /** Label for the explorer link, e.g. "View on Etherscan". */
  explorerLabel: string
}

/** Aggregated funding figures for a project. */
export interface Funding {
  /** Amount raised so far, in `currency`. */
  raised: number
  /** Funding goal, in `currency`. */
  goal: number
  /** Number of unique donors. */
  donors: number
  /** Whole days remaining — DERIVED from the contract's `end` timestamp. */
  daysLeft: number
  /** Compact countdown for cards, e.g. "11d, 6 Std." — DERIVED from `end`. */
  timeLeftShort: string
}

export interface Project {
  /** URL-safe identifier used in routes (/projects/:id). */
  id: string
  title: string
  /** Short blurb shown on the overview card. */
  summary: string
  /** Long-form paragraphs shown under the "Beschreibung" tab. */
  description: string[]
  /** Cover image URL. */
  image: string
  /** Category/label badge, e.g. "Fairer Handel & Bio". */
  category: string
  /** Whether the project is "verified" — a backend assertion (not on-chain). */
  verified: boolean
  /** Currency shown next to amounts. The chain's native coin (donations are
   *  `msg.value`, no ERC-20 token), so it's the same for every campaign. */
  currency: string
  status: ProjectStatus
  funding: Funding
  contract: ContractInfo
  validators: Validator[]
  milestones: Milestone[]
  news: NewsEntry[]
}

export type ProjectFilter = ProjectStatus | 'alle'

export type ProjectSort = 'neuste' | 'fortschritt' | 'endet_bald'
