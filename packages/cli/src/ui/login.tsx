import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { Spinner } from './shared.js'

type LoginPayload = {
  code: string
  loginUrl: string
  expiresAt: string
}

type LoginResult = {
  token: string
  projectId?: string
}

async function pollLogin(
  baseUrl: string,
  payload: LoginPayload,
  onStatus: (message: string) => void,
): Promise<LoginResult> {
  const expiresAt = new Date(payload.expiresAt).getTime()

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    onStatus('Waiting for login approval...')
    const poll = await fetch(`${baseUrl}/auth/cli-login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: payload.code }),
    })
    if (!poll.ok) {
      continue
    }
    const data = (await poll.json()) as { status: string; token?: string; projectId?: string }
    if (data.status === 'complete' && data.token) {
      return { token: data.token, projectId: data.projectId }
    }
  }

  throw new Error('CLI login expired. Run `secrets login` again.')
}

function openLoginUrl(loginUrl: string) {
  import('node:child_process')
    .then(({ exec }) => {
      const platform = process.platform
      const openCommand =
        platform === 'darwin'
          ? `open "${loginUrl}"`
          : platform === 'win32'
          ? `start "" "${loginUrl}"`
          : `xdg-open "${loginUrl}"`
      exec(openCommand)
    })
    .catch(() => {
      // Best effort only.
    })
}

export async function runLoginUI(baseUrl: string, payload: LoginPayload) {
  openLoginUrl(payload.loginUrl)

  return new Promise<LoginResult>((resolve, reject) => {
    const LoginUI = () => {
      const { exit } = useApp()
      const [status, setStatus] = useState('Waiting for login approval...')
      const [error, setError] = useState<string | null>(null)

      useEffect(() => {
        let isMounted = true
        pollLogin(baseUrl, payload, (message) => {
          if (isMounted) setStatus(message)
        })
          .then((result) => {
            if (!isMounted) return
            resolve(result)
            exit()
          })
          .catch((err) => {
            if (!isMounted) return
            const message = err instanceof Error ? err.message : 'Login failed'
            setError(message)
            reject(new Error(message))
            exit()
          })

        return () => {
          isMounted = false
        }
      }, [exit])

      useInput((input, key) => {
        if (key.ctrl && input === 'c') {
          reject(new Error('Aborted'))
          exit()
        }
      })

      return (
        <Box flexDirection="column" gap={1}>
          <Text>Open this URL to complete login:</Text>
          <Text color="cyan">{payload.loginUrl}</Text>
          <Text>{`Code: ${payload.code}`}</Text>
          {error ? <Text color="red">{error}</Text> : <Spinner label={status} />}
          <Text color="gray">Press Ctrl+C to cancel.</Text>
        </Box>
      )
    }

    render(<LoginUI />)
  })
}
