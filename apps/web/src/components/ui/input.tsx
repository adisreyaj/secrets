import * as React from 'react'

import { cn } from '../../lib/utils'
import {
  controlBaseClasses,
  controlSizeClasses,
  controlVariantClasses,
  type ControlSize,
  type ControlVariant,
} from './control-classes'

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  size?: ControlSize
  variant?: ControlVariant
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = 'md', variant = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          controlBaseClasses,
          controlSizeClasses[size],
          controlVariantClasses[variant],
          'file:text-foreground file:border-0 file:bg-transparent file:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
