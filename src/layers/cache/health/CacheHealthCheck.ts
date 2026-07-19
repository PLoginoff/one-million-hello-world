/**
 * Cache Health Check
 */

import { IStatisticsCollector } from '../statistics/collectors/IStatisticsCollector';

export type CacheHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CacheHealthCheckResult {
  status: CacheHealthStatus;
  timestamp: number;
  checks: CacheHealthCheckEntry[];
  summary: string;
}

export interface CacheHealthCheckEntry {
  name: string;
  status: CacheHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class CacheHealthCheck {
  private readonly _collector: IStatisticsCollector;

  constructor(collector: IStatisticsCollector) {
    this._collector = collector;
  }

  check(): CacheHealthCheckResult {
    const checks: CacheHealthCheckEntry[] = [];

    checks.push(this._checkRequestCount());
    checks.push(this._checkHitRate());
    checks.push(this._checkEvictionRate());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Cache health: ${overall}`,
    };
  }

  private _checkRequestCount(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    if (stats.getTotalRequests() > 0) {
      return { name: 'request-count', status: 'healthy', message: `${stats.getTotalRequests()} cache requests` };
    }
    return { name: 'request-count', status: 'degraded', message: 'No cache requests' };
  }

  private _checkHitRate(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    const hitRate = stats.getHitRate();
    if (hitRate >= 0.8) {
      return {
        name: 'hit-rate',
        status: 'healthy',
        message: `Hit rate: ${(hitRate * 100).toFixed(2)}%`,
        details: { hitRate },
      };
    }
    if (hitRate >= 0.5) {
      return {
        name: 'hit-rate',
        status: 'degraded',
        message: `Hit rate: ${(hitRate * 100).toFixed(2)}%`,
        details: { hitRate },
      };
    }
    return {
      name: 'hit-rate',
      status: 'unhealthy',
      message: `Hit rate: ${(hitRate * 100).toFixed(2)}%`,
      details: { hitRate },
    };
  }

  private _checkEvictionRate(): CacheHealthCheckEntry {
    const stats = this._collector.getStats();
    const total = stats.getTotalRequests();
    const evictionRate = total > 0 ? stats.evictions / total : 0;
    if (evictionRate <= 0.05) {
      return {
        name: 'eviction-rate',
        status: 'healthy',
        message: `Eviction rate: ${(evictionRate * 100).toFixed(2)}%`,
        details: { evictionRate },
      };
    }
    if (evictionRate <= 0.15) {
      return {
        name: 'eviction-rate',
        status: 'degraded',
        message: `Eviction rate: ${(evictionRate * 100).toFixed(2)}%`,
        details: { evictionRate },
      };
    }
    return {
      name: 'eviction-rate',
      status: 'unhealthy',
      message: `Eviction rate: ${(evictionRate * 100).toFixed(2)}%`,
      details: { evictionRate },
    };
  }

  private _aggregateStatus(checks: CacheHealthCheckEntry[]): CacheHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
