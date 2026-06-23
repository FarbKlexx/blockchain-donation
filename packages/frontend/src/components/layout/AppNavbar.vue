<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/ui/AppLogo.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import { useWalletStore } from '@/stores/wallet'
import { shortenAddress } from '@/utils/address'

// Wallet login + the connected account menu. Roles drive what the menu shows;
// see stores/wallet.ts (roles are presentation-only, derived from chain).
const wallet = useWalletStore()

const dialogOpen = ref(false)
const menuOpen = ref(false)

// Active role labels for the connected chip/menu.
const roleLabels: { key: 'donor' | 'validator' | 'owner'; label: string }[] = [
  { key: 'donor', label: 'Spender' },
  { key: 'validator', label: 'Validator' },
  { key: 'owner', label: 'Ersteller' },
]

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    // Close on the next outside click.
    setTimeout(() => window.addEventListener('click', closeMenu, { once: true }))
  }
}
function closeMenu() {
  menuOpen.value = false
}
function logout() {
  wallet.logout()
  menuOpen.value = false
}
onUnmounted(() => window.removeEventListener('click', closeMenu))
</script>

<template>
  <header class="navbar">
    <RouterLink to="/" class="navbar__logo" aria-label="Zur Startseite">
      <AppLogo />
    </RouterLink>

    <!-- Not connected: open the login overlay. -->
    <button
      v-if="!wallet.isConnected"
      class="navbar__wallet"
      :disabled="wallet.connecting"
      @click="dialogOpen = true"
    >
      {{ wallet.connecting ? 'Verbinde …' : 'Einloggen mit Wallet' }}
    </button>

    <!-- Connected: address chip toggles a role-aware menu. -->
    <div v-else class="navbar__account" @click.stop>
      <button
        class="navbar__wallet navbar__wallet--connected"
        :aria-expanded="menuOpen"
        @click="toggleMenu"
      >
        {{ shortenAddress(wallet.address ?? '') }}
        <AppIcon name="chevron-down" :size="14" />
      </button>

      <div v-if="menuOpen" class="menu" role="menu">
        <div class="menu__roles">
          <span v-if="!wallet.hasAnyRole" class="menu__role menu__role--none">Normaler Nutzer</span>
          <template v-else>
            <span
              v-for="r in roleLabels"
              v-show="wallet.roles[r.key]"
              :key="r.key"
              class="menu__role"
            >
              {{ r.label }}
            </span>
          </template>
        </div>
        <RouterLink
          v-if="wallet.hasAnyRole"
          :to="{ name: 'my-projects' }"
          class="menu__item"
          role="menuitem"
          @click="closeMenu"
        >
          Meine Projekte
        </RouterLink>
        <button class="menu__item menu__item--button" type="button" role="menuitem" @click="logout">
          Abmelden
        </button>
      </div>
    </div>

    <LoginDialog :open="dialogOpen" @close="dialogOpen = false" />
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

.navbar__account {
  position: relative;
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  box-shadow: var(--bd-shadow-card);
}

.menu__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px 10px;
  border-bottom: 1px solid var(--bd-divider);
  margin-bottom: 6px;
}

.menu__role {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: var(--bd-radius-pill);
  color: var(--bd-green);
  background: var(--bd-green-tint);
}

.menu__role--none {
  color: var(--bd-grey-text);
  background: var(--bd-grey);
}

.menu__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 8px;
  border: none;
  background: transparent;
  border-radius: var(--bd-radius-sm);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--bd-black);
}

.menu__item:hover {
  background: var(--bd-grey);
}

.menu__item--button {
  color: var(--bd-grey-text);
}
</style>
