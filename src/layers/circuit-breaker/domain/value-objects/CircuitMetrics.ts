/**
 * Circuit Metrics Value Object
 * 
 * Represents circuit breaker metrics and performance data.
 * Immutable value object for tracking circuit performance.
 */

export interface CircuitMetricsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  lastResetAt: number;
}

export class CircuitMetrics {
  readonly data: CircuitMetricsData;

  constructor(data?: Partial<CircuitMetricsData>) {
    this.data = {
      totalRequests: data?.totalRequests || 0,
      successfulRequests: data?.successfulRequests || 0,
      failedRequests: data?.failedRequests || 0,
      rejectedRequests: data?.rejectedRequests || 0,
      averageResponseTime: data?.averageResponseTime || 0,
      minResponseTime: data?.minResponseTime || Infinity,
      maxResponseTime: data?.maxResponseTime || 0,
      lastResetAt: data?.lastResetAt || Date.now(),
    };
  }

  /**
   * Get success rate (0-1)
   */
  getSuccessRate(): number {
    if (this.data.totalRequests === 0) return 1;
    return this.data.successfulRequests / this.data.totalRequests;
  }

  /**
   * Get failure rate (0-1)
   */
  getFailureRate(): number {
    if (this.data.totalRequests === 0) return 0;
    return this.data.failedRequests / this.data.totalRequests;
  }

  /**
   * Get rejection rate (0-1)
   */
  getRejectionRate(): number {
    if (this.data.totalRequests === 0) return 0;
    return this.data.rejectedRequests / this.data.totalRequests;
  }

  /**
   * Check if metrics indicate healthy circuit
   */
  isHealthy(threshold: number = 0.5): boolean {
    return this.getSuccessRate() >= threshold;
  }

  /**
   * Record successful request
   */
  recordSuccess(responseTime: number): CircuitMetrics {
    const newTotal = this.data.totalRequests + 1;
    const newSuccessful = this.data.successfulRequests + 1;
    const newAvg = this._calculateNewAverage(this.data.averageResponseTime, responseTime, newTotal);
    const newMin = Math.min(this.data.minResponseTime, responseTime);
    const newMax = Math.max(this.data.maxResponseTime, responseTime);

    return new CircuitMetrics({
      ...this.data,
      totalRequests: newTotal,
      successfulRequests: newSuccessful,
      averageResponseTime: newAvg,
      minResponseTime: newMin,
      maxResponseTime: newMax,
    });
  }

  /**
   * Record failed request
   */
  recordFailure(responseTime: number): CircuitMetrics {
    const newTotal = this.data.totalRequests + 1;
    const newFailed = this.data.failedRequests + 1;
    const newAvg = this._calculateNewAverage(this.data.averageResponseTime, responseTime, newTotal);
    const newMin = Math.min(this.data.minResponseTime, responseTime);
    const newMax = Math.max(this.data.maxResponseTime, responseTime);

    return new CircuitMetrics({
      ...this.data,
      totalRequests: newTotal,
      failedRequests: newFailed,
      averageResponseTime: newAvg,
      minResponseTime: newMin,
      maxResponseTime: newMax,
    });
  }

  /**
   * Record rejected request
   */
  recordRejection(): CircuitMetrics {
    return new CircuitMetrics({
      ...this.data,
      totalRequests: this.data.totalRequests + 1,
      rejectedRequests: this.data.rejectedRequests + 1,
    });
  }

  /**
   * Reset metrics
   */
  reset(): CircuitMetrics {
    return new CircuitMetrics({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      lastResetAt: Date.now(),
    });
  }

  /**
   * Get time since last reset
   */
  getTimeSinceReset(currentTime: number = Date.now()): number {
    return currentTime - this.data.lastResetAt;
  }

  private _calculateNewAverage(currentAvg: number, newValue: number, count: number): number {
    if (count === 0) return newValue;
    return currentAvg + (newValue - currentAvg) / count;
  }
}
