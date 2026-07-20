<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { formatEth, formatEur } from '@/utils/coupon'

// Shows a freshly created gift card's secret code to its creator — ONCE. The
// redeemable code IS the keypair's private key; it is never stored (no
// localStorage, no backend), so this is the only moment it can be copied
// (GitHub-style: shown at creation, then gone). Whoever holds it can have it
// redeemed at a shop. The public redemption key is shown alongside only as a
// reference.
const props = defineProps<{
  redemptionKey: string
  /** The secret code — present only here, at creation. */
  privateKey: string
  amount: number
  amountEur: number
}>()

const copied = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(field: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = field
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = null), 1500)
  } catch {
    /* clipboard unavailable (e.g. insecure context) — no-op */
  }
}
</script>

<template>
  <div class="reveal card">
    <div class="reveal__head">
      <span class="reveal__badge"><AppIcon name="check" :size="16" /> Gutscheincode</span>
      <span class="reveal__value">
        {{ formatEur(props.amountEur) }}
        <small>≈ {{ formatEth(props.amount) }}</small>
      </span>
    </div>

    <p class="reveal__warn" role="alert">
      <AppIcon name="circle-alert" :size="15" />
      <span>
        Dies ist der <strong>einzige Zeitpunkt</strong>, an dem der Gutscheincode angezeigt wird.
        Kopieren Sie ihn jetzt und bewahren Sie ihn sicher auf – er wird <strong>nicht
        gespeichert</strong> und kann später nicht erneut abgerufen werden. Wer den Code besitzt, kann
        den Gutschein einlösen.
      </span>
    </p>

    <div class="reveal__field">
      <span class="reveal__label">Öffentlicher Schlüssel (Referenz)</span>
      <div class="reveal__value-row">
        <code class="reveal__code">{{ props.redemptionKey }}</code>
        <button type="button" class="reveal__copy" @click="copy('key-pub', props.redemptionKey)">
          {{ copied === 'key-pub' ? 'Kopiert ✓' : 'Kopieren' }}
        </button>
      </div>
    </div>

    <div class="reveal__field">
      <span class="reveal__label">Gutscheincode (Privater Schlüssel)</span>
      <div class="reveal__value-row">
        <code class="reveal__code reveal__code--key">{{ props.privateKey }}</code>
        <button type="button" class="reveal__copy" @click="copy('key', props.privateKey)">
          {{ copied === 'key' ? 'Kopiert ✓' : 'Kopieren' }}
        </button>
      </div>
    </div>

    <RouterLink
      class="reveal__redeem"
      :to="{ name: 'coupon-redeem', query: { key: props.privateKey } }"
    >
      Zum Einlösen (Checkout-Demo) →
    </RouterLink>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 32px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.reveal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.reveal__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-green-tint);
  color: var(--bd-green);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.reveal__value {
  font-size: 20px;
  font-weight: 800;
  color: var(--bd-black);
}

.reveal__value small {
  font-size: 13px;
  font-weight: 500;
  color: var(--bd-grey-text);
}

.reveal__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--bd-radius-sm);
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  line-height: 1.5;
}

.reveal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reveal__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bd-grey-text);
}

.reveal__value-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bd-grey);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
}

.reveal__code {
  flex: 1 1 0;
  min-width: 0;
  font-family: var(--bd-font-stats, monospace);
  font-size: 14px;
  color: var(--bd-black);
  word-break: break-all;
}

.reveal__code--key {
  font-size: 13px;
}

.reveal__copy {
  flex-shrink: 0;
  padding: 6px 12px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.reveal__redeem {
  align-self: flex-start;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
}
</style>
