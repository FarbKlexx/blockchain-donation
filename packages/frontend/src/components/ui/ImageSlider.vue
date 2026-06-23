<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { mediaUrl } from '@/utils/media'
import AppIcon from '@/components/ui/AppIcon.vue'

// Image viewer for a list of URLs: nothing for an empty list, a single static
// image for one, and a slider (prev/next + dots) for several.
const props = defineProps<{ images: string[]; alt?: string }>()

const current = ref(0)
const hasMultiple = computed(() => props.images.length > 1)
// Stay in range if the list changes (e.g. editing) — and reset on a new set.
watch(
  () => props.images,
  () => {
    current.value = 0
  },
)

function go(delta: number) {
  const n = props.images.length
  if (n === 0) return
  current.value = (current.value + delta + n) % n
}
</script>

<template>
  <div v-if="images.length" class="slider">
    <div class="slider__frame">
      <img :src="mediaUrl(images[current] ?? '')" :alt="alt ?? ''" class="slider__img" loading="lazy" />

      <template v-if="hasMultiple">
        <button
          type="button"
          class="slider__nav slider__nav--prev"
          aria-label="Vorheriges Bild"
          @click="go(-1)"
        >
          <AppIcon name="chevron-left" :size="20" />
        </button>
        <button
          type="button"
          class="slider__nav slider__nav--next"
          aria-label="Nächstes Bild"
          @click="go(1)"
        >
          <AppIcon name="chevron-right" :size="20" />
        </button>
        <span class="slider__counter">{{ current + 1 }} / {{ images.length }}</span>
      </template>
    </div>

    <div v-if="hasMultiple" class="slider__dots">
      <button
        v-for="(_, i) in images"
        :key="i"
        type="button"
        class="slider__dot"
        :class="{ 'slider__dot--active': i === current }"
        :aria-label="`Bild ${i + 1} anzeigen`"
        :aria-current="i === current ? 'true' : undefined"
        @click="current = i"
      />
    </div>
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider__frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--bd-radius-md);
  overflow: hidden;
  background: var(--bd-grey);
}

.slider__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.slider__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
}

.slider__nav:hover {
  background: rgba(0, 0, 0, 0.75);
}

.slider__nav--prev {
  left: 10px;
}
.slider__nav--next {
  right: 10px;
}

.slider__counter {
  position: absolute;
  bottom: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: var(--bd-radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.slider__dots {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.slider__dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bd-stroke);
  cursor: pointer;
}

.slider__dot--active {
  background: var(--bd-black);
}
</style>
