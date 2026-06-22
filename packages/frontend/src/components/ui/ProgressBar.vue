<script setup lang="ts">
import { computed } from 'vue'

/** A marker drawn on the bar (e.g. a milestone funding threshold). */
export interface ProgressMarker {
  /** Position along the bar, 0–100. */
  position: number
  /** Optional tooltip label (e.g. the milestone name). */
  label?: string
}

const props = withDefaults(
  defineProps<{
    /** Fill percentage, 0–100. */
    value: number
    variant?: 'black' | 'green'
    /** Markers to draw on the track; empty = none. */
    markers?: ProgressMarker[]
  }>(),
  { variant: 'black', markers: () => [] },
)

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
const fillColor = computed(() =>
  props.variant === 'green' ? 'var(--bd-green)' : 'var(--bd-black)',
)
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
    <span
      v-for="(m, i) in markers"
      :key="i"
      class="bar__tick"
      :class="{ 'bar__tick--covered': m.position <= clamped }"
      :style="{ left: m.position + '%' }"
      :title="m.label"
    />
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
  /* Milestone threshold not yet reached: grey dot on the light track. */
  background: #b0b3bd;
  transform: translate(-50%, -50%);
  transition: background 0.4s ease;
}

/* Threshold reached: sits on the dark fill, so go light for contrast. */
.bar__tick--covered {
  background: rgba(255, 255, 255, 0.7);
}
</style>
