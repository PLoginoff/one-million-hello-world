/**
 * Transport Interface
 * 
 * Defines the contract for transport operations
 * including HTTP response, streaming, and chunked encoding.
 */

import { TransportResult, TransportConfig } from '../types/transport-types';

/**
 * Interface for transport operations
 */
export interface ITransport {
  /**
   * Sends HTTP response
   * 
   * @param data - Response data
   * @param status - HTTP status code
   * @returns Transport result
   */
  send(data: string, status?: number): Promise<TransportResult>;

  /**
   * Sets transport configuration
   * 
   * @param config - Transport configuration
   */
  setConfig(config: TransportConfig): void;

  /**
   * Gets current transport configuration
   * 
   * @returns Current transport configuration
   */
  getConfig(): TransportConfig;
}
