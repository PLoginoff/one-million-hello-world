/**
 * Compressor Interface
 * 
 * Defines the contract for compression operations
 * including Gzip, Brotli, and dynamic compression.
 */

import {
  CompressionAlgorithm,
  CompressionResult,
  CompressionConfig,
} from '../types/compression-types';

/**
 * Interface for compression operations
 */
export interface ICompressor {
  /**
   * Compresses data using specified algorithm
   * 
   * @param data - Data to compress
   * @param algorithm - Compression algorithm
   * @returns Compression result
   */
  compress(data: string, algorithm?: CompressionAlgorithm): CompressionResult;

  /**
   * Decompresses data using specified algorithm
   * 
   * @param data - Data to decompress
   * @param algorithm - Compression algorithm
   * @returns Decompression result
   */
  decompress(data: string, algorithm: CompressionAlgorithm): CompressionResult;

  /**
   * Selects best compression algorithm based on data
   * 
   * @param data - Data to analyze
   * @returns Recommended compression algorithm
   */
  selectAlgorithm(data: string): CompressionAlgorithm;

  /**
   * Sets compression configuration
   * 
   * @param config - Compression configuration
   */
  setConfig(config: CompressionConfig): void;

  /**
   * Gets current compression configuration
   * 
   * @returns Current compression configuration
   */
  getConfig(): CompressionConfig;
}
