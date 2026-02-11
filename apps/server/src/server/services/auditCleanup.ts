import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import type { LogDispatcher } from '../logging/dispatcher.js';

export function scheduleAuditRetentionCleanup(
  app: FastifyInstance,
  logDispatcher: LogDispatcher,
): void {
  let auditCleanupRunning = false;
  const runAuditRetentionCleanup = async () => {
    if (auditCleanupRunning) {
      return;
    }
    auditCleanupRunning = true;
    try {
      const projects = await prisma.project.findMany({
        where: { auditRetentionDays: { not: null } },
        select: { id: true, auditRetentionDays: true },
      });

      const now = new Date();
      for (const project of projects) {
        if (project.auditRetentionDays === null) continue;
        const cutoff = new Date(
          now.getTime() - project.auditRetentionDays * 24 * 60 * 60 * 1000,
        );
        const result = await prisma.auditLog.deleteMany({
          where: { projectId: project.id, createdAt: { lt: cutoff } },
        });
        if (result.count > 0) {
          app.log.info(
            {
              projectId: project.id,
              deleted: result.count,
              cutoff: cutoff.toISOString(),
            },
            'audit retention cleanup',
          );
        }
      }
    } catch (error) {
      await logDispatcher.emit({
        event: 'audit.cleanup.failed',
        level: 'error',
        category: 'internal',
        message: 'audit retention cleanup failed',
        err: error,
      });
    } finally {
      auditCleanupRunning = false;
    }
  };

  setTimeout(() => {
    void runAuditRetentionCleanup();
  }, 60 * 1000);
  setInterval(() => {
    void runAuditRetentionCleanup();
  }, 24 * 60 * 60 * 1000);
}
