import { describe, expect, it } from 'vitest'
import { PROJECT_TEMPLATE_ENVIRONMENTS } from '../features/projects/constants'

describe('PROJECT_TEMPLATE_ENVIRONMENTS', () => {
  it('maps starter template to development and prod', () => {
    expect(PROJECT_TEMPLATE_ENVIRONMENTS.starter).toEqual([
      'development',
      'prod',
    ])
  })

  it('maps full template to development, staging, and prod', () => {
    expect(PROJECT_TEMPLATE_ENVIRONMENTS.full).toEqual([
      'development',
      'staging',
      'prod',
    ])
  })

  it('maps empty template to no environments', () => {
    expect(PROJECT_TEMPLATE_ENVIRONMENTS.empty).toEqual([])
  })
})
