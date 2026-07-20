import { describe, expect, it, vi } from 'vitest';
import {
    NoopAuthEmailProvider,
    ResendAuthEmailProvider,
    buildPasswordResetEmail,
} from '../src/server/services/auth/email.js';

describe('auth email provider', () => {
  it('noop provider resolves without side effects', async () => {
    const provider = new NoopAuthEmailProvider();
    await expect(
      provider.send({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'world',
      }),
    ).resolves.toBeUndefined();
  });

  it('resend provider posts expected payload', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    const provider = new ResendAuthEmailProvider(
      're_test',
      'auth@example.com',
      'Secrets Auth',
      fetcher as unknown as typeof fetch,
    );

    await provider.send({
      to: 'user@example.com',
      subject: 'Reset',
      text: 'token',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
        }),
      }),
    );
  });

  it('resend provider throws on non-2xx responses', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
    );
    const provider = new ResendAuthEmailProvider(
      're_test',
      'auth@example.com',
      'Secrets Auth',
      fetcher as unknown as typeof fetch,
    );

    await expect(
      provider.send({
        to: 'user@example.com',
        subject: 'Verify',
        text: 'token',
      }),
    ).rejects.toThrow(/Email service request failed/);
  });

  it('builds reset template', () => {
    const reset = buildPasswordResetEmail({ resetToken: 'reset-token' });

    expect(reset.subject).toContain('Reset your password');
    expect(reset.text).toContain('reset-token');
  });
});
