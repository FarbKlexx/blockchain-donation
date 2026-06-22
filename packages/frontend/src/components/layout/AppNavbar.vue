<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/ui/AppLogo.vue'
import { useWalletStore } from '@/stores/wallet'

// "Einloggen mit Wallet" — shared wallet state (see stores/wallet.ts).
const wallet = useWalletStore()
</script>

<template>
  <header class="navbar">
    <RouterLink to="/" class="navbar__logo" aria-label="Zur Startseite">
      <AppLogo />
    </RouterLink>
    <button
      class="navbar__wallet"
      :class="{ 'navbar__wallet--connected': wallet.isConnected }"
      :disabled="wallet.connecting"
      @click="wallet.connect()"
    >
      {{
        wallet.address
          ? wallet.address
          : wallet.connecting
            ? 'Verbinde …'
            : 'Einloggen mit Wallet'
      }}
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

/* Connected: dark surface with a green status dot before the address. */
.navbar__wallet--connected {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.navbar__wallet--connected::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bd-green);
}
</style>
