/**
 * Security Statistics
 * 
 * Tracks and aggregates security-related metrics.
 */

import { ThreatType } from '../types/security-types';

export interface SecurityStats {
  totalAuthentications: number;
  successfulAuthentications: number;
  failedAuthentications: number;
  totalThreatsDetected: number;
  threatsByType: Map<ThreatType, number>;
  totalPolicyEvaluations: number;
  allowedRequests: number;
  deniedRequests: number;
  averageAuthenticationTime: number;
  lastThreatTime: number;
  activeSessions: number;
}

export class SecurityStatistics {
  private _stats: SecurityStats;
  private _authTimes: number[];
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalAuthentications: 0,
      successfulAuthentications: 0,
      failedAuthentications: 0,
      totalThreatsDetected: 0,
      threatsByType: new Map(),
      totalPolicyEvaluations: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      averageAuthenticationTime: 0,
      lastThreatTime: 0,
      activeSessions: 0,
    };
    this._authTimes = [];
  }

  /**
   * Record successful authentication
   */
  recordSuccessfulAuthentication(authTime: number): void {
    this._stats.totalAuthentications++;
    this._stats.successfulAuthentications++;
    this._authTimes.push(authTime);
    if (this._authTimes.length > this.maxSamples) {
      this._authTimes.shift();
    }
    this._stats.averageAuthenticationTime = this._calculateAverage(this._authTimes);
  }

  /**
   * Record failed authentication
   */
  recordFailedAuthentication(): void {
    this._stats.totalAuthentications++;
    this._stats.failedAuthentications++;
  }

  /**
   * Record detected threat
   */
  recordThreat(threatType: ThreatType): void {
    this._stats.totalThreatsDetected++;
    this._stats.lastThreatTime = Date.now();
    const currentCount = this._stats.threatsByType.get(threatType) || 0;
    this._stats.threatsByType.set(threatType, currentCount + 1);
  }

  /**
   * Record policy evaluation
   */
  recordPolicyEvaluation(allowed: boolean): void {
    this._stats.totalPolicyEvaluations++;
    if (allowed) {
      this._stats.allowedRequests++;
    } else {
      this._stats.deniedRequests++;
    }
  }

  /**
   * Increment active sessions
   */
  incrementActiveSessions(): void {
    this._stats.activeSessions++;
  }

  /**
   * Decrement active sessions
   */
  decrementActiveSessions(): void {
    if (this._stats.activeSessions > 0) {
      this._stats.activeSessions--;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): SecurityStats {
    return {
      ...this._stats,
      threatsByType: new Map(this._stats.threatsByType),
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalAuthentications: 0,
      successfulAuthentications: 0,
      failedAuthentications: 0,
      totalThreatsDetected: 0,
      threatsByType: new Map(),
      totalPolicyEvaluations: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      averageAuthenticationTime: 0,
      lastThreatTime: 0,
      activeSessions: 0,
    };
    this._authTimes = [];
  }

  /**
   * Get authentication success rate
   */
  getAuthenticationSuccessRate(): number {
    if (this._stats.totalAuthentications === 0) return 1.0;
    return this._stats.successfulAuthentications / this._stats.totalAuthentications;
  }

  /**
   * Get authentication failure rate
   */
  getAuthenticationFailureRate(): number {
    if (this._stats.totalAuthentications === 0) return 0;
    return this._stats.failedAuthentications / this._stats.totalAuthentications;
  }

  /**
   * Get policy allow rate
   */
  getPolicyAllowRate(): number {
    if (this._stats.totalPolicyEvaluations === 0) return 1.0;
    return this._stats.allowedRequests / this._stats.totalPolicyEvaluations;
  }

  /**
   * Get policy deny rate
   */
  getPolicyDenyRate(): number {
    if (this._stats.totalPolicyEvaluations === 0) return 0;
    return this._stats.deniedRequests / this._stats.totalPolicyEvaluations;
  }

  /**
   * Get threat count by type
   */
  getThreatCountByType(threatType: ThreatType): number {
    return this._stats.threatsByType.get(threatType) || 0;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    authentications: number;
    successRate: number;
    failureRate: number;
    threats: number;
    allowRate: number;
    denyRate: number;
    activeSessions: number;
  } {
    return {
      authentications: this._stats.totalAuthentications,
      successRate: this.getAuthenticationSuccessRate() * 100,
      failureRate: this.getAuthenticationFailureRate() * 100,
      threats: this._stats.totalThreatsDetected,
      allowRate: this.getPolicyAllowRate() * 100,
      denyRate: this.getPolicyDenyRate() * 100,
      activeSessions: this._stats.activeSessions,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }
}
