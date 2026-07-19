/**
 * Router Health Check Unit Tests
 */

import { RouterHealthCheck } from '../health/RouterHealthCheck';
import { RouterStatistics } from '../statistics/RouterStatistics';

describe('RouterHealthCheck', () => {
  let statistics: RouterStatistics;
  let healthCheck: RouterHealthCheck;

  beforeEach(() => {
    statistics = new RouterStatistics();
    healthCheck = new RouterHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordSuccess(3, '/hello', 'GET');
    statistics.recordSuccess(2, '/hello', 'GET');

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(3);
  });

  it('should return degraded when no requests', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should flag degraded when avg routing time is 5-20ms', () => {
    statistics.recordSuccess(10, '/hello', 'GET');
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-routing-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg routing time > 20ms', () => {
    statistics.recordSuccess(30, '/hello', 'GET');
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-routing-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
