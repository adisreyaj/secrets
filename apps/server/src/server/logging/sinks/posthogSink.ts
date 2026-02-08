import type { LogSink, StructuredLogEvent } from '../types.js';

export type PosthogSinkConfig = {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
};

export function toPosthogPayload(event: StructuredLogEvent): Record<string, unknown> {
  return {
    event: '$server_log',
    properties: {
      level: event.level,
      category: event.category,
      message: event.message,
      log_event: event.event,
      timestamp: event.timestamp,
      ...(event.context ? { context: event.context } : {}),
      ...(event.data ? { data: event.data } : {}),
    },
  };
}

export class PosthogSink implements LogSink {
  constructor(private readonly config: PosthogSinkConfig) {}

  write(event: StructuredLogEvent): void {
    if (!this.config.enabled) {
      return;
    }

    // Intentionally a stub for future implementation.
    void toPosthogPayload(event);
  }
}
