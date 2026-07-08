<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { listMyCoupons } from '@/services/couponsService'
import type { MyCoupon } from '@/types/coupon'
import CouponCodeReveal from '@/components/coupon/CouponCodeReveal.vue'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// "Meine Gutscheine": every coupon the connected wallet CREATED, each with its
// private key revealed (the creator is authenticated by controlling the wallet).
// The creator copies the keys here and distributes them off-site. Reads through
// couponsService (the integration seam).
const wallet = useWalletStore()
const dialogOpen = ref(false)

const coupons = ref<MyCoupon[]>([])
const loading = ref(false)

async function load() {
  if (!wallet.address) {
    coupons.value = []
    return
  }
  loading.value = true
  try {
    coupons.value = await listMyCoupons(wallet.address)
  } finally {
    loading.value = false
  }
}

onMounted(load)
// Reload when the connected wallet changes (login / switch account).
watch(() => wallet.address, load)
</script>

<template>
  <div class="mine">
    <div class="mine__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="mine__back">← Alle Gutscheine</RouterLink>
    </div>

    <header class="mine__head">
      <h1 class="mine__title">Meine Gutscheine</h1>
      <p class="mine__subtitle">
        Alle von Ihnen erstellten Gutscheine samt privatem Schlüssel. Verteilen Sie die Codes selbst
        – wer einen Schlüssel besitzt, kann ihn einlösen.
      </p>
    </header>

    <!-- Not connected -->
    <div v-if="!wallet.isConnected" class="mine__panel">
      <span class="mine__lock"><AppIcon name="lock" :size="20" /></span>
      <h2 class="mine__panel-title">Wallet verbinden</h2>
      <p class="mine__lead">
        Melden Sie sich mit Ihrer Wallet an, um die von Ihnen erstellten Gutscheine und deren Codes
        zu sehen.
      </p>
      <button class="mine__btn" type="button" @click="dialogOpen = true">
        Einloggen mit Wallet
      </button>
    </div>

    <template v-else>
      <p v-if="loading" class="mine__state">Lade Gutscheine …</p>

      <!-- Empty -->
      <div v-else-if="coupons.length === 0" class="mine__panel">
        <h2 class="mine__panel-title">Noch keine Gutscheine</h2>
        <p class="mine__lead">
          Diese Wallet hat noch keine Gutscheine erstellt.
        </p>
        <RouterLink :to="{ name: 'coupon-create' }" class="mine__btn">
          Gutscheine erstellen
        </RouterLink>
      </div>

      <!-- List -->
      <div v-else class="mine__list">
        <p class="mine__count">
          {{ coupons.length }} {{ coupons.length === 1 ? 'Gutschein' : 'Gutscheine' }}
        </p>
        <CouponCodeReveal
          v-for="c in coupons"
          :key="c.id"
          :coupon-id="c.id"
          :private-key="c.privateKey"
          :coupon-address="c.couponAddress"
          :value="c.value"
          :value-eur="c.valueEur"
          :redeemed="c.status === 'redeemed'"
        />
      </div>
    </template>

    <LoginDialog :open="dialogOpen" @close="dialogOpen = false" />
  </div>
</template>

<style scoped>
.mine {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 var(--bd-page-gutter) 64px;
  max-width: 820px;
}

.mine__topbar {
  padding: 48px 0 0;
}

.mine__back {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.mine__back:hover {
  color: var(--bd-black);
}

.mine__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mine__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--bd-black);
}

.mine__subtitle {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.mine__state {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.mine__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mine__count {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.mine__panel {
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

.mine__lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-icon-dark);
  color: var(--bd-surface);
}

.mine__panel-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--bd-black);
}

.mine__lead {
  max-width: 520px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.mine__btn {
  display: inline-flex;
  align-items: center;
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
</style>
