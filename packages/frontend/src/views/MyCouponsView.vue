<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import { estimateRefundCouponGas, listMyCoupons, refundCoupon } from '@/services/couponsService'
import type { TxGasEstimate } from '@/services/projectsService'
import type { Coupon } from '@/types/coupon'
import { formatEth, formatEur, formatUnixDate } from '@/utils/coupon'
import { NATIVE_CURRENCY } from '@/utils/amount'
import { shortenAddress } from '@/utils/address'
import CouponStatusBadge from '@/components/coupon/CouponStatusBadge.vue'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// "Meine Gutscheine": every gift card the connected wallet CREATED, read from
// chain (filtered by `creator`) — PUBLIC state only. The secret code is shown
// once at creation and never stored, so it is NOT shown here. Expired, unredeemed
// cards can be refunded to the creator (needs only the public redemption key).
const wallet = useWalletStore()
const notifications = useNotificationStore()
const dialogOpen = ref(false)

const coupons = ref<Coupon[]>([])
const loading = ref(false)

async function load() {
  if (!wallet.address) {
    coupons.value = []
    return
  }
  loading.value = true
  try {
    coupons.value = await listMyCoupons(wallet.address)
  } catch (e) {
    notifications.error(toUserMessage(e), 'Gutscheine konnten nicht geladen werden')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => wallet.address, load)

// ── Refund flow (expired, unredeemed cards) ──────────────────────────────────
const refundTarget = ref<Coupon | null>(null)
const confirmOpen = ref(false)
const estimate = ref<TxGasEstimate | null>(null)
const estimating = ref(false)
const estimateError = ref<string | null>(null)
const submitting = ref(false)

async function openRefund(coupon: Coupon) {
  refundTarget.value = coupon
  confirmOpen.value = true
  estimate.value = null
  estimateError.value = null
  estimating.value = true
  try {
    estimate.value = await estimateRefundCouponGas(coupon.redemptionKey)
  } catch (e) {
    estimateError.value = toUserMessage(e)
  } finally {
    estimating.value = false
  }
}

function cancelRefund() {
  if (submitting.value) return
  confirmOpen.value = false
  refundTarget.value = null
}

async function confirmRefund() {
  const target = refundTarget.value
  if (!target || submitting.value) return
  submitting.value = true
  try {
    const result = await refundCoupon(target.redemptionKey)
    notifications.success(
      `${formatEth(result.amount)} wurden an Ihre Wallet zurückerstattet.`,
      'Erstattung erfolgreich',
    )
    confirmOpen.value = false
    refundTarget.value = null
    await Promise.all([load(), wallet.refreshBalance()])
  } catch (e) {
    notifications.error(toUserMessage(e), 'Erstattung fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mine">
    <div class="mine__topbar">
      <RouterLink :to="{ name: 'coupons' }" class="mine__back">← Alle Gutscheine</RouterLink>
    </div>

    <header class="mine__head">
      <h1 class="mine__title">Meine Gutscheine</h1>
      <p class="mine__subtitle">
        Alle von Ihnen erstellten Gutscheine (öffentlicher Stand). Der geheime Code wird nur einmal
        bei der Erstellung angezeigt und <strong>nicht gespeichert</strong> – bewahren Sie ihn selbst
        auf. Abgelaufene, nicht eingelöste Gutscheine können Sie zurückfordern.
      </p>
    </header>

    <!-- Not connected -->
    <div v-if="!wallet.isConnected" class="mine__panel">
      <span class="mine__lock"><AppIcon name="lock" :size="20" /></span>
      <h2 class="mine__panel-title">Wallet verbinden</h2>
      <p class="mine__lead">
        Melden Sie sich mit Ihrer Wallet an, um die von Ihnen erstellten Gutscheine zu sehen.
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
          Diese Wallet hat noch keine Gutscheine erstellt. Jede Wallet kann Gutscheine erstellen.
        </p>
        <RouterLink :to="{ name: 'coupon-create' }" class="mine__btn"> Gutscheine erstellen </RouterLink>
      </div>

      <!-- List -->
      <div v-else class="mine__list">
        <p class="mine__count">
          {{ coupons.length }} {{ coupons.length === 1 ? 'Gutschein' : 'Gutscheine' }}
        </p>
        <div v-for="c in coupons" :key="c.redemptionKey" class="card mine__card">
          <div class="mine__card-head">
            <a
              class="mine__key"
              :href="c.explorerUrl"
              target="_blank"
              rel="noopener"
              :title="c.redemptionKey"
            >
              {{ shortenAddress(c.redemptionKey) }}
            </a>
            <CouponStatusBadge :status="c.status" />
          </div>
          <div class="mine__card-meta">
            <span class="mine__amount">
              {{ formatEur(c.amountEur) }} <small>≈ {{ formatEth(c.amount) }}</small>
            </span>
            <span class="mine__valid">Gültig bis {{ formatUnixDate(c.expirationDate) }}</span>
          </div>

          <div v-if="c.status === 'expired'" class="mine__refund">
            <p class="mine__refund-text">
              Abgelaufen und nicht eingelöst – Sie können die hinterlegten
              <strong>{{ formatEth(c.amount) }}</strong> zurückfordern.
            </p>
            <button
              class="mine__refund-btn"
              type="button"
              :disabled="submitting"
              @click="openRefund(c)"
            >
              Betrag zurückfordern
            </button>
          </div>
        </div>
      </div>
    </template>

    <TxConfirmDialog
      :open="confirmOpen"
      title="Erstattung bestätigen"
      :summary="
        refundTarget ? `Gutschein über ${formatEth(refundTarget.amount)} zurückfordern` : undefined
      "
      :rows="
        refundTarget ? [{ label: 'Erstattungsbetrag', value: formatEth(refundTarget.amount) }] : []
      "
      total-label="Netzwerkgebühr (max.)"
      :currency="NATIVE_CURRENCY"
      hint="Der hinterlegte Betrag wird an Ihre Wallet zurückgezahlt; Sie tragen nur die Netzwerkgebühr."
      :estimate="estimate"
      :estimating="estimating"
      :estimate-error="estimateError"
      :submitting="submitting"
      confirm-label="Jetzt zurückfordern"
      submitting-label="Erstatte …"
      @confirm="confirmRefund"
      @cancel="cancelRefund"
    />

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

.card {
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.mine__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
}

.mine__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mine__key {
  font-family: var(--bd-font-stats, monospace);
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-black);
}

.mine__key:hover {
  text-decoration: underline;
}

.mine__card-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.mine__amount {
  font-weight: 700;
  color: var(--bd-black);
}

.mine__amount small {
  font-weight: 500;
  color: var(--bd-grey-text);
}

.mine__refund {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  background: var(--bd-grey);
}

.mine__refund-text {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.mine__refund-btn {
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

.mine__refund-btn:disabled {
  opacity: 0.6;
  cursor: default;
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
