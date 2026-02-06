import { promptConfirm, promptText } from './shared.js'

export type InitAnswers = {
  projectName: string
  envName: string
  importEnv: boolean
}

export async function runInitUI(projectFallback: string, envFallback: string, hasEnv: boolean) {
  const projectName = await promptText('Project name', projectFallback)
  const envName = await promptText('Environment name', envFallback)

  let importEnv = false
  if (hasEnv) {
    importEnv = await promptConfirm('Import .env into secrets?', true)
  }

  const answers: InitAnswers = {
    projectName,
    envName,
    importEnv,
  }

  return answers
}
