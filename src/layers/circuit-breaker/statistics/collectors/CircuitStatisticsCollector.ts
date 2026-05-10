/**
 * Circuit Statistics Collector
 * 
 * Collects and aggregates circuit breaker statistics.
 */

import { CircuitMetrics } from '../../domain/value-objects/CircuitMetrics';
import { CircuitStateEntity } from '../../domain/entities/CircuitState';

export interface CircuitStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  successRate: number;
  failureRate: number;
  rejectionRate: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  stateTransitions: number;
  currentState: string;
  timeInCurrentState: number;
  uptime: number;
  downtime: number;
}

export class CircuitStatisticsCollector {
  private readonly _metrics: CircuitMetrics;
  private readonly _state: CircuitStateEntity;
  private readonly _startTime: number;
  private _lastStateChangeTime: number;
  private _totalDowntime: number;

  constructor(metrics: CircuitMetrics, state: CircuitStateEntity) {
    this._metrics = metrics;
    this._state = state;
    this._startTime = Date.now();
    this._lastStateChangeTime = state.metadata.lastStateChangedAt;
    this._totalDowntime = 0;
  }

  /**
   * Get current statistics
   */
  getStatistics(): CircuitStatistics {
    const currentTime = Date.now();
    const isCircuitOpen = this._state.isOpen();

    if (isCircuitOpen) {
      this._totalDowntime += currentTime - this._lastStateChangeTime;
    }

    this._lastStateChangeTime = currentTime;

    return {
      totalRequests: this._metrics.data.totalRequests,
      successfulRequests: this._metrics.data.successfulRequests,
      failedRequests: this._metrics.data.failedRequests,
      rejectedRequests: this._metrics.data.rejectedRequests,
      successRate: this._metrics.getSuccessRate(),
      failureRate: this._metrics.getFailureRate(),
      rejectionRate: this._metrics.getRejectionRate(),
      averageResponseTime: this._metrics.data.averageResponseTime,
      minResponseTime:
        this._metrics.data.minResponseTime === Infinity ? 0 : this._metrics.data.minResponseTime,
      maxResponseTime: this._metrics.data.maxResponseTime,
      stateTransitions: this._state.getTransitionCount(),
      currentState: this._state.currentState,
      timeInCurrentState: this._state.getTimeSinceLastChange(currentTime),
      uptime: this._calculateUptime(currentTime),
      downtime: this._totalDowntime,
    };
  }

  /**
   * Get statistics as JSON
   */
  getStatisticsAsJson(): string {
    return JSON.stringify(this.getStatistics(), null, 2);
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._totalDowntime = 0;
  }

  /**
   * Update metrics
   */
  updateMetrics(metrics: CircuitMetrics): void {
    (this._metrics as any) = metrics;
  }

  /**
   * Update state
   */
  updateState(state: CircuitStateEntity): void {
    const currentTime = Date.now();
    if (this._state.isOpen()) {
      this._totalDowntime += currentTime - this._lastStateChangeTime;
    }
    (this._state as any) = state;
    this._lastStateChangeTime = currentTime;
  }

  private _calculateUptime(currentTime: number): number {
    const totalRuntime = currentTime - this._startTime;
    return totalRuntime - this._totalDowntime;
  }
}
