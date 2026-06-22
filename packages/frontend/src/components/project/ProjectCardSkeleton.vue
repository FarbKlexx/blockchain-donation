<script setup lang="ts">
// Layout-matching placeholder for ProjectCard while the list loads.
</script>

<template>
  <div class="cardskel" aria-hidden="true">
    <div class="cardskel__image skeleton" />
    <div class="cardskel__body">
      <div class="cardskel__title skeleton" />
      <div class="cardskel__lines">
        <div class="cardskel__line skeleton" />
        <div class="cardskel__line cardskel__line--short skeleton" />
      </div>
      <div class="cardskel__bar skeleton" />
    </div>
  </div>
</template>

<style scoped>
.cardskel {
  display: flex;
  flex-direction: column;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  overflow: hidden;
}

.cardskel__image {
  height: 180px;
  border-radius: 0;
}

.cardskel__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.cardskel__title {
  height: 18px;
  width: 55%;
}

.cardskel__lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cardskel__line {
  height: 10px;
  width: 100%;
}

.cardskel__line--short {
  width: 75%;
}

.cardskel__bar {
  height: 12px;
  width: 100%;
  border-radius: var(--bd-radius-pill);
}
</style>
