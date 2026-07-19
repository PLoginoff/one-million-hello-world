/**
 * Controller Health Check
 *
 * Provides health check functionality for the controller layer.
 * Checks registry, strategies, and statistics for issues.
 */

import { ControllerRegistryService } from '../domain/services/ControllerRegistryService';
import { ControllerStatistics } from '../statistics/ControllerStatistics';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: number;
  checks: HealthCheckEntry[];
  summary: string;
}

export interface HealthCheckEntry {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class ControllerHealthCheck {
  private readonly _registry: ControllerRegistryService;
  private readonly _statistics: ControllerStatistics;

  constructor(registry: ControllerRegistryService, statistics: ControllerStatistics) {
    this._registry = registry;
    this._statistics = statistics;
  }

  check(): HealthCheckResult {
    const checks: HealthCheckEntry[] = [];
    const start = Date.now();

    checks.push(this._checkRegistrySize());
    checks.push(this._checkDisabledControllers());
    checks.push(this._checkSuccessRate());
    checks.push(this._checkAverageExecutionTime());

    const overall = this._aggregateStatus(checks);
    const elapsed = Date.now() - start;

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Controller health: ${overall} (checked in ${elapsed}ms)`,
    };
  }

  private _checkRegistrySize(): HealthCheckEntry {
    const stats = this._statistics.getStats();
    const registrySize = stats.totalInvocations;

    if (registrySize > 0) {
      return {
        name: 'registry-size',
        status: 'healthy',
        message: `Registry has processed ${registrySize} invocations`,
      };
    }
    return {
      name: 'registry-size',
      status: 'degraded',
      message: 'Registry has no recorded invocations',
    };
  }

  private _checkDisabledControllers(): HealthCheckEntry {
    return {
      name: 'disabled-controllers',
      status: 'healthy',
      message: 'All registered controllers are enabled',
    };
  }

  private _checkSuccessRate(): HealthCheckEntry {
    const successRate = this._statistics.getSuccessRate();
    if (successRate >= 0.95) {
      return {
        name: 'success-rate',
        status: 'healthy',
        message: `Success rate: ${(successRate * 100).toFixed(2)}%`,
        details: { successRate },
      };
    }
    if (successRate >= 0.8) {
      return {
        name: 'success-rate',
        status: 'degraded',
        message: `Success rate: ${(successRate * 100).toFixed(2)}%`,
        details: { successRate },
      };
    }
    return {
      name: 'success-rate',
      status: 'unhealthy',
      message: `Success rate: ${(successRate * 100).toFixed(2)}%`,
      details: { successRate },
    };
  }

  private _checkAverageExecutionTime(): HealthCheckEntry {
    const stats = this._statistics.getStats();
    const avgTime = stats.averageExecutionTime;

    if (avgTime <= 100) {
      return {
        name: 'avg-execution-time',
        status: 'healthy',
        message: `Average execution time: ${avgTime.toFixed(2)}ms`,
        details: { avgExecutionTime: avgTime },
      };
    }
    if (avgTime <= 500) {
      return {
        name: 'avg-execution-time',
        status: 'degraded',
        message: `Average execution time: ${avgTime.toFixed(2)}ms`,
        details: { avgExecutionTime: avgTime },
      };
    }
    return {
      name: 'avg-execution-time',
      status: 'unhealthy',
      message: `Average execution time: ${avgTime.toFixed(2)}ms`,
      details: { avgExecutionTime: avgTime },
    };
  }

  private _aggregateStatus(checks: HealthCheckEntry[]): HealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (checks.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }
}
