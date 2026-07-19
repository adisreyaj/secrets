import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  projectsFindFirst,
  projectMembersFindMany,
  updateReturning,
  insertValues,
} = vi.hoisted(() => ({
  projectsFindFirst: vi.fn(),
  projectMembersFindMany: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  return {
    ...actual,
    db: {
      query: {
        projects: { findFirst: projectsFindFirst },
        projectMembers: { findMany: projectMembersFindMany },
      },
      update: vi.fn(() => {
        const chain: any = {
          set: vi.fn(() => chain),
          where: vi.fn(() => chain),
          returning: vi.fn(async () => updateReturning()),
        };
        return chain;
      }),
      insert: vi.fn(() => {
        const chain: any = {
          values: vi.fn(async (v: unknown) => {
            insertValues(v);
          }),
        };
        return chain;
      }),
    },
  };
});

import { renameProjectWithGuards } from '../src/server/services/projectUpdates.js';

describe('renameProjectWithGuards', () => {
  beforeEach(() => {
    projectsFindFirst.mockReset();
    projectMembersFindMany.mockReset();
    updateReturning.mockReset();
    insertValues.mockReset();
  });

  it('renames a project and logs an audit entry with the old and new name', async () => {
    projectsFindFirst.mockResolvedValueOnce({ name: 'Old name' });
    projectMembersFindMany.mockResolvedValueOnce([]);
    updateReturning.mockResolvedValueOnce([
      {
        id: 'project_1',
        organizationId: null,
        name: 'New name',
        slug: 'old-name',
        auditRetentionDays: 90,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: 'New name',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe('New name');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project_1',
        actorUserId: 'user_1',
        action: 'project.update',
        metadataJson: { oldName: 'Old name', newName: 'New name' },
      }),
    );
  });

  it('returns 400 when the new name is empty or whitespace', async () => {
    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: '   ',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: false, status: 400, error: 'Name is required' });
    expect(projectsFindFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    projectsFindFirst.mockResolvedValueOnce(null);

    const result = await renameProjectWithGuards({
      projectId: 'missing',
      nextName: 'Renamed',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Project not found' });
  });

  it('returns 409 when the new name collides with another project the user belongs to', async () => {
    projectsFindFirst.mockResolvedValueOnce({ name: 'Old name' });
    projectMembersFindMany.mockResolvedValueOnce([{ project: { name: 'Renamed' } }]);

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: 'Renamed',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Project name already exists',
    });
  });

  it('treats name comparison case-insensitively for the conflict check', async () => {
    projectsFindFirst.mockResolvedValueOnce({ name: 'Old name' });
    projectMembersFindMany.mockResolvedValueOnce([{ project: { name: 'Renamed' } }]);

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: '  RENAMED  ',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it('skips the conflict check when the new name is identical', async () => {
    projectsFindFirst.mockResolvedValueOnce({ name: 'Same name' });
    updateReturning.mockResolvedValueOnce([
      {
        id: 'project_1',
        organizationId: null,
        name: 'Same name',
        slug: 'same-name',
        auditRetentionDays: 90,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: 'Same name',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(true);
    expect(projectMembersFindMany).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataJson: { oldName: 'Same name', newName: 'Same name' },
      }),
    );
  });
});
