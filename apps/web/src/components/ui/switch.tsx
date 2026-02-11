import * as React from 'react'

import { cn } from '../../lib/utils'

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      className={cn(
        'focus-visible:ring-ring inline-flex h-6 w-11 items-center rounded-full border border-slate-300 bg-white p-0.5 shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-slate-900 data-[state=checked]:bg-slate-900',
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span
        className={cn(
          'bg-slate-900 pointer-events-none h-5 w-5 rounded-full transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
          checked ? 'translate-x-5 bg-white' : 'translate-x-0',
        )}
        data-state={checked ? 'checked' : 'unchecked'}
      />
      <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
    </button>
  ),
)

Switch.displayName = 'Switch'

export { Switch }
