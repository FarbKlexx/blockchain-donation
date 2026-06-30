<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { subscribeNewsletter, type SubscribeResult } from '@/services/couponsService'
import AppIcon from '@/components/ui/AppIcon.vue'

// The newsletter-subscribe hero. On submit it mints a coupon (mock) and — since
// the prototype has no inbox — surfaces the "e-mailed" claim link inline so the
// flow is walkable. Emits `subscribed` so the parent reloads the coupon list.
const emit = defineEmits<{ subscribed: [] }>()

const email = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<SubscribeResult | null>(null)

async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = null
  result.value = null
  try {
    result.value = await subscribeNewsletter(email.value)
    email.value = ''
    emit('subscribed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="hero card">
    <span class="hero__badge">
      <AppIcon name="shield-check" :size="16" />
      Blockchain-gesichert
    </span>

    <div class="hero__intro">
      <h1 class="hero__title">Gutschein per E-Mail erhalten</h1>
      <p class="hero__lead">
        Abonnieren Sie unseren Newsletter und erhalten Sie einen privaten Schlüssel direkt in Ihr
        Postfach. Dieser Schlüssel dient als Gutscheincode und gewährt Ihnen einen Rabatt von 5 EUR
        auf Ihre nächste Spende oder Ihren nächsten Kauf.
      </p>
    </div>

    <form class="hero__form" @submit.prevent="submit">
      <input
        v-model="email"
        class="hero__input"
        type="email"
        autocomplete="email"
        placeholder="Ihre E-Mail-Adresse eingeben"
        aria-label="E-Mail-Adresse"
        :disabled="submitting"
      />
      <button type="submit" class="hero__submit" :disabled="submitting">
        {{ submitting ? 'Wird angefordert …' : 'Gutschein anfordern' }}
      </button>
    </form>

    <p v-if="error" class="hero__error" role="alert">{{ error }}</p>

    <div v-if="result" class="hero__result" role="status">
      <p class="hero__result-title">
        <AppIcon name="check" :size="16" /> Gutschein #{{ result.couponId }} erstellt
      </p>
      <p class="hero__result-body">
        Im Prototyp gibt es kein Postfach – der Link, den wir an
        <strong>{{ result.email }}</strong> senden würden, ist:
      </p>
      <RouterLink :to="result.claimUrl" class="hero__result-link">
        {{ result.claimUrl }} →
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 40px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px solid var(--bd-green);
  border-radius: var(--bd-radius-sm);
  background: var(--bd-green-tint);
  color: var(--bd-green);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.hero__intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--bd-black);
}

.hero__lead {
  max-width: 680px;
  font-size: 16px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.hero__form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hero__input {
  flex: 1 1 280px;
  min-width: 0;
  height: 48px;
  padding: 0 16px;
  font-family: inherit;
  font-size: 14px;
  color: var(--bd-black);
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-sm);
}

.hero__input:focus {
  outline: none;
  border-color: var(--bd-black);
}

.hero__submit {
  padding: 12px 24px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.hero__submit:disabled {
  opacity: 0.6;
}

.hero__error {
  font-size: 14px;
  color: #dc2626;
}

.hero__result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-green-tint);
  border: 1px solid var(--bd-green);
}

.hero__result-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--bd-green);
}

.hero__result-body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--bd-black);
}

.hero__result-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
  word-break: break-all;
}
</style>
