/**
 * Network Health Service
 * 
 * Domain service for monitoring and assessing network health.
 */

import { ConnectionState } from '../value-objects/ConnectionState';
import { ConnectionMetadata } from '../entities/ConnectionMetadata';

export interface HealthMetrics {
  score: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  value: number;
  threshold: number;
}

export class NetworkHealthService {
  private static readonly HEALTHY_THRESHOLD = 80;
  private static readonly DEGRADED_THRESHOLD = 50;

  /**
   * Calculate overall health score from individual checks
   */
  static calculateHealthScore(checks: HealthCheck[]): number {
    if (checks.length === 0) return 100;

    let totalScore = 0;
    let weightSum = 0;

    for (const check of checks) {
      const weight = this.getCheckWeight(check.name);
      const checkScore = this.getCheckScore(check);
      totalScore += checkScore * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? Math.round(totalScore / weightSum) : 100;
  }

  /**
   * Determine health status from score
   */
  static determineHealthStatus(score: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (score >= this.HEALTHY_THRESHOLD) {
      return 'healthy';
    } else if (score >= this.DEGRADED_THRESHOLD) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  /**
   * Check connection latency health
   */
  static checkLatencyHealth(latency: number, threshold: number = 1000): HealthCheck {
    const status = latency < threshold ? 'pass' : latency < threshold * 2 ? 'warn' : 'fail';
    return {
      name: 'latency',
      status,
      message: `Current latency: ${latency}ms, threshold: ${threshold}ms`,
      value: latency,
      threshold,
    };
  }

  /**
   * Check error rate health
   */
  static checkErrorRateHealth(errorRate: number, threshold: number = 0.1): HealthCheck {
    const status = errorRate < threshold ? 'pass' : errorRate < threshold * 2 ? 'warn' : 'fail';
    return {
      name: 'error_rate',
      status,
      message: `Error rate: ${(errorRate * 100).toFixed(2)}%, threshold: ${(threshold * 100).toFixed(2)}%`,
      value: errorRate,
      threshold,
    };
  }

  /**
   * Check connection count health
   */
  static checkConnectionCountHealth(
    current: number,
    max: number,
    threshold: number = 0.9,
  ): HealthCheck {
    const ratio = current / max;
    const status = ratio < threshold ? 'pass' : ratio < threshold * 1.1 ? 'warn' : 'fail';
    return {
      name: 'connection_count',
      status,
      message: `Connections: ${current}/${max} (${(ratio * 100).toFixed(1)}%)`,
      value: ratio,
      threshold,
    };
  }

  /**
   * Check throughput health
   */
  static checkThroughputHealth(
    throughput: number,
    expected: number,
    threshold: number = 0.5,
  ): HealthCheck {
    const ratio = expected > 0 ? throughput / expected : 1;
    const status = ratio >= threshold ? 'pass' : ratio >= threshold * 0.5 ? 'warn' : 'fail';
    return {
      name: 'throughput',
      status,
      message: `Throughput: ${throughput} bytes/s, expected: ${expected} bytes/s (${(ratio * 100).toFixed(1)}%)`,
      value: ratio,
      threshold,
    };
  }

  /**
   * Check packet loss health
   */
  static checkPacketLossHealth(packetLoss: number, threshold: number = 0.01): HealthCheck {
    const status = packetLoss < threshold ? 'pass' : packetLoss < threshold * 2 ? 'warn' : 'fail';
    return {
      name: 'packet_loss',
      status,
      message: `Packet loss: ${(packetLoss * 100).toFixed(2)}%, threshold: ${(threshold * 100).toFixed(2)}%`,
      value: packetLoss,
      threshold,
    };
  }

  /**
   * Check connection state health
   */
  static checkConnectionStateHealth(state: ConnectionState): HealthCheck {
    const status = state.isActive() ? 'pass' : state.isDisconnected() ? 'warn' : 'fail';
    return {
      name: 'connection_state',
      status,
      message: `Connection state: ${state.toString()}`,
      value: state.isActive() ? 1 : 0,
      threshold: 1,
    };
  }

  /**
   * Assess connection metadata health
   */
  static assessMetadataHealth(metadata: ConnectionMetadata): HealthCheck[] {
    const checks: HealthCheck[] = [];

    const errorRate = metadata.getErrorRate();
    checks.push(this.checkErrorRateHealth(errorRate));

    const idleTime = metadata.getIdleTime();
    const idleThreshold = 300000; // 5 minutes
    const idleStatus = idleTime < idleThreshold ? 'pass' : idleTime < idleThreshold * 2 ? 'warn' : 'fail';
    checks.push({
      name: 'idle_time',
      status: idleStatus,
      message: `Idle time: ${idleTime}ms, threshold: ${idleThreshold}ms`,
      value: idleTime,
      threshold: idleThreshold,
    });

    const age = metadata.getAge();
    const ageThreshold = 3600000; // 1 hour
    const ageStatus = age < ageThreshold ? 'pass' : age < ageThreshold * 2 ? 'warn' : 'fail';
    checks.push({
      name: 'connection_age',
      status: ageStatus,
      message: `Connection age: ${age}ms, threshold: ${ageThreshold}ms`,
      value: age,
      threshold: ageThreshold,
    });

    return checks;
  }

  /**
   * Calculate overall health metrics
   */
  static calculateOverallHealth(checks: HealthCheck[]): HealthMetrics {
    const score = this.calculateHealthScore(checks);
    const status = this.determineHealthStatus(score);

    return {
      score,
      status,
      checks,
    };
  }

  /**
   * Get weight for health check
   */
  private static getCheckWeight(name: string): number {
    const weights: Record<string, number> = {
      latency: 30,
      error_rate: 25,
      connection_count: 20,
      throughput: 15,
      packet_loss: 10,
      connection_state: 20,
      idle_time: 5,
      connection_age: 5,
    };
    return weights[name] || 10;
  }

  /**
   * Get score for individual health check
   */
  private static getCheckScore(check: HealthCheck): number {
    if (check.status === 'pass') return 100;
    if (check.status === 'warn') return 50;
    return 0;
  }
}
