<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Project, ProjectSort, ProjectStatus } from '@/types/project'
import { listProjects } from '@/services/projectsService'
import ProjectCard from '@/components/project/ProjectCard.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

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

// INTEGRATION POINT: project list. Service reads mockdata today; later it reads
// the campaign registry from the chain. Filter/sort can stay client-side.
async function load() {
  loading.value = true
  try {
    projects.value = await listProjects({
      filter: activeFilter.value,
      sort: activeSort.value,
    })
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
      <div class="overview__sort">
        <label for="sort" class="overview__sort-label">Sortieren nach</label>
        <div class="select">
          <select id="sort" v-model="activeSort">
            <option v-for="s in sorts" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
          <AppIcon name="chevron-down" :size="16" />
        </div>
      </div>
    </header>

    <div class="segmented" role="tablist">
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

    <p v-if="loading" class="overview__state">Lade Projekte …</p>
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
  display: inline-flex;
  gap: 0;
  width: 360px;
  max-width: 100%;
  padding: 2px;
  background: var(--bd-grey);
  border-radius: var(--bd-radius-sm);
}

.segmented__tab {
  flex: 1 1 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 6px 4px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.24px;
  color: var(--bd-black);
}

.segmented__tab--active {
  background: var(--bd-surface);
  box-shadow:
    0 3px 4px rgba(0, 0, 0, 0.12),
    0 3px 0.5px rgba(0, 0, 0, 0.04);
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
