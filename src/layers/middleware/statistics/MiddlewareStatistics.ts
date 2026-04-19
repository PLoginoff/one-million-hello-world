/**
 * Middleware Statistics
 * 
 * Tracks and aggregates middleware execution metrics.
 */

export interface MiddlewareStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  totalMiddlewareInvoked: number;
  mostExecutedMiddlewares: Array<{ id: string; count: number }>;
  lastResetTime: number;
}

export class MiddlewareStatistics {
  private _stats: MiddlewareStats;
  private _executionTimes: number[];
  private _middlewareCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      totalMiddlewareInvoked: 0,
      mostExecutedMiddlewares: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._middlewareCounts = new Map();
  }

  /**
   * Record successful execution
   */
  recordSuccess(executionTime: number): void {
    this._stats.totalExecutions++;
    this._stats.successfulExecutions++;
    this._executionTimes.push(executionTime);
    if (this._executionTimes.length > this.maxSamples) {
      this._executionTimes.shift();
    }
    this._stats.averageExecutionTime = this._calculateAverage(this._executionTimes);
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

  /**
   * Record middleware invocation
   */
  recordMiddlewareInvocation(middlewareId: string): void {
    const currentCount = this._middlewareCounts.get(middlewareId) || 0;
    this._middlewareCounts.set(middlewareId, currentCount + 1);
    this._stats.totalMiddlewareInvoked++;
    this._updateMostExecutedMiddlewares();
  }

  /**
   * Get current statistics
   */
  getStats(): MiddlewareStats {
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
      totalMiddlewareInvoked: 0,
      mostExecutedMiddlewares: [],
      lastResetTime: Date.now(),
    };
    this._executionTimes = [];
    this._middlewareCounts.clear();
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
    middlewareInvoked: number;
  } {
    return {
      executions: this._stats.totalExecutions,
      successful: this._stats.successfulExecutions,
      failed: this._stats.failedExecutions,
      successRate: this.getSuccessRate() * 100,
      failureRate: this.getFailureRate() * 100,
      avgExecutionTime: this._stats.averageExecutionTime,
      middlewareInvoked: this._stats.totalMiddlewareInvoked,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateMostExecutedMiddlewares(): void {
    const entries = Array.from(this._middlewareCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostExecutedMiddlewares = entries.slice(0, 10).map(([id, count]) => ({ id, count }));
  }
}
