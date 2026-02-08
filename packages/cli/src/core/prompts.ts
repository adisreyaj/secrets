import { CliError } from './errors.js'
import type { FlagOptions } from './types.js'
import { promptConfirm, promptSelect, promptText } from '../ui/shared.js'

export async function chooseIndex(flags: FlagOptions, question: string, options: string[]) {
  if (flags.yes) {
    return 0
  }
  return promptSelect(question, options)
}

export async function askText(flags: FlagOptions, question: string, defaultValue: string) {
  if (flags.yes) {
    return defaultValue
  }
  return promptText(question, defaultValue)
}

export async function askConfirm(flags: FlagOptions, question: string, defaultValue = true) {
  if (flags.yes) {
    return defaultValue
  }
  return promptConfirm(question, defaultValue)
}

export function assertNoUnexpectedArgs(rest: string[], command: string) {
  if (rest.length > 0) {
    throw new CliError('USAGE_ERROR', `Unexpected arguments for ${command} command`)
  }
}
