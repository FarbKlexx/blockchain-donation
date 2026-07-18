<script setup lang="ts">
// Static "Wie es funktioniert" explainer — three numbered steps. No data/logic;
// purely informational.
const steps = [
  {
    title: 'Erstellen & finanzieren',
    body: 'Der Betreiber oder eine freigeschaltete Institution legt einen Gutschein an und hinterlegt den Wert direkt im Smart Contract. Dabei entsteht ein Schlüsselpaar – nur die öffentliche Adresse geht on-chain.',
  },
  {
    title: 'Code weitergeben',
    body: 'Der Ersteller erhält den geheimen Gutscheincode (den privaten Schlüssel) und gibt ihn an Kundinnen und Kunden weiter. Der Schlüssel selbst wird nie on-chain gespeichert.',
  },
  {
    title: 'Beim Einkauf einlösen',
    body: 'Die Kundin oder der Kunde legt den Code beim Einkauf vor. Die freigeschaltete Institution löst ihn ein und erhält den Betrag direkt vom Contract — der Kunde zahlt entsprechend weniger und fasst das Geld nie an. Ungenutzt abgelaufen? Der Ersteller kann den Betrag zurückfordern.',
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
