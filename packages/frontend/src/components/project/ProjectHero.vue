<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Funding, Project } from '@/types/project'
import { donate, estimateDonationGas, type TxGasEstimate } from '@/services/projectsService'
import { decimalsFor, validateAmount, remainingAmountString } from '@/utils/amount'
import { mediaUrl } from '@/utils/media'
import { useWalletStore } from '@/stores/wallet'
import { useNotificationStore } from '@/stores/notifications'
import { toUserMessage } from '@/utils/errors'
import AppIcon from '@/components/ui/AppIcon.vue'
import TxConfirmDialog from '@/components/project/TxConfirmDialog.vue'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ donated: [funding: Funding] }>()

const wallet = useWalletStore()
const notifications = useNotificationStore()
const amount = ref('')
const submitting = ref(false)
// Inline error is for form-level validation only (empty/invalid amount, not
// logged in). Transaction failures surface as toasts.
const error = ref<string | null>(null)

// Checkout overlay: opened by "Jetzt unterstützen", it shows a full cost
// breakdown (amount + estimated gas) and only sends the tx once confirmed.
const confirmOpen = ref(false)
const estimating = ref(false)
const estimate = ref<TxGasEstimate | null>(null)
const estimateError = ref<string | null>(null)
const pendingAmount = ref('')

const decimals = computed(() => decimalsFor(props.project.currency))

// The still-needed amount (goal − raised) as a ready-to-donate input string.
// Offered as a "Restbetrag" shortcut only while donations are open (Funding) and
// something is actually left — so the user never has to compute it by hand.
const remaining = computed(() =>
  remainingAmountString(props.project.funding.goal, props.project.funding.raised),
)

// The donation box has three mutually-exclusive states:
//  • funded   — goal reached (and not failed): green "finished" box.
//  • closed   — project failed, or the funding period ended below goal: donations
//               are no longer possible (the refund/mark-failed actions live on
//               the detail page, not here).
//  • open     — Funding, still within time and below goal: the donate form.
const failed = computed(() => props.project.contractStatus === 'Failed')
const funded = computed(
  () => !failed.value && props.project.funding.goal > 0 && remaining.value === '',
)
const fundingEnded = computed(
  () => props.project.contractStatus === 'Funding' && props.project.status === 'abgelaufen',
)
const donationsClosed = computed(() => !funded.value && (failed.value || fundingEnded.value))
const donationsOpen = computed(() => !funded.value && !donationsClosed.value)
const closedMessage = computed(() =>
  failed.value
    ? 'Projekt gescheitert – Spenden sind nicht mehr möglich.'
    : 'Finanzierungsphase beendet – Spenden sind nicht mehr möglich.',
)

const canFillRemaining = computed(() => donationsOpen.value && remaining.value !== '')

function fillRemaining() {
  amount.value = remaining.value
  error.value = null
}

// "Jetzt unterstützen" — validate, then open the checkout overlay and estimate
// the full cost. Nothing is signed/sent here; the tx only goes out on confirm.
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

  pendingAmount.value = check.value
  estimate.value = null
  estimateError.value = null
  confirmOpen.value = true
  estimating.value = true
  try {
    estimate.value = await estimateDonationGas(props.project.id, check.value)
  } catch (e) {
    estimateError.value = toUserMessage(e, 'Die Gaskosten konnten nicht geschätzt werden.')
  } finally {
    estimating.value = false
  }
}

// Confirmed in the overlay → sign and send the donation.
async function confirmDonate() {
  if (submitting.value || !pendingAmount.value) return
  submitting.value = true
  try {
    const result = await donate(props.project.id, pendingAmount.value)
    // Authoritative post-confirmation funding from the service (no client math).
    emit('donated', result.funding)
    notifications.success(
      `Vielen Dank! Deine Spende von ${pendingAmount.value} ${props.project.currency} wurde übernommen.`,
    )
    amount.value = ''
    closeCheckout()
  } catch (e) {
    notifications.error(toUserMessage(e), 'Spende fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}

function closeCheckout() {
  confirmOpen.value = false
  pendingAmount.value = ''
  estimate.value = null
  estimateError.value = null
}

// Cancel from the overlay — never possible mid-send.
function cancelDonate() {
  if (submitting.value) return
  closeCheckout()
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
        <!-- Funded → green "finished" box; every viewer sees the goal is met. -->
        <div v-if="funded" class="hero__donate hero__donate--funded">
          <span class="hero__funded">
            <AppIcon name="circle-check" :size="18" />
            Ziel erreicht – vollständig finanziert
          </span>
          <button class="hero__submit" type="button" disabled>Finanziert</button>
        </div>

        <!-- Failed, or funding period ended below goal → donations closed. The
             refund / mark-as-failed actions live in the detail page banner. -->
        <div v-else-if="donationsClosed" class="hero__donate hero__donate--closed">
          <span class="hero__closed">
            <AppIcon name="circle-alert" :size="18" />
            {{ closedMessage }}
          </span>
        </div>

        <!-- Open → the donation form. -->
        <form
          v-else
          class="hero__donate"
          :class="{ 'hero__donate--error': error }"
          @submit.prevent="onDonate"
        >
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
          <button
            v-if="canFillRemaining"
            class="hero__rest"
            type="button"
            :title="`Restbetrag einsetzen: ${remaining} ${project.currency}`"
            @click="fillRemaining"
          >
            Restbetrag
          </button>
          <button class="hero__submit" type="submit" :disabled="submitting">
            {{ submitting ? 'Sende …' : 'Jetzt unterstützen' }}
          </button>
        </form>
        <p v-if="error && donationsOpen" class="hero__error" role="alert">{{ error }}</p>
      </div>

      <TxConfirmDialog
        :open="confirmOpen"
        title="Spende bestätigen"
        :summary="project.title"
        :rows="[{ label: 'Spendenbetrag', value: `${pendingAmount} ${project.currency}` }]"
        total-label="Gesamt (max.)"
        :currency="project.currency"
        hint="Betrag zzgl. maximaler Netzwerkgebühr. Die tatsächlichen Gaskosten können niedriger ausfallen; die Gebühr geht an das Netzwerk, nicht an das Projekt."
        confirm-label="Jetzt spenden"
        submitting-label="Sende …"
        :estimate="estimate"
        :estimating="estimating"
        :estimate-error="estimateError"
        :submitting="submitting"
        @confirm="confirmDonate"
        @cancel="cancelDonate"
      />
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

/* Secondary shortcut that fills the input with the remaining amount. Sits
   between the input and the primary submit CTA, styled subtly so it reads as a
   helper, not a second call to action. */
.hero__rest {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--bd-green);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  padding: 6px 8px;
  cursor: pointer;
}

.hero__rest:hover {
  text-decoration: underline;
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

/* Fully funded: green box + a clear "finished" label; the (disabled) button
   greys out so it's obvious no more donations are possible. */
.hero__donate--funded {
  border-color: var(--bd-green);
  background: var(--bd-green-tint);
}

.hero__funded {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-green);
}

/* Donations closed (failed / funding period ended) — flexible height so the
   message can wrap on narrow widths. */
.hero__donate--closed {
  height: auto;
  min-height: 42px;
  padding: 10px 14px;
  border-color: var(--bd-amber);
  background: var(--bd-amber-tint);
}

.hero__closed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--bd-amber);
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
