export type ControlSize = 'md' | 'sm' | 'xs' | 'xxs'
export type ControlVariant = 'default' | 'muted'

export const controlBaseClasses =
  'flex w-full rounded-md border border-input bg-background px-4 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export const controlSizeClasses: Record<ControlSize, string> = {
  md: 'h-11',
  sm: 'h-10',
  xs: 'h-9',
  xxs: 'h-8',
}

export const controlVariantClasses: Record<ControlVariant, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted/60 text-muted-foreground',
}
