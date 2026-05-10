/**
 * Circuit Breaker Helpers
 * 
 * Utility functions for circuit breaker operations.
 */

import { CircuitThreshold } from '../../domain/value-objects/CircuitThreshold';
import { CircuitMetrics } from '../../domain/value-objects/CircuitMetrics';
import { CircuitStateEntity } from '../../domain/entities/CircuitState';

export class CircuitHelper {
  /**
   * Calculate circuit health score (0-100)
   */
  static calculateHealthScore(metrics: CircuitMetrics, state: CircuitStateEntity): number {
    const successRate = metrics.getSuccessRate();
    const failureRate = metrics.getFailureRate();
    const isClosed = state.isClosed();

    let score = successRate * 100;

    if (isClosed) {
      score += 10;
    } else if (state.isOpen()) {
      score -= 30;
    } else if (state.isHalfOpen()) {
      score -= 10;
    }

    if (failureRate > 0.5) {
      score -= failureRate * 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine if circuit should be opened
   */
  static shouldOpenCircuit(metrics: CircuitMetrics, threshold: CircuitThreshold): boolean {
    return threshold.isFailureThresholdExceeded(metrics.data.failedRequests);
  }

  /**
   * Determine if circuit should be closed
   */
  static shouldCloseCircuit(metrics: CircuitMetrics, threshold: CircuitThreshold): boolean {
    return threshold.isSuccessThresholdMet(metrics.data.successfulRequests);
  }

  /**
   * Determine if circuit should attempt reset
   */
  static shouldAttemptReset(state: CircuitStateEntity, threshold: CircuitThreshold): boolean {
    if (!state.isOpen()) return false;
    const timeSinceChange = state.getTimeSinceLastChange();
    return threshold.isResetTimeoutExceeded(timeSinceChange);
  }

  /**
   * Format duration in human-readable format
   */
  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Format rate as percentage
   */
  static formatRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }

  /**
   * Calculate circuit efficiency
   */
  static calculateEfficiency(metrics: CircuitMetrics): number {
    if (metrics.data.totalRequests === 0) return 100;
    const successfulRatio = metrics.data.successfulRequests / metrics.data.totalRequests;
    return successfulRatio * 100;
  }

  /**
   * Estimate time to recovery
   */
  static estimateTimeToRecovery(
    state: CircuitStateEntity,
    threshold: CircuitThreshold,
    _metrics: CircuitMetrics,
  ): number {
    if (state.isClosed()) return 0;
    if (!state.isOpen()) return threshold.getTimeout();

    const timeSinceFailure = state.getTimeSinceLastChange();
    const remainingTime = threshold.getResetTimeout() - timeSinceFailure;

    return Math.max(0, remainingTime);
  }

  /**
   * Get circuit status summary
   */
  static getStatusSummary(
    state: CircuitStateEntity,
    metrics: CircuitMetrics,
    _threshold: CircuitThreshold,
  ): string {
    const healthScore = CircuitHelper.calculateHealthScore(metrics, state);
    const efficiency = CircuitHelper.calculateEfficiency(metrics);
    const timeInState = CircuitHelper.formatDuration(state.getTimeSinceLastChange());

    return [
      `State: ${state.currentState}`,
      `Health: ${healthScore.toFixed(1)}%`,
      `Efficiency: ${efficiency.toFixed(1)}%`,
      `Time in state: ${timeInState}`,
      `Requests: ${metrics.data.totalRequests}`,
      `Success rate: ${CircuitHelper.formatRate(metrics.getSuccessRate())}`,
    ].join(' | ');
  }
}
