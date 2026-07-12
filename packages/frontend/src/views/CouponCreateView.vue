<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import { createCoupons, type CreateCouponsResult } from '@/services/couponsService'
import { COUPON_NOMINAL_EUR, couponCreationCost, eurToEth, formatEth, formatEur } from '@/utils/coupon'
import { shortenAddress } from '@/utils/address'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import CouponCodeReveal from '@/components/coupon/CouponCodeReveal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// The CREATE flow: any connected wallet mints its own coupons and pays the
// contract for them (escrowed discount value + a per-coupon fee). The private
// keys are shown here so the creator can copy and distribute them off-site.
// Everything runs through couponsService (the integration seam); no distribution
// happens on the site.
const wallet = useWalletStore()
const notifications = useNotificationStore()
const dialogOpen = ref(false)

// Form state (kept as strings; parsed on submit and for the live quote).
const count = ref('5')
const valueEur = ref(String(COUPON_NOMINAL_EUR))

const submitting = ref(false)
const result = ref<CreateCouponsResult | null>(null)

// Live cost quote — mirrors what the service will charge (escrow + fee).
const quote = computed(() => {
  const n = Number(count.value)
  const v = Number(valueEur.value)
  if (!Number.isInteger(n) || n < 1 || !(v > 0)) return null
  return couponCreationCost(n, eurToEth(v))
})

async function submit() {
  if (submitting.value || !wallet.address) return
  submitting.value = true
  result.value = null
  try {
    result.value = await createCoupons(wallet.address, {
      count: Number(count.value),
      valueEur: Number(valueEur.value),
    })
    notifications.success('Deine Gutscheine wurden erstellt.')
  } catch (e) {
    notifications.error(toUserMessage(e), 'Erstellen fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}

function reset() {
  result.value = null
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
        Legen Sie eigene Gutscheine an. Beim Erstellen zahlen Sie den Rabattwert plus eine Gebühr an
        den Smart Contract und erhalten die privaten Schlüssel zum Verteilen.
      </p>
    </header>

    <!-- Not connected: needs a wallet to create. -->
    <div v-if="!wallet.isConnected" class="create__panel">
      <span class="create__lock"><AppIcon name="lock" :size="20" /></span>
      <h2 class="create__panel-title">Wallet verbinden</h2>
      <p class="create__lead">
        Gutscheine werden von Nutzern erstellt, nicht von der Plattform. Melden Sie sich mit Ihrer
        Wallet an, um eigene Gutscheine zu erstellen.
      </p>
      <button class="create__btn" type="button" @click="dialogOpen = true">
        Einloggen mit Wallet
      </button>
    </div>

    <!-- Success: created coupons + their codes -->
    <template v-else-if="result">
      <div class="create__success" role="status">
        <p class="create__success-title">
          <AppIcon name="check" :size="16" />
          {{ result.count }} {{ result.count === 1 ? 'Gutschein' : 'Gutscheine' }} erstellt
        </p>
        <p>
          Bezahlt an den Contract: <strong>{{ formatEth(result.cost.totalEth) }}</strong>
          (≈ {{ formatEur(result.cost.totalEur) }}).
        </p>
        <p class="create__success-hint">
          Unten sehen Sie die Gutscheincodes. <strong>Kopieren und sicher aufbewahren</strong> – der
          private Schlüssel wird nur der erstellenden Wallet angezeigt. Sie finden alle Ihre
          Gutscheine jederzeit unter
          <RouterLink :to="{ name: 'my-coupons' }">Meine Gutscheine</RouterLink>.
        </p>
      </div>

      <div class="create__list">
        <CouponCodeReveal
          v-for="c in result.coupons"
          :key="c.id"
          :coupon-id="c.id"
          :private-key="c.privateKey"
          :coupon-address="c.couponAddress"
          :value="c.value"
          :value-eur="c.valueEur"
        />
      </div>

      <button class="create__btn create__btn--ghost" type="button" @click="reset">
        Weitere Gutscheine erstellen
      </button>
    </template>

    <!-- Connected: the create form -->
    <div v-else class="create__grid">
      <section class="card create__form-card">
        <h2 class="card__title">Neue Gutscheine</h2>
        <p class="create__form-lead">
          Angemeldet als <strong>{{ shortenAddress(wallet.address ?? '') }}</strong> – diese Wallet
          wird als Ersteller hinterlegt.
        </p>

        <form class="create__form" @submit.prevent="submit">
          <label class="field">
            <span class="field__label">Anzahl Gutscheine</span>
            <input
              v-model="count"
              class="field__input"
              type="text"
              inputmode="numeric"
              placeholder="z. B. 5"
            />
          </label>
          <label class="field">
            <span class="field__label">Rabatt pro Gutschein (EUR)</span>
            <input
              v-model="valueEur"
              class="field__input"
              type="text"
              inputmode="decimal"
              placeholder="z. B. 5"
            />
          </label>

          <button type="submit" class="create__submit" :disabled="submitting || !quote">
            {{ submitting ? 'Erstelle Gutscheine …' : 'Gutscheine erstellen' }}
          </button>
          <p class="create__note">
            Die Schlüsselpaare werden lokal erzeugt – der private Schlüssel verlässt die Seite nie,
            nur die öffentlichen Adressen gehen on-chain.
          </p>
        </form>
      </section>

      <!-- Live cost quote -->
      <aside class="card create__cost">
        <h2 class="card__title">Kosten</h2>
        <template v-if="quote">
          <div class="create__line">
            <span>Rückstellung ({{ quote.count }} × {{ formatEur(quote.escrowEur / quote.count) }})</span>
            <span>{{ formatEth(quote.escrowEth) }}</span>
          </div>
          <div class="create__line">
            <span>Erstellungsgebühr</span>
            <span>{{ formatEth(quote.feeEth) }}</span>
          </div>
          <div class="create__line create__line--total">
            <span>Gesamt an Contract</span>
            <span>{{ formatEth(quote.totalEth) }}</span>
          </div>
          <p class="create__cost-hint">≈ {{ formatEur(quote.totalEur) }}</p>
          <p class="create__cost-note">
            Die Rückstellung deckt die Rabatte, die beim Einlösen ausgezahlt werden; die Gebühr ist
            das Entgelt an den Contract.
          </p>
        </template>
        <p v-else class="create__cost-empty">
          Bitte eine gültige Anzahl (≥ 1) und einen Rabattwert &gt; 0 eingeben.
        </p>
      </aside>
    </div>

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

.create__line--total {
  padding-top: 16px;
  border-top: 1px solid var(--bd-divider);
  font-size: 16px;
  font-weight: 800;
  color: var(--bd-black);
}

.create__cost-hint {
  font-size: 13px;
  color: var(--bd-grey-text);
  text-align: right;
}

.create__cost-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.create__cost-empty {
  font-size: 13px;
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

@media (max-width: 820px) {
  .create__grid {
    grid-template-columns: 1fr;
  }
}
</style>
