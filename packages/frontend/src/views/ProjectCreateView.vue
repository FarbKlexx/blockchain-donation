<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createProject,
  estimateCreateProjectGas,
  type CreateProjectPayload,
  type TxGasEstimate,
} from '@/services/projectsService'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import { NATIVE_CURRENCY, NATIVE_DECIMALS, validateAmount } from '@/utils/amount'
import { formatAmount } from '@/utils/format'
import { shortenAddress } from '@/utils/address'
import AppIcon from '@/components/ui/AppIcon.vue'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'

// Create a project — open to ANY connected account (no role required). The
// dataset is split along the contract boundary: the "Smart Contract" section is
// what DonationFactory.createDonation stores (and becomes immutable); the rest
// is off-chain metadata. The connected account becomes the on-chain owner.
// Submit deploys a mock contract address and persists metadata via the backend.
const wallet = useWalletStore()
const notifications = useNotificationStore()
const router = useRouter()

// const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
// const ZERO_ADDRESS = '0x' + '0'.repeat(40)

const form = reactive({
  // ── Backend metadata ──
  title: '',
  summary: '',
  category: '',
  image: '',
  description: [''],
  news: [] as { date: string; title: string; body: string; images: string[] }[],
  // ── Smart contract ──
  durationDays: '',
  onchainDescription: '',
  //validators: [''],
  // Each milestone carries an absolute funding amount (native coin). The funding
  // goal is their sum — the contract has no separate goal input.
  milestones: [{ amount: '', title: '', description: '' }],
})

// `attempted` gates whether inline errors are shown — the form stays clean until
// the user first tries to submit, then errors appear at the fields they belong to.
const attempted = ref(false)
const submitting = ref(false)

// Checkout overlay: opened on a valid submit, it shows the estimated gas cost of
// deploying the campaign and only sends the tx once confirmed.
const confirmOpen = ref(false)
const estimating = ref(false)
const estimate = ref<TxGasEstimate | null>(null)
const estimateError = ref<string | null>(null)
const pendingPayload = ref<CreateProjectPayload | null>(null)

// Entirely-blank milestone rows (no %, title, or description) are ignored — like
// the description/news lists — so a leftover empty row never blocks submit.
const filledMilestones = computed(() =>
  form.milestones.filter((m) => m.amount.trim() || m.title.trim() || m.description.trim()),
)
// Each milestone's amount as a validated decimal string (native coin). The
// funding goal is the SUM of these — the contract derives the goal from the
// milestone amounts; there is no separate goal input.
const milestoneAmountChecks = computed(() =>
  filledMilestones.value.map((m) => validateAmount(m.amount, NATIVE_DECIMALS)),
)
const goalTotal = computed(() =>
  milestoneAmountChecks.value.reduce((sum, c) => (c.ok ? sum + Number(c.value) : sum), 0),
)

//const filledValidators = computed(() => form.validators.map((v) => v.trim()).filter(Boolean))

// ── Per-field validation ──
// Each mandatory field owns its own error string (empty = valid), rendered
// inline right at the field instead of a summary block at the top of the form.

const titleError = computed(() => (form.title.trim() ? '' : 'Titel ist erforderlich.'))

const durationError = computed(() => {
  // NOTE: <input type="number"> makes v-model coerce this to a JS number (Vue
  // does that automatically for number inputs), so it is NOT always a string —
  // String() before trim() to stay safe for both.
  const raw = String(form.durationDays).trim()
  if (!raw) return 'Laufzeit ist erforderlich.'
  const days = Number(raw)
  if (!Number.isInteger(days) || days <= 0)
    return 'Laufzeit muss eine ganze Zahl an Tagen (> 0) sein.'
  return ''
})

// Per-row milestone errors, parallel to form.milestones. A fully-blank row is
// ignored (no errors — it won't be submitted); a partially filled row must have
// a valid amount and a title.
const milestoneErrors = computed(() =>
  form.milestones.map((m) => {
    const filled = m.amount.trim() || m.title.trim() || m.description.trim()
    if (!filled) return { amount: '', title: '' }
    const check = validateAmount(m.amount, NATIVE_DECIMALS)
    return {
      amount: check.ok ? '' : check.error,
      title: m.title.trim() ? '' : 'Titel ist erforderlich.',
    }
  }),
)

// At least one milestone is mandatory — the funding goal is the sum of their
// amounts, so a project with none has no goal.
const milestonesEmptyError = computed(() =>
  filledMilestones.value.length === 0 ? 'Mindestens ein Meilenstein ist erforderlich.' : '',
)

const isValid = computed(
  () =>
    !titleError.value &&
    !durationError.value &&
    !milestonesEmptyError.value &&
    milestoneErrors.value.every((e) => !e.amount && !e.title),
)

function addParagraph() {
  form.description.push('')
}
function removeParagraph(i: number) {
  form.description.splice(i, 1)
}
// function addValidator() {
//   form.validators.push('')
// }
// function removeValidator(i: number) {
//   form.validators.splice(i, 1)
// }
function addMilestone() {
  form.milestones.push({ amount: '', title: '', description: '' })
}
function removeMilestone(i: number) {
  form.milestones.splice(i, 1)
}
function addNews() {
  form.news.push({ date: '', title: '', body: '', images: [] })
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function normalizeUploadPath(fileName: string, folder?: string): string {
  if (!fileName) return ''
  if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith('/')) return fileName
  if (fileName.startsWith('uploads/')) return fileName
  const cleaned = folder ? folder.replace(/^\/|\/$/g, '') : ''
  return cleaned ? `uploads/${cleaned}/${fileName}` : `uploads/${fileName}`
}

// Images are uploads only (no external URLs). In this prototype the file isn't
// actually uploaded — we record the chosen filename as the placeholder key the
// backend would assign; the real upload→key flow lands in createProject().
function onCoverFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) form.image = normalizeUploadPath(file.name, slugify(form.title))
  input.value = ''
}
function onNewsFiles(e: Event, entry: { images: string[] }) {
  const input = e.target as HTMLInputElement
  if (input.files) entry.images.push(...Array.from(input.files).map((f) => normalizeUploadPath(f.name, slugify(form.title))))
  input.value = ''
}
function removeNews(i: number) {
  form.news.splice(i, 1)
}

// Detail rows shown in the checkout overlay (context, not costs — creation is
// non-payable, so the only cost is the gas fee).
const confirmRows = computed(() => [
  { label: 'Finanzierungsziel', value: `${formatAmount(goalTotal.value)} ${NATIVE_CURRENCY}` },
  { label: 'Meilensteine', value: String(filledMilestones.value.length) },
  { label: 'Laufzeit', value: `${form.durationDays || '–'} Tage` },
])

// Snapshot the current form into the create payload — built once on submit and
// reused by both the gas estimate and the actual deployment so they can't drift.
function buildPayload(): CreateProjectPayload {
  return {
    contract: {
      durationSeconds: Number(form.durationDays) * 86400,
      description: form.onchainDescription.trim(),
      //validators: filledValidators.value,
      // Validated decimal strings (native coin); the goal is their sum.
      milestoneAmounts: milestoneAmountChecks.value.map((c) => (c.ok ? c.value : '0')),
    },
    metadata: {
      title: form.title.trim(),
      summary: form.summary.trim(),
      category: form.category.trim(),
      image: form.image.trim(),
      description: form.description.map((p) => p.trim()).filter(Boolean),
      milestones: filledMilestones.value.map((m) => ({
        title: m.title.trim(),
        description: m.description.trim(),
      })),
      news: form.news
        .filter((n) => n.title.trim() || n.body.trim())
        .map((n) => ({
          date: n.date,
          title: n.title.trim(),
          body: n.body.trim(),
          images: n.images.map((s) => s.trim()).filter(Boolean),
        })),
    },
  }
}

// Submit → validate, then open the checkout overlay and estimate the deployment
// gas. Nothing is signed/sent here; the tx only goes out on confirm.
async function onSubmit() {
  attempted.value = true
  if (submitting.value) return

  // Deploying requires a connected wallet (a signer).
  if (!wallet.isConnected) {
    notifications.error('Bitte logge dich zuerst oben mit deiner Wallet ein.', 'Nicht eingeloggt')
    return
  }
  if (!isValid.value) {
    notifications.error('Bitte fülle die markierten Pflichtfelder aus.', 'Eingaben unvollständig')
    return
  }

  pendingPayload.value = buildPayload()
  estimate.value = null
  estimateError.value = null
  confirmOpen.value = true
  estimating.value = true
  try {
    estimate.value = await estimateCreateProjectGas(pendingPayload.value)
  } catch (e) {
    estimateError.value = toUserMessage(e, 'Die Gaskosten konnten nicht geschätzt werden.')
  } finally {
    estimating.value = false
  }
}

// Confirmed in the overlay → deploy, then route back to the overview.
async function confirmCreate() {
  if (submitting.value || !pendingPayload.value) return
  submitting.value = true
  try {
    await createProject(pendingPayload.value)
    // Creating a project makes this account an owner and cost gas — refresh the
    // navbar (roles + balance) before we leave the page.
    void wallet.refresh()
    notifications.success('Dein Projekt wurde erstellt und veröffentlicht.', 'Projekt erstellt')
    closeCheckout()
    router.push({ name: 'home' })
  } catch (e) {
    notifications.error(toUserMessage(e), 'Projekt konnte nicht erstellt werden')
  } finally {
    submitting.value = false
  }
}

function closeCheckout() {
  confirmOpen.value = false
  pendingPayload.value = null
  estimate.value = null
  estimateError.value = null
}

// Cancel from the overlay — never possible mid-deploy.
function cancelCreate() {
  if (submitting.value) return
  closeCheckout()
}
</script>

<template>
  <div class="create">
    <div class="create__topbar">
      <RouterLink :to="{ name: 'home' }" class="create__back">← Alle Projekte</RouterLink>
    </div>

    <form class="create__form" @submit.prevent="onSubmit">
      <header class="create__head">
        <div>
          <h1 class="create__title">Projekt erstellen</h1>
          <p class="create__subtitle">
            Du wirst Eigentümer dieses Projekts (Wallet {{ shortenAddress(wallet.address ?? '') }}).
          </p>
        </div>
        <button type="submit" class="btn btn--primary" :disabled="submitting">
          {{ submitting ? 'Erstelle …' : 'Projekt erstellen' }}
        </button>
      </header>

      <!-- Backend: Stammdaten -->
      <section class="card">
        <h2 class="card__title">Stammdaten</h2>
        <p class="card__hint">Off-chain – im Backend gespeichert, später jederzeit editierbar.</p>
        <label class="field">
          <span class="field__label">Titel *</span>
          <input
            v-model="form.title"
            class="field__input"
            type="text"
            :class="{ 'field__input--error': attempted && titleError }"
            :aria-invalid="attempted && titleError ? 'true' : undefined"
          />
          <span v-if="attempted && titleError" class="field__error">{{ titleError }}</span>
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
            <span class="field__label">Titelbild</span>
            <input class="field__file" type="file" accept="image/*" @change="onCoverFile" />
            <span v-if="form.image" class="field__chosen">
              {{ form.image }}
              <button type="button" class="field__chosen-x" aria-label="Entfernen" @click="form.image = ''">✕</button>
            </span>
            <span class="field__hint">Nur eigener Upload · im Prototyp Platzhalter (Datei wird nicht gespeichert).</span>
          </label>
        </div>
      </section>

      <!-- Backend: Beschreibung -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Ausführliche Beschreibung</h2>
          <button type="button" class="btn btn--small" @click="addParagraph">+ Absatz</button>
        </div>
        <div v-for="(_, i) in form.description" :key="i" class="field field--removable">
          <textarea v-model="form.description[i]" class="field__input field__input--area" rows="3" />
          <button type="button" class="btn btn--icon" aria-label="Absatz entfernen" @click="removeParagraph(i)">✕</button>
        </div>
      </section>

      <!-- Contract: Finanzierung -->
      <section class="card card--chain">
        <h2 class="card__title"><AppIcon name="lock" :size="14" /> Finanzierung (Smart Contract)</h2>
        <p class="card__hint">
          Wird im Vertrag gespeichert und ist nach der Erstellung <strong>unveränderlich</strong>.
        </p>
        <div class="field__row">
          <label class="field">
            <span class="field__label">Laufzeit (Tage) *</span>
            <input
              v-model="form.durationDays"
              class="field__input"
              type="number"
              min="1"
              step="1"
              :class="{ 'field__input--error': attempted && durationError }"
              :aria-invalid="attempted && durationError ? 'true' : undefined"
            />
            <span v-if="attempted && durationError" class="field__error">{{ durationError }}</span>
          </label>
          <div class="field">
            <span class="field__label">Finanzierungsziel ({{ NATIVE_CURRENCY }})</span>
            <output class="field__readonly">{{ formatAmount(goalTotal) }} {{ NATIVE_CURRENCY }}</output>
            <span class="field__hint">Ergibt sich automatisch aus der Summe der Meilensteinbeträge.</span>
          </div>
        </div>
        <label class="field">
          <span class="field__label">On-Chain-Beschreibung</span>
          <textarea v-model="form.onchainDescription" class="field__input field__input--area" rows="2" />
        </label>
      </section>

      <!-- Contract: Validatoren
      <section class="card card--chain">
        <div class="card__head">
          <h2 class="card__title"><AppIcon name="lock" :size="14" /> Validatoren (Smart Contract)</h2>
          <button type="button" class="btn btn--small" @click="addValidator">+ Validator</button>
        </div>
        <p class="card__hint">
          Mindestens eine Adresse, eindeutig, nicht deine eigene. Diese Konten stimmen über
          Meilenstein-Freigaben ab.
        </p>
        <div v-for="(_, i) in form.validators" :key="i" class="field field--removable">
          <input v-model="form.validators[i]" class="field__input field__input--mono" type="text" placeholder="0x…" />
          <button type="button" class="btn btn--icon" aria-label="Validator entfernen" @click="removeValidator(i)">✕</button>
        </div>
      </section> -->

      <!-- Contract + Backend: Meilensteine -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Meilensteine</h2>
          <span class="total">Summe {{ formatAmount(goalTotal) }} {{ NATIVE_CURRENCY }}</span>
        </div>
        <p class="card__hint">
          Betrag wird im Vertrag gespeichert (Finanzierungsziel = Summe der Beträge); Titel &
          Beschreibung im Backend.
        </p>
        <p v-if="attempted && milestonesEmptyError" class="field__error field__error--block">
          {{ milestonesEmptyError }}
        </p>
        <div v-for="(m, i) in form.milestones" :key="i" class="ms-create">
          <div class="field__row">
            <label class="field field--amount">
              <span class="field__label">Betrag ({{ NATIVE_CURRENCY }}) *</span>
              <input
                v-model="m.amount"
                class="field__input"
                type="text"
                inputmode="decimal"
                placeholder="z. B. 5000"
                :class="{ 'field__input--error': attempted && milestoneErrors[i]?.amount }"
                :aria-invalid="attempted && milestoneErrors[i]?.amount ? 'true' : undefined"
              />
            </label>
            <label class="field">
              <span class="field__label">Titel *</span>
              <input
                v-model="m.title"
                class="field__input"
                type="text"
                :class="{ 'field__input--error': attempted && milestoneErrors[i]?.title }"
                :aria-invalid="attempted && milestoneErrors[i]?.title ? 'true' : undefined"
              />
            </label>
            <button type="button" class="btn btn--icon" aria-label="Meilenstein entfernen" @click="removeMilestone(i)">✕</button>
          </div>
          <template v-if="attempted">
            <span v-if="milestoneErrors[i]?.amount" class="field__error">{{ milestoneErrors[i]?.amount }}</span>
            <span v-if="milestoneErrors[i]?.title" class="field__error">{{ milestoneErrors[i]?.title }}</span>
          </template>
          <label class="field">
            <span class="field__label">Beschreibung</span>
            <textarea v-model="m.description" class="field__input field__input--area" rows="2" />
          </label>
        </div>
        <button type="button" class="btn btn--small" @click="addMilestone">+ Meilenstein</button>
      </section>

      <!-- Backend: Neuigkeiten (optional) -->
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Neuigkeiten <span class="card__opt">optional</span></h2>
          <button type="button" class="btn btn--small" @click="addNews">+ Eintrag</button>
        </div>
        <div v-for="(n, i) in form.news" :key="i" class="news-create">
          <div class="field__row">
            <label class="field field--date">
              <span class="field__label">Datum</span>
              <input v-model="n.date" class="field__input" type="date" />
            </label>
            <label class="field">
              <span class="field__label">Titel</span>
              <input v-model="n.title" class="field__input" type="text" />
            </label>
            <button type="button" class="btn btn--icon" aria-label="Eintrag entfernen" @click="removeNews(i)">✕</button>
          </div>
          <label class="field">
            <span class="field__label">Text</span>
            <textarea v-model="n.body" class="field__input field__input--area" rows="3" />
          </label>
          <div class="subfield">
            <div class="subfield__head">
              <span class="field__label">Bilder</span>
              <label class="btn btn--small">
                + Bilder
                <input type="file" accept="image/*" multiple hidden @change="onNewsFiles($event, n)" />
              </label>
            </div>
            <div v-for="(img, j) in n.images" :key="j" class="chosen-row">
              <span class="chosen-row__name">{{ img }}</span>
              <button type="button" class="btn btn--icon" aria-label="Bild entfernen" @click="n.images.splice(j, 1)">✕</button>
            </div>
          </div>
        </div>
        <p v-if="!form.news.length" class="card__empty">Noch keine Neuigkeiten – kann auch später ergänzt werden.</p>
      </section>

      <div class="create__footer">
        <RouterLink :to="{ name: 'home' }" class="btn btn--ghost">Abbrechen</RouterLink>
        <button type="submit" class="btn btn--primary" :disabled="submitting">
          {{ submitting ? 'Erstelle …' : 'Projekt erstellen' }}
        </button>
      </div>

      <TxConfirmDialog
        :open="confirmOpen"
        title="Projekt erstellen"
        :summary="form.title.trim() || 'Neues Projekt'"
        :rows="confirmRows"
        total-label="Netzwerkgebühr (max.)"
        :currency="NATIVE_CURRENCY"
        hint="Das Erstellen deployt den Kampagnen-Vertrag und kostet nur die Netzwerkgebühr (Gas) – es wird kein Betrag überwiesen. Die tatsächlichen Gaskosten können niedriger ausfallen."
        confirm-label="Erstellen & deployen"
        submitting-label="Erstelle …"
        :estimate="estimate"
        :estimating="estimating"
        :estimate-error="estimateError"
        :submitting="submitting"
        @confirm="confirmCreate"
        @cancel="cancelCreate"
      />
    </form>
  </div>
</template>

<style scoped>
.create {
  display: flex;
  flex-direction: column;
  padding: 0 var(--bd-page-gutter) 64px;
}

.create__topbar {
  padding: 48px 0 16px;
}

.create__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}
.create__back:hover {
  color: var(--bd-black);
}

.create__form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 760px;
}

.create__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.create__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.create__subtitle {
  font-size: 14px;
  color: var(--bd-grey-text);
}

/* Inline validation: a red message at the field it belongs to (shown only after
   a submit attempt), plus a red border on the offending input. */
.field__error {
  font-size: 13px;
  line-height: 1.4;
  color: #dc2626;
}

/* A standalone error not tied to a single input (e.g. "at least one milestone"). */
.field__error--block {
  font-weight: 600;
}

.field__input--error {
  border-color: #dc2626;
}
.field__input--error:focus {
  border-color: #dc2626;
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

.card--chain {
  border-color: var(--bd-stroke);
  background: var(--bd-grey);
  box-shadow: none;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.card__opt,
.card__hint,
.card__empty {
  font-size: 13px;
  font-weight: 400;
  color: var(--bd-grey-text);
}

.card__opt {
  text-transform: uppercase;
  font-size: 11px;
}

.total {
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-grey-text);
}

/* Fields (shared shape with the edit view) */
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
.field--amount {
  flex: 0 0 150px;
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

.field__input--mono {
  font-family: var(--bd-font-stats, monospace);
}

.field__readonly {
  font-size: 16px;
  font-weight: 700;
  color: var(--bd-black);
  padding: 8px 0 2px;
}

.ms-create,
.news-create {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  background: var(--bd-surface);
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

/* Buttons */
.btn {
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

.field__file {
  font-size: 13px;
}

.field__chosen {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bd-black);
  word-break: break-all;
}

.field__chosen-x {
  border: none;
  background: transparent;
  color: var(--bd-grey-text);
  cursor: pointer;
}

.field__hint {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.chosen-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-size: 13px;
}

.chosen-row__name {
  word-break: break-all;
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
  align-self: flex-start;
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

.create__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .field__row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
