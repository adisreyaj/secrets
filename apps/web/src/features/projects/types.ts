export type ProjectTemplate = 'starter' | 'full' | 'empty'

export type CreateProjectPayload = {
  name: string
  template: ProjectTemplate
}
