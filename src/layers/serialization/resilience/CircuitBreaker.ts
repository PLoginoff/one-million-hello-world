/**
 * Circuit Breaker
 * 
 * Circuit breaker pattern for resilience.
 */

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export class CircuitBreaker {
  private _state: CircuitState;
  private _failureCount: number;
  private _successCount: number;
  private _lastFailureTime: Date | null;
  private _config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 60000,
      resetTimeout: config.resetTimeout ?? 60000,
    };
  }

  /**
   * Executes a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this._state === CircuitState.OPEN) {
      if (this._shouldAttemptReset()) {
        this._state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Executes a synchronous function with circuit breaker protection
   */
  executeSync<T>(fn: () => T): T {
    if (this._state === CircuitState.OPEN) {
      if (this._shouldAttemptReset()) {
        this._state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handles success
   */
  private _onSuccess(): void {
    if (this._state === CircuitState.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._config.successThreshold) {
        this._reset();
      }
    } else {
      this._failureCount = 0;
    }
  }

  /**
   * Handles failure
   */
  private _onFailure(): void {
    this._failureCount++;
    this._lastFailureTime = new Date();

    if (this._failureCount >= this._config.failureThreshold) {
      this._state = CircuitState.OPEN;
    }
  }

  /**
   * Checks if circuit should attempt reset
   */
  private _shouldAttemptReset(): boolean {
    if (!this._lastFailureTime) {
      return false;
    }
    const now = Date.now();
    return now - this._lastFailureTime.getTime() >= this._config.resetTimeout;
  }

  /**
   * Resets the circuit breaker
   */
  private _reset(): void {
    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
  }

  /**
   * Gets the current state
   */
  getState(): CircuitState {
    return this._state;
  }

  /**
   * Gets the failure count
   */
  getFailureCount(): number {
    return this._failureCount;
  }

  /**
   * Gets the success count
   */
  getSuccessCount(): number {
    return this._successCount;
  }

  /**
   * Resets the circuit breaker manually
   */
  reset(): void {
    this._reset();
  }

  /**
   * Gets the configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this._config };
  }

  /**
   * Updates the configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this._config = { ...this._config, ...config };
  }
}
