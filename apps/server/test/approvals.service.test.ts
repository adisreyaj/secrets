import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalAction, ApprovalStatus } from '@prisma/client';

const { findMany, findFirst, create } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    approvalRule: { findMany },
    approvalRequest: { findFirst, create },
  },
}));

import {
  createApprovalRequest,
  findMatchingApprovalRules,
  findPendingApprovalRequest,
} from '../src/server/services/approvals.js';

describe('approvals service', () => {
  beforeEach(() => {
    findMany.mockReset();
    findFirst.mockReset();
    create.mockReset();
  });

  it('findMatchingApprovalRules filters by action and glob pattern', async () => {
    findMany.mockResolvedValueOnce([
      { id: '1', keyPattern: 'API_*', actionsJson: [ApprovalAction.CREATE] },
      { id: '2', keyPattern: 'DB_*', actionsJson: [ApprovalAction.UPDATE] },
    ]);

    const result = await findMatchingApprovalRules({
      projectId: 'project_1',
      environmentId: 'env_1',
      action: ApprovalAction.CREATE,
      key: 'API_TOKEN',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('findPendingApprovalRequest forwards status pending lookup', async () => {
    findFirst.mockResolvedValueOnce({ id: 'approval_1' });

    const result = await findPendingApprovalRequest({
      projectId: 'project_1',
      environmentId: 'env_1',
      action: ApprovalAction.DELETE,
      key: 'KEY',
    });

    expect(result).toEqual({ id: 'approval_1' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ApprovalStatus.PENDING }),
      }),
    );
  });

  it('createApprovalRequest writes expected payload fields', async () => {
    create.mockResolvedValueOnce({ id: 'approval_2' });

    const result = await createApprovalRequest({
      projectId: 'project_1',
      environmentId: 'env_1',
      action: ApprovalAction.CREATE,
      key: 'KEY',
      requestedBy: 'user_1',
      metadataJson: { source: 'test' },
    });

    expect(result).toEqual({ id: 'approval_2' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project_1',
          environmentId: 'env_1',
          key: 'KEY',
          requestedBy: 'user_1',
        }),
      }),
    );
  });
});
