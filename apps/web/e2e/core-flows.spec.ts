import { test, expect } from '@playwright/test'
import {
  addSecret,
  createEnvironment,
  createProject,
  findSecretRow,
  goToEnvironments,
  openEnvironment,
  openProject,
} from './helpers'

test.describe.serial('core workspace flows', () => {
  const projectName = `E2E Project ${Date.now()}`
  const envExtra = 'staging'
  const primarySecret = { key: 'API_KEY', value: 'alpha' }
  const updatedSecret = { key: 'API_KEY_UPDATED', value: 'beta' }
  const diffSecretValue = 'gamma'
  const onlyDevSecret = { key: 'ONLY_DEV', value: 'dev-only' }

  test('Authentication + Project Creation', async ({ page }) => {
    await page.goto('/#/projects')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
    await createProject(page, projectName)
  })

  test('Environment List + New Environment', async ({ page }) => {
    await page.goto('/#/projects')
    await openProject(page, projectName)
    await goToEnvironments(page)
    await createEnvironment(page, envExtra)
  })

  test('Secrets CRUD + Search + Show/Hide', async ({ page }) => {
    await page.goto('/#/projects')
    await openProject(page, projectName)
    await goToEnvironments(page)
    await openEnvironment(page, 'development')

    await addSecret(page, primarySecret.key, primarySecret.value)

    await page.getByTestId('secrets-toggle-values').click()
    await expect(page.getByText(primarySecret.value, { exact: true })).toBeVisible()

    await page.getByTestId('secrets-search').fill(primarySecret.key)
    await expect(page.getByText(primarySecret.key, { exact: true })).toBeVisible()
    await page.getByTestId('secrets-search').fill(primarySecret.value)
    await expect(page.getByText(primarySecret.value, { exact: true })).toBeVisible()
    await page.getByTestId('secrets-search').fill('')

    const row = findSecretRow(page, primarySecret.key)
    await row.getByLabel('Edit secret').click()
    await row.getByPlaceholder('SECRET_KEY').fill(updatedSecret.key)
    await row.getByPlaceholder('New value').fill(updatedSecret.value)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(updatedSecret.key, { exact: true })).toBeVisible()

    await addSecret(page, 'TO_DELETE', 'temp')
    const deleteRow = findSecretRow(page, 'TO_DELETE')
    await deleteRow.getByLabel('Delete secret').click()
    await page.getByTestId('secret-delete-confirm').click()
    await expect(page.getByText('TO_DELETE')).toHaveCount(0)
  })

  test('Diff + Rollback', async ({ page }) => {
    await page.goto('/#/projects')
    await openProject(page, projectName)
    await goToEnvironments(page)
    await openEnvironment(page, 'development')

    const row = findSecretRow(page, updatedSecret.key)
    await row.getByLabel('Edit secret').click()
    await row.getByPlaceholder('New value').fill(diffSecretValue)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await findSecretRow(page, updatedSecret.key).getByLabel('View diff').click()
    await expect(page.getByRole('heading', { name: 'Secret diff' })).toBeVisible()
    await expect(page.getByText('Previous')).toBeVisible()
    await expect(page.getByText('Current')).toBeVisible()
    await page.keyboard.press('Escape')

    await findSecretRow(page, updatedSecret.key).getByLabel('Rollback secret').click()
    await page.getByTestId('secret-rollback-confirm').click()

    await page.getByTestId('secrets-toggle-values').click()
    await expect(page.getByText(updatedSecret.value, { exact: true })).toBeVisible()
  })

  test('Copy Secret + Missing Keys', async ({ page }) => {
    await page.goto('/#/projects')
    await openProject(page, projectName)
    await goToEnvironments(page)
    await openEnvironment(page, 'development')

    const row = findSecretRow(page, updatedSecret.key)
    await row.getByLabel('Copy secret').click()
    await page.getByTestId('secret-copy-confirm').click()
    await expect(page.getByText('Copied to')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await addSecret(page, onlyDevSecret.key, onlyDevSecret.value)

    await page.getByRole('tab', { name: 'prod' }).click()
    await expect(page.getByText(updatedSecret.key, { exact: true })).toBeVisible()

    await page.getByTestId('missing-keys-open').click()
    await page.getByTestId('missing-keys-confirm').click()
    await expect(page.getByText(onlyDevSecret.key, { exact: true })).toBeVisible()
  })
})
