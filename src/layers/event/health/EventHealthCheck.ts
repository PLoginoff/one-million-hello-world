/**
 * Event Health Check
 *
 * Comprehensive health checking for event bus adapters, including connectivity,
 * queue depths, processing lag, and adapter-specific metrics.
 *
 * @module EventLayer/Health
 */

import { EventMetricsCollector } from '../metrics/EventMetricsCollector';
import { IEventBus } from '../interfaces/IEventBus';
import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';
import { RedisEventAdapter } from '../adapters/RedisEventAdapter';
import { HttpEventAdapter } from '../adapters/HttpEventAdapter';
import { KafkaEventAdapter } from '../adapters/KafkaEventAdapter';

/**
 * Health status levels.
 */
export type EventHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Individual health check entry.
 */
export interface EventHealthCheckEntry {
  /** Check name */
  name: string;
  /** Health status */
  status: EventHealthStatus;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Timestamp of check */
  timestamp: number;
  /** Duration of check in ms */
  durationMs: number;
}

/**
 * Overall health check result.
 */
export interface EventHealthCheckResult {
  /** Overall status */
  status: EventHealthStatus;
  /** Timestamp of check */
  timestamp: number;
  /** Individual check results */
  checks: EventHealthCheckEntry[];
  /** Summary message */
  summary: string;
  /** Version info */
  version?: string;
}

/**
 * Adapter-specific health check configuration.
 */
export interface AdapterHealthCheckConfig {
  /** Check adapter connectivity */
  checkConnectivity: boolean;
  /** Check queue depths */
  checkQueueDepth: boolean;
  /** Check processing lag */
  checkProcessingLag: boolean;
  /** Maximum acceptable queue depth */
  maxQueueDepth: number;
  /** Maximum acceptable processing lag (ms) */
  maxProcessingLagMs: number;
  /** Timeout for health checks (ms) */
  checkTimeoutMs: number;
}

/**
 * Default health check configuration.
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: AdapterHealthCheckConfig = {
  checkConnectivity: true,
  checkQueueDepth: true,
  checkProcessingLag: true,
  maxQueueDepth: 10000,
  maxProcessingLagMs: 5000,
  checkTimeoutMs: 5000,
};

/**
 * Event Health Check implementation.
 * Provides comprehensive health monitoring for event bus adapters.
 */
export class EventHealthCheck {
  private readonly _collector: EventMetricsCollector;
  private readonly _config: AdapterHealthCheckConfig;
  private _adapters: Map<string, IEventBus> = new Map();
  private _adapterTypes: Map<string, string> = new Map();

  /**
   * Creates a new EventHealthCheck.
   *
   * @param collector - Metrics collector for execution metrics
   * @param config - Optional health check configuration
   */
  constructor(collector: EventMetricsCollector, config: Partial<AdapterHealthCheckConfig> = {}) {
    this._collector = collector;
    this._config = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };
  }

  /**
   * Registers an adapter for health checking.
   *
   * @param name - Adapter name
   * @param adapter - Adapter instance
   * @param type - Adapter type ('memory', 'redis', 'http', 'kafka')
   */
  registerAdapter(name: string, adapter: IEventBus, type: 'memory' | 'redis' | 'http' | 'kafka'): void {
    this._adapters.set(name, adapter);
    this._adapterTypes.set(name, type);
  }

  /**
   * Unregisters an adapter.
   *
   * @param name - Adapter name
   */
  unregisterAdapter(name: string): void {
    this._adapters.delete(name);
    this._adapterTypes.delete(name);
  }

  /**
   * Performs a comprehensive health check.
   *
   * @returns Health check result
   */
  async check(): Promise<EventHealthCheckResult> {
    const startTime = Date.now();
    const checks: EventHealthCheckEntry[] = [];

    // Check execution metrics
    checks.push(await this._checkExecutionMetrics());

    // Check each registered adapter
    for (const [name, adapter] of this._adapters.entries()) {
      const type = this._adapterTypes.get(name) ?? 'unknown';
      checks.push(await this._checkAdapter(name, type, adapter));
    }

    // If no adapters registered, add a default check
    if (this._adapters.size === 0) {
      checks.push({
        name: 'adapters',
        status: 'degraded',
        message: 'No adapters registered for health checking',
        timestamp: Date.now(),
        durationMs: 0,
      });
    }

    const overall = this._aggregateStatus(checks);
    const totalDuration = Date.now() - startTime;

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Event health: ${overall} (${checks.length} checks, ${totalDuration}ms)`,
      version: '1.0.0',
    };
  }

  /**
   * Performs a quick health check (connectivity only).
   *
   * @returns Health check result
   */
  async quickCheck(): Promise<EventHealthCheckResult> {
    const startTime = Date.now();
    const checks: EventHealthCheckEntry[] = [];

    // Quick metrics check
    checks.push(this._checkExecutionMetricsSync());

    // Quick adapter connectivity checks
    for (const [name, adapter] of this._adapters.entries()) {
      const type = this._adapterTypes.get(name) ?? 'unknown';
      checks.push(await this._quickCheckAdapter(name, type, adapter));
    }

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Event quick health: ${overall}`,
    };
  }

  /**
   * Checks execution metrics from collector.
   */
  private async _checkExecutionMetrics(): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();
    const m = this._collector.getMetrics();

    const totalExecutions = m.publishedTotal + m.handledTotal;
    if (totalExecutions === 0) {
      return {
        name: 'execution-metrics',
        status: 'degraded',
        message: 'No executions recorded',
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }

    const successfulExecutions = totalExecutions - m.errorTotal;
    const successRate = successfulExecutions / totalExecutions;
    const avgTime = (m.avgPublishLatencyMs + m.avgHandleLatencyMs) / 2;

    let status: EventHealthStatus = 'healthy';
    const messages: string[] = [];

    if (successRate < 0.8) {
      status = 'unhealthy';
      messages.push(`Success rate: ${(successRate * 100).toFixed(2)}%`);
    } else if (successRate < 0.95) {
      status = 'degraded';
      messages.push(`Success rate: ${(successRate * 100).toFixed(2)}%`);
    } else {
      messages.push(`Success rate: ${(successRate * 100).toFixed(2)}%`);
    }

    if (avgTime > 100) {
      status = status === 'healthy' ? 'degraded' : status;
      messages.push(`Avg time: ${avgTime.toFixed(2)}ms`);
    } else {
      messages.push(`Avg time: ${avgTime.toFixed(2)}ms`);
    }

    return {
      name: 'execution-metrics',
      status,
      message: messages.join(', '),
      details: {
        executionCount: m.publishedTotal + m.handledTotal,
        successCount: m.handledTotal,
        failureCount: m.errorTotal,
        successRate,
        averageExecutionTimeMs: avgTime,
        activeOperations: m.activeSubscriptions,
      },
      timestamp: Date.now(),
      durationMs: Date.now() - checkStart,
    };
  }

  /**
   * Synchronous execution metrics check.
   */
  private _checkExecutionMetricsSync(): EventHealthCheckEntry {
    const checkStart = Date.now();
    const m = this._collector.getMetrics();

    const totalExecutions = m.publishedTotal + m.handledTotal;
    if (totalExecutions === 0) {
      return {
        name: 'execution-metrics',
        status: 'degraded',
        message: 'No executions recorded',
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }

    const successfulExecutions = totalExecutions - m.errorTotal;
    const successRate = successfulExecutions / totalExecutions;
    let status: EventHealthStatus = successRate >= 0.95 ? 'healthy' : successRate >= 0.8 ? 'degraded' : 'unhealthy';

    return {
      name: 'execution-metrics',
      status,
      message: `Success rate: ${(successRate * 100).toFixed(2)}%`,
      timestamp: Date.now(),
      durationMs: Date.now() - checkStart,
    };
  }

  /**
   * Checks a specific adapter.
   */
  private async _checkAdapter(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();
    const subChecks: EventHealthCheckEntry[] = [];

    // Connectivity check
    if (this._config.checkConnectivity) {
      subChecks.push(await this._checkConnectivity(name, type, adapter));
    }

    // Queue depth check
    if (this._config.checkQueueDepth) {
      subChecks.push(await this._checkQueueDepth(name, type, adapter));
    }

    // Processing lag check
    if (this._config.checkProcessingLag) {
      subChecks.push(await this._checkProcessingLag(name, type, adapter));
    }

    // Adapter-specific checks
    subChecks.push(await this._checkAdapterSpecific(name, type, adapter));

    const overall = this._aggregateStatus(subChecks);
    const messages = subChecks.map((c) => `${c.name}: ${c.status}`).join(', ');

    return {
      name: `adapter:${name}`,
      status: overall,
      message: messages,
      details: {
        type,
        subChecks: subChecks.map((c) => ({ name: c.name, status: c.status, message: c.message })),
      },
      timestamp: Date.now(),
      durationMs: Date.now() - checkStart,
    };
  }

  /**
   * Quick adapter connectivity check.
   */
  private async _quickCheckAdapter(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();

    try {
      const stats = adapter.getStats();
      return {
        name: `adapter:${name}`,
        status: 'healthy',
        message: `Connected (published: ${stats.publishedCount}, handled: ${stats.handledCount})`,
        details: { type, stats },
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    } catch (error) {
      return {
        name: `adapter:${name}`,
        status: 'unhealthy',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { type },
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }
  }

  /**
   * Checks adapter connectivity.
   */
  private async _checkConnectivity(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();

    try {
      // Try to get stats as a connectivity test
      const stats = adapter.getStats();

      // Type-specific connectivity checks
      if (type === 'redis') {
        const redisAdapter = adapter as RedisEventAdapter;
        if (!redisAdapter.isConnected()) {
          return {
            name: `connectivity:${name}`,
            status: 'unhealthy',
            message: 'Redis not connected',
            timestamp: Date.now(),
            durationMs: Date.now() - checkStart,
          };
        }
      } else if (type === 'kafka') {
        const kafkaAdapter = adapter as KafkaEventAdapter;
        if (!kafkaAdapter.isConnected()) {
          return {
            name: `connectivity:${name}`,
            status: 'unhealthy',
            message: 'Kafka not connected',
            timestamp: Date.now(),
            durationMs: Date.now() - checkStart,
          };
        }
      }

      return {
        name: `connectivity:${name}`,
        status: 'healthy',
        message: 'Connected',
        details: { type, publishedCount: stats.publishedCount },
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    } catch (error) {
      return {
        name: `connectivity:${name}`,
        status: 'unhealthy',
        message: `Connectivity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }
  }

  /**
   * Checks queue depth.
   */
  private async _checkQueueDepth(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();

    try {
      let queueDepth = 0;
      let maxDepth = this._config.maxQueueDepth;

      if (type === 'memory') {
        const memAdapter = adapter as InMemoryEventBusAdapter;
        // In-memory adapter doesn't expose queue depth directly
        // Use subscription count as proxy
        queueDepth = memAdapter.getStats().subscriptionCount;
      } else if (type === 'http') {
        const httpAdapter = adapter as HttpEventAdapter;
        // Get buffer sizes from stats
        const stats = httpAdapter.getStats() as unknown as { bufferSizes?: Record<string, number> };
        if (stats.bufferSizes) {
          queueDepth = Object.values(stats.bufferSizes).reduce((a, b) => a + b, 0);
        }
      } else if (type === 'kafka') {
        // Kafka queue depth would require admin client
        queueDepth = 0;
      }

      let status: EventHealthStatus = 'healthy';
      if (queueDepth > maxDepth) {
        status = 'unhealthy';
      } else if (queueDepth > maxDepth * 0.8) {
        status = 'degraded';
      }

      return {
        name: `queue-depth:${name}`,
        status,
        message: `Queue depth: ${queueDepth}/${maxDepth}`,
        details: { type, queueDepth, maxDepth },
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    } catch (error) {
      return {
        name: `queue-depth:${name}`,
        status: 'unknown',
        message: `Queue depth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }
  }

  /**
   * Checks processing lag.
   */
  private async _checkProcessingLag(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();

    try {
      // For most adapters, we estimate lag from metrics
      const m = this._collector.getMetrics();
      const avgTime = (m.avgPublishLatencyMs + m.avgHandleLatencyMs) / 2;
      const activeOps = m.activeSubscriptions;

      // Estimate lag based on active operations and average time
      const estimatedLag = activeOps * avgTime;

      let status: EventHealthStatus = 'healthy';
      if (estimatedLag > this._config.maxProcessingLagMs) {
        status = 'unhealthy';
      } else if (estimatedLag > this._config.maxProcessingLagMs * 0.5) {
        status = 'degraded';
      }

      return {
        name: `processing-lag:${name}`,
        status,
        message: `Estimated lag: ${estimatedLag.toFixed(2)}ms`,
        details: { type, estimatedLagMs: estimatedLag, activeOperations: activeOps, avgExecutionTimeMs: avgTime },
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    } catch (error) {
      return {
        name: `processing-lag:${name}`,
        status: 'unknown',
        message: `Processing lag check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }
  }

  /**
   * Performs adapter-specific health checks.
   */
  private async _checkAdapterSpecific(name: string, type: string, adapter: IEventBus): Promise<EventHealthCheckEntry> {
    const checkStart = Date.now();

    try {
      let details: Record<string, unknown> = { type };
      let status: EventHealthStatus = 'healthy';
      let message = 'OK';

      if (type === 'redis') {
        const redisAdapter = adapter as RedisEventAdapter;
        details.connected = redisAdapter.isConnected();
        if (!redisAdapter.isConnected()) {
          status = 'unhealthy';
          message = 'Redis disconnected';
        }
      } else if (type === 'kafka') {
        const kafkaAdapter = adapter as KafkaEventAdapter;
        details.connected = kafkaAdapter.isConnected();
        if (!kafkaAdapter.isConnected()) {
          status = 'unhealthy';
          message = 'Kafka disconnected';
        }
      } else if (type === 'http') {
        const httpAdapter = adapter as HttpEventAdapter;
        details.endpoints = httpAdapter.getEndpoints();
        details.bufferSizes = {};
        for (const endpoint of httpAdapter.getEndpoints()) {
          (details.bufferSizes as Record<string, number>)[endpoint] = httpAdapter.getBufferSize(endpoint);
        }
      } else if (type === 'memory') {
        const memAdapter = adapter as InMemoryEventBusAdapter;
        details.subscriptionCount = memAdapter.getStats().subscriptionCount;
        details.eventHistorySize = memAdapter.getEventHistory().length;
        details.disposed = memAdapter.isDisposed();
      }

      return {
        name: `adapter-specific:${name}`,
        status,
        message,
        details,
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    } catch (error) {
      return {
        name: `adapter-specific:${name}`,
        status: 'unknown',
        message: `Adapter-specific check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        durationMs: Date.now() - checkStart,
      };
    }
  }

  /**
   * Aggregates multiple check statuses into overall status.
   */
  private _aggregateStatus(checks: EventHealthCheckEntry[]): EventHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    if (checks.some((c) => c.status === 'unknown')) return 'unknown';
    return 'healthy';
  }

  /**
   * Gets the health check configuration.
   */
  getConfig(): AdapterHealthCheckConfig {
    return { ...this._config };
  }

  /**
   * Updates the health check configuration.
   */
  updateConfig(config: Partial<AdapterHealthCheckConfig>): void {
    Object.assign(this._config, config);
  }
}