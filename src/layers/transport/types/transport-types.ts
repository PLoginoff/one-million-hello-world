/**
 * Transport Layer Types
 * 
 * This module defines all type definitions for the Transport Layer,
 * including HTTP response, streaming, and chunked encoding.
 */

/**
 * Transport result
 */
export interface TransportResult {
  success: boolean;
  data?: string;
  status: number;
  error?: string;
}

/**
 * Transport configuration
 */
export interface TransportConfig {
  enableStreaming: boolean;
  enableChunkedEncoding: boolean;
}
