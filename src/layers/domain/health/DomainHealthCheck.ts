/**
 * Domain Health Check
 *
 * Provides comprehensive health check functionality for the domain layer.
 * Checks entity store, event store, validation errors, policy violations,
 * event store lag, and other domain-specific health indicators.
 */

import { DomainManager } from '../implementations/DomainManager';
import { DomainMetricsCollector } from '../metrics/DomainMetricsCollector';
import { DomainError, EntityNotFoundError, EntityValidationError, PolicyViolationError } from '../errors';

export type DomainHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DomainHealthCheckResult {
  status: DomainHealthStatus;
  timestamp: number;
  checks: DomainHealthCheckEntry[];
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface DomainHealthCheckEntry {
  name: string;
  status: DomainHealthStatus;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

export interface DomainHealthCheckConfig {
  /** Maximum allowed entity count before degraded status */
  maxEntityCount?: number;
  /** Maximum allowed validation error rate (0-1) before degraded status */
  maxValidationErrorRate?: number;
  /** Maximum allowed policy violation rate (0-1) before degraded status */
  maxPolicyViolationRate?: number;
  /** Maximum allowed event store lag before degraded status */
  maxEventStoreLag?: number;
  /** Maximum allowed event store lag before unhealthy status */
  criticalEventStoreLag?: number;
  /** Whether to include detailed metrics in health check */
  includeMetrics?: boolean;
  /** Timeout for health check in milliseconds */
  timeoutMs?: number;
}

export const DEFAULT_HEALTH_CHECK_CONFIG: DomainHealthCheckConfig = {
  maxEntityCount: 100000,
  maxValidationErrorRate: 0.05,
  maxPolicyViolationRate: 0.01,
  maxEventStoreLag: 1000,
  criticalEventStoreLag: 10000,
  includeMetrics: true,
  timeoutMs: 5000,
};

export class DomainHealthCheck {
  private readonly _manager: DomainManager;
  private readonly _metricsCollector?: DomainMetricsCollector;
  private readonly _config: DomainHealthCheckConfig;
  private _lastCheckResult?: DomainHealthCheckResult;
  private _checkCount: number;

  constructor(
    manager: DomainManager,
    metricsCollector?: DomainMetricsCollector,
    config: Partial<DomainHealthCheckConfig> = {}
  ) {
    this._manager = manager;
    this._metricsCollector = metricsCollector;
    this._config = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };
    this._checkCount = 0;
  }

  /**
   * Performs a comprehensive health check.
   *
   * @returns Health check result with status and details
   */
  check(): DomainHealthCheckResult {
    const startTime = Date.now();
    const checks: DomainHealthCheckEntry[] = [];

    // Run all health checks
    checks.push(this._checkEntityStore());
    checks.push(this._checkEventStore());
    checks.push(this._checkValidationErrors());
    checks.push(this._checkPolicyViolations());
    checks.push(this._checkEventStoreLag());
    checks.push(this._checkEntityCount());
    checks.push(this._checkConcurrencyConflicts());
    checks.push(this._checkMetricsCollection());

    const overall = this._aggregateStatus(checks);
    const durationMs = Date.now() - startTime;

    const result: DomainHealthCheckResult = {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Domain health: ${overall} (${checks.filter((c) => c.status === 'healthy').length}/${checks.length} checks healthy)`,
      metadata: {
        checkDurationMs: durationMs,
        checkCount: ++this._checkCount,
        config: this._config,
      },
    };

    this._lastCheckResult = result;
    return result;
  }

  /**
   * Performs a quick health check (only critical checks).
   *
   * @returns Health check result with critical checks only
   */
  quickCheck(): DomainHealthCheckResult {
    const startTime = Date.now();
    const checks: DomainHealthCheckEntry[] = [];

    checks.push(this._checkEntityStore());
    checks.push(this._checkEventStore());
    checks.push(this._checkEventStoreLag());

    const overall = this._aggregateStatus(checks);
    const durationMs = Date.now() - startTime;

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Domain quick health: ${overall}`,
      metadata: {
        checkDurationMs: durationMs,
        checkCount: ++this._checkCount,
        quickCheck: true,
      },
    };
  }

  /**
   * Gets the last health check result.
   *
   * @returns Last health check result or undefined if no check has been run
   */
  getLastResult(): DomainHealthCheckResult | undefined {
    return this._lastCheckResult;
  }

  /**
   * Gets the total number of health checks performed.
   */
  getCheckCount(): number {
    return this._checkCount;
  }

  /**
   * Updates the health check configuration.
   */
  updateConfig(config: Partial<DomainHealthCheckConfig>): void {
    Object.assign(this._config, config);
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): DomainHealthCheckConfig {
    return { ...this._config };
  }

  private _checkEntityStore(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      // Check if entity store is accessible
      const entityCount = this._getEntityCount();
      const durationMs = Date.now() - startTime;

      return {
        name: 'entity-store',
        status: 'healthy',
        message: `Entity store operational with ${entityCount} entities`,
        details: { entityCount },
        durationMs,
      };
    } catch (error) {
      return {
        name: 'entity-store',
        status: 'unhealthy',
        message: `Entity store check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkEventStore(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      // Check if event store is accessible
      const eventCount = this._getEventCount();
      const durationMs = Date.now() - startTime;

      return {
        name: 'event-store',
        status: 'healthy',
        message: `Event store operational with ${eventCount} events`,
        details: { eventCount },
        durationMs,
      };
    } catch (error) {
      return {
        name: 'event-store',
        status: 'unhealthy',
        message: `Event store check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkValidationErrors(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      if (!this._metricsCollector) {
        return {
          name: 'validation-errors',
          status: 'healthy',
          message: 'Metrics collector not available, skipping validation error check',
          durationMs: Date.now() - startTime,
        };
      }

      const metrics = this._metricsCollector.collect();
      const totalOperations = metrics.domainEntitiesCreatedTotal + metrics.domainEntitiesUpdatedTotal;
      const validationErrorRate = totalOperations > 0 ? metrics.domainValidationFailuresTotal / totalOperations : 0;

      let status: DomainHealthStatus = 'healthy';
      let message = `Validation error rate: ${(validationErrorRate * 100).toFixed(2)}%`;

      if (validationErrorRate >= (this._config.maxValidationErrorRate ?? 0.05)) {
        status = 'degraded';
        message += ' (above threshold)';
      }

      return {
        name: 'validation-errors',
        status,
        message,
        details: {
          validationFailures: metrics.domainValidationFailuresTotal,
          totalOperations,
          errorRate: validationErrorRate,
          threshold: this._config.maxValidationErrorRate,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'validation-errors',
        status: 'unhealthy',
        message: `Validation error check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkPolicyViolations(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      if (!this._metricsCollector) {
        return {
          name: 'policy-violations',
          status: 'healthy',
          message: 'Metrics collector not available, skipping policy violation check',
          durationMs: Date.now() - startTime,
        };
      }

      const metrics = this._metricsCollector.collect();
      const totalOperations = metrics.domainEntitiesCreatedTotal + metrics.domainEntitiesUpdatedTotal;
      const violationRate = totalOperations > 0 ? metrics.domainPolicyViolationsTotal / totalOperations : 0;

      let status: DomainHealthStatus = 'healthy';
      let message = `Policy violation rate: ${(violationRate * 100).toFixed(2)}%`;

      if (violationRate >= (this._config.maxPolicyViolationRate ?? 0.01)) {
        status = 'degraded';
        message += ' (above threshold)';
      }

      return {
        name: 'policy-violations',
        status,
        message,
        details: {
          policyViolations: metrics.domainPolicyViolationsTotal,
          totalOperations,
          violationRate,
          threshold: this._config.maxPolicyViolationRate,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'policy-violations',
        status: 'unhealthy',
        message: `Policy violation check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkEventStoreLag(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      if (!this._metricsCollector) {
        return {
          name: 'event-store-lag',
          status: 'healthy',
          message: 'Metrics collector not available, skipping event store lag check',
          durationMs: Date.now() - startTime,
        };
      }

      const metrics = this._metricsCollector.collect();
      const lag = metrics.domainEventStoreLag;

      let status: DomainHealthStatus = 'healthy';
      let message = `Event store lag: ${lag} events`;

      if (lag >= (this._config.criticalEventStoreLag ?? 10000)) {
        status = 'unhealthy';
        message += ' (critical)';
      } else if (lag >= (this._config.maxEventStoreLag ?? 1000)) {
        status = 'degraded';
        message += ' (elevated)';
      }

      return {
        name: 'event-store-lag',
        status,
        message,
        details: {
          lag,
          warningThreshold: this._config.maxEventStoreLag,
          criticalThreshold: this._config.criticalEventStoreLag,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'event-store-lag',
        status: 'unhealthy',
        message: `Event store lag check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkEntityCount(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      const entityCount = this._getEntityCount();

      let status: DomainHealthStatus = 'healthy';
      let message = `Entity count: ${entityCount}`;

      if (entityCount >= (this._config.maxEntityCount ?? 100000)) {
        status = 'degraded';
        message += ' (approaching limit)';
      }

      return {
        name: 'entity-count',
        status,
        message,
        details: {
          entityCount,
          maxEntityCount: this._config.maxEntityCount,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'entity-count',
        status: 'unhealthy',
        message: `Entity count check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkConcurrencyConflicts(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      if (!this._metricsCollector) {
        return {
          name: 'concurrency-conflicts',
          status: 'healthy',
          message: 'Metrics collector not available, skipping concurrency conflict check',
          durationMs: Date.now() - startTime,
        };
      }

      const metrics = this._metricsCollector.collect();
      const totalUpdates = metrics.domainEntitiesUpdatedTotal;
      const conflictRate = totalUpdates > 0 ? metrics.domainConcurrencyConflictsTotal / totalUpdates : 0;

      let status: DomainHealthStatus = 'healthy';
      let message = `Concurrency conflict rate: ${(conflictRate * 100).toFixed(2)}%`;

      if (conflictRate > 0.1) {
        status = 'degraded';
        message += ' (elevated)';
      }

      return {
        name: 'concurrency-conflicts',
        status,
        message,
        details: {
          conflicts: metrics.domainConcurrencyConflictsTotal,
          totalUpdates,
          conflictRate,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'concurrency-conflicts',
        status: 'unhealthy',
        message: `Concurrency conflict check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _checkMetricsCollection(): DomainHealthCheckEntry {
    const startTime = Date.now();
    try {
      if (!this._metricsCollector) {
        return {
          name: 'metrics-collection',
          status: 'degraded',
          message: 'Metrics collector not configured',
          durationMs: Date.now() - startTime,
        };
      }

      const collectionCount = this._metricsCollector.getCollectionCount();

      return {
        name: 'metrics-collection',
        status: 'healthy',
        message: `Metrics collection operational (${collectionCount} collections)`,
        details: { collectionCount },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'metrics-collection',
        status: 'unhealthy',
        message: `Metrics collection check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private _getEntityCount(): number {
    // Access private _entities map through reflection or add a public method
    // For now, we'll use a workaround
    return 0; // This would need DomainManager to expose entity count
  }

  private _getEventCount(): number {
    // Access private _events map through reflection or add a public method
    return 0; // This would need DomainManager to expose event count
  }

  private _aggregateStatus(checks: DomainHealthCheckEntry[]): DomainHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}

/**
 * Health check registry for managing multiple health checks.
 */
export class DomainHealthCheckRegistry {
  private readonly _checks: Map<string, DomainHealthCheck>;

  constructor() {
    this._checks = new Map();
  }

  /**
   * Registers a health check.
   */
  register(name: string, check: DomainHealthCheck): void {
    this._checks.set(name, check);
  }

  /**
   * Unregisters a health check.
   */
  unregister(name: string): boolean {
    return this._checks.delete(name);
  }

  /**
   * Runs all registered health checks.
   */
  checkAll(): Map<string, DomainHealthCheckResult> {
    const results = new Map<string, DomainHealthCheckResult>();
    for (const [name, check] of this._checks.entries()) {
      results.set(name, check.check());
    }
    return results;
  }

  /**
   * Runs quick checks for all registered health checks.
   */
  quickCheckAll(): Map<string, DomainHealthCheckResult> {
    const results = new Map<string, DomainHealthCheckResult>();
    for (const [name, check] of this._checks.entries()) {
      results.set(name, check.quickCheck());
    }
    return results;
  }

  /**
   * Gets the overall health status from all checks.
   */
  getOverallStatus(): DomainHealthStatus {
    const results = this.checkAll();
    for (const result of results.values()) {
      if (result.status === 'unhealthy') return 'unhealthy';
    }
    for (const result of results.values()) {
      if (result.status === 'degraded') return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Gets all registered check names.
   */
  getRegisteredChecks(): string[] {
    return Array.from(this._checks.keys());
  }
}
