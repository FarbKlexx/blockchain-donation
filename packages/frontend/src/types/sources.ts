// The two RAW data sources, kept separate so each maps 1:1 onto a future API.
// projectsService merges them into the `Project` UI model (see types/project.ts).
//
//   ContractCampaign  ← SOURCE 1: smart contract (ethers.js reads)
//   ProjectMetadata   ← SOURCE 2: backend REST API (off-chain content)
//
// Join keys: id (campaign ↔ metadata), index (milestones), address (validators).

import type { MilestoneStatus, ProjectStatus } from './project'

// ── Source 1: on-chain ──────────────────────────────────────────────────────

/** Milestone release state held by the escrow contract. */
export interface ContractMilestone {
  index: string
  /** Funds escrowed for this milestone, in the campaign currency. */
  allocated: number
  status: MilestoneStatus
  confirmations: number
  totalValidators: number
}

/** A validator participating in a campaign — just its on-chain address. */
export interface ContractValidator {
  address: string
}

/** A campaign as read from the contract — financials + release state, no prose. */
export interface ContractCampaign {
  id: string
  /** Full deployed contract address (on-chain identity). The frontend derives
   *  both the display-short form and the explorer URL from this. */
  address: string
  /** Token the escrow accepts, e.g. "USDC". */
  currency: string
  verified: boolean
  status: ProjectStatus
  raised: number
  goal: number
  donors: number
  daysLeft: number
  timeLeftShort: string
  milestones: ContractMilestone[]
  validators: ContractValidator[]
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
  id: string
  title: string
  summary: string
  description: string[]
  image: string
  category: string
  milestones: MetadataMilestone[]
  news: MetadataNews[]
}
