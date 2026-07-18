<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  estimateRedeemCouponGas,
  listRedeemShops,
  previewRedeemCoupon,
  redeemCoupon,
  type RedeemResult,
  type RedeemShop,
} from '@/services/couponsService'
import type { TxGasEstimate } from '@/services/projectsService'
import type { Coupon } from '@/types/coupon'
import { useNotificationStore } from '@/stores/notifications'
import { useWalletStore } from '@/stores/wallet'
import { toUserMessage } from '@/utils/errors'
import { ethToEur, formatEth, formatEur } from '@/utils/coupon'
import { NATIVE_CURRENCY } from '@/utils/amount'
import { shortenAddress } from '@/utils/address'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// Customer-facing merchant CHECKOUT. You are the CUSTOMER: you pick the shop you
// are buying from, enter your gift-card code, and the SHOP (a whitelisted
// institution) receives the gift-card value directly from the contract. You never
// sign, pay gas, or touch the money — and you don't log in. The card code signs an
// EIP-712 message binding the shop; the shop's wallet submits it. All via
// couponsService.
const route = useRoute()
const notifications = useNotificationStore()
// Not required to redeem (the shop signs), but if someone IS logged in — e.g. as
// the shop in the demo — we refresh their navbar balance after a redeem so the
// received funds show up without a page reload.
const wallet = useWalletStore()

// A mock order the gift card is applied to (illustrative only).
const ORDER_ETH = 0.05

const shops = ref<RedeemShop[]>([])
const loadingShops = ref(true)
const selectedShop = ref('')

const code = ref('')
const previewCard = ref<Coupon | null>(null)
const result = ref<RedeemResult | null>(null)
const inputError = ref<string | null>(null)

// Confirm-overlay state (estimate → confirm → send), mirroring the donation flow.
const confirmOpen = ref(false)
const estimate = ref<TxGasEstimate | null>(null)
const estimating = ref(false)
const estimateError = ref<string | null>(null)
const submitting = ref(false)

const shopLabel = (s: RedeemShop) => `${shortenAddress(s.address)} · ${s.label}`
const selectedShopObj = computed(() => shops.value.find((s) => s.address === selectedShop.value) ?? null)
const appliedDiscount = computed(() => result.value?.discount ?? previewCard.value?.amount ?? 0)
const total = computed(() => Math.max(ORDER_ETH - (result.value?.discount ?? 0), 0))

async function loadShops() {
  loadingShops.value = true
  try {
    shops.value = await listRedeemShops()
    const first = shops.value[0]
    if (first && !selectedShop.value) selectedShop.value = first.address
  } catch (e) {
    notifications.error(toUserMessage(e), 'Shops konnten nicht geladen werden')
  } finally {
    loadingShops.value = false
  }
}

onMounted(() => {
  if (typeof route.query.key === 'string') code.value = route.query.key
  loadShops()
})

async function review() {
  if (submitting.value) return
  inputError.value = null
  if (!code.value.trim()) {
    inputError.value = 'Bitte den Gutscheincode (privaten Schlüssel) eingeben.'
    return
  }
  if (!selectedShop.value) {
    inputError.value = 'Bitte einen Shop auswählen.'
    return
  }
  // Resolve + validate the card (discount preview + early errors), then open the
  // overlay and estimate the shop's redemption gas.
  estimating.value = true
  estimate.value = null
  estimateError.value = null
  try {
    previewCard.value = await previewRedeemCoupon(code.value)
  } catch (e) {
    estimating.value = false
    notifications.error(toUserMessage(e), 'Einlösen nicht möglich')
    return
  }
  confirmOpen.value = true
  try {
    estimate.value = await estimateRedeemCouponGas(code.value, selectedShop.value)
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

async function confirmRedeem() {
  if (submitting.value || !selectedShop.value) return
  submitting.value = true
  try {
    result.value = await redeemCoupon(code.value, selectedShop.value)
    confirmOpen.value = false
    notifications.success('Der Gutschein wurde eingelöst.')
    // If the logged-in account is the shop, its balance just changed — refresh
    // the navbar so the credited funds appear without a reload.
    await wallet.refreshBalance()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Einlösen fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="redeem">
    <div class="redeem__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="redeem__back">← Alle Gutscheine</RouterLink>
    </div>

    <header class="redeem__head">
      <h1 class="redeem__title">Beim Kauf einlösen</h1>
      <p class="redeem__subtitle">
        Checkout-Demo aus Kundensicht: Shop wählen, Gutscheincode eingeben – der Gutscheinbetrag wird
        direkt an den Shop ausgezahlt. Sie müssen sich nicht anmelden und zahlen nichts.
      </p>
    </header>

    <div class="redeem__grid">
      <!-- Order summary -->
      <aside class="card redeem__order">
        <h2 class="card__title">Warenkorb</h2>
        <div class="redeem__line">
          <span>Zwischensumme</span>
          <span>{{ formatEth(ORDER_ETH) }}</span>
        </div>
        <div class="redeem__line redeem__line--discount" :class="{ 'is-on': appliedDiscount > 0 }">
          <span>Gutschein</span>
          <span>{{ appliedDiscount > 0 ? '−' + formatEth(appliedDiscount) : '—' }}</span>
        </div>
        <div class="redeem__line redeem__line--total">
          <span>Zu zahlen</span>
          <span>{{ formatEth(total) }}</span>
        </div>
        <p class="redeem__order-hint">≈ {{ formatEur(ethToEur(total)) }}</p>
      </aside>

      <!-- Redeem form -->
      <section class="card redeem__form-card">
        <h2 class="card__title">Gutschein einlösen</h2>

        <!-- No shops available (nothing deployed/whitelisted, or production). -->
        <div v-if="!loadingShops && shops.length === 0" class="redeem__warn" role="alert">
          <AppIcon name="circle-alert" :size="15" />
          <span>
            Keine freigeschalteten Shops verfügbar. Für die lokale Demo muss der
            GiftCardProject-Contract deployt und mindestens eine Institution freigeschaltet sein.
          </span>
        </div>

        <div v-else-if="result" class="redeem__success" role="status">
          <p class="redeem__success-title">
            <AppIcon name="check" :size="16" /> Gutschein eingelöst
          </p>
          <p>
            {{ formatEur(result.discountEur) }} ({{ formatEth(result.discount) }}) wurden dem Shop
            <template v-if="selectedShopObj">{{ shortenAddress(selectedShopObj.address) }}</template>
            ausgezahlt.
          </p>
        </div>

        <form v-else class="redeem__form" @submit.prevent="review">
          <label class="field">
            <span class="field__label">Shop (wo Sie einkaufen)</span>
            <select v-model="selectedShop" class="field__input" :disabled="loadingShops">
              <option v-if="loadingShops" value="">Lade Shops …</option>
              <option v-for="s in shops" :key="s.address" :value="s.address">
                {{ shopLabel(s) }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="field__label">Gutscheincode (Privater Schlüssel)</span>
            <input
              v-model="code"
              class="field__input field__input--mono"
              type="text"
              placeholder="0x…"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <p v-if="inputError" class="redeem__error" role="alert">{{ inputError }}</p>

          <button
            type="submit"
            class="redeem__submit"
            :disabled="submitting || estimating || shops.length === 0"
          >
            {{ estimating ? 'Prüfe Gutschein …' : 'Gutschein prüfen & einlösen' }}
          </button>
          <p class="redeem__note">
            Der Shop (eine freigeschaltete Institution) reicht die Einlösung ein und erhält den
            Betrag. Ihr Code wird lokal signiert – nur die Signatur geht an den Contract, der
            Schlüssel verlässt nie die Seite.
          </p>
        </form>
      </section>
    </div>

    <TxConfirmDialog
      :open="confirmOpen"
      title="Einlösung bestätigen"
      :summary="
        previewCard && selectedShopObj
          ? `Gutschein über ${formatEth(previewCard.amount)} bei ${shortenAddress(selectedShopObj.address)} einlösen`
          : undefined
      "
      :rows="
        previewCard
          ? [
              { label: 'Gutscheinwert', value: formatEth(previewCard.amount) },
              { label: 'Empfänger (Shop)', value: selectedShopObj ? shortenAddress(selectedShopObj.address) : '—' },
            ]
          : []
      "
      total-label="Netzwerkgebühr (max., zahlt der Shop)"
      :currency="NATIVE_CURRENCY"
      hint="Der Gutscheinbetrag wird an den Shop ausgezahlt; die Netzwerkgebühr trägt der Shop. Sie als Kundin/Kunde zahlen nichts."
      :estimate="estimate"
      :estimating="estimating"
      :estimate-error="estimateError"
      :submitting="submitting"
      confirm-label="Jetzt einlösen"
      submitting-label="Löse ein …"
      @confirm="confirmRedeem"
      @cancel="cancel"
    />
  </div>
</template>

<style scoped>
.redeem {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 var(--bd-page-gutter) 64px;
}

.redeem__topbar {
  padding: 48px 0 0;
}

.redeem__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.redeem__back:hover {
  color: var(--bd-black);
}

.redeem__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.redeem__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.redeem__subtitle {
  font-size: 14px;
  color: var(--bd-grey-text);
  max-width: 680px;
  line-height: 1.5;
}

.redeem__grid {
  display: grid;
  grid-template-columns: 320px 1fr;
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

.redeem__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.redeem__line--discount.is-on {
  color: var(--bd-green);
  font-weight: 700;
}

.redeem__line--total {
  padding-top: 16px;
  border-top: 1px solid var(--bd-divider);
  font-size: 16px;
  font-weight: 800;
  color: var(--bd-black);
}

.redeem__order-hint {
  font-size: 13px;
  color: var(--bd-grey-text);
  text-align: right;
}

.redeem__form {
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

.redeem__error {
  font-size: 14px;
  font-weight: 600;
  color: #dc2626;
}

.redeem__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--bd-radius-sm);
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  line-height: 1.45;
}

.redeem__submit {
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

.redeem__submit:disabled {
  opacity: 0.6;
}

.redeem__note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.redeem__success {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
  font-size: 14px;
  color: var(--bd-black);
}

.redeem__success-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--bd-green);
}

@media (max-width: 720px) {
  .redeem__grid {
    grid-template-columns: 1fr;
  }
}
</style>
