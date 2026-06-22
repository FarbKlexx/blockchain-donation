<script setup lang="ts">
import type { Validator } from '@/types/project'
import { addressGradient, shortenAddress } from '@/utils/address'

defineProps<{ validators: Validator[] }>()
</script>

<template>
  <article class="val card">
    <div class="val__head">
      <h2 class="val__title">Validatoren</h2>
    </div>
    <div class="val__list">
      <!-- INTEGRATION POINT: the validator set comes from on-chain data.
           Anonymous — identified only by address (no names / activity / user system). -->
      <div v-for="v in validators" :key="v.address" class="val__item">
        <span class="val__avatar" :style="{ background: addressGradient(v.address) }" aria-hidden="true" />
        <span class="val__address" :title="v.address">{{ shortenAddress(v.address) }}</span>
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

.val__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.val__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.val__item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.val__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bd-grey);
  flex-shrink: 0;
}

.val__address {
  flex: 1 1 0;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-black);
  white-space: nowrap;
}
</style>
