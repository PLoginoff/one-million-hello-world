/**
 * Integration test: Audit → Observability
 * Verifies that audit events feed into observability metrics
 */

import { FileAuditAdapter } from '../../audit/adapters/FileAuditAdapter';
import { AuditMetricsCollector } from '../../audit/statistics/AuditMetricsCollector';
import { AuditHealthCheck } from '../../audit/health/AuditHealthCheck';

describe('Audit → Observability Integration', () => {
  it('should track audit operations in health check', async () => {
    const audit = new FileAuditAdapter('/tmp/audit.log');
    const metrics = new AuditMetricsCollector();
    const health = new AuditHealthCheck(metrics);

    const start = Date.now();
    await audit.execute({ input: 'user-login', metadata: { userId: '123' }, timestamp: new Date() });
    metrics.recordExecution(Date.now() - start, true);

    const result = health.check();
    expect(result.status).toBe('healthy');
    expect(audit.getEntries().length).toBe(1);
  });

  it('should flag degraded health after audit failures', () => {
    const metrics = new AuditMetricsCollector();
    const health = new AuditHealthCheck(metrics);

    metrics.recordExecution(5, false);
    metrics.recordExecution(5, false);
    metrics.recordExecution(5, false);
    metrics.recordExecution(5, false);

    const result = health.check();
    const successRateCheck = result.checks.find((c) => c.name === 'success-rate');
    expect(successRateCheck!.status).toBe('unhealthy');
  });
});
