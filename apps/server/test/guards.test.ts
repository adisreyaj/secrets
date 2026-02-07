import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../src/db.js', () => ({
  prisma: {
    projectMember: { findUnique },
  },
}));

import {
  enforceGlobalBootstrapScope,
  requireAuth,
  requireEnvironmentScope,
  requireProjectRole,
  requireUserForApproval,
} from '../src/server/auth/guards.js';

const createReply = () => {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
  } as any;
  reply.code.mockReturnValue(reply);
  return reply;
};

describe('auth guards', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('requireAuth denies missing auth', () => {
    const reply = createReply();
    const result = requireAuth({} as any, reply);
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('requireEnvironmentScope denies token outside scope', () => {
    const reply = createReply();
    const allowed = requireEnvironmentScope(
      { auth: { viaToken: true, scopeEnvironmentIds: ['env_1'] } } as any,
      reply,
      'env_2',
    );
    expect(allowed).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('requireUserForApproval denies service-account-only auth', () => {
    const reply = createReply();
    const allowed = requireUserForApproval(
      { auth: { viaToken: true, serviceAccountId: 'sa_1' } } as any,
      reply,
    );
    expect(allowed).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('requireProjectRole denies insufficient role', async () => {
    findUnique.mockResolvedValueOnce({ role: Role.VIEWER });
    const reply = createReply();
    const result = await requireProjectRole(
      { auth: { viaToken: false, user: { id: 'user_1' } } } as any,
      reply,
      'project_1',
      Role.EDITOR,
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('enforceGlobalBootstrapScope denies non-bootstrap routes', () => {
    const reply = createReply();
    const allowed = enforceGlobalBootstrapScope(
      {
        method: 'GET',
        routeOptions: { url: '/environments/:id/secrets' },
        auth: { viaToken: true, tokenScopeType: 'global_bootstrap' },
      } as any,
      reply,
    );
    expect(allowed).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
