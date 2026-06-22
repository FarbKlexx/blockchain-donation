<script setup lang="ts">
const links = ['Privacy Policy', 'Terms of Service', 'Contact Us']
</script>

<template>
  <footer class="footer">
    <p class="footer__copy">© 2026 Blockchain Donation</p>
    <nav class="footer__links">
      <!-- INTEGRATION POINT: static placeholder links (no targets yet). -->
      <a v-for="link in links" :key="link" href="#" @click.prevent>{{ link }}</a>
    </nav>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 32px;
  background: var(--bd-surface);
  border-top: 1px solid var(--bd-stroke);
  color: var(--bd-grey-text);
  font-size: 14px;
}

.footer__links {
  display: flex;
  gap: 24px;
}
</style>
