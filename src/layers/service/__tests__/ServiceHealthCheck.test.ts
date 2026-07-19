/**
 * Service Health Check Unit Tests
 */

import { ServiceHealthCheck } from '../health/ServiceHealthCheck';
import { ServiceStatistics } from '../statistics/ServiceStatistics';

describe('ServiceHealthCheck', () => {
  let statistics: ServiceStatistics;
  let healthCheck: ServiceHealthCheck;

  beforeEach(() => {
    statistics = new ServiceStatistics();
    healthCheck = new ServiceHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordSuccess(50, 'svc-1');
    statistics.recordSuccess(30, 'svc-1');

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(3);
  });

  it('should return degraded when no executions', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should return degraded when success rate between 80% and 95%', () => {
    for (let i = 0; i < 8; i++) statistics.recordSuccess(10, 'svc-1');
    for (let i = 0; i < 2; i++) statistics.recordFailure(10);

    const result = healthCheck.check();
    const rateCheck = result.checks.find((c) => c.name === 'success-rate');
    expect(rateCheck!.status).toBe('degraded');
  });

  it('should return unhealthy when success rate below 80%', () => {
    for (let i = 0; i < 5; i++) statistics.recordSuccess(10, 'svc-1');
    for (let i = 0; i < 5; i++) statistics.recordFailure(10);

    const result = healthCheck.check();
    expect(result.status).toBe('unhealthy');
  });

  it('should flag degraded when avg execution time 100-500ms', () => {
    statistics.recordSuccess(200, 'svc-1');

    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg execution time > 500ms', () => {
    statistics.recordSuccess(600, 'svc-1');

    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
