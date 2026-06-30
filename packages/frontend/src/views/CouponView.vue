<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Coupon } from '@/types/coupon'
import { listCoupons } from '@/services/couponsService'
import CouponHero from '@/components/coupon/CouponHero.vue'
import CouponSteps from '@/components/coupon/CouponSteps.vue'
import CouponTable from '@/components/coupon/CouponTable.vue'

// Coupon landing page — mirrors the Figma `gutscheine-coupon-page`: subscribe
// hero, "how it works", and the public on-chain coupon table. Reads everything
// through couponsService (the integration seam).
const coupons = ref<Coupon[]>([])
const loading = ref(true)

// INTEGRATION POINT: coupon list. Service reads the mock contract source today;
// later it reads the Coupon contract from chain. No backend/secret needed — the
// table is purely public on-chain data.
async function load() {
  loading.value = true
  try {
    coupons.value = await listCoupons()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="coupons">
    <header class="coupons__header">
      <h1 class="coupons__title">Gutscheine</h1>
      <p class="coupons__count">
        {{ coupons.length }} {{ coupons.length === 1 ? 'Gutschein' : 'Gutscheine' }}
      </p>
    </header>

    <CouponHero @subscribed="load" />

    <CouponSteps />

    <section class="coupons__list">
      <div class="coupons__list-head">
        <h2 class="coupons__list-title">Aktive Gutscheine</h2>
        <p class="coupons__list-lead">
          Alle aktiven Gutscheine sind öffentlich auf der Blockchain einsehbar. Nur der Inhaber des
          privaten Schlüssels kann den Gutschein tatsächlich einlösen.
        </p>
      </div>

      <p v-if="loading" class="coupons__state">Lade Gutscheine …</p>
      <CouponTable v-else :coupons="coupons" />

      <p class="coupons__demo">
        Zum Ausprobieren der Einlöse-Seite:
        <RouterLink :to="{ name: 'coupon-redeem' }">Beim Kauf einlösen →</RouterLink>
      </p>
    </section>
  </div>
</template>

<style scoped>
.coupons {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 32px var(--bd-page-gutter) 64px;
}

.coupons__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coupons__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--bd-black);
}

.coupons__count {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.coupons__list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.coupons__list-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coupons__list-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--bd-black);
}

.coupons__list-lead {
  max-width: 800px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.coupons__state {
  padding: 32px 0;
  font-size: 14px;
  color: var(--bd-grey-text);
}

.coupons__demo {
  font-size: 14px;
  color: var(--bd-grey-text);
}

.coupons__demo a {
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
}
</style>
