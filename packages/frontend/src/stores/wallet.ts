import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { connectWallet } from '@/services/projectsService'

// Shared wallet-connection state. Login is wallet-only (no user system), so this
// single source of truth gates actions that require a signer — e.g. donating.
export const useWalletStore = defineStore('wallet', () => {
  const address = ref<string | null>(null)
  const connecting = ref(false)

  const isConnected = computed(() => address.value !== null)

  // INTEGRATION POINT: connects via the service (mock today). Wire to ethers
  // signer setup / BrowserProvider there.
  async function connect() {
    if (connecting.value) return
    connecting.value = true
    try {
      const wallet = await connectWallet()
      address.value = wallet.address
    } finally {
      connecting.value = false
    }
  }

  function disconnect() {
    address.value = null
  }

  return { address, connecting, isConnected, connect, disconnect }
})
