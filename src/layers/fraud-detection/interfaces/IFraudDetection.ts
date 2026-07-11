/**
 * FraudDetection Interface
 *
 * Defines the contract for the Fraud detection engine layer.
 */

import { FraudDetectionResult, FraudDetectionContext } from '../types/fraud-detection-types';

export interface IFraudDetection {
  /**
   * Execute the fraudDetection operation
   */
  execute(context: FraudDetectionContext): Promise<FraudDetectionResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
