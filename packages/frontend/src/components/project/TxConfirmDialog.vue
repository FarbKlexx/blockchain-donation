<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { TxGasEstimate } from '@/services/projectsService'
import AppIcon from '@/components/ui/AppIcon.vue'

// Generic checkout overlay: confirms an on-chain action before it is signed/sent
// and shows a full cost breakdown (any transferred value + estimated gas). Used
// for donations AND validator votes — both cost gas. The parent owns the flow:
// it estimates gas, then sends only on `confirm`.
const props = defineProps<{
  open: boolean
  /** Dialog heading, e.g. "Spende bestätigen" / "Abstimmung bestätigen". */
  title: string
  /** Context line under the title (e.g. the project title). */
  summary?: string
  /** Detail rows shown above the gas section, e.g. the donation amount or the
   *  vote being cast. */
  rows?: { label: string; value: string }[]
  /** Label for the grand-total row, e.g. "Gesamt (max.)" / "Netzwerkgebühr (max.)". */
  totalLabel: string
  currency: string
  /** Optional footnote under the box. */
  hint?: string
  /** Gas breakdown once estimated; null while estimating or on error. */
  estimate: TxGasEstimate | null
  /** The gas estimate request is in flight. */
  estimating: boolean
  /** Human-readable reason the estimate failed (if any). */
  estimateError: string | null
  /** The transaction itself is in flight. */
  submitting: boolean
  confirmLabel: string
  submittingLabel?: string
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

// Escape closes the overlay — but never mid-send (can't cancel a broadcast tx).
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open && !props.submitting) emit('cancel')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="checkout" role="dialog" aria-modal="true" :aria-label="title">
      <div class="checkout__backdrop" @click="submitting || emit('cancel')" />
      <div class="checkout__panel">
        <header class="checkout__head">
          <h2 class="checkout__title">{{ title }}</h2>
          <button
            class="checkout__close"
            type="button"
            aria-label="Schließen"
            :disabled="submitting"
            @click="emit('cancel')"
          >
            ✕
          </button>
        </header>

        <p v-if="summary" class="checkout__summary">{{ summary }}</p>

        <div class="checkout__box">
          <!-- Action detail rows (donation amount, vote being cast, …) -->
          <div v-for="(row, i) in rows" :key="i" class="checkout__row">
            <span class="checkout__label">{{ row.label }}</span>
            <span class="checkout__value">{{ row.value }}</span>
          </div>

          <div v-if="rows && rows.length" class="checkout__divider" />

          <!-- Gas breakdown -->
          <p class="checkout__section">Geschätzte Netzwerkgebühr (Gas)</p>

          <div v-if="estimating" class="checkout__pending">
            <span class="checkout__spinner" aria-hidden="true" />
            Gaskosten werden berechnet …
          </div>

          <div v-else-if="estimateError" class="checkout__gas-error" role="alert">
            <AppIcon name="circle-alert" :size="15" />
            <span>{{ estimateError }}</span>
          </div>

          <template v-else-if="estimate">
            <div class="checkout__row checkout__row--sub">
              <span class="checkout__label">Gas-Limit (Einheiten)</span>
              <span class="checkout__value">{{ estimate.gasUnits }}</span>
            </div>
            <div class="checkout__row checkout__row--sub">
              <span class="checkout__label">Gas-Preis</span>
              <span class="checkout__value">{{ estimate.gasPriceGwei }} Gwei</span>
            </div>
            <div class="checkout__row checkout__row--sub checkout__row--calc">
              <span class="checkout__label">Gas-Limit × Gas-Preis</span>
              <span class="checkout__value">{{ estimate.gasFee }} {{ currency }}</span>
            </div>
          </template>

          <div class="checkout__divider" />

          <!-- Total -->
          <div class="checkout__row checkout__row--total">
            <span class="checkout__label">{{ totalLabel }}</span>
            <span class="checkout__value">
              {{ estimate ? `${estimate.total} ${currency}` : '…' }}
            </span>
          </div>
        </div>

        <p v-if="hint" class="checkout__hint">{{ hint }}</p>

        <div class="checkout__actions">
          <button
            type="button"
            class="checkout__btn checkout__btn--ghost"
            :disabled="submitting"
            @click="emit('cancel')"
          >
            Abbrechen
          </button>
          <button
            type="button"
            class="checkout__btn checkout__btn--primary"
            :disabled="submitting || estimating"
            @click="emit('confirm')"
          >
            {{ submitting ? (submittingLabel ?? 'Sende …') : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.checkout {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.checkout__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.checkout__panel {
  position: relative;
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.checkout__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.checkout__title {
  font-size: 20px;
  font-weight: 800;
  color: var(--bd-black);
}

.checkout__close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--bd-grey-text);
  padding: 4px;
  cursor: pointer;
}
.checkout__close:disabled {
  opacity: 0.5;
  cursor: default;
}

.checkout__summary {
  font-size: 14px;
  color: var(--bd-grey-text);
  margin-top: -8px;
}

.checkout__box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--bd-grey);
  border-radius: var(--bd-radius-md);
}

.checkout__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--bd-black);
}

.checkout__row--sub {
  font-size: 13px;
  color: var(--bd-grey-text);
}

.checkout__row--calc .checkout__label {
  font-style: italic;
}

.checkout__row--total {
  font-size: 16px;
  font-weight: 800;
}

.checkout__label {
  min-width: 0;
  /* Long labels ("Netzwerkgebühr (max.)") wrap instead of colliding with the
     value, even on narrow screens. */
  overflow-wrap: anywhere;
}

.checkout__value {
  /* Keep the amount on one line and never let it shrink into the label. */
  flex-shrink: 0;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.checkout__section {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.checkout__divider {
  height: 1px;
  background: var(--bd-divider);
}

.checkout__pending {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bd-grey-text);
}

.checkout__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--bd-stroke);
  border-top-color: var(--bd-black);
  border-radius: 50%;
  animation: checkout-spin 0.7s linear infinite;
}

@keyframes checkout-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .checkout__spinner {
    animation-duration: 2s;
  }
}

.checkout__gas-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #dc2626;
}

.checkout__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.checkout__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.checkout__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 11px 18px;
  cursor: pointer;
}

.checkout__btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.checkout__btn--ghost {
  background: transparent;
  color: var(--bd-grey-text);
  border: 1px solid var(--bd-stroke);
}
.checkout__btn--ghost:hover:not(:disabled) {
  border-color: var(--bd-black);
  color: var(--bd-black);
}

.checkout__btn--primary {
  background: var(--bd-black);
  color: var(--bd-surface);
}
</style>
