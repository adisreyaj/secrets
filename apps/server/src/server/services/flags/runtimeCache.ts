type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function createRuntimeCatalogCache<T>(ttlMs: number) {
  const cache = new Map<string, CacheEntry<T>>();

  const buildKey = (params: {
    projectId: string;
    environmentId: string;
    flagKeys?: string[];
  }) => {
    const keys = params.flagKeys?.length
      ? [...params.flagKeys].sort().join(',')
      : '*';
    return `${params.projectId}:${params.environmentId}:${keys}`;
  };

  return {
    async getOrLoad(
      params: { projectId: string; environmentId: string; flagKeys?: string[] },
      loader: () => Promise<T>,
    ): Promise<T> {
      const key = buildKey(params);
      const now = Date.now();
      const existing = cache.get(key);
      if (existing && existing.expiresAt > now) {
        return existing.value;
      }

      const value = await loader();
      cache.set(key, {
        value,
        expiresAt: now + ttlMs,
      });
      return value;
    },
    clear() {
      cache.clear();
    },
  };
}
