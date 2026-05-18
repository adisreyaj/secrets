import type { FastifyReply } from 'fastify';
import { sendError } from './replies.js';

export const unauthorized = (reply: FastifyReply) => sendError(reply, 401, 'Unauthorized');
export const forbidden = (reply: FastifyReply) => sendError(reply, 403, 'Forbidden');
export const insufficientRole = (reply: FastifyReply) =>
  sendError(reply, 403, 'Insufficient role');
export const tokenScopeDenied = (reply: FastifyReply) =>
  sendError(reply, 403, 'Token does not have access to this environment');
export const globalBootstrapScopeDenied = (reply: FastifyReply) =>
  sendError(
    reply,
    403,
    'Global bootstrap token is restricted to project bootstrap endpoints',
  );
