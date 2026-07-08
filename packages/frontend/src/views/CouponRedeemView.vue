<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { redeemCoupon, type RedeemResult } from '@/services/couponsService'
import { ethToEur, formatEth, formatEur } from '@/utils/coupon'
import AppIcon from '@/components/ui/AppIcon.vue'

// A stand-in CHECKOUT where a coupon is redeemed. Open to anyone holding the
// code (id + private key) — not just the owner. The service proves possession
// of the key via signature recovery (mock of the on-chain ecrecover); the key
// itself is never sent on-chain.
//
// This demo page is NOT part of the donation flow — it represents an external
// merchant checkout that calls the Coupon contract.
const route = useRoute()

// A mock order to discount.
const ORDER_ETH = 0.05

const couponId = ref('')
const privateKey = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<RedeemResult | null>(null)

const total = computed(() => (result.value ? ORDER_ETH - result.value.discount : ORDER_ETH))

async function submit() {
  if (submitting.value) return
  const id = Number(couponId.value)
  if (!Number.isInteger(id) || id <= 0) {
    error.value = 'Bitte eine gültige Gutschein-ID eingeben.'
    return
  }
  submitting.value = true
  error.value = null
  result.value = null
  try {
    result.value = await redeemCoupon(id, privateKey.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Einlösen fehlgeschlagen.'
  } finally {
    submitting.value = false
  }
}

// Prefill from the claim page's "jetzt einlösen" link (?id=&key=).
onMounted(() => {
  if (typeof route.query.id === 'string') couponId.value = route.query.id
  if (typeof route.query.key === 'string') privateKey.value = route.query.key
})
</script>

<template>
  <div class="redeem">
    <div class="redeem__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="redeem__back">← Alle Gutscheine</RouterLink>
    </div>

    <header class="redeem__head">
      <h1 class="redeem__title">Beim Kauf einlösen</h1>
      <p class="redeem__subtitle">
        Checkout-Demo: Gutscheincode eingeben, um den Rabatt auf den Einkauf anzuwenden.
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
        <div class="redeem__line redeem__line--discount" :class="{ 'is-on': result }">
          <span>Gutschein-Rabatt</span>
          <span>{{ result ? '−' + formatEth(result.discount) : '—' }}</span>
        </div>
        <div class="redeem__line redeem__line--total">
          <span>Gesamt</span>
          <span>{{ formatEth(total) }}</span>
        </div>
        <p class="redeem__order-hint">≈ {{ formatEur(ethToEur(total)) }}</p>
      </aside>

      <!-- Redeem form -->
      <section class="card redeem__form-card">
        <h2 class="card__title">Gutscheincode</h2>

        <div v-if="result" class="redeem__success" role="status">
          <p class="redeem__success-title">
            <AppIcon name="check" :size="16" /> Gutschein #{{ result.couponId }} eingelöst
          </p>
          <p>{{ formatEur(result.discountEur) }} ({{ formatEth(result.discount) }}) wurden abgezogen.</p>
        </div>

        <form v-else class="redeem__form" @submit.prevent="submit">
          <label class="field">
            <span class="field__label">Gutschein-ID</span>
            <input v-model="couponId" class="field__input" type="text" inputmode="numeric" placeholder="z. B. 1" />
          </label>
          <label class="field">
            <span class="field__label">Privater Schlüssel</span>
            <input
              v-model="privateKey"
              class="field__input field__input--mono"
              type="text"
              placeholder="0x…"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <p v-if="error" class="redeem__error" role="alert">{{ error }}</p>

          <button type="submit" class="redeem__submit" :disabled="submitting">
            {{ submitting ? 'Prüfe Schlüssel …' : 'Gutschein einlösen' }}
          </button>
          <p class="redeem__note">
            Der Schlüssel wird lokal signiert und nur die Signatur geprüft – er verlässt nie die
            Seite.
          </p>
        </form>
      </section>
    </div>
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

.redeem__line--discount {
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
