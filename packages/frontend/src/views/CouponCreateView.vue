<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { parseEther } from 'ethers'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import {
  addInstitution,
  createCoupon,
  estimateCreateCouponGas,
  getGiftCardConfig,
  getGiftCardOperators,
  loadGiftCardAccount,
  removeInstitution,
  type CreatedCoupon,
  type GiftCardAccount,
  type GiftCardConfig,
  type GiftCardOperators,
} from '@/services/couponsService'
import type { TxGasEstimate } from '@/services/projectsService'
import {
  DEFAULT_VALIDITY_DAYS,
  daysToSeconds,
  ethToEur,
  formatEth,
  formatEur,
  formatUnixDate,
} from '@/utils/coupon'
import { NATIVE_CURRENCY, validateAmount } from '@/utils/amount'
import { shortenAddress } from '@/utils/address'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import CouponCodeReveal from '@/components/coupon/CouponCodeReveal.vue'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// The CREATE flow. The contract restricts creation to the OWNER or a WHITELISTED
// INSTITUTION (isAllowedToCreateGiftCard); this view gates the form on that and
// shows a notice otherwise. A card is funded on-chain with its value (msg.value)
// and a validity duration; the creator gets back the private key (the code).
// Owners also get an institution-management panel. Everything goes through
// couponsService.
const wallet = useWalletStore()
const notifications = useNotificationStore()
const dialogOpen = ref(false)

const account = ref<GiftCardAccount | null>(null)
const config = ref<GiftCardConfig | null>(null)
const loadingContext = ref(false)

// Form state (strings; parsed on submit and for the live preview).
const amountEth = ref('0.01')
const validityDays = ref(String(DEFAULT_VALIDITY_DAYS))

// Create/confirm-overlay state.
const confirmOpen = ref(false)
const estimate = ref<TxGasEstimate | null>(null)
const estimating = ref(false)
const estimateError = ref<string | null>(null)
const submitting = ref(false)
const result = ref<CreatedCoupon | null>(null)

async function loadContext() {
  account.value = null
  config.value = null
  if (!wallet.address) return
  loadingContext.value = true
  try {
    const [acc, cfg] = await Promise.all([
      loadGiftCardAccount(wallet.address),
      getGiftCardConfig(),
    ])
    account.value = acc
    config.value = cfg
    if (acc.isOwner) await loadOperators()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Kontext konnte nicht geladen werden')
  } finally {
    loadingContext.value = false
  }
}
onMounted(loadContext)
watch(() => wallet.address, loadContext)

// ── Validation / live preview ────────────────────────────────────────────────
const amountValidation = computed<{ ok: true; value: string } | { ok: false; error: string }>(() => {
  const v = validateAmount(amountEth.value, 18)
  if (!v.ok) return v
  if (config.value) {
    try {
      if (parseEther(v.value) < BigInt(config.value.minAmountWei)) {
        return { ok: false, error: `Mindestwert: ${formatEth(config.value.minAmount)}.` }
      }
    } catch {
      return { ok: false, error: 'Ungültiger Betrag.' }
    }
  }
  return { ok: true, value: v.value }
})

const daysValidation = computed<{ ok: true; value: number } | { ok: false; error: string }>(() => {
  const n = Number(validityDays.value)
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: 'Bitte eine gültige Anzahl Tage angeben.' }
  }
  if (config.value && n < config.value.minValidityDays) {
    return { ok: false, error: `Mindestgültigkeit: ${config.value.minValidityDays} Tage.` }
  }
  return { ok: true, value: n }
})

const amountEurLabel = computed(() =>
  amountValidation.value.ok ? formatEur(ethToEur(Number(amountValidation.value.value))) : '',
)
const expiresLabel = computed(() =>
  daysValidation.value.ok
    ? formatUnixDate(Math.floor(Date.now() / 1000) + daysToSeconds(daysValidation.value.value))
    : '',
)
const formValid = computed(() => amountValidation.value.ok && daysValidation.value.ok)

// ── Create: estimate → confirm → send ────────────────────────────────────────
function createParams() {
  // Guarded by formValid before use.
  const amount = amountValidation.value as { ok: true; value: string }
  const days = daysValidation.value as { ok: true; value: number }
  return { amountEth: amount.value, durationSeconds: daysToSeconds(days.value) }
}

async function review() {
  if (submitting.value || !formValid.value) return
  confirmOpen.value = true
  estimate.value = null
  estimateError.value = null
  estimating.value = true
  try {
    estimate.value = await estimateCreateCouponGas(createParams())
  } catch (e) {
    estimateError.value = toUserMessage(e)
  } finally {
    estimating.value = false
  }
}

function cancel() {
  if (submitting.value) return
  confirmOpen.value = false
}

async function confirmCreate() {
  if (submitting.value || !formValid.value) return
  submitting.value = true
  try {
    result.value = await createCoupon(createParams())
    confirmOpen.value = false
    notifications.success('Ihr Gutschein wurde erstellt.')
    await wallet.refreshBalance()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Erstellen fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}

function reset() {
  result.value = null
}

// ── Owner: institution management ────────────────────────────────────────────
const operators = ref<GiftCardOperators | null>(null)
const newInstitution = ref('')
const institutionBusy = ref(false)

async function loadOperators() {
  try {
    operators.value = await getGiftCardOperators()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Institutionen konnten nicht geladen werden')
  }
}

async function addInst() {
  if (institutionBusy.value || !newInstitution.value.trim()) return
  institutionBusy.value = true
  try {
    await addInstitution(newInstitution.value.trim())
    notifications.success('Institution freigeschaltet.')
    newInstitution.value = ''
    await loadOperators()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Aktion fehlgeschlagen')
  } finally {
    institutionBusy.value = false
  }
}

async function removeInst(address: string) {
  if (institutionBusy.value) return
  institutionBusy.value = true
  try {
    await removeInstitution(address)
    notifications.success('Institution entfernt.')
    await loadOperators()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Aktion fehlgeschlagen')
  } finally {
    institutionBusy.value = false
  }
}
</script>

<template>
  <div class="create">
    <div class="create__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="create__back">← Alle Gutscheine</RouterLink>
    </div>

    <header class="create__head">
      <h1 class="create__title">Gutscheine erstellen</h1>
      <p class="create__subtitle">
        Legen Sie Gutscheine an und hinterlegen Sie ihren Wert direkt im Smart Contract. Sie erhalten
        den geheimen Gutscheincode zum Verteilen. Nur der Betreiber und freigeschaltete Institutionen
        können Gutscheine erstellen.
      </p>
    </header>

    <!-- Not connected -->
    <div v-if="!wallet.isConnected" class="create__panel">
      <span class="create__lock"><AppIcon name="lock" :size="20" /></span>
      <h2 class="create__panel-title">Wallet verbinden</h2>
      <p class="create__lead">
        Melden Sie sich mit der Wallet des Betreibers oder einer freigeschalteten Institution an.
      </p>
      <button class="create__btn" type="button" @click="dialogOpen = true">
        Einloggen mit Wallet
      </button>
    </div>

    <!-- Connected but not allowed to create -->
    <div v-else-if="account && !account.canCreate" class="create__panel">
      <span class="create__lock"><AppIcon name="lock" :size="20" /></span>
      <h2 class="create__panel-title">Nicht berechtigt</h2>
      <p class="create__lead">
        Diese Wallet ({{ shortenAddress(wallet.address ?? '') }}) ist weder Betreiber noch eine
        freigeschaltete Institution. Nur diese können Gutscheine erstellen. Der Betreiber kann
        Institutionen im Verwaltungsbereich freischalten.
      </p>
      <RouterLink :to="{ name: 'coupons' }" class="create__btn create__btn--ghost">
        Zu allen Gutscheinen
      </RouterLink>
    </div>

    <!-- Success: created card + its code -->
    <template v-else-if="result">
      <div class="create__success" role="status">
        <p class="create__success-title">
          <AppIcon name="check" :size="16" /> Gutschein erstellt
        </p>
        <p>
          Wert im Contract hinterlegt: <strong>{{ formatEth(result.amount) }}</strong>
          (≈ {{ formatEur(result.amountEur) }}), gültig bis
          <strong>{{ formatUnixDate(result.expirationDate) }}</strong>.
        </p>
        <p class="create__success-hint">
          Unten sehen Sie den Gutscheincode – <strong>er wird nur jetzt angezeigt und nicht
          gespeichert</strong>. Kopieren Sie ihn und bewahren Sie ihn sicher auf; er kann später
          nicht erneut abgerufen werden. Den Status Ihrer Gutscheine sehen Sie unter
          <RouterLink :to="{ name: 'my-coupons' }">Meine Gutscheine</RouterLink>.
        </p>
      </div>

      <div class="create__list">
        <CouponCodeReveal
          :redemption-key="result.redemptionKey"
          :private-key="result.privateKey"
          :amount="result.amount"
          :amount-eur="result.amountEur"
        />
      </div>

      <button class="create__btn create__btn--ghost" type="button" @click="reset">
        Weiteren Gutschein erstellen
      </button>
    </template>

    <!-- Connected + allowed: the create form -->
    <div v-else-if="account" class="create__grid">
      <section class="card create__form-card">
        <h2 class="card__title">Neuer Gutschein</h2>
        <p class="create__form-lead">
          Angemeldet als <strong>{{ shortenAddress(wallet.address ?? '') }}</strong>
          <span v-if="account.isOwner"> (Betreiber)</span>
          <span v-else-if="account.isInstitution"> (Institution)</span>
          – diese Wallet wird als Ersteller hinterlegt.
        </p>

        <form class="create__form" @submit.prevent="review">
          <label class="field">
            <span class="field__label">Wert des Gutscheins (ETH)</span>
            <input
              v-model="amountEth"
              class="field__input"
              type="text"
              inputmode="decimal"
              placeholder="z. B. 0.01"
            />
            <span v-if="!amountValidation.ok" class="field__error">{{ amountValidation.error }}</span>
            <span v-else class="field__hint">≈ {{ amountEurLabel }}</span>
          </label>

          <label class="field">
            <span class="field__label">Gültigkeit (Tage)</span>
            <input
              v-model="validityDays"
              class="field__input"
              type="text"
              inputmode="numeric"
              placeholder="z. B. 365"
            />
            <span v-if="!daysValidation.ok" class="field__error">{{ daysValidation.error }}</span>
            <span v-else-if="expiresLabel" class="field__hint">Gültig bis {{ expiresLabel }}</span>
          </label>

          <button type="submit" class="create__submit" :disabled="submitting || !formValid">
            Gutschein erstellen
          </button>
          <p class="create__note">
            Das Schlüsselpaar wird lokal erzeugt – der private Schlüssel verlässt die Seite nie, nur
            die öffentliche Adresse geht on-chain.
          </p>
        </form>
      </section>

      <!-- Info / contract rules -->
      <aside class="card create__info">
        <h2 class="card__title">Regeln des Contracts</h2>
        <template v-if="config">
          <div class="create__line">
            <span>Mindestwert</span>
            <span>{{ formatEth(config.minAmount) }}</span>
          </div>
          <div class="create__line">
            <span>Mindestgültigkeit</span>
            <span>{{ config.minValidityDays }} Tage</span>
          </div>
          <p class="create__info-note">
            Der Wert wird beim Erstellen an den Contract gezahlt und beim Einlösen an die Institution
            ausgezahlt. Läuft der Gutschein ab, können Sie ihn zurückfordern.
          </p>
        </template>
        <p v-else class="create__info-note">Lade Vertragsregeln …</p>
      </aside>
    </div>

    <p v-else-if="loadingContext" class="create__state">Lade …</p>

    <!-- Owner: institution management -->
    <section v-if="account?.isOwner" class="card create__admin">
      <h2 class="card__title">Institutionen verwalten</h2>
      <p class="create__admin-lead">
        Freigeschaltete Institutionen können Gutscheine erstellen und einlösen. Nur Sie als Betreiber
        können diese Liste ändern.
      </p>

      <form class="create__admin-form" @submit.prevent="addInst">
        <input
          v-model="newInstitution"
          class="field__input field__input--mono"
          type="text"
          placeholder="0x… Adresse der Institution"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="submit" class="create__admin-add" :disabled="institutionBusy || !newInstitution.trim()">
          Freischalten
        </button>
      </form>

      <ul v-if="operators && operators.institutions.length" class="create__admin-list">
        <li v-for="inst in operators.institutions" :key="inst" class="create__admin-item">
          <code :title="inst">{{ shortenAddress(inst) }}</code>
          <button
            type="button"
            class="create__admin-remove"
            :disabled="institutionBusy"
            @click="removeInst(inst)"
          >
            Entfernen
          </button>
        </li>
      </ul>
      <p v-else class="create__admin-empty">Noch keine Institutionen freigeschaltet.</p>
    </section>

    <TxConfirmDialog
      :open="confirmOpen"
      title="Erstellung bestätigen"
      :summary="
        amountValidation.ok ? `Gutschein über ${formatEth(Number(amountValidation.value))} erstellen` : undefined
      "
      :rows="
        amountValidation.ok
          ? [{ label: 'Hinterlegter Wert', value: formatEth(Number(amountValidation.value)) }]
          : []
      "
      total-label="Gesamt (max.)"
      :currency="NATIVE_CURRENCY"
      hint="Der hinterlegte Wert plus die Netzwerkgebühr wird von Ihrer Wallet an den Contract gezahlt."
      :estimate="estimate"
      :estimating="estimating"
      :estimate-error="estimateError"
      :submitting="submitting"
      confirm-label="Jetzt erstellen"
      submitting-label="Erstelle …"
      @confirm="confirmCreate"
      @cancel="cancel"
    />

    <LoginDialog :open="dialogOpen" @close="dialogOpen = false" />
  </div>
</template>

<style scoped>
.create {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 var(--bd-page-gutter) 64px;
}

.create__topbar {
  padding: 48px 0 0;
}

.create__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.create__back:hover {
  color: var(--bd-black);
}

.create__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 680px;
}

.create__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.create__subtitle {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.create__grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}

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

.card__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--bd-black);
}

.create__form-lead {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.create__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
}

.field__input:focus {
  outline: none;
  border-color: var(--bd-black);
}

.field__input--mono {
  font-family: var(--bd-font-stats, monospace);
}

.field__hint {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.field__error {
  font-size: 12px;
  font-weight: 600;
  color: #dc2626;
}

.create__submit {
  align-self: flex-start;
  padding: 12px 20px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.create__submit:disabled {
  opacity: 0.6;
}

.create__note {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.create__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.create__info-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.create__state {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.create__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 40px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
  max-width: 620px;
}

.create__lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-icon-dark);
  color: var(--bd-surface);
}

.create__panel-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--bd-black);
}

.create__lead {
  max-width: 520px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.create__btn {
  padding: 12px 20px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.create__btn--ghost {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}

.create__success {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
  font-size: 14px;
  color: var(--bd-black);
}

.create__success-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 800;
  color: var(--bd-green);
}

.create__success-hint {
  font-size: 13px;
  line-height: 1.5;
  color: var(--bd-black);
}

.create__success-hint a,
.create__success a {
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
}

.create__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.create__admin {
  max-width: 680px;
}

.create__admin-lead {
  font-size: 13px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.create__admin-form {
  display: flex;
  gap: 10px;
}

.create__admin-form .field__input {
  flex: 1 1 0;
  min-width: 0;
}

.create__admin-add {
  flex-shrink: 0;
  padding: 10px 16px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.create__admin-add:disabled {
  opacity: 0.6;
  cursor: default;
}

.create__admin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
}

.create__admin-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bd-grey);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
  font-family: var(--bd-font-stats, monospace);
  font-size: 13px;
  color: var(--bd-black);
}

.create__admin-remove {
  border: none;
  background: transparent;
  color: #dc2626;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.create__admin-remove:disabled {
  opacity: 0.5;
  cursor: default;
}

.create__admin-empty {
  font-size: 13px;
  color: var(--bd-grey-text);
}

@media (max-width: 820px) {
  .create__grid {
    grid-template-columns: 1fr;
  }
}
</style>
