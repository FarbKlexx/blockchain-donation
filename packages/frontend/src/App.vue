<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
</script>

<template>
  <AppNavbar />
  <main class="app__main">
    <RouterView />
  </main>
  <AppFooter />
  <ToastHost />
</template>

<style scoped>
.app__main {
  flex: 1 1 auto;
}
</style>
