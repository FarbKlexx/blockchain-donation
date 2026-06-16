<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Fill percentage, 0–100. */
    value: number
    variant?: 'black' | 'green'
  }>(),
  { variant: 'black' },
)

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
const fillColor = computed(() =>
  props.variant === 'green' ? 'var(--bd-green)' : 'var(--bd-black)',
)
// Decorative tick marks (matches the dotted markers in the Figma design).
const ticks = [25, 50, 75]
</script>

<template>
  <div
    class="bar"
    role="progressbar"
    :aria-valuenow="clamped"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="bar__fill" :style="{ width: clamped + '%', background: fillColor }" />
    <span v-for="t in ticks" :key="t" class="bar__tick" :style="{ left: t + '%' }" />
  </div>
</template>

<style scoped>
.bar {
  position: relative;
  width: 100%;
  height: 12px;
  border-radius: var(--bd-radius-pill);
  background: var(--bd-grey);
  overflow: hidden;
}

.bar__fill {
  height: 100%;
  border-radius: var(--bd-radius-pill);
  transition: width 0.4s ease;
}

.bar__tick {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transform: translate(-50%, -50%);
}
</style>
