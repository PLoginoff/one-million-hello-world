/**
 * Middleware Health Check Unit Tests
 */

import { MiddlewareHealthCheck } from '../health/MiddlewareHealthCheck';
import { MiddlewareStatistics } from '../statistics/MiddlewareStatistics';

describe('MiddlewareHealthCheck', () => {
  let statistics: MiddlewareStatistics;
  let healthCheck: MiddlewareHealthCheck;

  beforeEach(() => {
    statistics = new MiddlewareStatistics();
    healthCheck = new MiddlewareHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordSuccess(5);
    statistics.recordSuccess(3);

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
  });

  it('should return degraded when no executions', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should flag degraded when avg execution time 10-50ms', () => {
    statistics.recordSuccess(30);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg execution time > 50ms', () => {
    statistics.recordSuccess(80);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
