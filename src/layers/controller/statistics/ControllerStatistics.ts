/**
 * Controller Statistics
 * 
 * Tracks and aggregates controller execution metrics.
 */

export interface ControllerStats {
  totalInvocations: number;
  successfulInvocations: number;
  failedInvocations: number;
  averageExecutionTime: number;
  mostInvokedControllers: Array<{ id: string; count: number }>;
  lastResetTime: number;
}

export class ControllerStatistics {
  private _stats: ControllerStats;
  private _executionTimes: number[];
  private _controllerCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalInvocations: 0,
      successfulInvocations: 0,
      failedInvocations: 0,
      averageExecutionTime: 0,
      mostInvokedControllers: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._controllerCounts = new Map();
  }

  /**
   * Record successful invocation
   */
  recordSuccess(executionTime: number, controllerId: string): void {
    this._stats.totalInvocations++;
    this._stats.successfulInvocations++;
    this._executionTimes.push(executionTime);
    if (this._executionTimes.length > this.maxSamples) {
      this._executionTimes.shift();
    }
    this._stats.averageExecutionTime = this._calculateAverage(this._executionTimes);
    this._recordController(controllerId);
  }

  /**
   * Record failed invocation
   */
  recordFailure(executionTime: number): void {
    this._stats.totalInvocations++;
    this._stats.failedInvocations++;
    this._executionTimes.push(executionTime);
    if (this._executionTimes.length > this.maxSamples) {
      this._executionTimes.shift();
    }
    this._stats.averageExecutionTime = this._calculateAverage(this._executionTimes);
  }

  private _recordController(controllerId: string): void {
    const currentCount = this._controllerCounts.get(controllerId) || 0;
    this._controllerCounts.set(controllerId, currentCount + 1);
    this._updateMostInvokedControllers();
  }

  /**
   * Get current statistics
   */
  getStats(): ControllerStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalInvocations: 0,
      successfulInvocations: 0,
      failedInvocations: 0,
      averageExecutionTime: 0,
      mostInvokedControllers: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._controllerCounts.clear();
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this._stats.totalInvocations === 0) return 1.0;
    return this._stats.successfulInvocations / this._stats.totalInvocations;
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this._stats.totalInvocations === 0) return 0;
    return this._stats.failedInvocations / this._stats.totalInvocations;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    invocations: number;
    successful: number;
    failed: number;
    successRate: number;
    failureRate: number;
    avgExecutionTime: number;
  } {
    return {
      invocations: this._stats.totalInvocations,
      successful: this._stats.successfulInvocations,
      failed: this._stats.failedInvocations,
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

  private _updateMostInvokedControllers(): void {
    const entries = Array.from(this._controllerCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostInvokedControllers = entries.slice(0, 10).map(([id, count]) => ({ id, count }));
  }
}
