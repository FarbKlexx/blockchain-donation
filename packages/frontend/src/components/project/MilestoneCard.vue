<script setup lang="ts">
import { computed } from 'vue'
import type { Milestone, MilestoneStatus, Validator } from '@/types/project'
import { formatAmount } from '@/utils/format'
import { addressGradient } from '@/utils/address'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{
  milestone: Milestone
  validators: Validator[]
  currency: string
  /** Whether the funding goal is reached. Validators can only vote on
   *  milestones AFTER the goal is met — until then this card stays locked,
   *  so it can never display confirmations that the concept forbids. */
  votingOpen: boolean
  /** The connected account may vote on THIS milestone (is a validator here, the
   *  milestone is the current open one, and they haven't voted yet). UI gate
   *  only — the contract re-checks every precondition. */
  canVote?: boolean
  /** This account's already-cast vote on this milestone, if any (session-local
   *  in the prototype; from chain once wired). */
  myVote?: 'approve' | 'reject' | null
  /** A vote tx for this milestone is in flight. */
  voting?: boolean
  /** Error from the last vote attempt on this milestone (e.g. the local-signer
   *  guard, or a revert once wired) — shown inline. */
  voteError?: string | null
  /** The connected account is the owner and may pay out THIS milestone now (it
   *  is the current one and the previous milestone is approved). UI gate only —
   *  the contract re-checks isOwner / phase / lastMilestoneApproved. */
  canPayout?: boolean
  /** A payout tx for this milestone is in flight. */
  payingOut?: boolean
  /** Error from the last payout attempt on this milestone — shown inline. */
  payoutError?: string | null
}>()

const emit = defineEmits<{ vote: [approve: boolean]; payout: [] }>()

const statusMeta: Record<MilestoneStatus, { label: string; variant: string }> = {
  completed: { label: 'Abgeschlossen', variant: 'green' },
  in_progress: { label: 'In Bearbeitung', variant: 'amber' },
  pending: { label: 'Ausstehend', variant: 'neutral' },
}

const status = computed(() => statusMeta[props.milestone.status])

// One identicon per required validator; the first `confirmations` are checked.
const avatars = computed(() =>
  props.validators.slice(0, props.milestone.totalValidators).map((v, i) => ({
    address: v.address,
    gradient: addressGradient(v.address),
    confirmed: i < props.milestone.confirmations,
  })),
)
</script>

<template>
  <article class="ms">
    <div class="ms__head">
      <div class="ms__title-group">
        <span class="ms__number">{{ milestone.index }}</span>
        <h3 class="ms__title">{{ milestone.title }}</h3>
      </div>
      <span v-if="votingOpen" class="ms__badge" :class="`ms__badge--${status.variant}`">
        {{ status.label }}
      </span>
      <span v-else class="ms__badge ms__badge--locked">
        <AppIcon name="lock" :size="11" />
        Gesperrt
      </span>
    </div>

    <p class="ms__description">{{ milestone.description }}</p>

    <div class="ms__footer">
      <div class="ms__funds">
        <span class="ms__funds-label">Zugeordnete Mittel</span>
        <span class="ms__funds-value">{{ formatAmount(milestone.allocated) }} {{ currency }}</span>
      </div>
      <!-- The confirmation/voting area mirrors the contract lifecycle and is only
           meaningful once the funding goal is reached (votingOpen). -->
      <template v-if="votingOpen">
        <!-- Funds released — a completed milestone is not re-voted. -->
        <div v-if="milestone.status === 'completed'" class="ms__released">
          <AppIcon name="check" :size="14" />
          <span>Freigegeben</span>
        </div>
        <!-- Validators are voting on this (already-paid) milestone right now;
             their approval unlocks the payout of the NEXT milestone. -->
        <div v-else-if="milestone.status === 'in_progress'" class="ms__confirm">
          <div class="ms__avatars">
            <span v-for="(a, i) in avatars" :key="i" class="ms__avatar" :title="a.address">
              <span class="ms__avatar-img" :style="{ background: a.gradient }" />
              <span v-if="a.confirmed" class="ms__check"><AppIcon name="check" :size="8" /></span>
            </span>
          </div>
          <span class="ms__confirm-text">
            {{ milestone.confirmations }}/{{ milestone.totalValidators }} bestätigt
            · {{ milestone.requiredApprovals }} für Freigabe nötig
          </span>
        </div>
        <!-- Not yet up for a vote — an earlier milestone must be approved and
             released first. -->
        <div v-else class="ms__locked">
          <AppIcon name="lock" :size="14" />
          <span>Noch nicht zur Abstimmung freigegeben</span>
        </div>
      </template>
      <div v-else class="ms__locked">
        <AppIcon name="lock" :size="14" />
        <span>Abstimmung startet nach Zielerreichung</span>
      </div>
    </div>

    <!-- Owner: release this milestone's funds. Paying it also opens the
         validator vote on it, which (once approved) unlocks the next payout.
         Sends the real payout() tx — see services/projectsService.payoutMilestone. -->
    <div v-if="canPayout" class="ms__payout">
      <span class="ms__payout-label">Bereit zur Auszahlung</span>
      <button
        type="button"
        class="ms__payout-btn"
        :disabled="payingOut"
        @click="emit('payout')"
      >
        {{ payingOut ? 'Zahle aus …' : 'Meilenstein auszahlen' }}
      </button>
      <span v-if="payoutError" class="ms__payout-error" role="alert">{{ payoutError }}</span>
    </div>

    <!-- Validator voting on the current milestone. The buttons mirror the
         contract's voteMilestone gate and send the real vote tx (see
         services/projectsService.voteOnMilestone). -->
    <div v-if="canVote || myVote" class="ms__vote">
      <template v-if="myVote">
        <span class="ms__voted" :class="`ms__voted--${myVote === 'approve' ? 'yes' : 'no'}`">
          <AppIcon v-if="myVote === 'approve'" name="check" :size="13" />
          {{ myVote === 'approve' ? 'Du hast zugestimmt' : 'Du hast abgelehnt' }}
        </span>
      </template>
      <template v-else>
        <span class="ms__vote-label">Als Validator abstimmen</span>
        <div class="ms__vote-actions">
          <button
            type="button"
            class="ms__vote-btn ms__vote-btn--yes"
            :disabled="voting"
            @click="emit('vote', true)"
          >
            <AppIcon name="check" :size="14" />
            Zustimmen
          </button>
          <button
            type="button"
            class="ms__vote-btn ms__vote-btn--no"
            :disabled="voting"
            @click="emit('vote', false)"
          >
            Ablehnen
          </button>
        </div>
        <span v-if="voteError" class="ms__vote-error" role="alert">{{ voteError }}</span>
      </template>
    </div>
  </article>
</template>

<style scoped>
.ms {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  box-shadow: var(--bd-shadow-card);
}

.ms__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ms__title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ms__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-grey);
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
  flex-shrink: 0;
}

.ms__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--bd-black);
}

.ms__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--bd-radius-pill);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid transparent;
}

.ms__badge--green {
  color: var(--bd-green);
  background: var(--bd-green-tint);
  border-color: var(--bd-green);
}

.ms__badge--amber {
  color: var(--bd-amber);
  background: var(--bd-amber-tint);
  border-color: var(--bd-amber);
}

.ms__badge--neutral {
  color: var(--bd-neutral);
  background: var(--bd-neutral-tint);
  border-color: var(--bd-neutral);
}

.ms__badge--locked {
  color: var(--bd-grey-text);
  background: var(--bd-grey);
  border-color: var(--bd-stroke);
}

.ms__description {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.ms__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ms__funds {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ms__funds-label {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--bd-grey-text);
}

.ms__funds-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--bd-black);
}

.ms__confirm {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.ms__avatars {
  display: flex;
}

.ms__avatar {
  position: relative;
  width: 28px;
  height: 28px;
  margin-left: -8px;
}

.ms__avatar:first-child {
  margin-left: 0;
}

.ms__avatar-img {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--bd-surface);
  background: var(--bd-grey);
}

.ms__check {
  position: absolute;
  top: -2px;
  right: -2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 6px;
  background: var(--bd-green);
  color: #fff;
  border: 1.5px solid var(--bd-surface);
}

.ms__confirm-text {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.ms__locked {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--bd-grey-text);
}

.ms__released {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-green);
}

/* Validator voting */
.ms__vote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--bd-divider);
}

.ms__vote-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--bd-black);
}

.ms__vote-actions {
  display: flex;
  gap: 8px;
}

.ms__vote-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
}

.ms__vote-btn:disabled {
  opacity: 0.6;
}

.ms__vote-btn--yes {
  color: #fff;
  background: var(--bd-green);
}

.ms__vote-btn--no {
  color: var(--bd-grey-text);
  background: var(--bd-surface);
  border-color: var(--bd-stroke);
}

.ms__vote-btn--no:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

.ms__voted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}

.ms__voted--yes {
  color: var(--bd-green);
}

.ms__voted--no {
  color: var(--bd-grey-text);
}

.ms__vote-note {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.ms__vote-error {
  flex-basis: 100%;
  font-size: 13px;
  color: #dc2626;
}

/* Owner payout */
.ms__payout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--bd-divider);
}

.ms__payout-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--bd-black);
}

.ms__payout-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
  color: var(--bd-surface);
  background: var(--bd-black);
}

.ms__payout-btn:disabled {
  opacity: 0.6;
}

.ms__payout-error {
  flex-basis: 100%;
  font-size: 13px;
  color: #dc2626;
}
</style>
