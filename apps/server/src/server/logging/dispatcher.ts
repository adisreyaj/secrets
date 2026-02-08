import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config.js';
import { CompositeLogSink } from './sinks/compositeSink.js';
import { NoopRemoteSink } from './sinks/noopRemoteSink.js';
import { PinoConsoleSink } from './sinks/pinoConsoleSink.js';
import { PosthogSink } from './sinks/posthogSink.js';
import type { LogSink, StructuredLogEvent } from './types.js';

export type LogDispatchConfig = {
  service: string;
  env: string;
};

export class LogDispatcher {
  constructor(private readonly sink: LogSink) {}

  async emit(event: Omit<StructuredLogEvent, 'timestamp'>): Promise<void> {
    await this.sink.write({ ...event, timestamp: new Date().toISOString() });
  }

  async flush(): Promise<void> {
    await this.sink.flush?.();
  }
}

export async function createLogDispatcher(
  logger: FastifyBaseLogger,
  dispatchConfig: LogDispatchConfig,
): Promise<LogDispatcher> {
  const sinkNames = config.logSinks;
  const sinks: LogSink[] = [];

  for (const sinkName of sinkNames) {
    if (sinkName === 'console') {
      sinks.push(new PinoConsoleSink(logger));
      continue;
    }
    if (sinkName === 'posthog') {
      sinks.push(
        new PosthogSink({
          enabled: config.logRemoteEnabled,
          endpoint: process.env.POSTHOG_HOST,
          apiKey: process.env.POSTHOG_API_KEY,
        }),
      );
      continue;
    }

    sinks.push(new NoopRemoteSink());
  }

  if (sinks.length === 0) {
    sinks.push(new PinoConsoleSink(logger));
  }

  const composite = new CompositeLogSink(sinks);
  await composite.init?.({
    service: dispatchConfig.service,
    env: dispatchConfig.env,
    now: () => new Date(),
  });

  return new LogDispatcher(composite);
}
