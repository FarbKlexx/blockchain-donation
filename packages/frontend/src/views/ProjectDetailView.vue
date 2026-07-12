<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Funding, Project } from '@/types/project'
import { getProject, voteOnMilestone, payoutMilestone, voteProjectSetup, createProjectNews, getMyProjectVotes } from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
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

const notifications = useNotificationStore()

// This account's current votes, keyed by milestone position — hydrated from chain
// in load() (so they survive reloads) and set optimistically after a vote. The
// authoritative confirmations come from the chain re-read on load() after the tx.
const myVotes = ref<Record<number, 'approve' | 'reject'>>({})
const votingIndex = ref<number | null>(null)

async function onVote(index: number, approve: boolean) {
  if (!project.value || votingIndex.value !== null) return
  votingIndex.value = index
  try {
    await voteOnMilestone(project.value.contract.address, index, approve)
    myVotes.value[index] = approve ? 'approve' : 'reject'
    // Re-read: an approval can unlock the next payout or close the project.
    await load()
    notifications.success('Deine Stimme wurde gezählt.')
  } catch (e) {
    // Failures (local-signer guard, contract revert) → a readable toast.
    notifications.error(toUserMessage(e), 'Abstimmung fehlgeschlagen')
  } finally {
    votingIndex.value = null
  }
}

// Owner: pay out the next milestone. The milestone the owner may pay is
// `currentMilestoneIndex`, but only in the Payout phase and once the previous
// milestone is approved (its card shows 'completed'). Milestone 0 is gated by
// the project-setup vote — reflected by contractStatus already being 'Payout'.
const payingOut = ref(false)

const payableIndex = computed(() => {
  const p = project.value
  if (!p || p.contractStatus !== 'Payout') return -1
  const k = p.currentMilestoneIndex
  if (k >= p.milestones.length) return -1
  if (k === 0) return 0
  return p.milestones[k - 1]?.status === 'completed' ? k : -1
})

async function onPayout(index: number) {
  if (!project.value || payingOut.value) return
  payingOut.value = true
  try {
    await payoutMilestone(project.value.contract.address, index)
    // Paying a milestone opens its validator vote — re-read to show it.
    await load()
    notifications.success('Der Meilenstein wurde ausgezahlt.')
  } catch (e) {
    notifications.error(toUserMessage(e), 'Auszahlung fehlgeschlagen')
  } finally {
    payingOut.value = false
  }
}

// Validator: approve/reject the PROJECT SETUP while the campaign is in
// ToBeApproved (the one-time vote that must pass before any milestone is paid).
const mySetupVote = ref<'approve' | 'reject' | null>(null)
const setupVoting = ref(false)

// Show the setup-vote panel only while the vote is actually open on-chain.
const setupVoteOpen = computed(
  () => !!project.value && project.value.contractStatus === 'ToBeApproved',
)
// A validator may vote AND change their vote while the setup poll is open — the
// contract only rejects re-submitting the identical choice.
const canVoteSetup = computed(() => setupVoteOpen.value && isValidator.value)

async function onVoteSetup(approve: boolean) {
  if (!project.value || setupVoting.value) return
  setupVoting.value = true
  try {
    await voteProjectSetup(project.value.contract.address, approve)
    mySetupVote.value = approve ? 'approve' : 'reject'
    // A decisive vote flips the project to Payout (or Failed) — re-read.
    await load()
    notifications.success('Deine Stimme zum Projektstart wurde gezählt.')
  } catch (e) {
    notifications.error(toUserMessage(e), 'Abstimmung fehlgeschlagen')
  } finally {
    setupVoting.value = false
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

// Re-fetch the project from chain + backend. Used both on first load and after
// a vote/payout — a same-project reload keeps the active tab (only `enterProject`
// resets that, on a real navigation).
async function load() {
  loading.value = true
  try {
    const p = await getProject(props.id)
    project.value = p
    // Derive THIS account's votes from chain so they survive a reload and reflect
    // any change — the contract, not session memory, is the source of truth for
    // "you already voted X". Only validators of this project have votes to read.
    if (p && wallet.address && wallet.roleInProject(p.contract.address).isValidator) {
      try {
        const mine = await getMyProjectVotes(p.contract.address, wallet.address)
        mySetupVote.value = mine.setup
        myVotes.value = mine.milestones
      } catch (e) {
        // Non-fatal: the page still renders without the pre-filled vote state.
        console.error('Fehler beim Laden der eigenen Stimmen:', e)
        mySetupVote.value = null
        myVotes.value = {}
      }
    } else {
      mySetupVote.value = null
      myVotes.value = {}
    }
  } finally {
    loading.value = false
  }
  await nextTick()
  updateIndicator()
}

// Switch to a (possibly different) project: clear per-project local UI state,
// then load.
function enterProject() {
  activeTab.value = 'beschreibung'
  myVotes.value = {}
  mySetupVote.value = null
  newsOpen.value = false
  resetNewsForm()
  load()
}

// Apply the authoritative funding the service returns AFTER the tx confirmed
// (a fresh chain read) — no client-side arithmetic on money here.
function onDonated(funding: Funding) {
  if (project.value) {
    project.value.funding = funding
  }
}

// ── Owner: publish a news update ─────────────────────────────────────────────
// Appends ONE entry via POST /api/projects/:id/news, so a quick update never
// rewrites the project's other news (the bulk edit in ProjectEditView still does
// a full replace). After it lands we re-read the project so the new entry shows
// alongside the existing ones.
const newsOpen = ref(false)
const publishing = ref(false)
const newsForm = reactive<{ date: string; title: string; body: string; images: string[] }>({
  date: '',
  title: '',
  body: '',
  images: [],
})

// Local date as YYYY-MM-DD (input[type=date] value / backend `date` string).
function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function resetNewsForm() {
  newsForm.date = ''
  newsForm.title = ''
  newsForm.body = ''
  newsForm.images = []
}

function openNewsComposer() {
  newsForm.date = todayIso()
  newsOpen.value = true
}

function closeNewsComposer() {
  newsOpen.value = false
  resetNewsForm()
}

// Images are uploads only (no external URLs). Prototype: the file isn't actually
// uploaded — we record the chosen filename as the placeholder key the backend
// would assign. Mirrors the create/edit views.
function normalizeUploadPath(fileName: string, projectId?: string): string {
  if (!fileName) return ''
  if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith('/')) return fileName
  if (fileName.startsWith('uploads/')) return fileName
  const folder = projectId ? projectId.replace(/^\/|\/$/g, '') : ''
  return folder ? `uploads/${folder}/${fileName}` : `uploads/${fileName}`
}

function onNewsImages(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    newsForm.images.push(
      ...Array.from(input.files).map((f) => normalizeUploadPath(f.name, project.value?.id)),
    )
  }
  input.value = ''
}

// The backend accepts a title-or-body; we require at least a title (it's the
// entry's heading) so an empty update can't be published by mistake.
const canPublish = computed(() => newsForm.title.trim().length > 0)

async function publishNews() {
  if (!project.value || publishing.value || !canPublish.value) return
  publishing.value = true
  try {
    await createProjectNews(project.value.id, {
      date: newsForm.date || todayIso(),
      title: newsForm.title.trim(),
      body: newsForm.body.trim(),
      images: newsForm.images.map((s) => s.trim()).filter(Boolean),
    })
    closeNewsComposer()
    // Re-read (keeps the active tab) so the appended entry appears with the rest.
    await load()
    notifications.success('Deine Neuigkeit wurde veröffentlicht.')
  } catch (e) {
    notifications.error(toUserMessage(e), 'Veröffentlichen fehlgeschlagen')
  } finally {
    publishing.value = false
  }
}

// Re-measure the underline when the tab changes, the window resizes, or the
// web font finishes loading (which changes text widths).
watch(activeTab, () => nextTick(updateIndicator))
watch(() => props.id, enterProject)

onMounted(() => {
  enterProject()
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
                  ? 'Nach Zielerreichung bestätigen die Validatoren zunächst den Projektstart. Danach zahlt der Eigentümer die Meilensteine nacheinander aus – über jeden ausgezahlten Meilenstein stimmen die Validatoren ab, und erst ihre Freigabe schaltet die Auszahlung des nächsten Meilensteins frei.'
                  : 'Die Abstimmung über die Meilensteine beginnt erst, sobald das Finanzierungsziel erreicht ist.'
              }}
            </p>

            <!-- Project-setup approval: shown while the campaign is ToBeApproved.
                 Validators confirm the project start before any milestone is paid. -->
            <div v-if="setupVoteOpen" class="setup">
              <div class="setup__head">
                <AppIcon name="shield-check" :size="16" />
                <h3 class="setup__title">Projektstart bestätigen</h3>
              </div>
              <p class="setup__text">
                Das Finanzierungsziel ist erreicht. Bevor die erste Auszahlung freigegeben wird,
                bestätigen die Validatoren den Projektstart. Mit
                <strong>{{ project.projectSetup.requiredApprovals }}</strong> von
                {{ project.projectSetup.totalValidators }} Zustimmungen startet die Auszahlungsphase.
              </p>
              <div class="setup__tally">
                {{ project.projectSetup.approvedCount }}/{{ project.projectSetup.totalValidators }}
                bestätigt · {{ project.projectSetup.requiredApprovals }} für Freigabe nötig
              </div>

              <!-- Validators may vote AND change their vote while the poll is open.
                   Both choices stay visible; only the current choice is disabled
                   (re-submitting it reverts on-chain). State comes from chain, so
                   it's correct after a reload. -->
              <div v-if="canVoteSetup" class="setup__vote">
                <span
                  v-if="mySetupVote"
                  class="setup__voted"
                  :class="`setup__voted--${mySetupVote === 'approve' ? 'yes' : 'no'}`"
                >
                  <AppIcon v-if="mySetupVote === 'approve'" name="check" :size="14" />
                  {{ mySetupVote === 'approve' ? 'Du hast den Projektstart bestätigt' : 'Du hast den Projektstart abgelehnt' }}
                </span>
                <div class="setup__actions">
                  <button
                    type="button"
                    class="setup__btn setup__btn--yes"
                    :class="{ 'setup__btn--current': mySetupVote === 'approve' }"
                    :disabled="setupVoting || mySetupVote === 'approve'"
                    @click="onVoteSetup(true)"
                  >
                    <AppIcon name="check" :size="14" />
                    {{ mySetupVote === 'approve' ? 'Bestätigt' : 'Projektstart bestätigen' }}
                  </button>
                  <button
                    type="button"
                    class="setup__btn setup__btn--no"
                    :class="{ 'setup__btn--current': mySetupVote === 'reject' }"
                    :disabled="setupVoting || mySetupVote === 'reject'"
                    @click="onVoteSetup(false)"
                  >
                    {{ mySetupVote === 'reject' ? 'Abgelehnt' : 'Ablehnen' }}
                  </button>
                </div>
                <p v-if="mySetupVote" class="setup__note">
                  Du kannst deine Stimme ändern, solange die Abstimmung läuft.
                </p>
              </div>
              <p v-else class="setup__note">Nur Validatoren dieses Projekts können abstimmen.</p>
            </div>

            <div class="milestones__list">
              <MilestoneCard
                v-for="(m, i) in project.milestones"
                :key="m.index"
                :milestone="m"
                :validators="project.validators"
                :currency="project.currency"
                :voting-open="goalReached"
                :can-vote="isValidator && m.status === 'in_progress'"
                :my-vote="myVotes[i] ?? null"
                :voting="votingIndex === i"
                :can-payout="isOwner && i === payableIndex"
                :paying-out="payingOut && i === payableIndex"
                @vote="onVote(i, $event)"
                @payout="onPayout(i)"
              />
            </div>
          </div>

          <!-- Neuigkeiten -->
          <div v-else class="news">
            <!-- Owner: publish a new update. Appends a single entry via the news
                 endpoint (no full-project rewrite) and re-reads on success. -->
            <div v-if="isOwner" class="news-publish">
              <button
                v-if="!newsOpen"
                type="button"
                class="news-publish__toggle"
                @click="openNewsComposer"
              >
                <AppIcon name="pencil" :size="14" />
                Update veröffentlichen
              </button>

              <form v-else class="news-publish__form" @submit.prevent="publishNews">
                <div class="news-publish__row">
                  <label class="npf">
                    <span class="npf__label">Titel</span>
                    <input
                      v-model="newsForm.title"
                      class="npf__input"
                      type="text"
                      placeholder="Worum geht es?"
                    />
                  </label>
                  <label class="npf npf--date">
                    <span class="npf__label">Datum</span>
                    <input v-model="newsForm.date" class="npf__input" type="date" />
                  </label>
                </div>
                <label class="npf">
                  <span class="npf__label">Text</span>
                  <textarea
                    v-model="newsForm.body"
                    class="npf__input npf__input--area"
                    rows="3"
                    placeholder="Was gibt es Neues?"
                  />
                </label>
                <div class="npf">
                  <div class="npf__images-head">
                    <span class="npf__label">Bilder</span>
                    <label class="news-publish__filebtn">
                      + Bilder
                      <input type="file" accept="image/*" multiple hidden @change="onNewsImages" />
                    </label>
                  </div>
                  <div v-for="(img, j) in newsForm.images" :key="j" class="npf__chosen">
                    <span class="npf__chosen-name">{{ img }}</span>
                    <button
                      type="button"
                      class="npf__chosen-x"
                      aria-label="Bild entfernen"
                      @click="newsForm.images.splice(j, 1)"
                    >
                      ✕
                    </button>
                  </div>
                  <span class="npf__hint">
                    Nur eigener Upload · im Prototyp Platzhalter (Datei wird nicht gespeichert).
                  </span>
                </div>
                <div class="news-publish__actions">
                  <button
                    type="button"
                    class="news-publish__btn news-publish__btn--ghost"
                    :disabled="publishing"
                    @click="closeNewsComposer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    class="news-publish__btn news-publish__btn--primary"
                    :disabled="publishing || !canPublish"
                  >
                    {{ publishing ? 'Veröffentliche …' : 'Veröffentlichen' }}
                  </button>
                </div>
              </form>
            </div>

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
            <p v-if="project.news.length === 0" class="news__empty">
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

/* Project-setup approval */
.setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
  background: var(--bd-amber-tint);
  border: 1px solid var(--bd-amber);
  border-radius: var(--bd-radius-md);
}

.setup__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bd-black);
}

.setup__title {
  font-size: 16px;
  font-weight: 800;
}

.setup__text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.setup__tally {
  font-size: 13px;
  font-weight: 600;
  color: var(--bd-black);
}

.setup__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setup__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
}

.setup__btn:disabled {
  opacity: 0.6;
}

.setup__vote {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setup__btn--current {
  box-shadow: 0 0 0 2px var(--bd-black);
}

/* The current choice is disabled, but it's the active selection — don't dim it
   like an ordinary disabled button. */
.setup__btn--current:disabled {
  opacity: 1;
}

.setup__btn--yes {
  color: #fff;
  background: var(--bd-green);
}

.setup__btn--no {
  color: var(--bd-grey-text);
  background: var(--bd-surface);
  border-color: var(--bd-stroke);
}

.setup__btn--no:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

.setup__voted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}

.setup__voted--yes {
  color: var(--bd-green);
}

.setup__voted--no {
  color: var(--bd-grey-text);
}

.setup__note {
  font-size: 13px;
  color: var(--bd-grey-text);
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

.news__empty {
  font-size: 14px;
  color: var(--bd-grey-text);
}

/* Neuigkeiten: owner publish composer */
.news-publish {
  padding-bottom: 4px;
}

.news-publish__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  background: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
  cursor: pointer;
}

.news-publish__toggle:hover {
  border-color: var(--bd-black);
}

.news-publish__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.news-publish__row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}

.npf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}

.npf--date {
  flex: 0 0 170px;
}

.npf__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.npf__input {
  width: 100%;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  padding: 10px 12px;
}

.npf__input:focus {
  outline: none;
  border-color: var(--bd-black);
}

.npf__input--area {
  resize: vertical;
  line-height: 1.5;
}

.npf__images-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.news-publish__filebtn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-grey);
  color: var(--bd-black);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.npf__chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-size: 13px;
}

.npf__chosen-name {
  word-break: break-all;
}

.npf__chosen-x {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--bd-grey-text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.npf__hint {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.news-publish__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.news-publish__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 16px;
  cursor: pointer;
}

.news-publish__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.news-publish__btn--primary {
  background: var(--bd-black);
  color: var(--bd-surface);
}

.news-publish__btn--ghost {
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}

.news-publish__btn--ghost:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

@media (max-width: 640px) {
  .news-publish__row {
    flex-direction: column;
    align-items: stretch;
  }
  .npf--date {
    flex-basis: auto;
  }
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
