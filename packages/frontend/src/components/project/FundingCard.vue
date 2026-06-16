<script setup lang="ts">
import { computed } from 'vue'
import type { Project } from '@/types/project'
import { formatAmount, percentFunded } from '@/utils/format'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = defineProps<{ project: Project }>()

const percent = computed(() =>
  percentFunded(props.project.funding.raised, props.project.funding.goal),
)
</script>

<template>
  <article class="funding card">
    <div class="funding__head">
      <p class="funding__label">Gesammelte Mittel</p>
      <p class="funding__amount">
        <span class="funding__value">{{ formatAmount(project.funding.raised) }}</span>
        <span class="funding__currency">{{ project.currency }}</span>
      </p>
      <p class="funding__goal">
        von {{ formatAmount(project.funding.goal) }} {{ project.currency }} Ziel erreicht
      </p>
    </div>

    <ProgressBar :value="percent" variant="green" />

    <div class="funding__stats">
      <div class="funding__stat">
        <span class="funding__stat-value">{{ percent }}%</span>
        <span class="funding__stat-label">Finanziert</span>
      </div>
      <div class="funding__stat funding__stat--center">
        <span class="funding__stat-value">{{ project.funding.donors }}</span>
        <span class="funding__stat-label">Donoren</span>
      </div>
      <div class="funding__stat funding__stat--end">
        <span class="funding__stat-value">{{ project.funding.daysLeft }}</span>
        <span class="funding__stat-label">Tage übrig</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 32px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.funding__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.funding__label {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--bd-grey-text);
}

.funding__amount {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.funding__value {
  font-size: 36px;
  font-weight: 800;
  color: var(--bd-black);
}

.funding__currency {
  font-size: 18px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.funding__goal {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.funding__stats {
  display: flex;
  justify-content: space-between;
}

.funding__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.funding__stat--center {
  align-items: center;
}

.funding__stat--end {
  align-items: flex-end;
}

.funding__stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--bd-black);
}

.funding__stat-label {
  font-size: 12px;
  color: var(--bd-grey-text);
}
</style>
