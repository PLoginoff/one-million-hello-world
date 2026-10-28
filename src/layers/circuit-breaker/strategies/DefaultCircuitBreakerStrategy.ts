/**
 * Default Circuit Breaker Strategy
 *
 * Provides the base implementation for circuit breaker execution.
 * Uses a simple state machine to track failures and successes,
 * transitioning between CLOSED, OPEN, and HALF_OPEN states.
 *
 * @module CircuitBreakerLayer/Strategies
 */

import {
  ICircuitBreakerStrategy,
  CircuitBreakerContext,
  CircuitBreakerStrategyResult,
} from './ICircuitBreakerStrategy';
import { CircuitConfig, CircuitState } from '../types/circuit-breaker-types';

/**
 * Default implementation of circuit breaker strategy
 *
 * @typeParam T - The type of result returned by the operation
 */
export class DefaultCircuitBreakerStrategy<T = unknown> implements ICircuitBreakerStrategy<T> {
  readonly name = 'default';
  readonly priority = 10;

  private _failureCount: number = 0;
  private _successCount: number = 0;
  private _lastFailureTime: number = 0;
  private _state: CircuitState = CircuitState.CLOSED;
  private _lastStateChange: number = Date.now();

  /**
   * Creates a new DefaultCircuitBreakerStrategy
   */
  constructor() {
    // Initialize with default values
  }

  /**
   * Gets the current circuit state
   *
   * @returns Current circuit state
   */
  getState(): CircuitState {
    this.evaluateStateTransition();
    return this._state;
  }

  /**
   * Gets the current failure count
   *
   * @returns Number of failures
   */
  getFailureCount(): number {
    return this._failureCount;
  }

  /**
   * Gets the current success count
   *
   * @returns Number of successes
   */
  getSuccessCount(): number {
    return this._successCount;
  }

  /**
   * Resets the circuit breaker to initial state
   */
  reset(): void {
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = 0;
    this._state = CircuitState.CLOSED;
    this._lastStateChange = Date.now();
  }

  /**
   * Evaluates if a state transition should occur based on current counts and time
   */
  private evaluateStateTransition(): void {
    const now = Date.now();

    switch (this._state) {
      case CircuitState.OPEN:
        // Check if we should transition to HALF_OPEN
        if (now - this._lastFailureTime >= this.getResetTimeout()) {
          this._state = CircuitState.HALF_OPEN;
          this._lastStateChange = now;
        }
        break;

      case CircuitState.HALF_OPEN:
        // In HALF_OPEN, we need successes to close, failures to open
        if (this._successCount >= this.getSuccessThreshold()) {
          this._state = CircuitState.CLOSED;
          this._failureCount = 0;
          this._successCount = 0;
          this._lastStateChange = now;
        } else if (this._failureCount > 0) {
          this._state = CircuitState.OPEN;
          this._lastFailureTime = now;
          this._lastStateChange = now;
        }
        break;

      case CircuitState.CLOSED:
        // In CLOSED, check if we should open
        if (this._failureCount >= this.getFailureThreshold()) {
          this._state = CircuitState.OPEN;
          this._lastFailureTime = now;
          this._lastStateChange = now;
        }
        break;
    }
  }

  /**
   * Gets the failure threshold from config (default: 5)
   */
  private getFailureThreshold(): number {
    return 5; // Default threshold
  }

  /**
   * Gets the success threshold for HALF_OPEN -> CLOSED (default: 2)
   */
  private getSuccessThreshold(): number {
    return 2; // Default threshold
  }

  /**
   * Gets the reset timeout for OPEN -> HALF_OPEN (default: 30000ms)
   */
  private getResetTimeout(): number {
    return 30000; // Default 30 seconds
  }

  /**
   * Executes an operation with circuit breaker protection
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: CircuitBreakerContext<T>): Promise<CircuitBreakerStrategyResult<T>> {
    const startTime = Date.now();
    this.evaluateStateTransition();

    // If circuit is OPEN and no fallback, fail fast
    if (this._state === CircuitState.OPEN && !context.fallback) {
      return {
        success: false,
        state: this._state,
        error: 'Circuit breaker is OPEN',
        attempts: 0,
        durationMs: Date.now() - startTime,
      };
    }

    let attempts = 0;
    let lastError: Error | undefined;

    // Try the operation
    while (attempts < 1) {
      attempts++;
      try {
        const result = await context.operation();
        this.onSuccess();
        return {
          success: true,
          data: result,
          state: this._state,
          attempts,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.onFailure();
      }
    }

    // If we have a fallback, try it
    if (context.fallback) {
      try {
        const fallbackResult = await context.fallback();
        return {
          success: true,
          data: fallbackResult,
          state: this._state,
          attempts,
          durationMs: Date.now() - startTime,
        };
      } catch {
        // Fallback also failed
      }
    }

    return {
      success: false,
      state: this._state,
      error: lastError?.message ?? 'Operation failed',
      attempts,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handles successful execution
   */
  private onSuccess(): void {
    this._successCount++;
    this._failureCount = 0; // Reset failure count on success
    this.evaluateStateTransition();
  }

  /**
   * Handles failed execution
   */
  private onFailure(): void {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    this._successCount = 0; // Reset success count on failure
    this.evaluateStateTransition();
  }

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: CircuitBreakerContext<unknown>): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'function' &&
      context.config !== undefined
    );
  }
}
