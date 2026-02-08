export class CliError extends Error {
  code: string
  hint?: string
  exitCode: number

  constructor(code: string, message: string, options?: { hint?: string; exitCode?: number }) {
    super(message)
    this.code = code
    this.hint = options?.hint
    this.exitCode = options?.exitCode ?? mapExitCode(code)
  }
}

export class ApiError extends Error {
  status: number
  path: string
  method: string

  constructor(status: number, message: string, path: string, method: string) {
    super(message)
    this.status = status
    this.path = path
    this.method = method
  }
}

export function mapExitCode(code: string) {
  switch (code) {
    case 'USAGE_ERROR':
      return 2
    case 'AUTH_ERROR':
      return 3
    case 'FORBIDDEN':
      return 4
    case 'CONFLICT':
      return 5
    case 'NETWORK_ERROR':
      return 6
    default:
      return 1
  }
}

export function fromError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error
  }

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return new CliError('AUTH_ERROR', error.message, {
        hint: 'Run `secrets login` and retry.',
      })
    }
    if (error.status === 403) {
      return new CliError('FORBIDDEN', error.message)
    }
    if (error.status === 409) {
      return new CliError('CONFLICT', error.message)
    }
    return new CliError('API_ERROR', error.message)
  }

  if (error instanceof Error) {
    return new CliError('UNKNOWN_ERROR', error.message)
  }

  return new CliError('UNKNOWN_ERROR', 'Unknown error')
}
