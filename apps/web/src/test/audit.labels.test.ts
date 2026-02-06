import { describe, expect, it } from 'vitest'
import {
  humanizeAction,
  humanizeResourceType,
} from '../features/audit/labels'

describe('audit labels', () => {
  it('returns configured labels for known audit values', () => {
    expect(humanizeAction('secret.create')).toBe('Create Secret')
    expect(humanizeResourceType('service_account')).toBe('Service Account')
  })

  it('humanizes unknown action and resource tokens', () => {
    expect(humanizeAction('secrets.rotate')).toBe('Rotate Secrets')
    expect(humanizeResourceType('runtime_config')).toBe('Runtime Config')
  })
})
