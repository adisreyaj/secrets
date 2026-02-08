import type { LogSink, StructuredLogEvent } from '../types.js';

export class NoopRemoteSink implements LogSink {
  // Placeholder sink for future remote integrations.
  write(_event: StructuredLogEvent): void {}
}
