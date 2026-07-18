<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  estimateRedeemCouponGas,
  getRedeemShop,
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

// Customer-facing merchant CHECKOUT, dressed up as a familiar online-shop
// product page so the gift-card flow reads like real shopping. You are the
// CUSTOMER: you pick the shop, enter your gift-card code, and the SHOP (a
// whitelisted institution) receives the gift-card value directly from the
// contract. You never sign, pay gas, or touch the money — and you don't log in.
// The card code signs an EIP-712 message binding the shop; the shop's wallet
// submits it. All chain interaction goes through couponsService. (This is a
// generic demo storefront — not affiliated with any real retailer.)
const route = useRoute()
const notifications = useNotificationStore()
// Not required to redeem (the shop signs), but if someone IS logged in — e.g. as
// the shop in the demo — we refresh their navbar balance after a redeem so the
// received funds show up without a page reload.
const wallet = useWalletStore()

// The demo product the gift card is applied against (illustrative only). Its
// price defines the cart subtotal.
const PRODUCT = {
  brand: 'SoundWave',
  name: 'SoundWave Pro ANC – Kabellose Over-Ear Kopfhörer, Bluetooth 5.3, Active Noise Cancelling, 40 h Akku',
  rating: 4.6,
  reviews: 2847,
  priceEth: 0.05,
  bullets: [
    'Adaptives Active Noise Cancelling – blendet Umgebungslärm in Echtzeit aus.',
    'Bis zu 40 Stunden Wiedergabe, Schnellladung: 10 Min. laden = 5 Std. hören.',
    'Bluetooth 5.3 mit Multipoint – gleichzeitig mit zwei Geräten verbunden.',
    'Plüsch-Ohrpolster mit Memory-Schaum für Tragekomfort über Stunden.',
  ],
}
const ORDER_ETH = PRODUCT.priceEth

// A single, fixed shop — the "Beispiel-Shop" persona — mirroring a real
// deployment where the customer is on one shop's checkout (no institution
// picker). Null while loading or if it is not whitelisted on-chain.
const shop = ref<RedeemShop | null>(null)
const loadingShop = ref(true)

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

const productEur = computed(() => ethToEur(PRODUCT.priceEth))
const ratingStars = computed(() => {
  // Five slots, each 'full' | 'half' | 'empty', from the fractional rating.
  return Array.from({ length: 5 }, (_, i) => {
    const d = PRODUCT.rating - i
    return d >= 0.75 ? 'full' : d >= 0.25 ? 'half' : 'empty'
  })
})

const appliedDiscount = computed(() => result.value?.discount ?? previewCard.value?.amount ?? 0)
const total = computed(() => Math.max(ORDER_ETH - (result.value?.discount ?? 0), 0))

async function loadShop() {
  loadingShop.value = true
  try {
    shop.value = await getRedeemShop()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Shop konnte nicht geladen werden')
  } finally {
    loadingShop.value = false
  }
}

onMounted(() => {
  if (typeof route.query.key === 'string') code.value = route.query.key
  loadShop()
})

async function review() {
  if (submitting.value) return
  inputError.value = null
  if (!code.value.trim()) {
    inputError.value = 'Bitte den Gutscheincode (privaten Schlüssel) eingeben.'
    return
  }
  if (!shop.value) {
    inputError.value = 'Kein Shop verfügbar.'
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
    estimate.value = await estimateRedeemCouponGas(code.value, shop.value.address)
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
  if (submitting.value || !shop.value) return
  submitting.value = true
  try {
    result.value = await redeemCoupon(code.value, shop.value.address)
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
  <div class="shop">
    <!-- Mock storefront chrome ------------------------------------------------->
    <div class="shop__bar">
      <div class="shop__bar-inner">
        <RouterLink :to="{ name: 'coupons' }" class="shop__logo">
          Beispiel<span class="shop__logo-accent">Shop</span>
        </RouterLink>
        <div class="shop__search" aria-hidden="true">
          <input class="shop__search-input" placeholder="Produkte durchsuchen …" disabled />
          <span class="shop__search-btn"><AppIcon name="search" :size="16" /></span>
        </div>
        <div class="shop__bar-actions" aria-hidden="true">
          <span class="shop__bar-item">Konto</span>
          <span class="shop__bar-item shop__bar-cart">
            <AppIcon name="shopping-cart" :size="18" />
            <span class="shop__cart-count">1</span>
          </span>
        </div>
      </div>
    </div>

    <div class="shop__wrap">
      <div class="shop__demo-note" role="note">
        <AppIcon name="info" :size="15" />
        <span>
          <strong>Demo-Shop.</strong> So löst du einen Gutschein beim Einkauf ein: Der
          Gutscheinbetrag wird direkt dem Shop gutgeschrieben – du musst dich nicht anmelden und
          zahlst selbst nichts.
        </span>
      </div>

      <nav class="shop__crumbs" aria-label="Breadcrumb">
        <RouterLink :to="{ name: 'coupons' }">Gutscheine</RouterLink>
        <span>›</span>
        <span>Elektronik</span>
        <span>›</span>
        <span>Kopfhörer</span>
        <span>›</span>
        <span class="shop__crumbs-current">{{ PRODUCT.brand }} Pro ANC</span>
      </nav>

      <!-- Product detail: gallery · info · buy box ---------------------------->
      <div class="pdp">
        <!-- Gallery -->
        <div class="pdp__gallery">
          <div class="pdp__thumbs" aria-hidden="true">
            <span class="pdp__thumb is-active"></span>
            <span class="pdp__thumb"></span>
            <span class="pdp__thumb"></span>
            <span class="pdp__thumb"></span>
          </div>
          <div class="pdp__image">
            <svg viewBox="0 0 240 240" role="img" aria-label="Produktbild Kopfhörer">
              <defs>
                <linearGradient id="cup" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#3a3f45" />
                  <stop offset="1" stop-color="#16181c" />
                </linearGradient>
              </defs>
              <path
                d="M52 132 V116 a68 68 0 0 1 136 0 V132"
                fill="none"
                stroke="#2b2f34"
                stroke-width="14"
                stroke-linecap="round"
              />
              <rect x="34" y="120" width="42" height="74" rx="20" fill="url(#cup)" />
              <rect x="164" y="120" width="42" height="74" rx="20" fill="url(#cup)" />
              <rect x="44" y="132" width="22" height="50" rx="11" fill="#54c1a0" opacity="0.9" />
              <rect x="174" y="132" width="22" height="50" rx="11" fill="#54c1a0" opacity="0.9" />
            </svg>
          </div>
        </div>

        <!-- Info -->
        <div class="pdp__info">
          <span class="pdp__brand">{{ PRODUCT.brand }}</span>
          <h1 class="pdp__title">{{ PRODUCT.name }}</h1>

          <div class="pdp__rating">
            <span class="pdp__stars" aria-hidden="true">
              <span
                v-for="(s, i) in ratingStars"
                :key="i"
                class="pdp__star"
                :class="`pdp__star--${s}`"
                >★</span
              >
            </span>
            <span class="pdp__rating-num">{{ PRODUCT.rating.toFixed(1) }}</span>
            <span class="pdp__reviews">{{ PRODUCT.reviews.toLocaleString('de-DE') }} Bewertungen</span>
          </div>

          <div class="pdp__divider"></div>

          <ul class="pdp__bullets">
            <li v-for="(b, i) in PRODUCT.bullets" :key="i">{{ b }}</li>
          </ul>
        </div>

        <!-- Buy box -->
        <aside class="buybox card">
          <div class="buybox__price">
            <span class="buybox__price-eur">{{ formatEur(productEur) }}</span>
            <span class="buybox__price-eth">≈ {{ formatEth(PRODUCT.priceEth) }}</span>
          </div>
          <p class="buybox__delivery">
            <strong>GRATIS Lieferung</strong> morgen · Auf Lager
          </p>
          <span class="buybox__stock">Auf Lager</span>

          <!-- Success state -->
          <div v-if="result" class="buybox__success" role="status">
            <p class="buybox__success-title">
              <AppIcon name="check" :size="18" /> Bestellung aufgegeben
            </p>
            <p class="buybox__success-text">
              Gutschein eingelöst: {{ formatEur(result.discountEur) }} ({{ formatEth(result.discount) }})
              wurden dem Shop
              <template v-if="shop">{{ shop.label }}</template>
              gutgeschrieben. Zu zahlen: <strong>{{ formatEth(total) }}</strong>.
            </p>
            <RouterLink :to="{ name: 'coupons' }" class="buybox__success-link">
              Zurück zu den Gutscheinen →
            </RouterLink>
          </div>

          <!-- No shop available -->
          <div v-else-if="!loadingShop && !shop" class="buybox__warn" role="alert">
            <AppIcon name="circle-alert" :size="15" />
            <span>
              Der Shop ist nicht verfügbar. Für die lokale Demo muss der GiftCardProject-Contract
              deployt und der „Beispiel-Shop“ als Institution freigeschaltet sein.
            </span>
          </div>

          <!-- Buy / redeem form -->
          <form v-else class="buybox__form" @submit.prevent="review">
            <div class="buybox__gift">
              <span class="buybox__gift-head">
                <AppIcon name="gift" :size="15" /> Geschenkgutschein einlösen
              </span>

              <div class="buybox__shop">
                <span class="field__label">Shop</span>
                <span class="buybox__shop-name">
                  {{ shop?.label ?? '…' }}
                  <small v-if="shop">{{ shortenAddress(shop.address) }}</small>
                </span>
              </div>

              <label class="field">
                <span class="field__label">Gutscheincode</span>
                <input
                  v-model="code"
                  class="field__input field__input--mono"
                  type="text"
                  placeholder="0x…"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
            </div>

            <!-- Cart summary -->
            <div class="buybox__summary">
              <div class="buybox__line">
                <span>Zwischensumme</span>
                <span>{{ formatEth(ORDER_ETH) }}</span>
              </div>
              <div
                class="buybox__line buybox__line--discount"
                :class="{ 'is-on': appliedDiscount > 0 }"
              >
                <span>Gutschein</span>
                <span>{{ appliedDiscount > 0 ? '−' + formatEth(appliedDiscount) : '—' }}</span>
              </div>
              <div class="buybox__line buybox__line--total">
                <span>Zu zahlen</span>
                <span>{{ formatEth(total) }}</span>
              </div>
              <p class="buybox__summary-eur">≈ {{ formatEur(ethToEur(total)) }}</p>
            </div>

            <p v-if="inputError" class="buybox__error" role="alert">{{ inputError }}</p>

            <button
              type="submit"
              class="buybox__cta"
              :disabled="submitting || estimating || !shop"
            >
              {{ estimating ? 'Prüfe Gutschein …' : 'Mit Gutschein bezahlen' }}
            </button>
          </form>
        </aside>
      </div>
    </div>

    <TxConfirmDialog
      :open="confirmOpen"
      title="Einlösung bestätigen"
      :summary="
        previewCard && shop
          ? `Gutschein über ${formatEth(previewCard.amount)} bei ${shop.label} einlösen`
          : undefined
      "
      :rows="
        previewCard
          ? [
              { label: 'Gutscheinwert', value: formatEth(previewCard.amount) },
              {
                label: 'Empfänger (Shop)',
                value: shop ? shortenAddress(shop.address) : '—',
              },
            ]
          : []
      "
      total-label="Netzwerkgebühr (max., zahlt der Shop)"
      :currency="NATIVE_CURRENCY"
      hint="Der Gutscheinbetrag wird an den Shop ausgezahlt; die Netzwerkgebühr trägt der Shop. Du als Kundin/Kunde zahlst nichts."
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
.shop {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* Storefront top bar ------------------------------------------------------- */
.shop__bar {
  background: #131a22;
  color: #fff;
}

.shop__bar-inner {
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px var(--bd-page-gutter);
}

.shop__logo {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #fff;
}

.shop__logo-accent {
  color: #54c1a0;
}

.shop__search {
  display: flex;
  flex: 1 1 auto;
  max-width: 620px;
  height: 40px;
  border-radius: var(--bd-radius-sm);
  overflow: hidden;
}

.shop__search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  padding: 0 14px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: #333;
}

.shop__search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  background: #54c1a0;
  color: #10241d;
}

.shop__bar-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
}

.shop__bar-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #e4e8ed;
}

.shop__bar-cart {
  position: relative;
}

.shop__cart-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #f0a020;
  color: #131a22;
  font-size: 11px;
  font-weight: 800;
}

/* Page container ----------------------------------------------------------- */
.shop__wrap {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px var(--bd-page-gutter) 64px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shop__demo-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
  color: var(--bd-black);
  font-size: 13px;
  line-height: 1.45;
}

.shop__crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bd-grey-text);
}

.shop__crumbs a {
  color: var(--bd-grey-text);
}

.shop__crumbs a:hover {
  color: var(--bd-black);
  text-decoration: underline;
}

.shop__crumbs-current {
  color: var(--bd-black);
  font-weight: 600;
}

/* Product detail grid ------------------------------------------------------ */
.pdp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) 340px;
  gap: 32px;
  align-items: start;
}

.pdp__gallery {
  display: flex;
  gap: 12px;
}

.pdp__thumbs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.pdp__thumb {
  width: 44px;
  height: 44px;
  border-radius: var(--bd-radius-sm);
  border: 1px solid var(--bd-stroke);
  background: var(--bd-grey);
}

.pdp__thumb.is-active {
  border-color: var(--bd-green);
  box-shadow: 0 0 0 1px var(--bd-green);
}

.pdp__image {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
}

.pdp__image svg {
  width: 78%;
  height: 78%;
}

.pdp__brand {
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-green);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.pdp__title {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--bd-black);
}

.pdp__rating {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
}

.pdp__stars {
  position: relative;
  display: inline-flex;
  font-size: 16px;
  letter-spacing: 1px;
}

.pdp__star {
  color: #e2e5e9;
}

.pdp__star--full {
  color: #f0a020;
}

.pdp__star--half {
  background: linear-gradient(90deg, #f0a020 50%, #e2e5e9 50%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.pdp__rating-num {
  font-weight: 700;
  color: var(--bd-black);
}

.pdp__reviews {
  color: var(--bd-green);
}

.pdp__divider {
  height: 1px;
  margin: 18px 0;
  background: var(--bd-divider);
}

.pdp__bullets {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-black);
}

.pdp__bullets li {
  list-style: disc;
}

/* Buy box ------------------------------------------------------------------ */
.card {
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.buybox {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  position: sticky;
  top: 16px;
}

.buybox__price {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.buybox__price-eur {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.buybox__price-eth {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.buybox__delivery {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.buybox__stock {
  font-size: 15px;
  font-weight: 700;
  color: var(--bd-green);
}

.buybox__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 8px;
}

.buybox__gift {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px dashed var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  background: var(--bd-grey);
}

.buybox__gift-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--bd-black);
}

.buybox__shop {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.buybox__shop-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
}

.buybox__shop-name small {
  font-family: var(--bd-font-stats, monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--bd-grey-text);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  font-size: 12px;
  font-weight: 600;
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

.buybox__summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.buybox__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.buybox__line--discount.is-on {
  color: var(--bd-green);
  font-weight: 700;
}

.buybox__line--total {
  padding-top: 10px;
  border-top: 1px solid var(--bd-divider);
  font-size: 16px;
  font-weight: 800;
  color: var(--bd-black);
}

.buybox__summary-eur {
  font-size: 13px;
  color: var(--bd-grey-text);
  text-align: right;
}

.buybox__error {
  font-size: 14px;
  font-weight: 600;
  color: #dc2626;
}

.buybox__cta {
  padding: 13px 20px;
  border: none;
  border-radius: 999px;
  background: #f0a020;
  color: #131a22;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.buybox__cta:hover:not(:disabled) {
  background: #e0900f;
}

.buybox__cta:disabled {
  opacity: 0.55;
  cursor: default;
}

.buybox__note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.buybox__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: var(--bd-radius-sm);
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  line-height: 1.45;
}

.buybox__success {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 16px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
}

.buybox__success-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--bd-green);
}

.buybox__success-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-black);
}

.buybox__success-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
}

/* Responsive --------------------------------------------------------------- */
@media (max-width: 940px) {
  .pdp {
    grid-template-columns: 1fr 1fr;
  }
  .buybox {
    grid-column: 1 / -1;
    position: static;
  }
}

@media (max-width: 640px) {
  .pdp {
    grid-template-columns: 1fr;
  }
  .shop__search {
    display: none;
  }
}
</style>
