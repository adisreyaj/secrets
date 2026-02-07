import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalStatus } from '@prisma/client';

const {
  projectFindUnique,
  projectDelete,
  projectCount,
  environmentCount,
  secretCount,
  tokenCount,
  serviceAccountCount,
  approvalCount,
  auditCreate,
} = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  projectDelete: vi.fn(),
  projectCount: vi.fn(),
  environmentCount: vi.fn(),
  secretCount: vi.fn(),
  tokenCount: vi.fn(),
  serviceAccountCount: vi.fn(),
  approvalCount: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    project: {
      findUnique: projectFindUnique,
      count: projectCount,
    },
    environment: {
      count: environmentCount,
    },
    secret: {
      count: secretCount,
    },
    apiToken: {
      count: tokenCount,
    },
    serviceAccount: {
      count: serviceAccountCount,
    },
    approvalRequest: {
      count: approvalCount,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        auditLog: { create: auditCreate },
        project: { delete: projectDelete },
      }),
    ),
  },
}));

import { deleteProjectWithGuards } from '../src/server/services/deletions.js';

describe('deleteProjectWithGuards', () => {
  beforeEach(() => {
    projectFindUnique.mockReset();
    projectDelete.mockReset();
    projectCount.mockReset();
    environmentCount.mockReset();
    secretCount.mockReset();
    tokenCount.mockReset();
    serviceAccountCount.mockReset();
    approvalCount.mockReset();
    auditCreate.mockReset();
  });

  it('deletes a project for admin flow with matching confirmation', async () => {
    projectFindUnique.mockResolvedValueOnce({ id: 'project_1', name: 'Alpha' });
    approvalCount.mockResolvedValueOnce(0);
    environmentCount.mockResolvedValueOnce(2);
    secretCount.mockResolvedValueOnce(5);
    tokenCount.mockResolvedValueOnce(1);
    serviceAccountCount.mockResolvedValueOnce(1);

    const result = await deleteProjectWithGuards({
      projectId: 'project_1',
      confirmText: 'Alpha',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(approvalCount).toHaveBeenCalledWith({
      where: { projectId: 'project_1', status: ApprovalStatus.PENDING },
    });
    expect(auditCreate).toHaveBeenCalled();
    expect(projectDelete).toHaveBeenCalledWith({ where: { id: 'project_1' } });
  });

  it('returns 400 when confirmation text does not match', async () => {
    projectFindUnique.mockResolvedValueOnce({ id: 'project_1', name: 'Alpha' });

    const result = await deleteProjectWithGuards({
      projectId: 'project_1',
      confirmText: 'alpha',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Confirmation text must exactly match project name',
    });
    expect(projectDelete).not.toHaveBeenCalled();
  });

  it('returns 409 when pending approvals exist', async () => {
    projectFindUnique.mockResolvedValueOnce({ id: 'project_1', name: 'Alpha' });
    approvalCount.mockResolvedValueOnce(2);

    const result = await deleteProjectWithGuards({
      projectId: 'project_1',
      confirmText: 'Alpha',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Cannot delete project with pending approvals',
    });
    expect(projectDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when project does not exist', async () => {
    projectFindUnique.mockResolvedValueOnce(null);

    const result = await deleteProjectWithGuards({
      projectId: 'missing',
      confirmText: 'Alpha',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: 'Project not found',
    });
  });
});
