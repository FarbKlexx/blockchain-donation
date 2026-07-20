import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  connectWallet,
  loadAccountSession,
  setActiveSignerKey,
  getWalletBalance,
  type AccountSession,
  type Role,
} from '@/services/projectsService'
import { MOCK_USERS } from '@/services/mockUsers'

// The connected-account session: the wallet address PLUS the roles/memberships
// derived from chain at login. Single source of truth for "who am I and what
// can the UI show me". Login is wallet-only; in the prototype the LoginDialog
// picks a mock address, but everything past `login(address)` is identical to the
// real path.
//
// SECURITY: roles here gate UI only — never authority. They are ALWAYS
// re-derived from chain (loadAccountSession), never trusted from storage. We
// persist only the public address (sessionStorage, this tab) and re-derive
// roles on restore, so a tampered value can at most change what UI is shown —
// the contract still rejects any action the address isn't actually entitled to.
const STORAGE_KEY = 'bd.session.address'

const NO_ROLES: Record<Role, boolean> = { donor: false, validator: false, owner: false }

export const useWalletStore = defineStore('wallet', () => {
  const address = ref<string | null>(null)
  const session = ref<AccountSession | null>(null)
  const connecting = ref(false)
  // The connected account's on-chain native-coin balance (null = unknown yet).
  const balance = ref<number | null>(null)

  const isConnected = computed(() => address.value !== null)
  const roles = computed(() => session.value?.roles ?? NO_ROLES)
  const donorOf = computed(() => session.value?.donorOf ?? [])
  const validatorOf = computed(() => session.value?.validatorOf ?? [])
  const ownerOf = computed(() => session.value?.ownerOf ?? [])
  const hasAnyRole = computed(() => roles.value.donor || roles.value.validator || roles.value.owner)

  /** What the connected account is in ONE project — a cheap lookup over the
   *  cached memberships (no re-scan). Future per-project actions (vote, refund,
   *  owner controls) decide their button visibility from this. */
  function roleInProject(projectAddress: string) {
    const a = projectAddress.toLowerCase()
    const inSet = (s: string[]) => s.some((x) => x.toLowerCase() === a)
    return {
      isDonor: inSet(donorOf.value),
      isValidator: inSet(validatorOf.value),
      isOwner: inSet(ownerOf.value),
    }
  }

  /** Refresh the connected account's on-chain balance for the navbar chip.
   *  Non-fatal: a read failure just clears it rather than breaking login. */
  async function refreshBalance() {
    if (!address.value) {
      balance.value = null
      return
    }
    try {
      balance.value = await getWalletBalance(address.value)
    } catch {
      balance.value = null
    }
  }

  /** Core entry: adopt an address and derive its roles from chain (one scan).
   *  Used by both the mock-user overlay and the real wallet path.
   *
   *  `privateKey` (DEV personas only) also switches the SIGNER to this account,
   *  so the address shown in the UI is the address every transaction is sent
   *  from — without it, writes would sign as the .env fallback key and e.g.
   *  a donation would be credited to a different account than the one logged
   *  in. The real-wallet path passes no key (the wallet itself signs). */
  async function login(addr: string, privateKey?: string) {
    if (connecting.value) return
    connecting.value = true
    try {
      // Throws on a key/address mismatch BEFORE we adopt the identity.
      setActiveSignerKey(privateKey ?? null, addr)
      address.value = addr
      session.value = await loadAccountSession(addr)
      await refreshBalance()
      sessionStorage.setItem(STORAGE_KEY, addr) // persist the address only
    } finally {
      connecting.value = false
    }
  }

  // INTEGRATION POINT: real wallet path. connectWallet() is the service stub
  // today; later it's BrowserProvider + getSigner(). Either way we then `login`
  // with the returned address so roles get derived the same way.
  async function connect() {
    const wallet = await connectWallet()
    await login(wallet.address)
  }

  /** Re-derive roles/memberships from chain (e.g. after a donation changes
   *  them). Cheap — one pass over the campaigns. */
  async function refresh() {
    if (address.value) {
      session.value = await loadAccountSession(address.value)
      await refreshBalance()
    }
  }

  function logout() {
    setActiveSignerKey(null)
    address.value = null
    session.value = null
    balance.value = null
    sessionStorage.removeItem(STORAGE_KEY)
  }

  /** Rehydrate a tab session on app start: read the saved address and RE-DERIVE
   *  roles from chain (we never trust stored roles). Only the address is
   *  persisted — if it belongs to a DEV persona, re-attach that persona's
   *  signing key so writes keep coming from the logged-in account after a
   *  reload. No-op if none saved. */
  async function restore() {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return
    const persona = import.meta.env.DEV
      ? MOCK_USERS.find((u) => u.address.toLowerCase() === saved.toLowerCase())
      : undefined
    await login(saved, persona?.privateKey)
  }

  return {
    address,
    session,
    connecting,
    balance,
    isConnected,
    roles,
    donorOf,
    validatorOf,
    ownerOf,
    hasAnyRole,
    roleInProject,
    login,
    connect,
    refresh,
    refreshBalance,
    logout,
    restore,
  }
})
