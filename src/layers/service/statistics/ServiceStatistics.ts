/**
 * Service Statistics
 * 
 * Tracks and aggregates service execution metrics.
 */

export interface ServiceStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  mostExecutedServices: Array<{ id: string; count: number }>;
  lastResetTime: number;
}

export class ServiceStatistics {
  private _stats: ServiceStats;
  private _executionTimes: number[];
  private _serviceCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      mostExecutedServices: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._serviceCounts = new Map();
  }

  /**
   * Record successful execution
   */
  recordSuccess(executionTime: number, serviceId: string): void {
    this._stats.totalExecutions++;
    this._stats.successfulExecutions++;
    this._executionTimes.push(executionTime);
    if (this._executionTimes.length > this.maxSamples) {
      this._executionTimes.shift();
    }
    this._stats.averageExecutionTime = this._calculateAverage(this._executionTimes);
    this._recordService(serviceId);
  }

  /**
   * Record failed execution
   */
  recordFailure(executionTime: number): void {
    this._stats.totalExecutions++;
    this._stats.failedExecutions++;
    this._executionTimes.push(executionTime);
    if (this._executionTimes.length > this.maxSamples) {
      this._executionTimes.shift();
    }
    this._stats.averageExecutionTime = this._calculateAverage(this._executionTimes);
  }

  private _recordService(serviceId: string): void {
    const currentCount = this._serviceCounts.get(serviceId) || 0;
    this._serviceCounts.set(serviceId, currentCount + 1);
    this._updateMostExecutedServices();
  }

  /**
   * Get current statistics
   */
  getStats(): ServiceStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      mostExecutedServices: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._serviceCounts.clear();
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this._stats.totalExecutions === 0) return 1.0;
    return this._stats.successfulExecutions / this._stats.totalExecutions;
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this._stats.totalExecutions === 0) return 0;
    return this._stats.failedExecutions / this._stats.totalExecutions;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    executions: number;
    successful: number;
    failed: number;
    successRate: number;
    failureRate: number;
    avgExecutionTime: number;
  } {
    return {
      executions: this._stats.totalExecutions,
      successful: this._stats.successfulExecutions,
      failed: this._stats.failedExecutions,
      successRate: this.getSuccessRate() * 100,
      failureRate: this.getFailureRate() * 100,
      avgExecutionTime: this._stats.averageExecutionTime,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateMostExecutedServices(): void {
    const entries = Array.from(this._serviceCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostExecutedServices = entries.slice(0, 10).map(([id, count]) => ({ id, count }));
  }
}
