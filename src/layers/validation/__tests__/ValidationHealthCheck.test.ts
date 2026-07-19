/**
 * Validation Health Check Unit Tests
 */

import { ValidationHealthCheck } from '../health/ValidationHealthCheck';
import { ValidationStatistics } from '../statistics/ValidationStatistics';

describe('ValidationHealthCheck', () => {
  let statistics: ValidationStatistics;
  let healthCheck: ValidationHealthCheck;

  beforeEach(() => {
    statistics = new ValidationStatistics();
    healthCheck = new ValidationHealthCheck(statistics);
  });

  it('should return healthy when all checks pass', () => {
    statistics.recordSuccess(3);
    statistics.recordSuccess(2);

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
  });

  it('should return degraded when no validations', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('degraded');
  });

  it('should flag degraded when avg validation time 5-20ms', () => {
    statistics.recordSuccess(10);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-validation-time');
    expect(avgCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg validation time > 20ms', () => {
    statistics.recordSuccess(30);
    const result = healthCheck.check();
    const avgCheck = result.checks.find((c) => c.name === 'avg-validation-time');
    expect(avgCheck!.status).toBe('unhealthy');
  });
});
