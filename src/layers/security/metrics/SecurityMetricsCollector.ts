/**
 * Security Metrics Collector
 */

import { SecurityStatistics } from '../statistics/SecurityStatistics';

export interface SecurityMetrics {
  securityAuthTotal: number;
  securityAuthSuccessfulTotal: number;
  securityAuthFailedTotal: number;
  securityThreatsTotal: number;
  securityPolicyAllowedTotal: number;
  securityPolicyDeniedTotal: number;
  securityAvgAuthTimeMs: number;
  securityActiveSessions: number;
  collectedAt: number;
}

export interface SecurityMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class SecurityMetricsCollector {
  private readonly _statistics: SecurityStatistics;
  private _collectionCount: number;

  constructor(statistics: SecurityStatistics) {
    this._statistics = statistics;
    this._collectionCount = 0;
  }

  collect(): SecurityMetrics {
    const stats = this._statistics.getStats();
    this._collectionCount++;
    return {
      securityAuthTotal: stats.totalAuthentications,
      securityAuthSuccessfulTotal: stats.successfulAuthentications,
      securityAuthFailedTotal: stats.failedAuthentications,
      securityThreatsTotal: stats.totalThreatsDetected,
      securityPolicyAllowedTotal: stats.allowedRequests,
      securityPolicyDeniedTotal: stats.deniedRequests,
      securityAvgAuthTimeMs: stats.averageAuthenticationTime,
      securityActiveSessions: stats.activeSessions,
      collectedAt: Date.now(),
    };
  }

  collectAsPrometheusSamples(): SecurityMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'security_auth_total', value: m.securityAuthTotal, labels: {}, timestamp: ts },
      { name: 'security_auth_successful_total', value: m.securityAuthSuccessfulTotal, labels: {}, timestamp: ts },
      { name: 'security_auth_failed_total', value: m.securityAuthFailedTotal, labels: {}, timestamp: ts },
      { name: 'security_threats_total', value: m.securityThreatsTotal, labels: {}, timestamp: ts },
      { name: 'security_policy_allowed_total', value: m.securityPolicyAllowedTotal, labels: {}, timestamp: ts },
      { name: 'security_policy_denied_total', value: m.securityPolicyDeniedTotal, labels: {}, timestamp: ts },
      { name: 'security_avg_auth_time_ms', value: m.securityAvgAuthTimeMs, labels: {}, timestamp: ts },
      { name: 'security_active_sessions', value: m.securityActiveSessions, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP security_auth_total Total authentication attempts',
      '# TYPE security_auth_total counter',
      '# HELP security_auth_successful_total Total successful authentications',
      '# TYPE security_auth_successful_total counter',
      '# HELP security_auth_failed_total Total failed authentications',
      '# TYPE security_auth_failed_total counter',
      '# HELP security_threats_total Total threats detected',
      '# TYPE security_threats_total counter',
      '# HELP security_policy_allowed_total Total allowed policy requests',
      '# TYPE security_policy_allowed_total counter',
      '# HELP security_policy_denied_total Total denied policy requests',
      '# TYPE security_policy_denied_total counter',
      '# HELP security_avg_auth_time_ms Average authentication time in ms',
      '# TYPE security_avg_auth_time_ms gauge',
      '# HELP security_active_sessions Current active sessions',
      '# TYPE security_active_sessions gauge',
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
