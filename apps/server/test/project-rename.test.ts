import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  projectFindUnique,
  projectUpdate,
  projectMemberFindMany,
  auditCreate,
} = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn(),
  projectMemberFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    project: {
      findUnique: projectFindUnique,
      update: projectUpdate,
    },
    projectMember: {
      findMany: projectMemberFindMany,
    },
    auditLog: {
      create: auditCreate,
    },
  },
}));

import { renameProjectWithGuards } from '../src/server/services/projectUpdates.js';

describe('renameProjectWithGuards', () => {
  beforeEach(() => {
    projectFindUnique.mockReset();
    projectUpdate.mockReset();
    projectMemberFindMany.mockReset();
    auditCreate.mockReset();
  });

  it('renames a project and logs an audit entry with the old and new name', async () => {
    projectFindUnique.mockResolvedValueOnce({ name: 'Old name' });
    projectMemberFindMany.mockResolvedValueOnce([]);
    projectUpdate.mockResolvedValueOnce({
      id: 'project_1',
      organizationId: null,
      name: 'New name',
      slug: 'old-name',
      auditRetentionDays: 90,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: 'New name',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe('New name');
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: 'project_1' },
      data: { name: 'New name' },
    });
expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project_1',
          actorUserId: 'user_1',
          action: 'project.update',
          resourceType: 'project',
          resourceId: 'project_1',
          metadataJson: { oldName: 'Old name', newName: 'New name' },
        }),
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
    expect(projectFindUnique).not.toHaveBeenCalled();
    expect(projectUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    projectFindUnique.mockResolvedValueOnce(null);

    const result = await renameProjectWithGuards({
      projectId: 'missing',
      nextName: 'Renamed',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Project not found' });
    expect(projectUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the new name collides with another project the user belongs to', async () => {
    projectFindUnique.mockResolvedValueOnce({ name: 'Old name' });
    projectMemberFindMany.mockResolvedValueOnce([
      { project: { name: 'Renamed' } },
    ]);

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
    expect(projectUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('treats name comparison case-insensitively for the conflict check', async () => {
    projectFindUnique.mockResolvedValueOnce({ name: 'Old name' });
    projectMemberFindMany.mockResolvedValueOnce([
      { project: { name: 'Renamed' } },
    ]);

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: '  RENAMED  ',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it('skips the conflict check and audit metadata uses the same name when the new name is identical', async () => {
    projectFindUnique.mockResolvedValueOnce({ name: 'Same name' });
    projectUpdate.mockResolvedValueOnce({
      id: 'project_1',
      organizationId: null,
      name: 'Same name',
      slug: 'same-name',
      auditRetentionDays: 90,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await renameProjectWithGuards({
      projectId: 'project_1',
      nextName: 'Same name',
      actorUserId: 'user_1',
    });

    expect(result.ok).toBe(true);
    expect(projectMemberFindMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project_1',
          actorUserId: 'user_1',
          action: 'project.update',
          resourceType: 'project',
          resourceId: 'project_1',
          metadataJson: { oldName: 'Same name', newName: 'Same name' },
        }),
      }),
    );
  });
});
