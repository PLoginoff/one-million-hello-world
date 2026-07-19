/**
 * Rate Limiting Metrics Collector
 */

import { RateLimitStatistics } from '../statistics/RateLimitStatistics';

export interface RateLimitingMetrics {
  rateLimitRequestsTotal: number;
  rateLimitAllowedTotal: number;
  rateLimitDeniedTotal: number;
  rateLimitActiveKeys: number;
  rateLimitAvgResponseTimeMs: number;
  rateLimitPeakRequestsPerWindow: number;
  collectedAt: number;
}

export interface RateLimitingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RateLimitingMetricsCollector {
  private readonly _statistics: RateLimitStatistics;
  private _collectionCount: number;

  constructor(statistics: RateLimitStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): RateLimitingMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      rateLimitRequestsTotal: stats.totalRequests,
      rateLimitAllowedTotal: stats.allowedRequests,
      rateLimitDeniedTotal: stats.deniedRequests,
      rateLimitActiveKeys: stats.activeKeys,
      rateLimitAvgResponseTimeMs: stats.averageResponseTime,
      rateLimitPeakRequestsPerWindow: stats.peakRequestsPerWindow,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RateLimitingMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'rate_limit_requests_total', value: m.rateLimitRequestsTotal, labels: {}, timestamp: ts },
      { name: 'rate_limit_allowed_total', value: m.rateLimitAllowedTotal, labels: {}, timestamp: ts },
      { name: 'rate_limit_denied_total', value: m.rateLimitDeniedTotal, labels: {}, timestamp: ts },
      { name: 'rate_limit_active_keys', value: m.rateLimitActiveKeys, labels: {}, timestamp: ts },
      { name: 'rate_limit_avg_response_time_ms', value: m.rateLimitAvgResponseTimeMs, labels: {}, timestamp: ts },
      { name: 'rate_limit_peak_per_window', value: m.rateLimitPeakRequestsPerWindow, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP rate_limit_requests_total Total rate-limited requests',
      '# TYPE rate_limit_requests_total counter',
      '# HELP rate_limit_allowed_total Total allowed requests',
      '# TYPE rate_limit_allowed_total counter',
      '# HELP rate_limit_denied_total Total denied requests',
      '# TYPE rate_limit_denied_total counter',
      '# HELP rate_limit_active_keys Current active rate limit keys',
      '# TYPE rate_limit_active_keys gauge',
      '# HELP rate_limit_avg_response_time_ms Average response time in ms',
      '# TYPE rate_limit_avg_response_time_ms gauge',
      '# HELP rate_limit_peak_per_window Peak requests per window',
      '# TYPE rate_limit_peak_per_window gauge',
    ];

    for (const s of samples) {
      lines.push(`${s.name} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
