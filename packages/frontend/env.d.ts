/// <reference types="vite/client" />

// Vite inlines every VITE_* value into the client bundle at build time.
// ⚠️ Only ever put a Hardhat TEST key in VITE_DEV_PRIVATE_KEY — never a funded
// key. assertLocalSigner() in projectsService.ts enforces localhost-only use.
interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string
  readonly VITE_DEV_PRIVATE_KEY?: string
  readonly VITE_CONTRACT_ADDRESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
