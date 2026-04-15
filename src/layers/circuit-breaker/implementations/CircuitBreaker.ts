/**
 * Circuit Breaker Implementation
 * 
 * Concrete implementation of ICircuitBreaker.
 * Handles fault tolerance and fallback strategies.
 */

import { ICircuitBreaker, FallbackFunction } from '../interfaces/ICircuitBreaker';
import {
  CircuitState,
  CircuitStats,
  CircuitConfig,
  CircuitResult,
} from '../types/circuit-breaker-types';

export class CircuitBreaker implements ICircuitBreaker {
  private _state: CircuitState;
  private _stats: CircuitStats;
  private _config: CircuitConfig;
  private _successCount: number;
  private _lastStateChange: number;

  constructor() {
    this._state = CircuitState.CLOSED;
    this._stats = {
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      state: CircuitState.CLOSED,
    };
    this._config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      resetTimeout: 30000,
    };
    this._successCount = 0;
    this._lastStateChange = Date.now();
  }

  async execute<T>(operation: () => T | Promise<T>, fallback?: FallbackFunction<T>): Promise<CircuitResult<T>> {
    if (this._state === CircuitState.OPEN) {
      if (this._shouldAttemptReset()) {
        this._state = CircuitState.HALF_OPEN;
        this._lastStateChange = Date.now();
      } else {
        if (fallback) {
          try {
            const fallbackResult = await fallback();
            return {
              success: true,
              data: fallbackResult,
              state: this._state,
            };
          } catch (error) {
            return {
              success: false,
              state: this._state,
              error: error instanceof Error ? error.message : 'Fallback failed',
            };
          }
        }
        return {
          success: false,
          state: this._state,
          error: 'Circuit is open',
        };
      }
    }

    try {
      const result = await operation();
      this._onSuccess();
      return {
        success: true,
        data: result,
        state: this._state,
      };
    } catch (error) {
      this._onFailure();
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          return {
            success: true,
            data: fallbackResult,
            state: this._state,
          };
        } catch (fallbackError) {
          return {
            success: false,
            state: this._state,
            error: error instanceof Error ? error.message : 'Operation failed',
          };
        }
      }
      return {
        success: false,
        state: this._state,
        error: error instanceof Error ? error.message : 'Operation failed',
      };
    }
  }

  getState(): CircuitState {
    return this._state;
  }

  getStats(): CircuitStats {
    return { ...this._stats };
  }

  reset(): void {
    this._state = CircuitState.CLOSED;
    this._stats = {
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      state: CircuitState.CLOSED,
    };
    this._successCount = 0;
    this._lastStateChange = Date.now();
  }

  setConfig(config: CircuitConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): CircuitConfig {
    return { ...this._config };
  }

  private _onSuccess(): void {
    this._stats.successCount++;
    this._successCount++;

    if (this._state === CircuitState.HALF_OPEN) {
      if (this._successCount >= this._config.successThreshold) {
        this._state = CircuitState.CLOSED;
        this._successCount = 0;
        this._stats.failureCount = 0;
      }
    }
  }

  private _onFailure(): void {
    this._stats.failureCount++;
    this._stats.lastFailureTime = Date.now();
    this._successCount = 0;

    if (this._stats.failureCount >= this._config.failureThreshold) {
      this._state = CircuitState.OPEN;
      this._lastStateChange = Date.now();
    }
  }

  private _shouldAttemptReset(): boolean {
    const now = Date.now();
    const timeSinceLastChange = now - this._lastStateChange;
    return timeSinceLastChange >= this._config.resetTimeout;
  }
}
