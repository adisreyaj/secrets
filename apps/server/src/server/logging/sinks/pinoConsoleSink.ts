import type { FastifyBaseLogger } from 'fastify';
import type { LogSink, StructuredLogEvent } from '../types.js';

export class PinoConsoleSink implements LogSink {
  constructor(private readonly logger: FastifyBaseLogger) {}

  write(event: StructuredLogEvent): void {
    const payload = {
      event: event.event,
      category: event.category,
      ...(event.context ? { ...event.context } : {}),
      ...(event.data ? { data: event.data } : {}),
      ...(event.err ? { err: event.err } : {}),
    };

    switch (event.level) {
      case 'trace':
        this.logger.trace(payload, event.message);
        return;
      case 'debug':
        this.logger.debug(payload, event.message);
        return;
      case 'info':
        this.logger.info(payload, event.message);
        return;
      case 'warn':
        this.logger.warn(payload, event.message);
        return;
      case 'fatal':
        this.logger.fatal(payload, event.message);
        return;
      default:
        this.logger.error(payload, event.message);
    }
  }
}
