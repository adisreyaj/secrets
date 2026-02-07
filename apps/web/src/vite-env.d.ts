/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FF_PROVIDER?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_FF_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
