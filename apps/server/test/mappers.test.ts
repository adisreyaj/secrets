import { ApprovalAction, ApprovalStatus, Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toApprovalRequestDto, toApprovalRuleDto } from '../src/server/mappers/approvals.js';
import { toInviteDto } from '../src/server/mappers/invites.js';
import { toEnvironmentDto, toProjectDto } from '../src/server/mappers/projects.js';
import { toUserDto } from '../src/server/mappers/users.js';

describe('mappers', () => {
  it('maps user/project/environment/invite dates to iso strings', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(toUserDto({ id: 'u1', email: 'a@b.com', name: null })).toEqual({
      id: 'u1',
      email: 'a@b.com',
      name: null,
    });

    expect(
      toProjectDto(
        {
          id: 'p1',
          name: 'P',
          slug: 'p',
          auditRetentionDays: 90,
          createdAt: date,
          updatedAt: date,
        },
        Role.ADMIN,
      ),
    ).toMatchObject({ createdAt: date.toISOString(), updatedAt: date.toISOString(), role: Role.ADMIN });

    expect(
      toEnvironmentDto({
        id: 'e1',
        projectId: 'p1',
        name: 'Dev',
        slug: 'dev',
        createdAt: date,
        updatedAt: date,
      }),
    ).toMatchObject({ createdAt: date.toISOString(), updatedAt: date.toISOString() });

    expect(
      toInviteDto({
        id: 'i1',
        projectId: 'p1',
        email: 'x@y.com',
        role: Role.VIEWER,
        status: 'PENDING',
        createdAt: date,
        expiresAt: date,
        acceptedAt: null,
      }),
    ).toMatchObject({ createdAt: date.toISOString(), expiresAt: date.toISOString(), acceptedAt: null });
  });

  it('maps approval rule/request with nullable fields', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(
      toApprovalRuleDto({
        id: 'r1',
        projectId: 'p1',
        name: 'Rule',
        environmentId: null,
        keyPattern: '*',
        actionsJson: [ApprovalAction.CREATE],
        isActive: true,
        createdBy: 'u1',
        createdAt: date,
        updatedAt: date,
      }),
    ).toMatchObject({ actions: [ApprovalAction.CREATE] });

    expect(
      toApprovalRequestDto({
        id: 'a1',
        projectId: 'p1',
        environmentId: 'e1',
        secretId: null,
        action: ApprovalAction.CREATE,
        status: ApprovalStatus.PENDING,
        requestedBy: 'u1',
        approvedBy: null,
        approvedAt: null,
        deniedAt: null,
        canceledAt: null,
        key: 'KEY',
        targetEnvironmentId: null,
        expectedVersionId: null,
        metadataJson: null,
        createdAt: date,
        updatedAt: date,
      }),
    ).toMatchObject({ approvedAt: null, deniedAt: null, canceledAt: null });
  });
});
