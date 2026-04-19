/**
 * Rate Limit Statistics
 * 
 * Tracks and aggregates rate limiting metrics.
 */

export interface RateLimitStats {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  totalKeys: number;
  activeKeys: number;
  averageResponseTime: number;
  peakRequestsPerWindow: number;
  lastResetTime: number;
}

export class RateLimitStatistics {
  private _stats: RateLimitStats;
  private _responseTimes: number[];
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      totalKeys: 0,
      activeKeys: 0,
      averageResponseTime: 0,
      peakRequestsPerWindow: 0,
      lastResetTime: Date.now(),
    };
    this._responseTimes = [];
  }

  /**
   * Record request (allowed)
   */
  recordAllowedRequest(responseTime: number): void {
    this._stats.totalRequests++;
    this._stats.allowedRequests++;
    this._responseTimes.push(responseTime);
    if (this._responseTimes.length > this.maxSamples) {
      this._responseTimes.shift();
    }
    this._stats.averageResponseTime = this._calculateAverage(this._responseTimes);
  }

  /**
   * Record request (denied)
   */
  recordDeniedRequest(): void {
    this._stats.totalRequests++;
    this._stats.deniedRequests++;
  }

  /**
   * Increment total keys
   */
  incrementTotalKeys(): void {
    this._stats.totalKeys++;
  }

  /**
   * Decrement total keys
   */
  decrementTotalKeys(): void {
    if (this._stats.totalKeys > 0) {
      this._stats.totalKeys--;
    }
  }

  /**
   * Set active keys count
   */
  setActiveKeys(count: number): void {
    this._stats.activeKeys = count;
  }

  /**
   * Update peak requests per window
   */
  updatePeakRequests(count: number): void {
    if (count > this._stats.peakRequestsPerWindow) {
      this._stats.peakRequestsPerWindow = count;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): RateLimitStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      totalKeys: 0,
      activeKeys: 0,
      averageResponseTime: 0,
      peakRequestsPerWindow: 0,
      lastResetTime: Date.now(),
    };
    this._responseTimes = [];
  }

  /**
   * Get allow rate percentage
   */
  getAllowRate(): number {
    if (this._stats.totalRequests === 0) return 1.0;
    return this._stats.allowedRequests / this._stats.totalRequests;
  }

  /**
   * Get deny rate percentage
   */
  getDenyRate(): number {
    if (this._stats.totalRequests === 0) return 0;
    return this._stats.deniedRequests / this._stats.totalRequests;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    requests: number;
    allowed: number;
    denied: number;
    allowRate: number;
    denyRate: number;
    activeKeys: number;
    avgResponseTime: number;
  } {
    return {
      requests: this._stats.totalRequests,
      allowed: this._stats.allowedRequests,
      denied: this._stats.deniedRequests,
      allowRate: this.getAllowRate() * 100,
      denyRate: this.getDenyRate() * 100,
      activeKeys: this._stats.activeKeys,
      avgResponseTime: this._stats.averageResponseTime,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }
}
