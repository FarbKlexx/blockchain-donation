<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '@/types/project'
import { donate } from '@/services/projectsService'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ donated: [newRaised: number] }>()

const amount = ref('')
const submitting = ref(false)

// INTEGRATION POINT: "Jetzt unterstützen" — the donation transaction.
// Calls the mock service today; wire to the escrow contract's donate().
async function onDonate() {
  const value = Number(amount.value)
  if (!value || value <= 0 || submitting.value) return
  submitting.value = true
  try {
    const result = await donate(props.project.id, value)
    emit('donated', result.newRaised)
    amount.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="hero">
    <div class="hero__image">
      <img :src="project.image" :alt="project.title" />
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

      <form class="hero__donate" @submit.prevent="onDonate">
        <span class="hero__currency">{{ project.currency }}</span>
        <input
          v-model="amount"
          class="hero__input"
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
          placeholder="Betrag eingeben"
          aria-label="Spendenbetrag"
        />
        <button class="hero__submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Sende …' : 'Jetzt unterstützen' }}
        </button>
      </form>
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
