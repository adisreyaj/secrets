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
      const result = await prisma.$executeRaw`
        DELETE al FROM audit_logs al
        INNER JOIN projects p ON al.project_id = p.id
        WHERE p.audit_retention_days IS NOT NULL
          AND al.created_at < DATE_SUB(NOW(), INTERVAL p.audit_retention_days DAY)
      `;
      if (result > 0) {
        app.log.info({ deleted: result }, 'audit retention cleanup');
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
