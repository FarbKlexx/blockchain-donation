<script setup lang="ts">
// Layout-matching placeholder for the project detail page while it loads.
const paragraphWidths = ['100%', '96%', '88%', '100%', '92%', '60%']
</script>

<template>
  <div class="dskel" aria-hidden="true">
    <div class="dskel__hero-wrap">
      <div class="dskel__hero">
        <div class="dskel__hero-image skeleton" />
        <div class="dskel__hero-content">
          <div class="dskel__badge skeleton" />
          <div class="dskel__title skeleton" />
          <div class="dskel__line skeleton" />
          <div class="dskel__line dskel__line--short skeleton" />
          <div class="dskel__input skeleton" />
        </div>
      </div>
    </div>

    <div class="dskel__content">
      <div class="dskel__main">
        <div class="dskel__heading skeleton" />
        <div class="dskel__tabs">
          <div class="dskel__tab skeleton" />
          <div class="dskel__tab skeleton" />
          <div class="dskel__tab skeleton" />
        </div>
        <div class="dskel__divider" />
        <div class="dskel__paras">
          <div
            v-for="(w, i) in paragraphWidths"
            :key="i"
            class="dskel__line skeleton"
            :style="{ width: w }"
          />
        </div>
      </div>

      <div class="dskel__sidebar">
        <div class="dskel__card dskel__card--tall skeleton" />
        <div class="dskel__card skeleton" />
        <div class="dskel__card dskel__card--mid skeleton" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dskel {
  display: flex;
  flex-direction: column;
}

/* Top padding handled by the always-visible topbar in the view, so the hero
   sits at the same Y whether loading or loaded (no layout shift). */
.dskel__hero-wrap {
  padding: 0 var(--bd-page-gutter) 32px;
}

.dskel__hero {
  display: flex;
  gap: 20px;
  background: var(--bd-surface);
  border-radius: var(--bd-radius-lg);
  overflow: hidden;
}

.dskel__hero-image {
  flex: 0 0 425px;
  max-width: 45%;
  min-height: 320px;
  border-radius: 0;
}

.dskel__hero-content {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  padding: 40px 20px;
}

.dskel__badge {
  width: 190px;
  height: 30px;
  border-radius: var(--bd-radius-sm);
}

.dskel__title {
  width: 70%;
  height: 40px;
}

.dskel__input {
  width: 100%;
  max-width: 420px;
  height: 42px;
  border-radius: var(--bd-radius-sm);
}

.dskel__content {
  display: flex;
  align-items: flex-start;
  gap: 48px;
  padding: 0 var(--bd-page-gutter) 64px;
}

.dskel__main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dskel__heading {
  width: 220px;
  height: 28px;
}

.dskel__tabs {
  display: flex;
  gap: 32px;
}

.dskel__tab {
  width: 96px;
  height: 14px;
}

.dskel__divider {
  height: 1px;
  background: var(--bd-divider);
}

.dskel__paras {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 664px;
}

.dskel__line {
  height: 12px;
  width: 100%;
}

.dskel__line--short {
  width: 80%;
}

.dskel__sidebar {
  flex: 0 0 400px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.dskel__card {
  height: 150px;
  border-radius: var(--bd-radius-lg);
}

.dskel__card--tall {
  height: 240px;
}

.dskel__card--mid {
  height: 210px;
}

@media (max-width: 1000px) {
  .dskel__content {
    flex-direction: column;
  }
  .dskel__sidebar {
    flex-basis: auto;
    max-width: none;
    width: 100%;
  }
}

@media (max-width: 860px) {
  .dskel__hero {
    flex-direction: column;
  }
  .dskel__hero-image {
    flex-basis: auto;
    max-width: none;
    min-height: 220px;
  }
}
</style>
