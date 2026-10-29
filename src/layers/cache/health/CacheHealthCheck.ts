/**
 * Cache Health Check
 *
 * Comprehensive health checking for cache layer including
 * Redis connectivity, memory usage, hit rates, and performance metrics.
 *
 * @module CacheLayer/Health
 */

import { IStatisticsCollector } from '../statistics/collectors/IStatisticsCollector';
import { CacheManager } from '../core/managers/CacheManager';
import { RedisCacheAdapter } from '../adapters/RedisCacheAdapter';
import { ClusterCacheAdapter } from '../adapters/ClusterCacheAdapter';

export type CacheHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CacheHealthCheckResult {
  status: CacheHealthStatus;
  timestamp: number;
  checks: CacheHealthCheckEntry[];
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface CacheHealthCheckEntry {
  name: string;
  status: CacheHealthStatus;
  message: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export interface CacheHealthCheckConfig {
  /** Minimum hit rate for healthy status (0-1) */
  minHitRate?: number;
  /** Minimum hit rate for degraded status (0-1) */
  degradedHitRate?: number;
  /** Maximum eviction rate for healthy status (0-1) */
  maxEvictionRate?: number;
  /** Maximum eviction rate for degraded status (0-1) */
  degradedEvictionRate?: number;
  /** Maximum average latency for healthy status (ms) */
  maxAvgLatencyMs?: number;
  /** Maximum average latency for degraded status (ms) */
  degradedAvgLatencyMs?: number;
  /** Maximum memory usage percentage for healthy (0-1) */
  maxMemoryUsage?: number;
  /** Maximum memory usage percentage for degraded (0-1) */
  degradedMemoryUsage?: number;
  /** Redis connection timeout for health check (ms) */
  redisTimeout?: number;
  /** Enable detailed Redis checks */
  detailedRedisChecks?: boolean;
}

/**
 * Cache Health Check Implementation
 *
 * Performs comprehensive health checks on the cache layer:
 * - Request throughput
 * - Hit/miss rates
 * - Eviction rates
 * - Latency percentiles
 * - Redis connectivity and memory (if using Redis)
 * - Cluster health (if using Redis Cluster)
 */
export class CacheHealthCheck {
  private readonly _collector: IStatisticsCollector;
  private readonly _manager?: CacheManager;
  private readonly _redisAdapter?: RedisCacheAdapter;
  private readonly _clusterAdapter?: ClusterCacheAdapter;
  private readonly _config: Required<CacheHealthCheckConfig>;

  constructor(
    collector: IStatisticsCollector,
    options?: {
      manager?: CacheManager;
      redisAdapter?: RedisCacheAdapter;
      clusterAdapter?: ClusterCacheAdapter;
      config?: CacheHealthCheckConfig;
    }
  ) {
    this._collector = collector;
    this._manager = options?.manager;
    this._redisAdapter = options?.redisAdapter;
    this._clusterAdapter = options?.clusterAdapter;
    this._config = {
      minHitRate: options?.config?.minHitRate ?? 0.7,
      degradedHitRate: options?.config?.degradedHitRate ?? 0.2,
      maxEvictionRate: options?.config?.maxEvictionRate ?? 0.05,
      degradedEvictionRate: options?.config?.degradedEvictionRate ?? 0.15,
      maxAvgLatencyMs: options?.config?.maxAvgLatencyMs ?? 10,
      degradedAvgLatencyMs: options?.config?.degradedAvgLatencyMs ?? 50,
      maxMemoryUsage: options?.config?.maxMemoryUsage ?? 0.8,
      degradedMemoryUsage: options?.config?.degradedMemoryUsage ?? 0.9,
      redisTimeout: options?.config?.redisTimeout ?? 100,
      detailedRedisChecks: options?.config?.detailedRedisChecks ?? true,
    };
  }

  /**
   * Perform comprehensive health check
   */
  async check(): Promise<CacheHealthCheckResult> {
    const checks: CacheHealthCheckEntry[] = [];
    const startTime = Date.now();

    // Core cache checks
    checks.push(this._checkRequestCount());
    checks.push(this._checkHitRate());
    checks.push(this._checkEvictionRate());
    checks.push(await this._checkLatency());

    // Cache manager checks
    if (this._manager) {
      checks.push(await this._checkCacheManager());
    }

    // Redis adapter checks
    if (this._redisAdapter) {
      checks.push(await this._checkRedisAdapter());
    }

    // Cluster adapter checks
    if (this._clusterAdapter) {
      checks.push(await this._checkClusterAdapter());
    }

    const overall = this._aggregateStatus(checks);
    const totalLatency = Date.now() - startTime;

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Cache health: ${overall} (${checks.filter(c => c.status === 'healthy').length}/${checks.length} checks passed)`,
      metadata: {
        totalCheckLatencyMs: totalLatency,
        checkCount: checks.length,
        healthyCount: checks.filter(c => c.status === 'healthy').length,
        degradedCount: checks.filter(c => c.status === 'degraded').length,
        unhealthyCount: checks.filter(c => c.status === 'unhealthy').length,
      },
    };
  }

  /**
   * Quick health check (only core metrics)
   */
  quickCheck(): CacheHealthCheckResult {
    const checks: CacheHealthCheckEntry[] = [];

    checks.push(this._checkRequestCount());
    checks.push(this._checkHitRate());
    checks.push(this._checkEvictionRate());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Cache health (quick): ${overall}`,
    };
  }

  /**
   * Check request count
   */
  private _checkRequestCount(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    const totalRequests = stats.getTotalRequests();

    if (totalRequests > 0) {
      return {
        name: 'request-count',
        status: 'healthy',
        message: `${totalRequests} cache requests processed`,
        details: { totalRequests },
      };
    }

    return {
      name: 'request-count',
      status: 'degraded',
      message: 'No cache requests processed',
      details: { totalRequests: 0 },
    };
  }

  /**
   * Check hit rate
   */
  private _checkHitRate(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    const hitRate = stats.getHitRate();
    const totalRequests = stats.getTotalRequests();

    if (totalRequests === 0) {
      return {
        name: 'hit-rate',
        status: 'degraded',
        message: 'No requests to calculate hit rate',
        details: { hitRate: 0, totalRequests: 0 },
      };
    }

    const pct = (hitRate * 100).toFixed(2);

    if (hitRate >= this._config.minHitRate) {
      return {
        name: 'hit-rate',
        status: 'healthy',
        message: `Hit rate: ${pct}%`,
        details: { hitRate, totalRequests },
      };
    }

    if (hitRate >= this._config.degradedHitRate) {
      return {
        name: 'hit-rate',
        status: 'degraded',
        message: `Hit rate: ${pct}% (below ${(this._config.minHitRate * 100).toFixed(0)}%)`,
        details: { hitRate, totalRequests, threshold: this._config.minHitRate },
      };
    }

    return {
      name: 'hit-rate',
      status: 'unhealthy',
      message: `Hit rate: ${pct}% (critically low)`,
      details: { hitRate, totalRequests, threshold: this._config.degradedHitRate },
    };
  }

  /**
   * Check eviction rate
   */
  private _checkEvictionRate(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    const total = stats.getTotalRequests();
    const evictionRate = total > 0 ? stats.evictions / total : 0;
    const pct = (evictionRate * 100).toFixed(2);

    if (evictionRate <= this._config.maxEvictionRate) {
      return {
        name: 'eviction-rate',
        status: 'healthy',
        message: `Eviction rate: ${pct}%`,
        details: { evictionRate, evictions: stats.evictions, totalRequests: total },
      };
    }

    if (evictionRate <= this._config.degradedEvictionRate) {
      return {
        name: 'eviction-rate',
        status: 'degraded',
        message: `Eviction rate: ${pct}% (above ${(this._config.maxEvictionRate * 100).toFixed(0)}%)`,
        details: { evictionRate, evictions: stats.evictions, totalRequests: total, threshold: this._config.maxEvictionRate },
      };
    }

    return {
      name: 'eviction-rate',
      status: 'unhealthy',
      message: `Eviction rate: ${pct}% (critically high)`,
      details: { evictionRate, evictions: stats.evictions, totalRequests: total, threshold: this._config.degradedEvictionRate },
    };
  }

  /**
   * Check latency (uses metrics collector if available)
   */
  private async _checkLatency(): Promise<CacheHealthCheckEntry> {
    const start = Date.now();

    try {
      // Try to get latency from metrics collector if available
      const metricsCollector = (this._collector as any).getMetricsCollector?.();
      if (metricsCollector) {
        const metrics = metricsCollector.getAllMetrics();
        let totalLatency = 0;
        let totalCount = 0;

        for (const [, metric] of Object.entries(metrics)) {
          totalLatency += (metric as any).averageExecutionTimeMs * (metric as any).totalExecutions;
          totalCount += (metric as any).totalExecutions;
        }

        const avgLatency = totalCount > 0 ? totalLatency / totalCount : 0;
        const latencyMs = Date.now() - start;

        if (avgLatency <= this._config.maxAvgLatencyMs) {
          return {
            name: 'latency',
            status: 'healthy',
            message: `Average latency: ${avgLatency.toFixed(2)}ms`,
            details: { avgLatency, totalExecutions: totalCount },
            latencyMs,
          };
        }

        if (avgLatency <= this._config.degradedAvgLatencyMs) {
          return {
            name: 'latency',
            status: 'degraded',
            message: `Average latency: ${avgLatency.toFixed(2)}ms (above ${this._config.maxAvgLatencyMs}ms)`,
            details: { avgLatency, totalExecutions: totalCount, threshold: this._config.maxAvgLatencyMs },
            latencyMs,
          };
        }

        return {
          name: 'latency',
          status: 'unhealthy',
          message: `Average latency: ${avgLatency.toFixed(2)}ms (critically high)`,
          details: { avgLatency, totalExecutions: totalCount, threshold: this._config.degradedAvgLatencyMs },
          latencyMs,
        };
      }
    } catch {
      // Ignore metrics errors
    }

    // Fallback: measure a simple operation
    const latencyMs = Date.now() - start;
    return {
      name: 'latency',
      status: 'healthy',
      message: `Health check latency: ${latencyMs}ms`,
      details: { checkLatencyMs: latencyMs },
      latencyMs,
    };
  }

  /**
   * Check cache manager health
   */
  private async _checkCacheManager(): Promise<CacheHealthCheckEntry> {
    const start = Date.now();

    try {
      if (!this._manager) {
        return {
          name: 'cache-manager',
          status: 'degraded',
          message: 'Cache manager not configured',
          latencyMs: Date.now() - start,
        };
      }

      // Check if strategy is initialized
      const strategy = (this._manager as any)._strategy;
      if (!strategy) {
        return {
          name: 'cache-manager',
          status: 'unhealthy',
          message: 'Cache strategy not initialized',
          latencyMs: Date.now() - start,
        };
      }

      // Check strategy stats
      const strategyStats = strategy.getStats?.();
      const stats = this._manager.getStats();
      const size = stats.size;

      return {
        name: 'cache-manager',
        status: 'healthy',
        message: `Cache manager operational (size: ${size})`,
        details: {
          strategy: strategy.name,
          size,
          strategyStats: strategyStats?.toJSON?.() ?? strategyStats,
        },
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'cache-manager',
        status: 'unhealthy',
        message: `Cache manager check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Check Redis adapter health
   */
  private async _checkRedisAdapter(): Promise<CacheHealthCheckEntry> {
    const start = Date.now();

    try {
      if (!this._redisAdapter) {
        return {
          name: 'redis-adapter',
          status: 'degraded',
          message: 'Redis adapter not configured',
          latencyMs: Date.now() - start,
        };
      }

      const health = await this._redisAdapter.healthCheck();
      const status = health.healthy ? 'healthy' : 'unhealthy';

      return {
        name: 'redis-adapter',
        status,
        message: health.healthy ? `Redis connected (${health.latencyMs}ms)` : 'Redis connection failed',
        details: {
          latencyMs: health.latencyMs,
          memoryUsage: health.memoryUsage,
          connectedClients: health.connectedClients,
        },
        latencyMs: health.latencyMs,
      };
    } catch (error) {
      return {
        name: 'redis-adapter',
        status: 'unhealthy',
        message: `Redis health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Check Redis Cluster adapter health
   */
  private async _checkClusterAdapter(): Promise<CacheHealthCheckEntry> {
    const start = Date.now();

    try {
      if (!this._clusterAdapter) {
        return {
          name: 'cluster-adapter',
          status: 'degraded',
          message: 'Cluster adapter not configured',
          latencyMs: Date.now() - start,
        };
      }

      const health = await this._clusterAdapter.healthCheck();
      const healthyNodes = health.nodes.filter((n: { healthy: boolean }) => n.healthy).length;
      const totalNodes = health.nodes.length;

      let status: CacheHealthStatus = 'healthy';
      if (healthyNodes === 0) {
        status = 'unhealthy';
      } else if (healthyNodes < totalNodes) {
        status = 'degraded';
      }

      return {
        name: 'cluster-adapter',
        status,
        message: `Cluster: ${healthyNodes}/${totalNodes} nodes healthy, ${health.slotsCovered}/16384 slots covered`,
        details: {
          latencyMs: health.latencyMs,
          nodes: health.nodes.map((n: { address: string; healthy: boolean; latencyMs: number; role: string }) => ({
            address: n.address,
            healthy: n.healthy,
            latencyMs: n.latencyMs,
            role: n.role,
          })),
          slotsCovered: health.slotsCovered,
        },
        latencyMs: health.latencyMs,
      };
    } catch (error) {
      return {
        name: 'cluster-adapter',
        status: 'unhealthy',
        message: `Cluster health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Aggregate overall status from individual checks
   */
  private _aggregateStatus(checks: CacheHealthCheckEntry[]): CacheHealthStatus {
    if (checks.some(c => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some(c => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Get health check configuration
   */
  getConfig(): Readonly<CacheHealthCheckConfig> {
    return { ...this._config };
  }

  /**
   * Update health check configuration
   */
  updateConfig(config: Partial<CacheHealthCheckConfig>): void {
    Object.assign(this._config, config);
  }
}