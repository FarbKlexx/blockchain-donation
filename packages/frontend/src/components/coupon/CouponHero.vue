<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import LoginDialog from '@/components/auth/LoginDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// The coupon landing hero. Gift cards can be created by ANY wallet and funded
// on-chain; only REDEMPTION is restricted to whitelisted institutions. A visitor
// without a wallet is prompted to log in first. Distribution of the resulting
// codes happens off-site.
const wallet = useWalletStore()
const dialogOpen = ref(false)
</script>

<template>
  <section class="hero card">
    <span class="hero__badge">
      <AppIcon name="shield-check" :size="16" />
      Blockchain-gesichert
    </span>

    <div class="hero__intro">
      <h1 class="hero__title">Blockchain-Gutscheine</h1>
      <p class="hero__lead">
        Jede Wallet kann Gutscheine erstellen und ihren Wert direkt im Smart Contract hinterlegen.
        Als Gutscheincode dient der private Schlüssel eines Schlüsselpaares – er wird nie on-chain
        gespeichert. Wer den Code besitzt, kann den Gutschein bei einer freigeschalteten Institution
        einlösen; abgelaufene Gutscheine kann der Ersteller zurückfordern.
      </p>
    </div>

    <div class="hero__actions">
      <!-- Connected: straight to the create page. Not connected: log in first. -->
      <RouterLink v-if="wallet.isConnected" :to="{ name: 'coupon-create' }" class="hero__cta">
        Gutscheine erstellen
      </RouterLink>
      <button v-else type="button" class="hero__cta" @click="dialogOpen = true">
        Einloggen mit Wallet
      </button>

      <RouterLink
        v-if="wallet.isConnected"
        :to="{ name: 'my-coupons' }"
        class="hero__secondary"
      >
        Meine Gutscheine ansehen →
      </RouterLink>
    </div>

    <LoginDialog :open="dialogOpen" @close="dialogOpen = false" />
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 40px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px solid var(--bd-green);
  border-radius: var(--bd-radius-sm);
  background: var(--bd-green-tint);
  color: var(--bd-green);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.hero__intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero__title {
  font-size: 32px;
  font-weight: 800;
  color: var(--bd-black);
}

.hero__lead {
  max-width: 680px;
  font-size: 16px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.hero__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.hero__cta {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border: none;
  border-radius: var(--bd-radius-sm);
  background: var(--bd-black);
  color: var(--bd-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.hero__secondary {
  font-size: 14px;
  font-weight: 700;
  color: var(--bd-green);
  text-decoration: underline;
}
</style>
