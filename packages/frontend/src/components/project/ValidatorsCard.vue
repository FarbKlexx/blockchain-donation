<script setup lang="ts">
import type { Validator } from '@/types/project'

defineProps<{ validators: Validator[] }>()
</script>

<template>
  <article class="val card">
    <div class="val__head">
      <h2 class="val__title">Validatoren</h2>
      <span class="val__status">Aktiv</span>
    </div>
    <div class="val__list">
      <!-- INTEGRATION POINT: validator set + uptime come from on-chain attestations. -->
      <div v-for="v in validators" :key="v.address" class="val__item">
        <img class="val__avatar" :src="v.avatar" :alt="v.name" loading="lazy" />
        <div class="val__text">
          <span class="val__name">{{ v.name }}</span>
          <span class="val__address">{{ v.address }}</span>
        </div>
        <span class="val__uptime">{{ v.uptime }}%</span>
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

.val__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.val__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.val__status {
  font-size: 12px;
  font-weight: 700;
  color: var(--bd-green);
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
  object-fit: cover;
  background: var(--bd-grey);
  flex-shrink: 0;
}

.val__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
}

.val__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-black);
}

.val__address {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.val__uptime {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bd-green-tint);
  color: var(--bd-green);
  font-size: 10px;
  font-weight: 800;
}
</style>
