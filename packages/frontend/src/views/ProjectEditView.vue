<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Project } from '@/types/project'
import { getProject, updateProjectMetadata, type ProjectMetadataPatch } from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { formatAmount } from '@/utils/format'
import { shortenAddress } from '@/utils/address'
import AppIcon from '@/components/ui/AppIcon.vue'

// Owner-only metadata editor. Editable here = the OFF-CHAIN fields the backend
// owns (title/summary/category/image/description/news + milestone texts).
// Everything from the contract is shown read-only ("gesperrt"), because it is
// fixed at deployment and cannot be changed off-chain. Per-project ownership is
// re-checked here against the session (the route guard only ensures a session).
const props = defineProps<{ id: string }>()
const router = useRouter()
const wallet = useWalletStore()

const project = ref<Project | null>(null)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const denied = ref(false)

// Editable copy of the metadata-origin fields (contract fields are NOT copied
// in — they stay read-only on `project`).
const form = reactive<ProjectMetadataPatch>({
  title: '',
  summary: '',
  category: '',
  image: '',
  description: [],
  milestones: [],
  news: [],
})

const isOwner = computed(
  () => !!project.value && wallet.roleInProject(project.value.contract.address).isOwner,
)

async function load() {
  loading.value = true
  try {
    const p = await getProject(props.id)
    project.value = p
    if (!p) return
    if (!wallet.roleInProject(p.contract.address).isOwner) {
      denied.value = true
      return
    }
    // Seed the editable form from the loaded project's metadata fields.
    form.title = p.title
    form.summary = p.summary
    form.category = p.category
    form.image = p.image
    form.description = [...p.description]
    form.milestones = p.milestones.map((m) => ({
      index: m.index,
      title: m.title,
      description: m.description,
    }))
    form.news = p.news.map((n) => ({
      date: n.date,
      title: n.title,
      body: n.body,
      images: [...n.images],
    }))
  } finally {
    loading.value = false
  }
}

function addParagraph() {
  form.description.push('')
}
function removeParagraph(i: number) {
  form.description.splice(i, 1)
}
function addNews() {
  form.news.unshift({ date: '', title: '', body: '', images: [] })
}
function removeNews(i: number) {
  form.news.splice(i, 1)
}

async function save() {
  if (saving.value) return
  saving.value = true
  saved.value = false
  try {
    // Snapshot the patch the backend would receive (a plain copy).
    const patch: ProjectMetadataPatch = {
      title: form.title,
      summary: form.summary,
      category: form.category,
      image: form.image,
      description: [...form.description],
      milestones: form.milestones.map((m) => ({ ...m })),
      news: form.news.map((n) => ({
        date: n.date,
        title: n.title,
        body: n.body,
        images: n.images.map((s) => s.trim()).filter(Boolean),
      })),
    }
    await updateProjectMetadata(props.id, patch)
    saved.value = true // prototype: nothing persisted (see service stub)
  } finally {
    saving.value = false
  }
}

function cancel() {
  router.push({ name: 'project-detail', params: { id: props.id } })
}

onMounted(load)
</script>

<template>
  <div class="edit">
    <div class="edit__topbar">
      <RouterLink :to="{ name: 'project-detail', params: { id } }" class="edit__back">
        ← Zurück zum Projekt
      </RouterLink>
    </div>

    <p v-if="loading" class="edit__state">Lade …</p>
    <p v-else-if="!project" class="edit__state">Projekt nicht gefunden.</p>
    <p v-else-if="denied" class="edit__state">
      Du bist nicht der Eigentümer dieses Projekts und kannst es nicht bearbeiten.
    </p>

    <form v-else class="edit__form" @submit.prevent="save">
      <header class="edit__head">
        <div>
          <h1 class="edit__title">Projekt bearbeiten</h1>
          <p class="edit__subtitle">{{ project.title }}</p>
        </div>
        <div class="edit__actions">
          <button type="button" class="btn btn--ghost" @click="cancel">Abbrechen</button>
          <button type="submit" class="btn btn--primary" :disabled="saving || !isOwner">
            {{ saving ? 'Speichere …' : 'Speichern' }}
          </button>
        </div>
      </header>

      <p class="edit__note">
        <AppIcon name="lock" :size="13" />
        Nur Inhalte aus dem Backend sind editierbar. Vertrags­daten (Ziel, Spenden, Validatoren,
        Meilenstein-Mittel & -Status) werden einmalig bei der Vertragserstellung festgelegt und sind
        hier gesperrt.
      </p>

      <p v-if="saved" class="edit__saved" role="status">
        Änderungen erfasst. Im Prototyp wird <strong>nichts gespeichert</strong> – sobald das Backend
        angebunden ist, geht hier ein POST an die API raus.
      </p>

      <!-- Stammdaten -->
      <section class="card">
        <h2 class="card__title">Stammdaten</h2>
        <label class="field">
          <span class="field__label">Titel</span>
          <input v-model="form.title" class="field__input" type="text" />
        </label>
        <label class="field">
          <span class="field__label">Kurzbeschreibung</span>
          <textarea v-model="form.summary" class="field__input field__input--area" rows="2" />
        </label>
        <div class="field__row">
          <label class="field">
            <span class="field__label">Kategorie</span>
            <input v-model="form.category" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Bild-URL</span>
            <input v-model="form.image" class="field__input" type="url" />
          </label>
        </div>
      </section>

      <!-- Beschreibung -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Beschreibung</h2>
          <button type="button" class="btn btn--small" @click="addParagraph">+ Absatz</button>
        </div>
        <div v-for="(_, i) in form.description" :key="i" class="field field--removable">
          <textarea v-model="form.description[i]" class="field__input field__input--area" rows="3" />
          <button
            type="button"
            class="btn btn--icon"
            aria-label="Absatz entfernen"
            @click="removeParagraph(i)"
          >
            ✕
          </button>
        </div>
        <p v-if="!form.description.length" class="card__empty">Noch keine Absätze.</p>
      </section>

      <!-- Meilenstein-Texte -->
      <section class="card">
        <h2 class="card__title">Meilenstein-Texte</h2>
        <p class="card__hint">
          Mittel, Reihenfolge und Status kommen aus dem Vertrag – nur Titel & Beschreibung sind
          editierbar.
        </p>
        <div v-for="(m, i) in form.milestones" :key="i" class="ms-edit">
          <div class="ms-edit__locked">
            <span class="ms-edit__num">{{ m.index }}</span>
            <span class="lock-pill">
              <AppIcon name="lock" :size="11" />
              {{ formatAmount(project.milestones[i]?.allocated ?? 0) }} {{ project.currency }}
            </span>
          </div>
          <label class="field">
            <span class="field__label">Titel</span>
            <input v-model="m.title" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Beschreibung</span>
            <textarea v-model="m.description" class="field__input field__input--area" rows="2" />
          </label>
        </div>
      </section>

      <!-- Neuigkeiten -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Neuigkeiten</h2>
          <button type="button" class="btn btn--small" @click="addNews">+ Eintrag</button>
        </div>
        <div v-for="(n, i) in form.news" :key="i" class="news-edit">
          <div class="field__row">
            <label class="field field--date">
              <span class="field__label">Datum</span>
              <input v-model="n.date" class="field__input" type="date" />
            </label>
            <label class="field">
              <span class="field__label">Titel</span>
              <input v-model="n.title" class="field__input" type="text" />
            </label>
            <button
              type="button"
              class="btn btn--icon"
              aria-label="Eintrag entfernen"
              @click="removeNews(i)"
            >
              ✕
            </button>
          </div>
          <label class="field">
            <span class="field__label">Text</span>
            <textarea v-model="n.body" class="field__input field__input--area" rows="3" />
          </label>
          <div class="subfield">
            <div class="subfield__head">
              <span class="field__label">Bilder (URLs)</span>
              <button type="button" class="btn btn--small" @click="n.images.push('')">+ Bild</button>
            </div>
            <div v-for="(_, j) in n.images" :key="j" class="field--removable">
              <input v-model="n.images[j]" class="field__input" type="url" placeholder="https://…" />
              <button type="button" class="btn btn--icon" aria-label="Bild entfernen" @click="n.images.splice(j, 1)">✕</button>
            </div>
          </div>
        </div>
        <p v-if="!form.news.length" class="card__empty">Noch keine Neuigkeiten.</p>
      </section>

      <!-- Gesperrt: Smart-Contract-Daten -->
      <section class="card card--locked">
        <h2 class="card__title">
          <AppIcon name="lock" :size="14" />
          Smart-Contract-Daten (gesperrt)
        </h2>
        <p class="card__hint">Read-only – einmalig bei Vertragserstellung festgelegt.</p>
        <div class="locked-grid">
          <div class="locked-item">
            <span class="locked-item__label">Finanzierungsziel</span>
            <span class="locked-item__value">
              {{ formatAmount(project.funding.goal) }} {{ project.currency }}
            </span>
          </div>
          <div class="locked-item">
            <span class="locked-item__label">Gesammelt</span>
            <span class="locked-item__value">
              {{ formatAmount(project.funding.raised) }} {{ project.currency }}
            </span>
          </div>
          <div class="locked-item">
            <span class="locked-item__label">Spender</span>
            <span class="locked-item__value">{{ project.funding.donors }}</span>
          </div>
          <div class="locked-item">
            <span class="locked-item__label">Validatoren</span>
            <span class="locked-item__value">{{ project.validators.length }}</span>
          </div>
          <div class="locked-item locked-item--wide">
            <span class="locked-item__label">Contract</span>
            <span class="locked-item__value">{{ shortenAddress(project.contract.address) }}</span>
          </div>
        </div>
      </section>
    </form>
  </div>
</template>

<style scoped>
.edit {
  display: flex;
  flex-direction: column;
  padding: 0 var(--bd-page-gutter) 64px;
}

.edit__topbar {
  padding: 48px 0 16px;
}

.edit__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}
.edit__back:hover {
  color: var(--bd-black);
}

.edit__state {
  padding: 64px 0;
  color: var(--bd-grey-text);
}

.edit__form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 760px;
}

.edit__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.edit__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.edit__subtitle {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.edit__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.edit__note,
.edit__saved {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  padding: 12px 14px;
  border-radius: var(--bd-radius-md);
}

.edit__note {
  color: var(--bd-grey-text);
  background: var(--bd-grey);
}

.edit__saved {
  color: var(--bd-green);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
}

/* Cards */
.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.card--locked {
  background: var(--bd-grey);
  box-shadow: none;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.card__hint {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.card__empty {
  font-size: 13px;
  color: var(--bd-grey-text);
}

/* Fields */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}

.field--removable {
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
}

.field--date {
  flex: 0 0 170px;
}

.field__row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}

.field__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.field__input {
  width: 100%;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  padding: 10px 12px;
}

.field__input:focus {
  outline: none;
  border-color: var(--bd-black);
}

.field__input--area {
  resize: vertical;
  line-height: 1.5;
}

/* Milestone + news editing blocks */
.ms-edit,
.news-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
}

.subfield {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subfield__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ms-edit__locked {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ms-edit__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-grey);
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-black);
}

.lock-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--bd-grey-text);
  background: var(--bd-grey);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-pill);
  padding: 3px 10px;
}

/* Locked contract grid */
.locked-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.locked-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  opacity: 0.85;
}

.locked-item--wide {
  grid-column: 1 / -1;
}

.locked-item__label {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.locked-item__value {
  font-size: 15px;
  font-weight: 700;
  color: var(--bd-black);
}

/* Buttons */
.btn {
  border: none;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 10px 16px;
}

.btn--primary {
  background: var(--bd-black);
  color: var(--bd-surface);
}
.btn--primary:disabled {
  opacity: 0.6;
}

.btn--ghost {
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}

.btn--small {
  padding: 6px 12px;
  font-size: 13px;
  background: var(--bd-grey);
  color: var(--bd-black);
}

.btn--icon {
  flex-shrink: 0;
  padding: 8px 10px;
  background: transparent;
  color: var(--bd-grey-text);
  font-size: 14px;
  line-height: 1;
}

@media (max-width: 640px) {
  .field__row {
    flex-direction: column;
    align-items: stretch;
  }
  .locked-grid {
    grid-template-columns: 1fr;
  }
}
</style>
