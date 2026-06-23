import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useWalletStore } from './stores/wallet'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Restore a tab session (address from sessionStorage; roles re-derived from
// chain) BEFORE mounting, so route guards see the session on a hard refresh.
// Mount regardless of the outcome so a failed/empty restore never blocks the UI.
useWalletStore()
  .restore()
  .finally(() => app.mount('#app'))
