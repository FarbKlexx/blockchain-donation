<script setup lang="ts">
import AppIcon from './AppIcon.vue'
</script>

<template>
  <span class="logo">
    <span class="logo__mark"><AppIcon name="heart" :size="18" /></span>
    <span class="logo__text">Blockchain Donation</span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.logo__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bd-black);
  color: var(--bd-surface);
}

.logo__mark :deep(svg path) {
  fill: currentColor;
  stroke: none;
}

.logo__text {
  font-weight: 800;
  font-size: 17px;
  color: var(--bd-black);
  letter-spacing: -0.2px;
}
</style>
