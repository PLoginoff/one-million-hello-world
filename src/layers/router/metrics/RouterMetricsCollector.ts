/**
 * Router Metrics Collector
 */

import { RouterStatistics } from '../statistics/RouterStatistics';

export interface RouterMetrics {
  routerRequestsTotal: number;
  routerSuccessfulRoutesTotal: number;
  routerFailedRoutesTotal: number;
  routerAverageRoutingTimeMs: number;
  routerMostRequestedPaths: Array<{ path: string; count: number }>;
  routerMostRequestedMethods: Array<{ method: string; count: number }>;
  collectedAt: number;
}

export interface RouterMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class RouterMetricsCollector {
  private readonly _statistics: RouterStatistics;
  private _collectionCount: number;

  constructor(statistics: RouterStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): RouterMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      routerRequestsTotal: stats.totalRequests,
      routerSuccessfulRoutesTotal: stats.successfulRoutes,
      routerFailedRoutesTotal: stats.failedRoutes,
      routerAverageRoutingTimeMs: stats.averageRoutingTime,
      routerMostRequestedPaths: stats.mostRequestedPaths.map((p) => ({ path: p.path, count: p.count })),
      routerMostRequestedMethods: stats.mostRequestedMethods.map((m) => ({ method: m.method, count: m.count })),
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): RouterMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: RouterMetricSample[] = [
      { name: 'router_requests_total', value: m.routerRequestsTotal, labels: {}, timestamp: ts },
      { name: 'router_successful_routes_total', value: m.routerSuccessfulRoutesTotal, labels: {}, timestamp: ts },
      { name: 'router_failed_routes_total', value: m.routerFailedRoutesTotal, labels: {}, timestamp: ts },
      { name: 'router_avg_routing_time_ms', value: m.routerAverageRoutingTimeMs, labels: {}, timestamp: ts },
    ];

    for (const p of m.routerMostRequestedPaths) {
      samples.push({ name: 'router_requests_by_path', value: p.count, labels: { path: p.path }, timestamp: ts });
    }
    for (const meth of m.routerMostRequestedMethods) {
      samples.push({
        name: 'router_requests_by_method',
        value: meth.count,
        labels: { method: meth.method },
        timestamp: ts,
      });
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP router_requests_total Total router requests',
      '# TYPE router_requests_total counter',
      '# HELP router_successful_routes_total Total successful routes',
      '# TYPE router_successful_routes_total counter',
      '# HELP router_failed_routes_total Total failed routes',
      '# TYPE router_failed_routes_total counter',
      '# HELP router_avg_routing_time_ms Average routing time in ms',
      '# TYPE router_avg_routing_time_ms gauge',
      '# HELP router_requests_by_path Requests per path',
      '# TYPE router_requests_by_path counter',
      '# HELP router_requests_by_method Requests per method',
      '# TYPE router_requests_by_method counter',
    ];

    for (const s of samples) {
      const labelStr =
        Object.keys(s.labels).length > 0
          ? '{' +
            Object.entries(s.labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',') +
            '}'
          : '';
      lines.push(`${s.name}${labelStr} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
