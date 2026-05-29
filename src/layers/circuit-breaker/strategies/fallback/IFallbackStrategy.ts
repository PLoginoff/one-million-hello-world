/**
 * Fallback Strategy Interface
 * 
 * Defines the contract for fallback strategies when circuit is open.
 */

export interface IFallbackStrategy<T> {
  /**
   * Execute fallback logic
   * 
   * @param context - Fallback execution context
   * @returns Fallback result
   */
  execute(context: FallbackContext<T>): Promise<FallbackResult<T>>;

  /**
   * Check if fallback is available
   * 
   * @returns True if fallback is available
   */
  isAvailable(): boolean;

  /**
   * Get fallback strategy name
   * 
   * @returns Strategy name
   */
  getName(): string;
}

export interface FallbackContext<T> {
  originalError: Error;
  attemptCount: number;
  lastAttemptTime: number;
  metadata?: Record<string, unknown>;
  data?: T;
}

export interface FallbackResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromFallback: boolean;
  strategyName: string;
}
