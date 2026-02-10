import type { ModuleKey, ProjectModuleDto } from '@secrets/shared'

const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  secrets: true,
  flags: true,
  auth: true,
}

export const getProjectModuleState = (modules: ProjectModuleDto[] | undefined) => {
  if (!modules?.length) {
    return DEFAULT_MODULES
  }

  const byModule = new Map<ModuleKey, boolean>(
    modules.map((module) => [module.module, module.enabled]),
  )

  return {
    secrets: byModule.get('secrets') ?? true,
    flags: byModule.get('flags') ?? true,
    auth: byModule.get('auth') ?? true,
  }
}
