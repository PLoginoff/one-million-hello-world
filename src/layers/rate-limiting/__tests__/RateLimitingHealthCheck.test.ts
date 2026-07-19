/**
 * Rate Limiting Health Check Unit Tests
 */

import { RateLimitingHealthCheck } from '../health/RateLimitingHealthCheck';
import { RateLimitStatistics } from '../statistics/RateLimitStatistics';

describe('RateLimitingHealthCheck', () => {
  let statistics: RateLimitStatistics;
  let healthCheck: RateLimitingHealthCheck;

  beforeEach(() => {
    statistics = new RateLimitStatistics();
    healthCheck = new RateLimitingHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordAllowedRequest(3);

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(3);
  });

  it('should return degraded when no requests', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should flag degraded when avg response time 5-20ms', () => {
    statistics.recordAllowedRequest(10);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-response-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg response time > 20ms', () => {
    statistics.recordAllowedRequest(30);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-response-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
