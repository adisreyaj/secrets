import type { FastifyReply } from 'fastify';

export const sendError = (reply: FastifyReply, statusCode: number, error: string) => {
  reply.code(statusCode).send({ error });
};
