<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Funding, Project } from '@/types/project'
import { donate } from '@/services/projectsService'
import { decimalsFor, validateAmount } from '@/utils/amount'
import { mediaUrl } from '@/utils/media'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ donated: [funding: Funding] }>()

const wallet = useWalletStore()
const notifications = useNotificationStore()
const amount = ref('')
const submitting = ref(false)
// Inline error is for form-level validation only (empty/invalid amount, not
// logged in). Transaction failures surface as toasts.
const error = ref<string | null>(null)

const decimals = computed(() => decimalsFor(props.project.currency))

// INTEGRATION POINT: "Jetzt unterstützen" — the donation transaction.
// Calls the mock service today; wire to the escrow contract's donate().
async function onDonate() {
  if (submitting.value) return
  error.value = null

  // Login is wallet-only — donating requires a connected wallet (a signer).
  if (!wallet.isConnected) {
    error.value = 'Bitte logge dich zuerst oben mit deiner Wallet ein, um zu spenden.'
    return
  }

  // Validate as a decimal string (never a float) before anything is sent.
  const check = validateAmount(amount.value, decimals.value)
  if (!check.ok) {
    error.value = check.error
    return
  }

  submitting.value = true
  try {
    const result = await donate(props.project.id, check.value)
    // Use the authoritative post-confirmation funding from the service,
    // not a client-computed value.
    emit('donated', result.funding)
    notifications.success(
      `Vielen Dank! Deine Spende von ${check.value} ${props.project.currency} wurde übernommen.`,
    )
    amount.value = ''
  } catch (e) {
    notifications.error(toUserMessage(e), 'Spende fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="hero">
    <div class="hero__image">
      <img :src="mediaUrl(project.image)" :alt="project.title" />
    </div>
    <div class="hero__content">
      <span v-if="project.verified" class="hero__badge hero__badge--verified">
        <AppIcon name="shield-check" :size="16" />
        Verified Smart Contract
      </span>
      <span v-else class="hero__badge hero__badge--category">{{ project.category }}</span>

      <div class="hero__heading">
        <h1 class="hero__title">{{ project.title }}</h1>
        <p class="hero__summary">{{ project.summary }}</p>
      </div>

      <div class="hero__donate-wrap">
        <form class="hero__donate" :class="{ 'hero__donate--error': error }" @submit.prevent="onDonate">
          <span class="hero__currency">{{ project.currency }}</span>
          <!-- type="text", NOT "number": Vue auto-casts v-model on number inputs
               to a JS float, but the amount must stay a decimal STRING all the
               way to parseEther (see utils/amount.ts). inputmode keeps the
               numeric keyboard on mobile; validateAmount rejects bad input. -->
          <input
            v-model="amount"
            class="hero__input"
            type="text"
            inputmode="decimal"
            placeholder="Betrag eingeben"
            aria-label="Spendenbetrag"
            :aria-invalid="error ? 'true' : undefined"
          />
          <button class="hero__submit" type="submit" :disabled="submitting">
            {{ submitting ? 'Sende …' : 'Jetzt unterstützen' }}
          </button>
        </form>
        <p v-if="error" class="hero__error" role="alert">{{ error }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: flex;
  gap: 20px;
  background: var(--bd-surface);
  border-radius: var(--bd-radius-lg);
  overflow: hidden;
}

.hero__image {
  flex: 0 0 425px;
  max-width: 45%;
}

.hero__image img {
  width: 100%;
  height: 100%;
  min-height: 320px;
  object-fit: cover;
}

.hero__content {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  justify-content: center;
  padding: 40px 20px;
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: var(--bd-radius-sm);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.hero__badge--verified {
  color: var(--bd-green);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
}

.hero__badge--category {
  color: var(--bd-grey-text);
  background: var(--bd-grey);
}

.hero__heading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero__title {
  font-size: 40px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.8px;
  color: var(--bd-black);
}

.hero__summary {
  font-size: 16px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.hero__donate {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  padding-left: 14px;
  height: 42px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
}

.hero__currency {
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-grey-text);
}

.hero__input {
  flex: 1 1 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
}

.hero__submit {
  background: var(--bd-black);
  color: var(--bd-surface);
  border: none;
  border-radius: var(--bd-radius-sm);
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.hero__submit:disabled {
  opacity: 0.7;
  cursor: default;
}

.hero__donate-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero__donate--error {
  border-color: #dc2626;
}

.hero__error {
  font-size: 13px;
  color: #dc2626;
}

@media (max-width: 860px) {
  .hero {
    flex-direction: column;
  }
  .hero__image {
    flex-basis: auto;
    max-width: none;
  }
  .hero__image img {
    min-height: 220px;
  }
}
</style>
