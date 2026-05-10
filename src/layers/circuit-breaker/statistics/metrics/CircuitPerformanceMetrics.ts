/**
 * Circuit Performance Metrics
 * 
 * Tracks performance metrics for circuit breaker operations.
 */

export interface PerformanceMetrics {
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
  circuitOpenRate: number;
  averageRecoveryTime: number;
  averageFailureTime: number;
}

export class CircuitPerformanceMetrics {
  private readonly _responseTimes: number[] = [];
  private readonly _maxSamples: number;
  private _totalRequests: number;
  private _totalErrors: number;
  private _circuitOpenCount: number;
  private _circuitCloseCount: number;
  private _recoveryTimes: number[] = [];
  private _failureTimes: number[] = [];

  constructor(maxSamples: number = 1000) {
    this._maxSamples = maxSamples;
    this._totalRequests = 0;
    this._totalErrors = 0;
    this._circuitOpenCount = 0;
    this._circuitCloseCount = 0;
  }

  /**
   * Record response time
   */
  recordResponseTime(responseTime: number): void {
    this._responseTimes.push(responseTime);
    if (this._responseTimes.length > this._maxSamples) {
      this._responseTimes.shift();
    }
    this._totalRequests++;
  }

  /**
   * Record error
   */
  recordError(): void {
    this._totalErrors++;
  }

  /**
   * Record circuit open
   */
  recordCircuitOpen(): void {
    this._circuitOpenCount++;
  }

  /**
   * Record circuit close
   */
  recordCircuitClose(): void {
    this._circuitCloseCount++;
  }

  /**
   * Record recovery time
   */
  recordRecoveryTime(recoveryTime: number): void {
    this._recoveryTimes.push(recoveryTime);
    if (this._recoveryTimes.length > this._maxSamples) {
      this._recoveryTimes.shift();
    }
  }

  /**
   * Record failure time
   */
  recordFailureTime(failureTime: number): void {
    this._failureTimes.push(failureTime);
    if (this._failureTimes.length > this._maxSamples) {
      this._failureTimes.shift();
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const sortedResponseTimes = [...this._responseTimes].sort((a, b) => a - b);

    return {
      p50ResponseTime: this._calculatePercentile(sortedResponseTimes, 50),
      p95ResponseTime: this._calculatePercentile(sortedResponseTimes, 95),
      p99ResponseTime: this._calculatePercentile(sortedResponseTimes, 99),
      throughput: this._calculateThroughput(),
      errorRate: this._calculateErrorRate(),
      circuitOpenRate: this._calculateCircuitOpenRate(),
      averageRecoveryTime: this._calculateAverage(this._recoveryTimes),
      averageFailureTime: this._calculateAverage(this._failureTimes),
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this._responseTimes.length = 0;
    this._recoveryTimes.length = 0;
    this._failureTimes.length = 0;
    this._totalRequests = 0;
    this._totalErrors = 0;
    this._circuitOpenCount = 0;
    this._circuitCloseCount = 0;
  }

  private _calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] ?? 0;
  }

  private _calculateThroughput(): number {
    if (this._responseTimes.length === 0) return 0;
    return this._totalRequests / (this._responseTimes.length / 1000);
  }

  private _calculateErrorRate(): number {
    if (this._totalRequests === 0) return 0;
    return this._totalErrors / this._totalRequests;
  }

  private _calculateCircuitOpenRate(): number {
    const totalTransitions = this._circuitOpenCount + this._circuitCloseCount;
    if (totalTransitions === 0) return 0;
    return this._circuitOpenCount / totalTransitions;
  }

  private _calculateAverage(array: number[]): number {
    if (array.length === 0) return 0;
    const sum = array.reduce((acc, val) => acc + val, 0);
    return sum / array.length;
  }
}
