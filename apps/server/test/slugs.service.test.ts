import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, findFirst } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    project: { findUnique },
    environment: { findFirst },
  },
}));

import {
  ensureUniqueEnvironmentSlug,
  ensureUniqueProjectSlug,
  slugify,
} from '../src/server/services/slugs.js';

describe('slugs service', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
  });

  it('slugify returns fallback when empty', () => {
    expect(slugify('   ', 'project')).toBe('project');
  });

  it('ensureUniqueProjectSlug appends suffix on collisions', async () => {
    findUnique
      .mockResolvedValueOnce({ id: '1' })
      .mockResolvedValueOnce({ id: '2' })
      .mockResolvedValueOnce(null);

    await expect(ensureUniqueProjectSlug('My Project')).resolves.toBe('my-project-3');
  });

  it('ensureUniqueEnvironmentSlug appends suffix on collisions', async () => {
    findFirst
      .mockResolvedValueOnce({ id: '1' })
      .mockResolvedValueOnce(null);

    await expect(ensureUniqueEnvironmentSlug('project_1', 'Prod')).resolves.toBe('prod-2');
  });
});
