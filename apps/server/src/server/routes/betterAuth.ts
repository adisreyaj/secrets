import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../betterAuth.js';

export async function registerBetterAuthRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const headers = fromNodeHeaders(request.headers);

      const hasBody =
        request.method !== 'GET' &&
        request.method !== 'HEAD' &&
        request.body !== undefined &&
        request.body !== null;

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      const body = response.body ? await response.text() : null;
      return reply.send(body);
    },
  });
}
