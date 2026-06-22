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
}>()

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
      <!-- Validator confirmations are only shown once voting has opened
           (funding goal reached). Before that, the milestone is locked. -->
      <div v-if="votingOpen" class="ms__confirm">
        <div class="ms__avatars">
          <span v-for="(a, i) in avatars" :key="i" class="ms__avatar" :title="a.address">
            <span class="ms__avatar-img" :style="{ background: a.gradient }" />
            <span v-if="a.confirmed" class="ms__check"><AppIcon name="check" :size="8" /></span>
          </span>
        </div>
        <span class="ms__confirm-text">
          {{ milestone.confirmations }}/{{ milestone.totalValidators }} Validatoren bestätigt
        </span>
      </div>
      <div v-else class="ms__locked">
        <AppIcon name="lock" :size="14" />
        <span>Abstimmung startet nach Zielerreichung</span>
      </div>
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
</style>
