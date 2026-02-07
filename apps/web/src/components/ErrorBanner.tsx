import { cn } from '../lib/utils'

export const ErrorBanner = ({
  message,
  className,
}: {
  message?: string | null
  className?: string
}) =>
  message ? (
    <div
      className={cn(
        'rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700',
        className,
      )}
      role="alert"
    >
      {message}
    </div>
  ) : null
