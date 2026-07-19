import { beforeEach, describe, expect, it, vi } from 'vitest';

const { projectsFindFirst, organizationsFindFirst, environmentsFindFirst } = vi.hoisted(() => ({
  projectsFindFirst: vi.fn(),
  organizationsFindFirst: vi.fn(),
  environmentsFindFirst: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  return {
    ...actual,
    db: {
      query: {
        projects: { findFirst: projectsFindFirst },
        organizations: { findFirst: organizationsFindFirst },
        environments: { findFirst: environmentsFindFirst },
      },
    },
  };
});

import {
  ensureUniqueEnvironmentSlug,
  ensureUniqueOrganizationSlug,
  ensureUniqueProjectSlug,
  slugify,
} from '../src/server/services/slugs.js';

describe('slugs service', () => {
  beforeEach(() => {
    projectsFindFirst.mockReset();
    organizationsFindFirst.mockReset();
    environmentsFindFirst.mockReset();
  });

  it('slugify returns fallback when empty', () => {
    expect(slugify('   ', 'project')).toBe('project');
  });

  it('ensureUniqueProjectSlug appends suffix on collisions', async () => {
    projectsFindFirst
      .mockResolvedValueOnce({ id: '1' })
      .mockResolvedValueOnce({ id: '2' })
      .mockResolvedValueOnce(null);

    await expect(ensureUniqueProjectSlug('My Project')).resolves.toBe('my-project-3');
  });

  it('ensureUniqueOrganizationSlug appends suffix on collisions', async () => {
    organizationsFindFirst
      .mockResolvedValueOnce({ id: '1' })
      .mockResolvedValueOnce(null);

    await expect(ensureUniqueOrganizationSlug('My Org')).resolves.toBe('my-org-2');
  });

  it('ensureUniqueEnvironmentSlug appends suffix on collisions', async () => {
    environmentsFindFirst.mockResolvedValueOnce({ id: '1' }).mockResolvedValueOnce(null);

    await expect(ensureUniqueEnvironmentSlug('project_1', 'Prod')).resolves.toBe('prod-2');
  });
});
