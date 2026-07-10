<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWalletStore } from '@/stores/wallet'
import { MOCK_USERS, type MockUser } from '@/services/mockUsers'
import AppIcon from '@/components/ui/AppIcon.vue'

// Wallet login overlay. In DEV it offers the mock personas (prototype
// impersonation); in a production build it falls back to a real wallet connect.
// The persona list is gated to import.meta.env.DEV so it can never ship.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const wallet = useWalletStore()
const isDev = import.meta.env.DEV

async function pick(user: MockUser) {
  // Address + key together: the persona is both the shown identity AND the
  // signer, so its transactions actually come from this account.
  await wallet.login(user.address, user.privateKey)
  emit('close')
}

async function connectReal() {
  await wallet.connect()
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="login" role="dialog" aria-modal="true" aria-label="Einloggen">
      <div class="login__backdrop" @click="emit('close')" />
      <div class="login__panel">
        <header class="login__head">
          <h2 class="login__title">Einloggen mit Wallet</h2>
          <button class="login__close" type="button" aria-label="Schließen" @click="emit('close')">
            ✕
          </button>
        </header>

        <template v-if="isDev">
          <p class="login__hint">
            Prototyp: Wähle ein Beispiel-Konto. Die Rollen werden – wie später bei einer echten
            Wallet – aus den Verträgen abgeleitet.
          </p>
          <ul class="login__list">
            <li v-for="user in MOCK_USERS" :key="user.key">
              <button
                class="login__user"
                type="button"
                :disabled="wallet.connecting"
                @click="pick(user)"
              >
                <span class="login__user-main">
                  <span class="login__user-label">{{ user.label }}</span>
                  <span class="login__user-desc">{{ user.description }}</span>
                </span>
                <AppIcon name="chevron-down" :size="16" class="login__chev" />
              </button>
            </li>
          </ul>
        </template>

        <template v-else>
          <p class="login__hint">Verbinde deine Wallet, um fortzufahren.</p>
          <button
            class="login__connect"
            type="button"
            :disabled="wallet.connecting"
            @click="connectReal"
          >
            <AppIcon name="shield-check" :size="16" />
            {{ wallet.connecting ? 'Verbinde …' : 'Mit Wallet verbinden' }}
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.login {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.login__panel {
  position: relative;
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-lg);
  box-shadow: var(--bd-shadow-card);
}

.login__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.login__title {
  font-size: 20px;
  font-weight: 800;
  color: var(--bd-black);
}

.login__close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--bd-grey-text);
  padding: 4px;
}

.login__hint {
  font-size: 14px;
  line-height: 1.5;
  color: var(--bd-grey-text);
}

.login__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
}

.login__user {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  padding: 14px 16px;
  background: var(--bd-surface);
  border: 1px solid var(--bd-stroke);
  border-radius: var(--bd-radius-md);
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.login__user:hover:not(:disabled) {
  border-color: var(--bd-black);
  transform: translateY(-1px);
}

.login__user:disabled {
  opacity: 0.6;
}

.login__user-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.login__user-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--bd-black);
}

.login__user-desc {
  font-size: 12px;
  color: var(--bd-grey-text);
}

.login__chev {
  flex-shrink: 0;
  transform: rotate(-90deg);
  color: var(--bd-grey-text);
}

.login__connect {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bd-black);
  color: var(--bd-surface);
  border: none;
  border-radius: var(--bd-radius-sm);
  font-size: 14px;
  font-weight: 700;
}

.login__connect:disabled {
  opacity: 0.7;
}
</style>
