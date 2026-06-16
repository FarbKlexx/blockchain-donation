<script setup lang="ts">
import type { ContractInfo } from '@/types/project'
import AppIcon from '@/components/ui/AppIcon.vue'

defineProps<{ contract: ContractInfo }>()
</script>

<template>
  <article class="sc card">
    <h2 class="sc__title">Smart Contract Details</h2>
    <div class="sc__rows">
      <div class="sc__row">
        <span class="sc__icon"><AppIcon name="hash" :size="16" /></span>
        <div class="sc__text">
          <span class="sc__caption">Contract Adresse</span>
          <span class="sc__value">{{ contract.address }}</span>
        </div>
      </div>
      <div class="sc__row">
        <span class="sc__icon"><AppIcon name="external-link" :size="16" /></span>
        <div class="sc__text">
          <span class="sc__caption">Explorer</span>
          <!-- INTEGRATION POINT: explorer URL comes from contract metadata. -->
          <a class="sc__link" :href="contract.explorerUrl" target="_blank" rel="noopener">
            {{ contract.explorerLabel }}
          </a>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.sc__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.sc__rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sc__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sc__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-icon-dark);
  color: var(--bd-surface);
  flex-shrink: 0;
}

.sc__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sc__caption {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.sc__value {
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-black);
}

.sc__link {
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-green);
  text-decoration: underline;
}
</style>
