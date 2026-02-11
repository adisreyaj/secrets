type LoginAttemptState = {
  failures: number;
  lockUntil?: number;
};

export class LoginAbuseProtector {
  private readonly attempts = new Map<string, LoginAttemptState>();

  constructor(
    private readonly maxAttempts: number,
    private readonly lockMs: number,
  ) {}

  isLocked(key: string): { locked: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const state = this.attempts.get(key);
    if (!state?.lockUntil) {
      return { locked: false };
    }
    if (state.lockUntil <= now) {
      this.attempts.delete(key);
      return { locked: false };
    }
    return { locked: true, retryAfterMs: state.lockUntil - now };
  }

  recordFailure(key: string): { locked: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const current = this.attempts.get(key) ?? { failures: 0 };
    const nextFailures = current.failures + 1;

    if (nextFailures >= this.maxAttempts) {
      const lockUntil = now + this.lockMs;
      this.attempts.set(key, { failures: 0, lockUntil });
      return { locked: true, retryAfterMs: this.lockMs };
    }

    this.attempts.set(key, { failures: nextFailures });
    return { locked: false };
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
