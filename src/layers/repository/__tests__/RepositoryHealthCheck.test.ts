/**
 * Repository Health Check Unit Tests
 */

import { RepositoryHealthCheck } from '../health/RepositoryHealthCheck';
import { RepositoryStatistics } from '../statistics/RepositoryStatistics';

describe('RepositoryHealthCheck', () => {
  let statistics: RepositoryStatistics;
  let healthCheck: RepositoryHealthCheck;

  beforeEach(() => {
    statistics = new RepositoryStatistics();
    healthCheck = new RepositoryHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordSuccess(30, 'repo-1');
    statistics.recordSuccess(20, 'repo-1');

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(3);
  });

  it('should return degraded when no queries', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should return degraded when avg query time is 50-200ms', () => {
    statistics.recordSuccess(100, 'repo-1');
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-query-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should return unhealthy when avg query time > 200ms', () => {
    statistics.recordSuccess(300, 'repo-1');
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-query-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
