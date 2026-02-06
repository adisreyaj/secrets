import path from 'path'
import { chromium } from '@playwright/test'

const storageStatePath = path.resolve(__dirname, '.auth', 'storage.json')
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

const testUser = {
  name: 'E2E Tester',
  email: 'e2e.tester@example.com',
  password: 'E2E-Password-123!',
}

export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(`${baseURL}/#/login`)
  await page.getByTestId('auth-toggle-mode').click()
  await page.getByTestId('auth-name').fill(testUser.name)
  await page.getByTestId('auth-email').fill(testUser.email)
  await page.getByTestId('auth-password').fill(testUser.password)
  await page.getByTestId('auth-submit').click()
  await page.waitForURL('**/#/projects')

  await page.context().storageState({ path: storageStatePath })
  await browser.close()
}
