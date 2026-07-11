/**
 * BotDetection Interface
 *
 * Defines the contract for the Bot detection and traffic filtering layer.
 */

import { BotDetectionResult, BotDetectionContext } from '../types/bot-detection-types';

export interface IBotDetection {
  /**
   * Execute the botDetection operation
   */
  execute(context: BotDetectionContext): Promise<BotDetectionResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
