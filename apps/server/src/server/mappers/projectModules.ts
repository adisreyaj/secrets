export function toProjectModuleDto(module: {
  projectId: string;
  module: 'SECRETS' | 'FLAGS' | 'AUTH';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    projectId: module.projectId,
    module: module.module.toLowerCase() as 'secrets' | 'flags' | 'auth',
    enabled: module.enabled,
    createdAt: module.createdAt.toISOString(),
    updatedAt: module.updatedAt.toISOString(),
  };
}
