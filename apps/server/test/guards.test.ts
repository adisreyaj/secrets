import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { hashToken } from '../src/auth.js';

const { projectMemberFindUnique, projectModuleFindUnique, authSessionFindFirst, authSessionUpdate } =
  vi.hoisted(() => ({
    projectMemberFindUnique: vi.fn(),
    projectModuleFindUnique: vi.fn(),
    authSessionFindFirst: vi.fn(),
    authSessionUpdate: vi.fn(),
  }));
vi.mock('../src/db.js', () => ({
  prisma: {
    projectMember: { findUnique: projectMemberFindUnique },
    projectModule: { findUnique: projectModuleFindUnique },
    authSession: { findFirst: authSessionFindFirst, update: authSessionUpdate },
  },
}));

import {
  enforceGlobalBootstrapScope,
  requireAuth,
  requireEnvironmentScope,
  requireProjectAuthSession,
  requireProjectModuleEnabled,
  requireProjectRole,
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
    projectMemberFindUnique.mockReset();
    projectModuleFindUnique.mockReset();
    authSessionFindFirst.mockReset();
    authSessionUpdate.mockReset();
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

  it('requireProjectRole denies insufficient role', async () => {
    projectMemberFindUnique.mockResolvedValueOnce({ role: Role.VIEWER });
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

  it('requireProjectModuleEnabled denies disabled module', async () => {
    projectModuleFindUnique.mockResolvedValueOnce({ enabled: false });
    const reply = createReply();
    const allowed = await requireProjectModuleEnabled(
      {} as any,
      reply,
      'project_1',
      'AUTH' as any,
    );
    expect(allowed).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('requireProjectAuthSession denies missing bearer token', async () => {
    const reply = createReply();
    const result = await requireProjectAuthSession(
      { headers: {} } as any,
      reply,
      'project_1',
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('requireProjectAuthSession denies disabled end user', async () => {
    authSessionFindFirst.mockResolvedValueOnce({
      id: 'session_1',
      endUser: { id: 'eu_1', email: 'user@example.com', disabledAt: new Date() },
    });
    const reply = createReply();
    const result = await requireProjectAuthSession(
      { headers: { authorization: 'Bearer session-token' } } as any,
      reply,
      'project_1',
    );
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('requireProjectAuthSession returns session context when valid', async () => {
    authSessionFindFirst.mockResolvedValueOnce({
      id: 'session_1',
      endUser: { id: 'eu_1', email: 'user@example.com', disabledAt: null },
    });
    authSessionUpdate.mockResolvedValueOnce({ id: 'session_1' });
    const reply = createReply();
    const result = await requireProjectAuthSession(
      { headers: { authorization: 'Bearer session-token' } } as any,
      reply,
      'project_1',
    );

    expect(authSessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'project_1',
          sessionTokenHash: hashToken('session-token'),
        }),
      }),
    );
    expect(authSessionUpdate).toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: 'session_1',
      endUserId: 'eu_1',
      email: 'user@example.com',
    });
  });
});
