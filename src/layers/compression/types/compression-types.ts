/**
 * Compression Layer Types
 * 
 * This module defines all type definitions for the Compression Layer,
 * including Gzip, Brotli, and dynamic compression.
 */

/**
 * Compression algorithm
 */
export enum CompressionAlgorithm {
  GZIP = 'gzip',
  BROTLI = 'brotli',
  NONE = 'none',
}

/**
 * Compression result
 */
export interface CompressionResult {
  success: boolean;
  data?: string;
  algorithm?: CompressionAlgorithm;
  originalSize?: number;
  compressedSize?: number;
  ratio?: number;
  error?: string;
}

/**
 * Compression configuration
 */
export interface CompressionConfig {
  defaultAlgorithm: CompressionAlgorithm;
  threshold: number;
  enableDynamic: boolean;
}
