<script setup lang="ts">
import type { Coupon } from '@/types/coupon'
import { shortenAddress } from '@/utils/address'
import { formatEur, formatEth, formatUnixDate } from '@/utils/coupon'
import CouponStatusBadge from '@/components/coupon/CouponStatusBadge.vue'

// The public "Aktive Gutscheine" table. Every column is on-chain or derived from
// on-chain data — no secrets here (the private key is never part of this model).
defineProps<{ coupons: Coupon[] }>()
</script>

<template>
  <div class="table">
    <div class="table__head" role="row">
      <span class="col col--key">Öffentlicher Schlüssel</span>
      <span class="col col--status">Status</span>
      <span class="col col--date">Erstellt</span>
      <span class="col col--value">Rabatt</span>
    </div>

    <p v-if="coupons.length === 0" class="table__empty">Noch keine Gutscheine.</p>

    <div v-for="coupon in coupons" :key="coupon.id" class="table__row" role="row">
      <a
        class="col col--key coupon-key"
        :href="coupon.explorerUrl"
        target="_blank"
        rel="noopener"
        :title="coupon.couponAddress"
      >
        {{ shortenAddress(coupon.couponAddress) }}
      </a>
      <span class="col col--status">
        <CouponStatusBadge :status="coupon.status" />
      </span>
      <span class="col col--date">{{ formatUnixDate(coupon.createdAt) }}</span>
      <span class="col col--value" :title="formatEth(coupon.value)">
        {{ formatEur(coupon.valueEur) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
}

.table__head,
.table__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.table__head {
  background: var(--bd-grey);
  border-bottom: 1px solid var(--bd-stroke);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.table__row {
  padding: 16px;
  border-bottom: 1px solid var(--bd-stroke);
}

.table__row:last-child {
  border-bottom: none;
}

.col--key {
  flex: 1 1 0;
  min-width: 140px;
}

.col--status {
  flex: 0 0 120px;
}

.col--date {
  flex: 0 0 150px;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.col--value {
  flex: 0 0 100px;
  text-align: right;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-black);
}

.coupon-key {
  font-family: var(--bd-font-stats, monospace);
  font-size: 14px;
  font-weight: 500;
  color: var(--bd-black);
}

.coupon-key:hover {
  text-decoration: underline;
}

.table__empty {
  padding: 32px 16px;
  font-size: 14px;
  color: var(--bd-grey-text);
}

@media (max-width: 640px) {
  .table {
    overflow-x: auto;
  }

  .table__head,
  .table__row {
    min-width: 520px;
  }
}
</style>
