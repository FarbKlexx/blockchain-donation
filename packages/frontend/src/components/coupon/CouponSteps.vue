<script setup lang="ts">
// Static "Wie es funktioniert" explainer — three numbered steps, straight from
// the Figma. No data/logic; purely informational.
const steps = [
  {
    title: 'E-Mail eingeben',
    body: 'Tragen Sie Ihre E-Mail-Adresse ein und bestätigen Sie die Anmeldung zum Newsletter.',
  },
  {
    title: 'Privaten Schlüssel erhalten',
    body: 'Wir senden Ihnen einen kryptografischen privaten Schlüssel per E-Mail zu.',
  },
  {
    title: 'Beim Kauf einlösen',
    body: 'Geben Sie den Schlüssel beim Checkout ein. Der Rabatt wird sofort in ETH abgezogen.',
  },
]
</script>

<template>
  <section class="steps">
    <h2 class="steps__title">Wie es funktioniert</h2>
    <ol class="steps__grid">
      <li v-for="(step, i) in steps" :key="i" class="step">
        <span class="step__num">{{ i + 1 }}</span>
        <div class="step__text">
          <h3 class="step__heading">{{ step.title }}</h3>
          <p class="step__body">{{ step.body }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.steps {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.steps__title {
  font-size: 24px;
  font-weight: 800;
  color: var(--bd-black);
}

.steps__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
  list-style: none;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--bd-grey);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
}

.step__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--bd-radius-md);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-size: 14px;
  font-weight: 700;
}

.step__text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step__heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--bd-black);
}

.step__body {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}
</style>
