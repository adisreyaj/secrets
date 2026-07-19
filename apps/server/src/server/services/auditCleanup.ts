import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
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
      // created_at is stored as unix ms; retention is days on the project.
      const result = await db.run(sql`
        DELETE FROM audit_logs
        WHERE id IN (
          SELECT al.id
          FROM audit_logs al
          INNER JOIN projects p ON al.project_id = p.id
          WHERE p.audit_retention_days IS NOT NULL
            AND al.created_at < (unixepoch('now') * 1000 - p.audit_retention_days * 86400000)
        )
      `);
      const deleted = Number(result.rowsAffected ?? 0);
      if (deleted > 0) {
        app.log.info({ deleted }, 'audit retention cleanup');
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
