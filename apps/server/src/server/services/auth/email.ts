import { config } from '../../../config.js';

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  fetcher: typeof fetch = globalThis.fetch,
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;
  return fetcher(url, { ...options, signal }).finally(() => clearTimeout(timeout));
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export type AuthEmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface AuthEmailProvider {
  readonly name: 'noop' | 'resend';
  send: (message: AuthEmailMessage) => Promise<void>;
}

export class NoopAuthEmailProvider implements AuthEmailProvider {
  readonly name = 'noop' as const;

  async send(_message: AuthEmailMessage): Promise<void> {
    // Intentionally a no-op for local/test environments.
  }
}

export class ResendAuthEmailProvider implements AuthEmailProvider {
  readonly name = 'resend' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fromName: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async send(message: AuthEmailMessage): Promise<void> {
    if (!this.fetcher) {
      throw new Error('No fetch implementation available for Resend provider');
    }

    const response = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.from}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      },
      this.fetcher,
    );

    if (!response.ok) {
      throw new Error(`Email service request failed (${response.status})`);
    }
  }
}

export function createAuthEmailProvider(
  fetcher: typeof fetch = globalThis.fetch,
): AuthEmailProvider {
  if (config.authEmailProvider === 'resend' && config.resendApiKey.trim()) {
    return new ResendAuthEmailProvider(
      config.resendApiKey.trim(),
      config.authEmailFrom,
      config.authEmailFromName,
      fetcher,
    );
  }

  return new NoopAuthEmailProvider();
}

export function buildPasswordResetEmail(params: {
  resetToken: string;
  appName?: string;
}): Pick<AuthEmailMessage, 'subject' | 'text'> {
  const appName = params.appName ?? 'Secrets';
  return {
    subject: `${appName}: Reset your password`,
    text: `Use this token to reset your password: ${params.resetToken}`,
  };
}

export function buildEmailVerificationEmail(params: {
  verificationToken: string;
  appName?: string;
}): Pick<AuthEmailMessage, 'subject' | 'text'> {
  const appName = params.appName ?? 'Secrets';
  return {
    subject: `${appName}: Verify your email`,
    text: `Use this token to verify your email: ${params.verificationToken}`,
  };
}
