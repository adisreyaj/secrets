import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  projectsFindFirst,
  insertValues,
  deleteWhere,
  selectResult,
} = vi.hoisted(() => ({
  projectsFindFirst: vi.fn(),
  insertValues: vi.fn(),
  deleteWhere: vi.fn(),
  selectResult: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const db: any = {
    query: {
      projects: { findFirst: projectsFindFirst },
    },
    select: vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        then: (resolve: any, reject: any) =>
          Promise.resolve(selectResult()).then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn(() => {
      const chain: any = {
        values: vi.fn(async (v: unknown) => {
          insertValues(v);
          return undefined;
        }),
      };
      return chain;
    }),
    delete: vi.fn(() => {
      const chain: any = {
        where: vi.fn(async () => {
          deleteWhere();
          return undefined;
        }),
      };
      return chain;
    }),
    transaction: vi.fn(async (cb: any) => cb(db)),
  };
  return { ...actual, db };
});

import { deleteProjectWithGuards } from '../src/server/services/deletions.js';

describe('deleteProjectWithGuards', () => {
  beforeEach(() => {
    projectsFindFirst.mockReset();
    insertValues.mockReset();
    deleteWhere.mockReset();
    selectResult.mockReset();
    selectResult.mockResolvedValue([{ value: 0 }]);
  });

  it('deletes a project for admin flow with matching confirmation', async () => {
    projectsFindFirst.mockResolvedValueOnce({ id: 'project_1', name: 'Alpha' });
    selectResult
      .mockResolvedValueOnce([{ value: 2 }])
      .mockResolvedValueOnce([{ value: 5 }])
      .mockResolvedValueOnce([{ value: 1 }])
      .mockResolvedValueOnce([{ value: 1 }]);

    const result = await deleteProjectWithGuards({
      projectId: 'project_1',
      confirmText: 'Alpha',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({ ok: true });
    expect(insertValues).toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalled();
  });

  it('returns 400 when confirmation text does not match', async () => {
    projectsFindFirst.mockResolvedValueOnce({ id: 'project_1', name: 'Alpha' });

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
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('returns 404 when project does not exist', async () => {
    projectsFindFirst.mockResolvedValueOnce(null);

    const result = await deleteProjectWithGuards({
      projectId: 'missing',
      confirmText: 'X',
      actorUserId: 'user_1',
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: 'Project not found',
    });
  });
});
