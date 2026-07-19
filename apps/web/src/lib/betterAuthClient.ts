import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'

const baseURL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export const betterAuthClient = createAuthClient({
  baseURL,
  plugins: [passkeyClient()],
})
