<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { claimCoupon, type ClaimResult } from '@/services/couponsService'
import { shortenAddress } from '@/utils/address'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import CouponCodeReveal from '@/components/coupon/CouponCodeReveal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// The e-mail claim-link target (/gutschein/:token). TWO-factor authentication:
//  • the LINK (this token) proves the visitor is on the right page;
//  • the WALLET proves the rightful owner (binds the owner on first claim, must
//    match on later visits).
// Once both pass, couponsService reveals the code (id + private key).
const props = defineProps<{ token: string }>()

const wallet = useWalletStore()

const loading = ref(false)
const error = ref<string | null>(null)
const revealed = ref<ClaimResult | null>(null)
const dialogOpen = ref(false)

async function runClaim() {
  if (!wallet.isConnected || !wallet.address || loading.value || revealed.value) return
  loading.value = true
  error.value = null
  try {
    revealed.value = await claimCoupon(props.token, wallet.address)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Gutschein konnte nicht eingelöst werden.'
  } finally {
    loading.value = false
  }
}

function switchWallet() {
  wallet.logout()
  revealed.value = null
  error.value = null
  dialogOpen.value = true
}

// Claim as soon as a wallet is connected (on mount or after login).
onMounted(runClaim)
watch(() => wallet.isConnected, (connected) => connected && runClaim())
</script>

<template>
  <div class="claim">
    <div class="claim__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="claim__back">← Alle Gutscheine</RouterLink>
    </div>

    <!-- Success: code revealed -->
    <template v-if="revealed">
      <header class="claim__head">
        <h1 class="claim__title">Ihr Gutschein</h1>
        <p class="claim__subtitle">
          Authentifiziert über den Link und Ihre Wallet
          {{ shortenAddress(wallet.address ?? '') }}.
        </p>
      </header>
      <CouponCodeReveal
        :coupon-id="revealed.couponId"
        :private-key="revealed.privateKey"
        :coupon-address="revealed.couponAddress"
        :value="revealed.value"
        :value-eur="revealed.valueEur"
        :redeemed="revealed.redeemed"
      />
    </template>

    <!-- Working -->
    <div v-else-if="loading" class="claim__panel">
      <p class="claim__state">Prüfe Link und Wallet …</p>
    </div>

    <!-- Not connected: needs wallet -->
    <div v-else-if="!wallet.isConnected" class="claim__panel">
      <span class="claim__lock"><AppIcon name="lock" :size="20" /></span>
      <h1 class="claim__title">Gutschein freischalten</h1>
      <p class="claim__lead">
        Sie haben einen Gutschein-Link geöffnet. Melden Sie sich mit Ihrer Wallet an, um sich als
        rechtmäßiger Inhaber auszuweisen und Ihren Code zu erhalten.
      </p>
      <button class="claim__btn" type="button" @click="dialogOpen = true">
        Einloggen mit Wallet
      </button>
    </div>

    <!-- Connected but claim failed (e.g. wrong wallet / bad link) -->
    <div v-else class="claim__panel">
      <h1 class="claim__title">Freischalten nicht möglich</h1>
      <p class="claim__error" role="alert">{{ error }}</p>
      <p class="claim__lead">
        Angemeldet als {{ shortenAddress(wallet.address ?? '') }}.
      </p>
      <button class="claim__btn claim__btn--ghost" type="button" @click="switchWallet">
        Andere Wallet verwenden
      </button>
    </div>

    <LoginDialog :open="dialogOpen" @close="dialogOpen = false" />
  </div>
</template>

<style scoped>
.claim {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 var(--bd-page-gutter) 64px;
  max-width: 760px;
}

.claim__topbar {
  padding: 48px 0 0;
}

.claim__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.claim__back:hover {
  color: var(--bd-black);
}

.claim__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.claim__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.claim__subtitle {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.claim__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 40px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.claim__lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-icon-dark);
  color: var(--bd-surface);
}

.claim__lead {
  max-width: 560px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.claim__state {
  font-size: 15px;
  color: var(--bd-grey-text);
}

.claim__error {
  font-size: 14px;
  font-weight: 600;
  color: #dc2626;
}

.claim__btn {
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

.claim__btn--ghost {
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}
</style>
