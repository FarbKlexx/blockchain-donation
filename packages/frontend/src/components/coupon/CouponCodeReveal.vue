<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { formatEth, formatEur } from '@/utils/coupon'

// Reveals a coupon's redeem code to its CREATOR (create success + "Meine
// Gutscheine"). The code is two parts: 1) the coupon ID, 2) the private key (the
// secret). Anyone holding both can redeem — so it is framed as a secret to guard
// and to distribute deliberately.
const props = defineProps<{
  couponId: number
  privateKey: string
  couponAddress: string
  value: number
  valueEur: number
  /** Already spent — show as redeemed, hide the "einlösen" CTA. */
  redeemed?: boolean
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
      <span v-if="props.redeemed" class="reveal__badge reveal__badge--redeemed">
        Bereits eingelöst
      </span>
      <span v-else class="reveal__badge"><AppIcon name="check" :size="16" /> Gutscheincode</span>
      <span class="reveal__value">
        {{ formatEur(props.valueEur) }}
        <small>≈ {{ formatEth(props.value) }}</small>
      </span>
    </div>

    <p v-if="props.redeemed" class="reveal__hint">
      Dieser Gutschein wurde bereits eingelöst und kann nicht erneut verwendet werden. Ihr Code wird
      hier nur noch zur Ansicht angezeigt.
    </p>
    <p v-else class="reveal__hint">
      Das ist Ihr Gutscheincode. Er besteht aus zwei Teilen. Bewahren Sie ihn sicher auf –
      <strong>jeder, der diesen Code besitzt, kann den Gutschein einlösen</strong> (Sie können ihn
      also auch verschenken).
    </p>

    <div class="reveal__field">
      <span class="reveal__label">1 · Gutschein-ID</span>
      <div class="reveal__value-row">
        <code class="reveal__code">{{ props.couponId }}</code>
        <button type="button" class="reveal__copy" @click="copy('id', String(props.couponId))">
          {{ copied === 'id' ? 'Kopiert ✓' : 'Kopieren' }}
        </button>
      </div>
    </div>

    <div class="reveal__field">
      <span class="reveal__label">2 · Privater Schlüssel</span>
      <div class="reveal__value-row">
        <code class="reveal__code reveal__code--key">{{ props.privateKey }}</code>
        <button type="button" class="reveal__copy" @click="copy('key', props.privateKey)">
          {{ copied === 'key' ? 'Kopiert ✓' : 'Kopieren' }}
        </button>
      </div>
    </div>

    <RouterLink
      v-if="!props.redeemed"
      class="reveal__redeem"
      :to="{ name: 'coupon-redeem', query: { id: props.couponId, key: props.privateKey } }"
    >
      Jetzt beim Kauf einlösen →
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

.reveal__badge--redeemed {
  background: var(--bd-neutral-tint);
  color: var(--bd-neutral);
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

.reveal__hint {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
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
