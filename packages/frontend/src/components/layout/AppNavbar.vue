<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/ui/AppLogo.vue'
import { connectWallet } from '@/services/projectsService'

const connecting = ref(false)
const address = ref<string | null>(null)

// INTEGRATION POINT: "Einloggen mit Wallet" button.
// Currently calls the mock service. Wire to ethers signer setup.
async function onConnect() {
  connecting.value = true
  try {
    const wallet = await connectWallet()
    address.value = wallet.address
  } finally {
    connecting.value = false
  }
}
</script>

<template>
  <header class="navbar">
    <RouterLink to="/" class="navbar__logo" aria-label="Zur Startseite">
      <AppLogo />
    </RouterLink>
    <button class="navbar__wallet" :disabled="connecting" @click="onConnect">
      {{ address ? address : connecting ? 'Verbinde …' : 'Einloggen mit Wallet' }}
    </button>
  </header>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  padding: 0 32px;
  background: var(--bd-surface);
  border-bottom: 1px solid var(--bd-stroke);
}

.navbar__wallet {
  background: var(--bd-black);
  color: var(--bd-surface);
  border: none;
  border-radius: var(--bd-radius-sm);
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
}

.navbar__wallet:disabled {
  opacity: 0.7;
  cursor: default;
}
</style>
