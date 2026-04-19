/**
 * Parser Statistics
 * 
 * Tracks and aggregates HTTP parser performance metrics.
 */

import { ParseErrorCode } from '../types/http-parser-types';

export interface ParserStats {
  totalRequestsParsed: number;
  totalResponsesParsed: number;
  totalBytesParsed: number;
  totalHeadersParsed: number;
  totalBodiesParsed: number;
  averageParseTime: number;
  averageRequestParseTime: number;
  averageResponseParseTime: number;
  errorCount: number;
  lastParseTime: number;
  parseErrors: Map<ParseErrorCode, number>;
  successRate: number;
}

export class ParserStatistics {
  private _stats: ParserStats;
  private _requestParseTimes: number[];
  private _responseParseTimes: number[];
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalRequestsParsed: 0,
      totalResponsesParsed: 0,
      totalBytesParsed: 0,
      totalHeadersParsed: 0,
      totalBodiesParsed: 0,
      averageParseTime: 0,
      averageRequestParseTime: 0,
      averageResponseParseTime: 0,
      errorCount: 0,
      lastParseTime: 0,
      parseErrors: new Map(),
      successRate: 1.0,
    };
    this._requestParseTimes = [];
    this._responseParseTimes = [];
  }

  /**
   * Record a successful request parse
   */
  recordRequestParse(bytes: number, headers: number, bodySize: number, parseTime: number): void {
    this._stats.totalRequestsParsed++;
    this._stats.totalBytesParsed += bytes;
    this._stats.totalHeadersParsed += headers;
    this._stats.totalBodiesParsed += bodySize;
    this._stats.lastParseTime = Date.now();

    this._requestParseTimes.push(parseTime);
    if (this._requestParseTimes.length > this.maxSamples) {
      this._requestParseTimes.shift();
    }

    this._stats.averageRequestParseTime = this._calculateAverage(this._requestParseTimes);
    this._updateOverallAverage();
    this._updateSuccessRate();
  }

  /**
   * Record a successful response parse
   */
  recordResponseParse(bytes: number, headers: number, bodySize: number, parseTime: number): void {
    this._stats.totalResponsesParsed++;
    this._stats.totalBytesParsed += bytes;
    this._stats.totalHeadersParsed += headers;
    this._stats.totalBodiesParsed += bodySize;
    this._stats.lastParseTime = Date.now();

    this._responseParseTimes.push(parseTime);
    if (this._responseParseTimes.length > this.maxSamples) {
      this._responseParseTimes.shift();
    }

    this._stats.averageResponseParseTime = this._calculateAverage(this._responseParseTimes);
    this._updateOverallAverage();
    this._updateSuccessRate();
  }

  /**
   * Record a parse error
   */
  recordError(errorCode: ParseErrorCode): void {
    this._stats.errorCount++;
    const currentCount = this._stats.parseErrors.get(errorCode) || 0;
    this._stats.parseErrors.set(errorCode, currentCount + 1);
    this._updateSuccessRate();
  }

  /**
   * Get current statistics
   */
  getStats(): ParserStats {
    return {
      ...this._stats,
      parseErrors: new Map(this._stats.parseErrors),
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalRequestsParsed: 0,
      totalResponsesParsed: 0,
      totalBytesParsed: 0,
      totalHeadersParsed: 0,
      totalBodiesParsed: 0,
      averageParseTime: 0,
      averageRequestParseTime: 0,
      averageResponseParseTime: 0,
      errorCount: 0,
      lastParseTime: 0,
      parseErrors: new Map(),
      successRate: 1.0,
    };
    this._requestParseTimes = [];
    this._responseParseTimes = [];
  }

  /**
   * Get error rate as percentage
   */
  getErrorRate(): number {
    const total = this._stats.totalRequestsParsed + this._stats.totalResponsesParsed + this._stats.errorCount;
    if (total === 0) return 0;
    return (this._stats.errorCount / total) * 100;
  }

  /**
   * Get throughput in bytes per second
   */
  getThroughput(): number {
    if (this._stats.averageParseTime === 0) return 0;
    return (this._stats.totalBytesParsed / this._stats.averageParseTime) * 1000;
  }

  /**
   * Get requests per second
   */
  getRequestsPerSecond(): number {
    if (this._stats.averageRequestParseTime === 0) return 0;
    return (this._stats.totalRequestsParsed / this._stats.averageRequestParseTime) * 1000;
  }

  /**
   * Get responses per second
   */
  getResponsesPerSecond(): number {
    if (this._stats.averageResponseParseTime === 0) return 0;
    return (this._stats.totalResponsesParsed / this._stats.averageResponseParseTime) * 1000;
  }

  /**
   * Get percentile of request parse times
   */
  getRequestParsePercentile(percentile: number): number {
    if (this._requestParseTimes.length === 0) return 0;
    const sorted = [...this._requestParseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get percentile of response parse times
   */
  getResponseParsePercentile(percentile: number): number {
    if (this._responseParseTimes.length === 0) return 0;
    const sorted = [...this._responseParseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalParses: number;
    successRate: number;
    errorRate: number;
    averageParseTime: number;
    p50: number;
    p95: number;
    p99: number;
    throughput: number;
  } {
    const allTimes = [...this._requestParseTimes, ...this._responseParseTimes];
    const sorted = allTimes.sort((a, b) => a - b);

    return {
      totalParses: this._stats.totalRequestsParsed + this._stats.totalResponsesParsed,
      successRate: this._stats.successRate * 100,
      errorRate: this.getErrorRate(),
      averageParseTime: this._stats.averageParseTime,
      p50: this._getPercentile(sorted, 50),
      p95: this._getPercentile(sorted, 95),
      p99: this._getPercentile(sorted, 99),
      throughput: this.getThroughput(),
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateOverallAverage(): void {
    const allTimes = [...this._requestParseTimes, ...this._responseParseTimes];
    this._stats.averageParseTime = this._calculateAverage(allTimes);
  }

  private _updateSuccessRate(): void {
    const total = this._stats.totalRequestsParsed + this._stats.totalResponsesParsed + this._stats.errorCount;
    if (total === 0) {
      this._stats.successRate = 1.0;
      return;
    }
    const successful = this._stats.totalRequestsParsed + this._stats.totalResponsesParsed;
    this._stats.successRate = successful / total;
  }

  private _getPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
