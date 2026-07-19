/**
 * Controller Health Check Unit Tests
 */

import { ControllerHealthCheck } from '../health/ControllerHealthCheck';
import { ControllerRegistryService } from '../domain/services/ControllerRegistryService';
import { ControllerStatistics } from '../statistics/ControllerStatistics';

describe('ControllerHealthCheck', () => {
  let registry: ControllerRegistryService;
  let statistics: ControllerStatistics;
  let healthCheck: ControllerHealthCheck;

  beforeEach(() => {
    registry = new ControllerRegistryService();
    statistics = new ControllerStatistics();
    healthCheck = new ControllerHealthCheck(registry, statistics);
  });

  it('should return healthy status when all checks pass', () => {
    statistics.recordSuccess(50, 'ctrl-1');
    statistics.recordSuccess(30, 'ctrl-1');

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.summary).toContain('Controller health');
  });

  it('should return degraded status when success rate is between 80% and 95%', () => {
    for (let i = 0; i < 8; i++) statistics.recordSuccess(10, 'ctrl-1');
    for (let i = 0; i < 2; i++) statistics.recordFailure(10);

    const result = healthCheck.check();
    const successRateCheck = result.checks.find((c) => c.name === 'success-rate');
    expect(successRateCheck).toBeDefined();
    expect(successRateCheck!.status).toBe('degraded');
  });

  it('should return unhealthy status when success rate is below 80%', () => {
    for (let i = 0; i < 5; i++) statistics.recordSuccess(10, 'ctrl-1');
    for (let i = 0; i < 5; i++) statistics.recordFailure(10);

    const result = healthCheck.check();
    expect(result.status).toBe('unhealthy');
  });

  it('should return degraded when no invocations recorded', () => {
    const result = healthCheck.check();
    const registryCheck = result.checks.find((c) => c.name === 'registry-size');
    expect(registryCheck).toBeDefined();
    expect(registryCheck!.status).toBe('degraded');
  });

  it('should flag degraded when avg execution time is between 100ms and 500ms', () => {
    statistics.recordSuccess(200, 'ctrl-1');

    const result = healthCheck.check();
    const avgTimeCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgTimeCheck).toBeDefined();
    expect(avgTimeCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when avg execution time exceeds 500ms', () => {
    statistics.recordSuccess(600, 'ctrl-1');

    const result = healthCheck.check();
    const avgTimeCheck = result.checks.find((c) => c.name === 'avg-execution-time');
    expect(avgTimeCheck).toBeDefined();
    expect(avgTimeCheck!.status).toBe('unhealthy');
  });
});
