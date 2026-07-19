export interface SecretsRotationMetrics {
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastExecutionTime: number;
  activeOperations: number;
}

export class SecretsRotationMetricsCollector {
  private _metrics: SecretsRotationMetrics;

  constructor() {
    this._metrics = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0,
      activeOperations: 0,
    };
  }

  recordExecution(durationMs: number, success: boolean): void {
    this._metrics.executionCount++;
    if (success) {
      this._metrics.successCount++;
    } else {
      this._metrics.failureCount++;
    }
    this._metrics.lastExecutionTime = durationMs;
    const total = this._metrics.averageExecutionTime * (this._metrics.executionCount - 1) + durationMs;
    this._metrics.averageExecutionTime = total / this._metrics.executionCount;
  }

  incrementActiveOperations(): void {
    this._metrics.activeOperations++;
  }
  decrementActiveOperations(): void {
    this._metrics.activeOperations = Math.max(0, this._metrics.activeOperations - 1);
  }

  getMetrics(): SecretsRotationMetrics {
    return { ...this._metrics };
  }

  reset(): void {
    this._metrics = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      lastExecutionTime: 0,
      activeOperations: 0,
    };
  }
}
