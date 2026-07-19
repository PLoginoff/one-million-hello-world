/**
 * Parsing Strategy Interface
 *
 * Defines contract for different HTTP parsing strategies.
 */

import { ParserConfigOptions } from '../../configuration/defaults/DefaultConfigs';

export interface IParsingStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Parse HTTP request with this strategy
   */
  parseRequest(
    raw: Buffer,
    config: ParserConfigOptions
  ): {
    success: boolean;
    data?: unknown;
    error?: string;
  };

  /**
   * Parse HTTP response with this strategy
   */
  parseResponse(
    raw: Buffer,
    config: ParserConfigOptions
  ): {
    success: boolean;
    data?: unknown;
    error?: string;
  };

  /**
   * Reset strategy state
   */
  reset(): void;
}
