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
  parseRequest(raw: any, config: ParserConfigOptions): {
    success: boolean;
    data?: any;
    error?: string;
  };

  /**
   * Parse HTTP response with this strategy
   */
  parseResponse(raw: any, config: ParserConfigOptions): {
    success: boolean;
    data?: any;
    error?: string;
  };

  /**
   * Reset strategy state
   */
  reset(): void;
}
