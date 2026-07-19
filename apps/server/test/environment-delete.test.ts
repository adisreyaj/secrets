import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  environmentsFindFirst,
  insertValues,
  deleteWhere,
  selectResult,
} = vi.hoisted(() => ({
  environmentsFindFirst: vi.fn(),
  insertValues: vi.fn(),
  deleteWhere: vi.fn(),
  selectResult: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const db: any = {
    query: {
      environments: { findFirst: environmentsFindFirst },
    },
    select: vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        then: (resolve: any, reject: any) =>
          Promise.resolve(selectResult()).then(resolve, reject),
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
    delete: vi.fn(() => {
      const chain: any = {
        where: vi.fn(async () => {
          deleteWhere();
        }),
      };
      return chain;
    }),
    transaction: vi.fn(async (cb: any) => cb(db)),
  };
  return { ...actual, db };
});

import { deleteEnvironmentWithGuards } from '../src/server/services/deletions.js';

describe('deleteEnvironmentWithGuards', () => {
  beforeEach(() => {
    environmentsFindFirst.mockReset();
    insertValues.mockReset();
    deleteWhere.mockReset();
    selectResult.mockReset();
  });

  it('deletes a non-final environment', async () => {
    environmentsFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'staging',
    });
    selectResult.mockResolvedValueOnce([{ value: 2 }]).mockResolvedValueOnce([{ value: 3 }]);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'staging',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(deleteWhere).toHaveBeenCalled();
  });

  it('returns 409 for last environment without explicit force flag', async () => {
    environmentsFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'prod',
    });
    selectResult.mockResolvedValueOnce([{ value: 1 }]).mockResolvedValueOnce([{ value: 3 }]);

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
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('allows last environment delete when force flag is true', async () => {
    environmentsFindFirst.mockResolvedValueOnce({
      id: 'env_1',
      projectId: 'project_1',
      name: 'prod',
    });
    selectResult.mockResolvedValueOnce([{ value: 1 }]).mockResolvedValueOnce([{ value: 3 }]);

    const result = await deleteEnvironmentWithGuards({
      projectId: 'project_1',
      environmentId: 'env_1',
      confirmText: 'prod',
      forceLastEnvironment: true,
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(deleteWhere).toHaveBeenCalled();
  });

  it('returns 404 for project/environment mismatch', async () => {
    environmentsFindFirst.mockResolvedValueOnce(null);

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
