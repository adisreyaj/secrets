import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'

function useTextInput(initialValue: string) {
  const [value, setValue] = useState(initialValue)

  useInput((input, key) => {
    if (key.return) return
    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1))
      return
    }
    if (key.ctrl || key.meta) return
    if (!input) return
    setValue((current) => `${current}${input}`)
  })

  return [value, setValue] as const
}

export function promptText(question: string, initialValue: string) {
  return new Promise<string>((resolve, reject) => {
    const Prompt = () => {
      const { exit } = useApp()
      const [value] = useTextInput(initialValue)

      useInput((input, key) => {
        if (key.ctrl && input === 'c') {
          exit()
          reject(new Error('Aborted'))
          return
        }
        if (key.return) {
          exit()
          resolve(value.trim() || initialValue)
        }
      })

      return (
        <Box flexDirection="column">
          <Text>{question}</Text>
          <Text>{`> ${value}`}</Text>
        </Box>
      )
    }

    render(<Prompt />)
  })
}

export function promptConfirm(question: string, defaultYes: boolean) {
  return new Promise<boolean>((resolve, reject) => {
    const Prompt = () => {
      const { exit } = useApp()
      const hint = defaultYes ? '[Y/n]' : '[y/N]'

      useInput((input, key) => {
        if (key.ctrl && input === 'c') {
          exit()
          reject(new Error('Aborted'))
          return
        }
        if (key.return) {
          exit()
          resolve(defaultYes)
          return
        }
        const normalized = input.trim().toLowerCase()
        if (normalized === 'y') {
          exit()
          resolve(true)
        }
        if (normalized === 'n') {
          exit()
          resolve(false)
        }
      })

      return (
        <Box flexDirection="column">
          <Text>{`${question} ${hint}`}</Text>
          <Text color="gray">Press Y or N, Enter accepts default.</Text>
        </Box>
      )
    }

    render(<Prompt />)
  })
}

export function Spinner({ label }: { label: string }) {
  const frames = ['-', '\\', '|', '/']
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % frames.length)
    }, 120)
    return () => clearInterval(timer)
  }, [])

  return <Text>{`${frames[index]} ${label}`}</Text>
}
