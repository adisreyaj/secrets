import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../src/db/index.js';

const {
  projectMembersFindFirst,
  projectModulesFindFirst,
  authSessionsFindFirst,
  authSessionsUpdate,
} = vi.hoisted(() => ({
  projectMembersFindFirst: vi.fn(),
  projectModulesFindFirst: vi.fn(),
  authSessionsFindFirst: vi.fn(),
  authSessionsUpdate: vi.fn(),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => ({ id: 'session_1' })),
  };
  authSessionsUpdate.mockImplementation(() => updateChain);
  return {
    ...actual,
    db: {
      query: {
        projectMembers: { findFirst: projectMembersFindFirst },
        projectModules: { findFirst: projectModulesFindFirst },
        authSessions: { findFirst: authSessionsFindFirst },
      },
      update: authSessionsUpdate,
    },
  };
});

import {
  enforceGlobalBootstrapScope,
  requireAuth,
  requireEnvironmentScope,
  requireProjectAuthSession,
  requireProjectModuleEnabled,
  requireProjectRole,
} from '../src/server/auth/guards.js';
import { ProjectModuleKey } from '../src/db/index.js';

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
    projectMembersFindFirst.mockReset();
    projectModulesFindFirst.mockReset();
    authSessionsFindFirst.mockReset();
    authSessionsUpdate.mockReset();
    const updateChain = {
      set: vi.fn(() => updateChain),
      where: vi.fn(async () => ({ id: 'session_1' })),
    };
    authSessionsUpdate.mockImplementation(() => updateChain);
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
    projectMembersFindFirst.mockResolvedValueOnce({ role: Role.VIEWER });
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
    projectModulesFindFirst.mockResolvedValueOnce({ enabled: false });
    const reply = createReply();
    const allowed = await requireProjectModuleEnabled(
      {} as any,
      reply,
      'project_1',
      ProjectModuleKey.AUTH,
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
    authSessionsFindFirst.mockResolvedValueOnce({
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
    authSessionsFindFirst.mockResolvedValueOnce({
      id: 'session_1',
      endUser: { id: 'eu_1', email: 'user@example.com', disabledAt: null },
    });
    const reply = createReply();
    const result = await requireProjectAuthSession(
      { headers: { authorization: 'Bearer session-token' } } as any,
      reply,
      'project_1',
    );

    expect(authSessionsFindFirst).toHaveBeenCalled();
    expect(authSessionsUpdate).toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: 'session_1',
      endUserId: 'eu_1',
      email: 'user@example.com',
    });
  });
});
