<script setup lang="ts">
import type { CouponStatus } from '@/types/coupon'
import { COUPON_STATUS_LABELS } from '@/utils/coupon'

// Small status pill — Aktiv (green) / Eingelöst (neutral) / Abgelaufen (amber).
// Colors reuse the shared status tokens (same palette as the milestone badges).
defineProps<{ status: CouponStatus }>()
</script>

<template>
  <span class="badge" :class="`badge--${status}`">{{ COUPON_STATUS_LABELS[status] }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: var(--bd-radius-sm);
  font-size: 12px;
  font-weight: 700;
}

.badge--active {
  color: var(--bd-green);
  background: var(--bd-green-tint);
}

.badge--redeemed {
  color: var(--bd-neutral);
  background: var(--bd-neutral-tint);
}

.badge--expired {
  color: #b45309;
  background: #fef3c7;
}
</style>
