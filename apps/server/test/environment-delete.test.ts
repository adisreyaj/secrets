import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  environmentFindFirst,
  environmentCount,
  environmentDelete,
  secretCount,
  auditCreate,
} = vi.hoisted(() => ({
  environmentFindFirst: vi.fn(),
  environmentCount: vi.fn(),
  environmentDelete: vi.fn(),
  secretCount: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    environment: {
      findFirst: environmentFindFirst,
      count: environmentCount,
    },
    secret: {
      count: secretCount,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        auditLog: { create: auditCreate },
        environment: { delete: environmentDelete },
      }),
    ),
  },
}));

import { deleteEnvironmentWithGuards } from '../src/server/services/deletions.js';

describe('deleteEnvironmentWithGuards', () => {
  beforeEach(() => {
    environmentFindFirst.mockReset();
    environmentCount.mockReset();
    environmentDelete.mockReset();
    secretCount.mockReset();
    auditCreate.mockReset();
  });

  it('deletes a non-final environment', async () => {
    environmentFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'staging',
    });
    environmentCount.mockResolvedValueOnce(2);
    secretCount.mockResolvedValueOnce(3);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'staging',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(environmentDelete).toHaveBeenCalledWith({ where: { id: 'env_1' } });
  });

  it('returns 409 for last environment without explicit force flag', async () => {
    environmentFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'prod',
    });
    environmentCount.mockResolvedValueOnce(1);
    secretCount.mockResolvedValueOnce(3);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'prod',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Deleting the last environment requires explicit confirmation',
    });
    expect(environmentDelete).not.toHaveBeenCalled();
  });

  it('allows last environment delete when force flag is true', async () => {
    environmentFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'prod',
    });
    environmentCount.mockResolvedValueOnce(1);
    secretCount.mockResolvedValueOnce(3);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'prod',
      forceLastEnvironment: true,
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(environmentDelete).toHaveBeenCalledWith({ where: { id: 'env_1' } });
  });

  it('returns 404 for project/environment mismatch', async () => {
    environmentFindFirst.mockResolvedValueOnce(null);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'staging',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: 'Environment not found',
    });
  });
});
