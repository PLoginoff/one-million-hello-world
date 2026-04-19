/**
 * Connection Statistics Service
 * 
 * Domain service for calculating and aggregating connection statistics.
 */

import { ConnectionMetadata } from '../entities/ConnectionMetadata';

export interface ConnectionStatistics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  errorConnections: number;
  averageAge: number;
  averageIdleTime: number;
  totalBytesTransferred: number;
  totalRequests: number;
  totalResponses: number;
  totalErrors: number;
  averageErrorRate: number;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
}

export class ConnectionStatisticsService {
  /**
   * Calculate statistics from connection metadata
   */
  static calculateStatistics(metadataList: ConnectionMetadata[]): ConnectionStatistics {
    if (metadataList.length === 0) {
      return ConnectionStatisticsService.getEmptyStatistics();
    }

    const idleThreshold = 300000;

    let totalAge = 0;
    let totalIdleTime = 0;
    let totalBytesTransferred = 0;
    let totalRequests = 0;
    let totalResponses = 0;
    let totalErrors = 0;
    let activeCount = 0;
    let idleCount = 0;
    let errorCount = 0;

    for (const metadata of metadataList) {
      totalAge += metadata.getAge();
      totalIdleTime += metadata.getIdleTime();
      totalBytesTransferred += metadata.getTotalBytes();
      totalRequests += metadata.requestCount;
      totalResponses += metadata.responseCount;
      totalErrors += metadata.errorCount;

      if (metadata.isIdle(idleThreshold)) {
        idleCount++;
      } else {
        activeCount++;
      }

      if (metadata.errorCount > 0) {
        errorCount++;
      }
    }

    const averageAge = totalAge / metadataList.length;
    const averageIdleTime = totalIdleTime / metadataList.length;
    const totalOperations = totalRequests + totalResponses;
    const averageErrorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;

    return {
      totalConnections: metadataList.length,
      activeConnections: activeCount,
      idleConnections: idleCount,
      errorConnections: errorCount,
      averageAge,
      averageIdleTime,
      totalBytesTransferred,
      totalRequests,
      totalResponses,
      totalErrors,
      averageErrorRate,
    };
  }

  /**
   * Calculate throughput statistics
   */
  static calculateThroughput(
    metadata: ConnectionMetadata,
    timeWindow: number,
  ): number {
    const bytes = metadata.getTotalBytes();
    const age = Math.min(metadata.getAge(), timeWindow);
    return age > 0 ? (bytes / age) * 1000 : 0;
  }

  /**
   * Calculate request rate
   */
  static calculateRequestRate(
    metadata: ConnectionMetadata,
    timeWindow: number,
  ): number {
    const requests = metadata.requestCount;
    const age = Math.min(metadata.getAge(), timeWindow);
    return age > 0 ? (requests / age) * 1000 : 0;
  }

  /**
   * Calculate response rate
   */
  static calculateResponseRate(
    metadata: ConnectionMetadata,
    timeWindow: number,
  ): number {
    const responses = metadata.responseCount;
    const age = Math.min(metadata.getAge(), timeWindow);
    return age > 0 ? (responses / age) * 1000 : 0;
  }

  /**
   * Generate time series data for a metric
   */
  static generateTimeSeries(
    samples: number[],
    interval: number,
    startTime: number = Date.now(),
  ): TimeSeriesData[] {
    const data: TimeSeriesData[] = [];
    for (let i = 0; i < samples.length; i++) {
      data.push({
        timestamp: startTime + i * interval,
        value: samples[i] ?? 0,
      });
    }
    return data;
  }

  /**
   * Calculate moving average
   */
  static calculateMovingAverage(
    data: TimeSeriesData[],
    windowSize: number,
  ): TimeSeriesData[] {
    if (data.length === 0 || windowSize <= 0) return [];

    const result: TimeSeriesData[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = data.slice(start, i + 1);
      const sum = window.reduce((acc, d) => acc + d.value, 0);
      const average = sum / window.length;
      result.push({
        timestamp: data[i].timestamp,
        value: average,
      });
    }
    return result;
  }

  /**
   * Calculate percentile
   */
  static calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /**
   * Calculate statistics for a numeric array
   */
  static calculateNumericStats(values: number[]): {
    min: number;
    max: number;
    average: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { min: 0, max: 0, average: 0, median: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const average = sum / values.length;
    const median = this.calculatePercentile(values, 50);
    const p95 = this.calculatePercentile(values, 95);
    const p99 = this.calculatePercentile(values, 99);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      average,
      median,
      p95,
      p99,
    };
  }

  /**
   * Get empty statistics
   */
  private static getEmptyStatistics(): ConnectionStatistics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      errorConnections: 0,
      averageAge: 0,
      averageIdleTime: 0,
      totalBytesTransferred: 0,
      totalRequests: 0,
      totalResponses: 0,
      totalErrors: 0,
      averageErrorRate: 0,
    };
  }
}
