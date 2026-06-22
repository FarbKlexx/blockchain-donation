// Merged domain model for the donation dApp. The projects service builds these
// by joining two sources — contract state (src/data/contractData.json) and
// backend metadata (src/data/projectMetadata.json); see types/sources.ts for
// the raw shapes. Later the same merge runs over on-chain reads + the backend
// API, keeping the UI untouched. See INTEGRATION.md for the per-field data origin.

export type ProjectStatus = 'laufend' | 'abgelaufen'

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending'

/** A validator/attester shown on the project detail page. */
export interface Validator {
  /** Display name, e.g. "VeriChain Audits". */
  name: string
  /** Shortened on-chain address, e.g. "0x12b...c34". */
  address: string
  /** Avatar image URL. */
  avatar: string
  /** Uptime / reliability score in percent (0–100). */
  uptime: number
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
  /** How many validators have confirmed this milestone so far. */
  confirmations: number
  /** Total validators that must confirm before funds are released. */
  totalValidators: number
}

/** A project update entry shown under the "Neuigkeiten" tab. */
export interface NewsEntry {
  /** ISO date string (YYYY-MM-DD). */
  date: string
  title: string
  body: string
}

/** Smart-contract info shown in the sidebar. */
export interface ContractInfo {
  /** Full on-chain contract address (the view shortens it for display). */
  address: string
  /** Explorer page URL — derived by the frontend from `address`, not stored. */
  explorerUrl: string
  /** Label for the explorer link, e.g. "View on Polygonscan". */
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
  /** Whole days remaining in the campaign. */
  daysLeft: number
  /** Compact countdown label used on cards, e.g. "11d, 6 Std.". */
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
  /** Whether the smart contract has been verified. */
  verified: boolean
  /** ISO 4217-ish currency code shown next to amounts, e.g. "USDC". */
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
