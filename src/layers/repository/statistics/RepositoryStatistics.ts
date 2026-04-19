/**
 * Repository Statistics
 * 
 * Tracks and aggregates repository operation metrics.
 */

export interface RepositoryStats {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageQueryTime: number;
  mostQueriedRepositories: Array<{ id: string; count: number }>;
  lastResetTime: number;
}

export class RepositoryStatistics {
  private _stats: RepositoryStats;
  private _queryTimes: number[];
  private _repositoryCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      mostQueriedRepositories: [],
      lastResetTime: Date.now(),
    };
    this._queryTimes = [];
    this._repositoryCounts = new Map();
  }

  /**
   * Record successful query
   */
  recordSuccess(queryTime: number, repositoryId: string): void {
    this._stats.totalQueries++;
    this._stats.successfulQueries++;
    this._queryTimes.push(queryTime);
    if (this._queryTimes.length > this.maxSamples) {
      this._queryTimes.shift();
    }
    this._stats.averageQueryTime = this._calculateAverage(this._queryTimes);
    this._recordRepository(repositoryId);
  }

  /**
   * Record failed query
   */
  recordFailure(queryTime: number): void {
    this._stats.totalQueries++;
    this._stats.failedQueries++;
    this._queryTimes.push(queryTime);
    if (this._queryTimes.length > this.maxSamples) {
      this._queryTimes.shift();
    }
    this._stats.averageQueryTime = this._calculateAverage(this._queryTimes);
  }

  private _recordRepository(repositoryId: string): void {
    const currentCount = this._repositoryCounts.get(repositoryId) || 0;
    this._repositoryCounts.set(repositoryId, currentCount + 1);
    this._updateMostQueriedRepositories();
  }

  /**
   * Get current statistics
   */
  getStats(): RepositoryStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      mostQueriedRepositories: [],
      lastResetTime: Date.now(),
    };
    this._queryTimes = [];
    this._repositoryCounts.clear();
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this._stats.totalQueries === 0) return 1.0;
    return this._stats.successfulQueries / this._stats.totalQueries;
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this._stats.totalQueries === 0) return 0;
    return this._stats.failedQueries / this._stats.totalQueries;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    queries: number;
    successful: number;
    failed: number;
    successRate: number;
    failureRate: number;
    avgQueryTime: number;
  } {
    return {
      queries: this._stats.totalQueries,
      successful: this._stats.successfulQueries,
      failed: this._stats.failedQueries,
      successRate: this.getSuccessRate() * 100,
      failureRate: this.getFailureRate() * 100,
      avgQueryTime: this._stats.averageQueryTime,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateMostQueriedRepositories(): void {
    const entries = Array.from(this._repositoryCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostQueriedRepositories = entries.slice(0, 10).map(([id, count]) => ({ id, count }));
  }
}
