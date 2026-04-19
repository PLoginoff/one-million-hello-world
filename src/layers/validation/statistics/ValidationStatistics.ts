/**
 * Validation Statistics
 * 
 * Tracks and aggregates validation metrics.
 */

export interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  totalErrors: number;
  totalWarnings: number;
  averageValidationTime: number;
  mostValidatedFields: Array<{ field: string; count: number }>;
  lastResetTime: number;
}

export class ValidationStatistics {
  private _stats: ValidationStats;
  private _validationTimes: number[];
  private _fieldCounts: Map<string, number>;
  private readonly maxSamples: number = 1000;

  constructor() {
    this._stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      totalErrors: 0,
      totalWarnings: 0,
      averageValidationTime: 0,
      mostValidatedFields: [],
      lastResetTime: Date.now(),
    };
    this._validationTimes = [];
    this._fieldCounts = new Map();
  }

  /**
   * Record successful validation
   */
  recordSuccess(validationTime: number): void {
    this._stats.totalValidations++;
    this._stats.successfulValidations++;
    this._validationTimes.push(validationTime);
    if (this._validationTimes.length > this.maxSamples) {
      this._validationTimes.shift();
    }
    this._stats.averageValidationTime = this._calculateAverage(this._validationTimes);
  }

  /**
   * Record failed validation
   */
  recordFailure(errorCount: number, warningCount: number, validationTime: number): void {
    this._stats.totalValidations++;
    this._stats.failedValidations++;
    this._stats.totalErrors += errorCount;
    this._stats.totalWarnings += warningCount;
    this._validationTimes.push(validationTime);
    if (this._validationTimes.length > this.maxSamples) {
      this._validationTimes.shift();
    }
    this._stats.averageValidationTime = this._calculateAverage(this._validationTimes);
  }

  /**
   * Record field validation
   */
  recordFieldValidation(field: string): void {
    const currentCount = this._fieldCounts.get(field) || 0;
    this._fieldCounts.set(field, currentCount + 1);
    this._updateMostValidatedFields();
  }

  /**
   * Get current statistics
   */
  getStats(): ValidationStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this._stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      totalErrors: 0,
      totalWarnings: 0,
      averageValidationTime: 0,
      mostValidatedFields: [],
      lastResetTime: Date.now(),
    };
    this._validationTimes = [];
    this._fieldCounts.clear();
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate(): number {
    if (this._stats.totalValidations === 0) return 1.0;
    return this._stats.successfulValidations / this._stats.totalValidations;
  }

  /**
   * Get failure rate percentage
   */
  getFailureRate(): number {
    if (this._stats.totalValidations === 0) return 0;
    return this._stats.failedValidations / this._stats.totalValidations;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    validations: number;
    successful: number;
    failed: number;
    successRate: number;
    failureRate: number;
    errors: number;
    warnings: number;
    avgValidationTime: number;
  } {
    return {
      validations: this._stats.totalValidations,
      successful: this._stats.successfulValidations,
      failed: this._stats.failedValidations,
      successRate: this.getSuccessRate() * 100,
      failureRate: this.getFailureRate() * 100,
      errors: this._stats.totalErrors,
      warnings: this._stats.totalWarnings,
      avgValidationTime: this._stats.averageValidationTime,
    };
  }

  private _calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private _updateMostValidatedFields(): void {
    const entries = Array.from(this._fieldCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this._stats.mostValidatedFields = entries.slice(0, 10).map(([field, count]) => ({ field, count }));
  }
}
