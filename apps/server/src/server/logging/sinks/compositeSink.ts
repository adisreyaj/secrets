import type { LogSink, LogSinkInitContext, StructuredLogEvent } from '../types.js';

export class CompositeLogSink implements LogSink {
  constructor(private readonly sinks: LogSink[]) {}

  async init(context: LogSinkInitContext): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.init?.(context)));
  }

  async write(event: StructuredLogEvent): Promise<void> {
    await Promise.all(
      this.sinks.map(async (sink) => {
        try {
          await sink.write(event);
        } catch {
          // Sink failures are intentionally isolated from request handling.
        }
      }),
    );
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.sinks.map(async (sink) => {
        try {
          await sink.flush?.();
        } catch {
          // Best effort flush during shutdown.
        }
      }),
    );
  }
}
