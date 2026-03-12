import { ApiError } from './api'

export const getErrorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error && error.message
      ? error.message
      : 'Something went wrong.'
