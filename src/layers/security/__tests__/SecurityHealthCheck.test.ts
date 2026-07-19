/**
 * Security Health Check Unit Tests
 */

import { SecurityHealthCheck } from '../health/SecurityHealthCheck';
import { SecurityStatistics } from '../statistics/SecurityStatistics';

describe('SecurityHealthCheck', () => {
  let statistics: SecurityStatistics;
  let healthCheck: SecurityHealthCheck;

  beforeEach(() => {
    statistics = new SecurityStatistics();
    healthCheck = new SecurityHealthCheck(statistics);
  });

  it('should return healthy when no threats and good auth rate', () => {
    statistics.recordSuccessfulAuthentication(30);

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(4);
  });

  it('should return degraded when no auth attempts', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should flag degraded when avg auth time is 50-200ms', () => {
    statistics.recordSuccessfulAuthentication(100);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-auth-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg auth time > 200ms', () => {
    statistics.recordSuccessfulAuthentication(300);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-auth-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
