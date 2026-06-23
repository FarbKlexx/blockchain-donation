<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Project } from '@/types/project'
import { formatAmount, percentFunded } from '@/utils/format'
import { mediaUrl } from '@/utils/media'
import AppIcon from '@/components/ui/AppIcon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'

const props = defineProps<{ project: Project }>()

const percent = computed(() =>
  percentFunded(props.project.funding.raised, props.project.funding.goal),
)

// Grey dots = milestone funding thresholds, positioned at the cumulative
// allocated amount / goal. The final boundary (= goal, 100%) is omitted since
// these mark the intermediate steps between milestones.
const milestoneMarkers = computed(() => {
  const { goal } = props.project.funding
  const milestones = props.project.milestones
  if (goal <= 0 || milestones.length < 2) return []

  const markers: { position: number; label: string }[] = []
  let cumulative = 0
  // Exclude the final milestone — its cumulative equals the goal (100%).
  for (const m of milestones.slice(0, -1)) {
    cumulative += m.allocated
    markers.push({
      position: Math.min(100, (cumulative / goal) * 100),
      label: m.title,
    })
  }
  return markers
})
</script>

<template>
  <RouterLink class="card" :to="{ name: 'project-detail', params: { id: project.id } }">
    <div class="card__image">
      <img :src="mediaUrl(project.image)" :alt="project.title" loading="lazy" />
    </div>
    <div class="card__body">
      <h3 class="card__title">{{ project.title }}</h3>
      <p class="card__summary">{{ project.summary }}</p>

      <div class="card__status">
        <div class="card__progress-info">
          <span class="card__raised">
            {{ formatAmount(project.funding.raised) }} {{ project.currency }} gesammelt
          </span>
          <span class="card__percent">
            <strong>{{ percent }}%</strong> finanziert
          </span>
        </div>
        <div class="card__meta">
          <span class="card__meta-row">
            <AppIcon name="target" :size="12" />
            {{ formatAmount(project.funding.goal) }} {{ project.currency }}
          </span>
          <span class="card__meta-row">
            <AppIcon name="clock" :size="12" />
            {{ project.funding.timeLeftShort }}
          </span>
        </div>
      </div>

      <ProgressBar :value="percent" :markers="milestoneMarkers" />
    </div>
  </RouterLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  overflow: hidden;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--bd-shadow-card);
}

.card__image {
  height: 180px;
  background: var(--bd-grey);
}

.card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.card__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--bd-black);
}

.card__summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card__status {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.card__progress-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card__raised {
  font-family: var(--bd-font-stats);
  font-size: 12px;
  color: var(--bd-grey-text);
}

.card__percent {
  font-family: var(--bd-font-stats);
  font-size: 16px;
  color: var(--bd-black);
}

.card__percent strong {
  font-weight: 700;
}

.card__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.card__meta-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--bd-font-stats);
  font-size: 12px;
  color: var(--bd-grey-text);
}
</style>
