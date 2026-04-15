/**
 * Compressor Implementation
 * 
 * Concrete implementation of ICompressor.
 * Handles Gzip, Brotli, and dynamic compression.
 */

import { ICompressor } from '../interfaces/ICompressor';
import {
  CompressionAlgorithm,
  CompressionResult,
  CompressionConfig,
} from '../types/compression-types';

export class Compressor implements ICompressor {
  private _config: CompressionConfig;

  constructor() {
    this._config = {
      defaultAlgorithm: CompressionAlgorithm.NONE,
      threshold: 1024,
      enableDynamic: false,
    };
  }

  compress(data: string, algorithm?: CompressionAlgorithm): CompressionResult {
    const targetAlgorithm = algorithm ?? this._config.defaultAlgorithm;
    const originalSize = data.length;

    if (originalSize < this._config.threshold) {
      return {
        success: true,
        data,
        algorithm: CompressionAlgorithm.NONE,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
      };
    }

    if (targetAlgorithm === CompressionAlgorithm.NONE) {
      return {
        success: true,
        data,
        algorithm: CompressionAlgorithm.NONE,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
      };
    }

    try {
      let compressed: string;

      switch (targetAlgorithm) {
        case CompressionAlgorithm.GZIP:
          compressed = this._simulateGzip(data);
          break;
        case CompressionAlgorithm.BROTLI:
          compressed = this._simulateBrotli(data);
          break;
        default:
          return {
            success: false,
            error: 'Unsupported compression algorithm',
          };
      }

      const compressedSize = compressed.length;
      const ratio = originalSize > 0 ? compressedSize / originalSize : 1;

      return {
        success: true,
        data: compressed,
        algorithm: targetAlgorithm,
        originalSize,
        compressedSize,
        ratio,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Compression failed',
      };
    }
  }

  decompress(data: string, algorithm: CompressionAlgorithm): CompressionResult {
    try {
      let decompressed: string;

      switch (algorithm) {
        case CompressionAlgorithm.GZIP:
          decompressed = this._simulateGzipDecompress(data);
          break;
        case CompressionAlgorithm.BROTLI:
          decompressed = this._simulateBrotliDecompress(data);
          break;
        case CompressionAlgorithm.NONE:
          decompressed = data;
          break;
        default:
          return {
            success: false,
            error: 'Unsupported decompression algorithm',
          };
      }

      return {
        success: true,
        data: decompressed,
        algorithm,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Decompression failed',
      };
    }
  }

  selectAlgorithm(data: string): CompressionAlgorithm {
    if (!this._config.enableDynamic) {
      return this._config.defaultAlgorithm;
    }

    if (data.length < this._config.threshold) {
      return CompressionAlgorithm.NONE;
    }

    const hasRepeatingPatterns = this._hasRepeatingPatterns(data);

    if (hasRepeatingPatterns) {
      return CompressionAlgorithm.GZIP;
    }

    return CompressionAlgorithm.NONE;
  }

  setConfig(config: CompressionConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): CompressionConfig {
    return { ...this._config };
  }

  private _simulateGzip(data: string): string {
    return `[GZIP:${data.length}]${data}`;
  }

  private _simulateGzipDecompress(data: string): string {
    if (data.startsWith('[GZIP:')) {
      const end = data.indexOf(']');
      const length = parseInt(data.substring(6, end), 10);
      return data.substring(end + 1);
    }
    return data;
  }

  private _simulateBrotli(data: string): string {
    return `[BROTLI:${data.length}]${data}`;
  }

  private _simulateBrotliDecompress(data: string): string {
    if (data.startsWith('[BROTLI:')) {
      const end = data.indexOf(']');
      const length = parseInt(data.substring(8, end), 10);
      return data.substring(end + 1);
    }
    return data;
  }

  private _hasRepeatingPatterns(data: string): boolean {
    const pattern = /(.{10,})\1/;
    return pattern.test(data);
  }
}
