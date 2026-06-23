<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Funding, Project } from '@/types/project'
import { getProject, voteOnMilestone } from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { formatDate } from '@/utils/format'
import ProjectHero from '@/components/project/ProjectHero.vue'
import FundingCard from '@/components/project/FundingCard.vue'
import SmartContractCard from '@/components/project/SmartContractCard.vue'
import ValidatorsCard from '@/components/project/ValidatorsCard.vue'
import MilestoneCard from '@/components/project/MilestoneCard.vue'
import ProjectDetailSkeleton from '@/components/project/ProjectDetailSkeleton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import ImageSlider from '@/components/ui/ImageSlider.vue'

const props = defineProps<{ id: string }>()

type TabKey = 'beschreibung' | 'meilensteine' | 'neuigkeiten'
const tabs: { key: TabKey; label: string }[] = [
  { key: 'beschreibung', label: 'Beschreibung' },
  { key: 'meilensteine', label: 'Meilensteine' },
  { key: 'neuigkeiten', label: 'Neuigkeiten' },
]

const project = ref<Project | null>(null)
const loading = ref(true)
const activeTab = ref<TabKey>('beschreibung')

// Owner of THIS project (from the session's cached memberships) → may edit its
// off-chain metadata. UI gating only; the save is authorized by the backend.
const wallet = useWalletStore()
const isOwner = computed(
  () => !!project.value && wallet.roleInProject(project.value.contract.address).isOwner,
)
// Validator of THIS project → may vote on its current milestone.
const isValidator = computed(
  () => !!project.value && wallet.roleInProject(project.value.contract.address).isValidator,
)

// This account's votes cast THIS session, keyed by milestone position. Local UI
// reflection only — the contract write is a placeholder (voteOnMilestone), so
// nothing is persisted. Once wired, this comes from chain (hasVoted/votes).
const myVotes = ref<Record<number, 'approve' | 'reject'>>({})
const voteErrors = ref<Record<number, string>>({})
const votingIndex = ref<number | null>(null)

async function onVote(index: number, approve: boolean) {
  if (!project.value || votingIndex.value !== null) return
  votingIndex.value = index
  delete voteErrors.value[index]
  try {
    await voteOnMilestone(project.value.contract.address, index, approve)
    myVotes.value[index] = approve ? 'approve' : 'reject'
  } catch (e) {
    // Surface failures (today: the local-signer guard; once wired: a revert)
    // instead of swallowing them — mirrors the donate flow in ProjectHero.
    voteErrors.value[index] =
      e instanceof Error ? e.message : 'Abstimmung fehlgeschlagen. Bitte erneut versuchen.'
  } finally {
    votingIndex.value = null
  }
}

// Lifecycle gate (Spende → Stimme → Auszahlung): validators may only vote on
// milestones once the funding goal is reached. The milestone UI keys off this,
// so it can never present confirmations before the goal is met.
const goalReached = computed(
  () => !!project.value && project.value.funding.raised >= project.value.funding.goal,
)

// Sliding underline: tabs are variable-width, so we measure the active tab's
// position/width and move a single underline there (animated via CSS).
const tabRow = ref<HTMLElement | null>(null)
const indicator = ref({ left: 0, width: 0 })

function updateIndicator() {
  const row = tabRow.value
  if (!row) return
  const idx = tabs.findIndex((t) => t.key === activeTab.value)
  const el = row.children[idx] as HTMLElement | undefined
  if (el) indicator.value = { left: el.offsetLeft, width: el.offsetWidth }
}

async function load() {
  loading.value = true
  activeTab.value = 'beschreibung'
  myVotes.value = {}
  voteErrors.value = {}
  try {
    project.value = await getProject(props.id)
  } finally {
    loading.value = false
  }
  await nextTick()
  updateIndicator()
}

// Apply the authoritative funding the service returns AFTER the tx confirmed
// (a fresh chain read) — no client-side arithmetic on money here.
function onDonated(funding: Funding) {
  if (project.value) {
    project.value.funding = funding
  }
}

// Re-measure the underline when the tab changes, the window resizes, or the
// web font finishes loading (which changes text widths).
watch(activeTab, () => nextTick(updateIndicator))
watch(() => props.id, load)

onMounted(() => {
  load()
  window.addEventListener('resize', updateIndicator)
  document.fonts?.ready.then(updateIndicator)
})
onUnmounted(() => window.removeEventListener('resize', updateIndicator))
</script>

<template>
  <div class="detail">
    <!-- Always visible (needs no data) — keeps the layout stable across loading. -->
    <div class="detail__topbar">
      <RouterLink :to="{ name: 'home' }" class="detail__back">← Alle Projekte</RouterLink>
      <!-- Owner-only: edit the project's off-chain metadata. -->
      <RouterLink
        v-if="project && isOwner"
        :to="{ name: 'project-edit', params: { id: project.id } }"
        class="detail__edit"
      >
        <AppIcon name="pencil" :size="14" />
        Projekt bearbeiten
      </RouterLink>
    </div>

    <ProjectDetailSkeleton v-if="loading" />

    <template v-else-if="project">
      <div class="detail__hero-wrap">
        <ProjectHero :project="project" @donated="onDonated" />
      </div>

      <div class="detail__content">
        <div class="detail__main">
          <h2 class="detail__heading">Über das Projekt</h2>

          <div class="tabs">
            <div ref="tabRow" class="tabs__row" role="tablist">
              <button
                v-for="t in tabs"
                :key="t.key"
                type="button"
                role="tab"
                class="tabs__tab"
                :class="{ 'tabs__tab--active': activeTab === t.key }"
                :aria-selected="activeTab === t.key"
                @click="activeTab = t.key"
              >
                {{ t.label }}
              </button>
              <span
                class="tabs__underline"
                :style="{ width: indicator.width + 'px', transform: `translateX(${indicator.left}px)` }"
                aria-hidden="true"
              />
            </div>
            <div class="tabs__divider" />
          </div>

          <!-- Beschreibung -->
          <div v-if="activeTab === 'beschreibung'" class="prose">
            <p v-for="(para, i) in project.description" :key="i">{{ para }}</p>
          </div>

          <!-- Meilensteine -->
          <div v-else-if="activeTab === 'meilensteine'" class="milestones">
            <p class="milestones__hint">
              <AppIcon :name="goalReached ? 'circle-help' : 'lock'" :size="14" />
              {{
                goalReached
                  ? 'Validatoren stimmen über jeden Meilenstein ab — Gelder werden erst nach deren Bestätigung freigegeben.'
                  : 'Die Abstimmung über die Meilensteine beginnt erst, sobald das Finanzierungsziel erreicht ist.'
              }}
            </p>
            <div class="milestones__list">
              <MilestoneCard
                v-for="(m, i) in project.milestones"
                :key="m.index"
                :milestone="m"
                :validators="project.validators"
                :currency="project.currency"
                :voting-open="goalReached"
                :can-vote="isValidator && m.status === 'in_progress' && !myVotes[i]"
                :my-vote="myVotes[i] ?? null"
                :voting="votingIndex === i"
                :vote-error="voteErrors[i] ?? null"
                @vote="onVote(i, $event)"
              />
            </div>
          </div>

          <!-- Neuigkeiten -->
          <div v-else class="news">
            <article v-for="(entry, i) in project.news" :key="i" class="news__entry">
              <p class="news__meta">{{ formatDate(entry.date) }}</p>
              <h3 class="news__title">{{ entry.title }}</h3>
              <ImageSlider
                v-if="entry.images.length"
                :images="entry.images"
                :alt="entry.title"
                class="news__media"
              />
              <p class="news__body">{{ entry.body }}</p>
            </article>
            <p v-if="project.news.length === 0" class="detail__state">
              Noch keine Neuigkeiten.
            </p>
          </div>
        </div>

        <aside class="detail__sidebar">
          <FundingCard :project="project" />
          <SmartContractCard :contract="project.contract" />
          <ValidatorsCard :validators="project.validators" />
        </aside>
      </div>
    </template>

    <div v-else class="detail__state">
      <p>Projekt nicht gefunden.</p>
    </div>
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
}

.detail__state {
  padding: 80px var(--bd-page-gutter);
  color: var(--bd-grey-text);
}

.detail__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 48px var(--bd-page-gutter) 16px;
}

.detail__edit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
  background: var(--bd-surface);
}

.detail__edit:hover {
  border-color: var(--bd-black);
}

.detail__hero-wrap {
  padding: 0 var(--bd-page-gutter) 32px;
}

.detail__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.detail__back:hover {
  color: var(--bd-black);
}

.detail__content {
  display: flex;
  align-items: flex-start;
  gap: 48px;
  padding: 0 var(--bd-page-gutter) 64px;
}

.detail__main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail__heading {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.detail__sidebar {
  flex: 0 0 400px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Tabs */
.tabs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs__row {
  position: relative;
  display: flex;
  gap: 32px;
}

.tabs__tab {
  border: none;
  background: transparent;
  padding: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-grey-text);
  transition: color 0.28s ease;
}

.tabs__tab--active {
  font-weight: 600;
  color: var(--bd-black);
}

/* Single underline that slides/stretches to the active tab. */
.tabs__underline {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--bd-black);
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.tabs__divider {
  height: 1px;
  background: var(--bd-divider);
}

@media (prefers-reduced-motion: reduce) {
  .tabs__underline {
    transition: none;
  }
}

/* Beschreibung */
.prose {
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--bd-grey-text);
  max-width: 664px;
}

/* Meilensteine */
.milestones {
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 664px;
}

.milestones__hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bd-grey-text);
}

.milestones__list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Neuigkeiten */
.news {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 664px;
}

.news__entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.news__meta {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--bd-green);
}

.news__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--bd-black);
}

.news__body {
  font-size: 16px;
  line-height: 1.6;
  color: var(--bd-grey-text);
}

@media (max-width: 1000px) {
  .detail__content {
    flex-direction: column;
  }
  .detail__sidebar {
    flex-basis: auto;
    max-width: none;
    width: 100%;
  }
}
</style>
