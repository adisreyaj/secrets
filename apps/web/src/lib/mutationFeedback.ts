import { toast } from 'sonner'
import { getErrorMessage } from './errors'

type MutationFeedbackOptions<T> = {
  successMessage?: string
  errorMessage?: string
  onSuccess?: (result: T) => Promise<void> | void
}

export const runMutationWithToast = async <T>(
  run: () => Promise<T>,
  options: MutationFeedbackOptions<T> = {},
): Promise<T | undefined> => {
  try {
    const result = await run()
    if (options.onSuccess) {
      await options.onSuccess(result)
    }
    if (options.successMessage) {
      toast.success(options.successMessage)
    }
    return result
  } catch (error) {
    toast.error(options.errorMessage ?? getErrorMessage(error))
    return undefined
  }
}
