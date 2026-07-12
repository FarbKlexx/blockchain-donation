<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Project, ProjectSort, ProjectStatus } from '@/types/project'
import { listProjects } from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import ProjectCard from '@/components/project/ProjectCard.vue'
import ProjectCardSkeleton from '@/components/project/ProjectCardSkeleton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// Any connected account may create a project (no role required).
const wallet = useWalletStore()
const notifications = useNotificationStore()

const filters: { value: ProjectStatus; label: string }[] = [
  { value: 'laufend', label: 'Laufend' },
  { value: 'abgelaufen', label: 'Abgelaufen' },
]

const sorts: { value: ProjectSort; label: string }[] = [
  { value: 'neuste', label: 'Neuste' },
  { value: 'fortschritt', label: 'Fortschritt' },
  { value: 'endet_bald', label: 'Endet bald' },
]

const activeFilter = ref<ProjectStatus>('laufend')
const activeSort = ref<ProjectSort>('neuste')
const projects = ref<Project[]>([])
const loading = ref(true)

// Sliding-thumb position for the animated segmented control.
const activeIndex = computed(() => filters.findIndex((f) => f.value === activeFilter.value))
const thumbStyle = computed(() => ({
  width: `calc((100% - 4px) / ${filters.length})`,
  transform: `translateX(${activeIndex.value * 100}%)`,
}))

// INTEGRATION POINT: project list. Service merges the contract + backend mock
// sources today; later it reads the campaign registry from the chain and the
// metadata from the backend API. Filter/sort can stay client-side.
async function load() {
  loading.value = true
  try {
    projects.value = await listProjects({
      filter: activeFilter.value,
      sort: activeSort.value,
    })
  } catch (e) {
    notifications.error(toUserMessage(e), 'Projekte konnten nicht geladen werden')
  } finally {
    loading.value = false
  }
}

watch([activeFilter, activeSort], load)
onMounted(load)
</script>

<template>
  <div class="overview">
    <header class="overview__header">
      <div class="overview__heading">
        <h1 class="overview__title">Projekte</h1>
        <p class="overview__count">{{ projects.length }} Ergebnisse</p>
      </div>
      <div class="overview__actions">
        <RouterLink
          v-if="wallet.isConnected"
          :to="{ name: 'project-create' }"
          class="overview__create"
        >
          + Projekt erstellen
        </RouterLink>
        <div class="overview__sort">
          <label for="sort" class="overview__sort-label">Sortieren nach</label>
          <div class="select">
            <select id="sort" v-model="activeSort">
              <option v-for="s in sorts" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <AppIcon name="chevron-down" :size="16" />
          </div>
        </div>
      </div>
    </header>

    <div class="segmented" role="tablist">
      <span class="segmented__thumb" :style="thumbStyle" aria-hidden="true" />
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        role="tab"
        class="segmented__tab"
        :class="{ 'segmented__tab--active': activeFilter === f.value }"
        :aria-selected="activeFilter === f.value"
        @click="activeFilter = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="overview__grid">
      <ProjectCardSkeleton v-for="n in 6" :key="n" />
    </div>
    <p v-else-if="projects.length === 0" class="overview__state">
      Keine Projekte in dieser Ansicht.
    </p>
    <div v-else class="overview__grid">
      <ProjectCard v-for="project in projects" :key="project.id" :project="project" />
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 32px var(--bd-page-gutter);
}

.overview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.overview__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--bd-black);
}

.overview__count {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.overview__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.overview__create {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-size: 14px;
  font-weight: 700;
}

.overview__sort {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview__sort-label {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select select {
  appearance: none;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  padding: 10px 38px 10px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-black);
  cursor: pointer;
}

.select svg {
  position: absolute;
  right: 14px;
  pointer-events: none;
  color: var(--bd-black);
}

.segmented {
  position: relative;
  display: inline-flex;
  gap: 0;
  width: 360px;
  max-width: 100%;
  padding: 2px;
  background: var(--bd-grey);
  border-radius: var(--bd-radius-sm);
}

/* The sliding surface that animates between tabs. */
.segmented__thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  border-radius: 6px;
  background: var(--bd-surface);
  box-shadow:
    0 3px 4px rgba(0, 0, 0, 0.12),
    0 3px 0.5px rgba(0, 0, 0, 0.04);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.segmented__tab {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 6px 4px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.24px;
  color: var(--bd-grey-text);
  transition: color 0.28s ease;
}

.segmented__tab--active {
  color: var(--bd-black);
}

@media (prefers-reduced-motion: reduce) {
  .segmented__thumb {
    transition: none;
  }
}

.overview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 32px;
}

.overview__state {
  padding: 48px 0;
  color: var(--bd-grey-text);
}
</style>
