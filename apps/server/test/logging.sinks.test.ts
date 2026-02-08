import { describe, expect, it, vi } from 'vitest';
import { CompositeLogSink } from '../src/server/logging/sinks/compositeSink.js';
import { toPosthogPayload } from '../src/server/logging/sinks/posthogSink.js';
import type { LogSink, StructuredLogEvent } from '../src/server/logging/types.js';

const baseEvent: StructuredLogEvent = {
  event: 'request.failed',
  level: 'error',
  category: 'internal',
  message: 'request failed',
  timestamp: new Date().toISOString(),
  context: {
    requestId: 'req_1',
    method: 'GET',
    url: '/x',
    route: '/x',
    statusCode: 500,
    ip: '127.0.0.1',
    auth: null,
  },
};

describe('CompositeLogSink', () => {
  it('continues when one sink throws', async () => {
    const healthy = { write: vi.fn(async () => undefined) } satisfies LogSink;
    const broken = {
      write: vi.fn(async () => {
        throw new Error('sink failed');
      }),
    } satisfies LogSink;

    const sink = new CompositeLogSink([broken, healthy]);

    await expect(sink.write(baseEvent)).resolves.toBeUndefined();
    expect(healthy.write).toHaveBeenCalledTimes(1);
  });
});

describe('toPosthogPayload', () => {
  it('maps structured event to provider payload', () => {
    const payload = toPosthogPayload(baseEvent);
    expect(payload.event).toBe('$server_log');
    expect(payload.properties).toMatchObject({
      level: 'error',
      category: 'internal',
      log_event: 'request.failed',
      message: 'request failed',
    });
  });
});
