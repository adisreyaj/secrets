import { expect, type Page } from '@playwright/test'

export const createProject = async (page: Page, name: string) => {
  await page.getByTestId('projects-new').click()
  await page.getByTestId('project-name-input').fill(name)
  await page.getByTestId('project-template-select').click()
  await page.getByText('Starter (Dev + Prod)').click()
  await page.getByTestId('project-create-submit').click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

export const openProject = async (page: Page, name: string) => {
  await page.getByRole('button', { name: new RegExp(name) }).click()
}

export const goToEnvironments = async (page: Page) => {
  await page.getByRole('button', { name: /Environments/ }).click()
  await expect(page.getByRole('heading', { name: 'Environments' })).toBeVisible()
}

export const createEnvironment = async (page: Page, name: string) => {
  await page.getByTestId('envs-new').click()
  await page.getByTestId('env-name-input').fill(name)
  await page.getByTestId('env-create-submit').click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

export const openEnvironment = async (page: Page, name: string) => {
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { name: 'Secrets' })).toBeVisible()
}

export const addSecret = async (page: Page, key: string, value: string) => {
  await page.getByTestId('secret-add-open').click()
  await page.getByTestId('secret-key-input').fill(key)
  await page.getByTestId('secret-value-input').fill(value)
  await page.getByTestId('secret-add-submit').click()
  await expect(page.getByText(key, { exact: true })).toBeVisible()
}

export const findSecretRow = (page: Page, key: string) => {
  return page.getByRole('row', { name: new RegExp(`\\b${key}\\b`) })
}
