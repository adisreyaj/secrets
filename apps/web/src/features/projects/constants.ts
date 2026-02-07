import type { ProjectTemplate } from './types'

export const PROJECT_TEMPLATE_OPTIONS: ReadonlyArray<{
  id: ProjectTemplate
  label: string
}> = [
  { id: 'starter', label: 'Starter (Dev + Prod)' },
  { id: 'full', label: 'Full stack (Dev + Staging + Prod)' },
  { id: 'empty', label: 'Empty project' },
]

export const PROJECT_TEMPLATE_ENVIRONMENTS: Readonly<
  Record<ProjectTemplate, readonly string[]>
> = {
  starter: ['development', 'prod'],
  full: ['development', 'staging', 'prod'],
  empty: [],
}
