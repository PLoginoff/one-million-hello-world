/**
 * Router Statistics
 * 
 * Tracks and aggregates routing metrics.
 */

export interface RouterStats {
  totalRequests: number;
  successfulRoutes: number;
  failedRoutes: number;
  averageRoutingTime: number;
  mostRequestedPaths: Array<{ path: string; count: number }>;
  mostRequestedMethods: Array<{ method: string; count: number }>;
  lastResetTime: number;
}

export class RouterStatistics {
  private _stats: RouterStats;
  private _routingTimes: number[];
  private _pathCounts: Map<string, number>;
  private _methodCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalRequests: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      averageRoutingTime: 0,
      mostRequestedPaths: [],
      mostRequestedMethods: [],
      lastResetTime: Date.now(),
    };
    this._routingTimes = [];
    this._pathCounts = new Map();
    this._methodCounts = new Map();
  }

  /**
   * Record successful route
   */
  recordSuccess(routingTime: number, path: string, method: string): void {
    this._stats.totalRequests++;
    this._stats.successfulRoutes++;
    this._routingTimes.push(routingTime);
    if (this._routingTimes.length > this.maxSamples) {
      this._routingTimes.shift();
    }
    this._stats.averageRoutingTime = this._calculateAverage(this._routingTimes);
    this._recordPath(path);
    this._recordMethod(method);
  }

  /**
   * Record failed route
   */
  recordFailure(routingTime: number): void {
    this._stats.totalRequests++;
    this._stats.failedRoutes++;
    this._routingTimes.push(routingTime);
    if (this._routingTimes.length > this.maxSamples) {
      this._routingTimes.shift();
    }
    this._stats.averageRoutingTime = this._calculateAverage(this._routingTimes);
  }

  private _recordPath(path: string): void {
    const currentCount = this._pathCounts.get(path) || 0;
    this._pathCounts.set(path, currentCount + 1);
    this._updateMostRequestedPaths();
  }

  private _recordMethod(method: string): void {
    const currentCount = this._methodCounts.get(method) || 0;
    this._methodCounts.set(method, currentCount + 1);
    this._updateMostRequestedMethods();
  }

  /**
   * Get current statistics
   */
  getStats(): RouterStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalRequests: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      averageRoutingTime: 0,
      mostRequestedPaths: [],
      mostRequestedMethods: [],
      lastResetTime: Date.now(),
    };
    this._routingTimes = [];
    this._pathCounts.clear();
    this._methodCounts.clear();
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this._stats.totalRequests === 0) return 1.0;
    return this._stats.successfulRoutes / this._stats.totalRequests;
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this._stats.totalRequests === 0) return 0;
    return this._stats.failedRoutes / this._stats.totalRequests;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    requests: number;
    successful: number;
    failed: number;
    successRate: number;
    failureRate: number;
    avgRoutingTime: number;
  } {
    return {
      requests: this._stats.totalRequests,
      successful: this._stats.successfulRoutes,
      failed: this._stats.failedRoutes,
      successRate: this.getSuccessRate() * 100,
      failureRate: this.getFailureRate() * 100,
      avgRoutingTime: this._stats.averageRoutingTime,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateMostRequestedPaths(): void {
    const entries = Array.from(this._pathCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostRequestedPaths = entries.slice(0, 10).map(([path, count]) => ({ path, count }));
  }

  private _updateMostRequestedMethods(): void {
    const entries = Array.from(this._methodCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostRequestedMethods = entries.slice(0, 10).map(([method, count]) => ({ method, count }));
  }
}
