import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendLoggedError } from './logging.js';
import type { LogCategory } from '../logging/types.js';

export const sendError = (reply: FastifyReply, statusCode: number, error: string) => {
  reply.code(statusCode).send({ error });
};

export const sendErrorLogged = async (
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  error: string,
  category: LogCategory = 'domain',
) => sendLoggedError(reply, request, statusCode, error, category);
