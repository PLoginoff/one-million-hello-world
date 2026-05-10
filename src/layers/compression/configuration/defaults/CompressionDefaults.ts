/**
 * Compression Default Configurations
 * 
 * Provides default configuration presets for different use cases.
 */

import { CompressionAlgorithm } from '../../domain/value-objects/CompressionAlgorithm';
import { CompressionThreshold } from '../../domain/value-objects/CompressionThreshold';

export interface CompressionConfigDefaults {
  algorithm: CompressionAlgorithm;
  threshold: CompressionThreshold;
  enableMetrics: boolean;
  enableLogging: boolean;
  defaultLevel: number;
}

export class CompressionDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createGzip(),
      threshold: CompressionThreshold.createDefault(),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 6,
    };
  }

  /**
   * High compression configuration
   */
  static getHighCompression(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createBrotli(),
      threshold: CompressionThreshold.createStrict(),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 9,
    };
  }

  /**
   * Fast compression configuration
   */
  static getFastCompression(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createGzip(),
      threshold: CompressionThreshold.createLenient(),
      enableMetrics: false,
      enableLogging: false,
      defaultLevel: 1,
    };
  }

  /**
   * Balanced compression configuration
   */
  static getBalanced(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createGzip(),
      threshold: CompressionThreshold.createDefault(),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 6,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createGzip(),
      threshold: new CompressionThreshold({
        minSize: 512,
        maxSize: 10 * 1024 * 1024,
        minCompressionRatio: 0.9,
        maxCompressionTime: 2000,
        enableDynamicCompression: false,
      }),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 4,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createBrotli(),
      threshold: CompressionThreshold.createStrict(),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 4,
    };
  }

  /**
   * Static assets configuration
   */
  static getStaticAssets(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createBrotli(),
      threshold: new CompressionThreshold({
        minSize: 1024,
        maxSize: 100 * 1024 * 1024,
        minCompressionRatio: 0.7,
        maxCompressionTime: 5000,
        enableDynamicCompression: false,
      }),
      enableMetrics: true,
      enableLogging: false,
      defaultLevel: 11,
    };
  }

  /**
   * API responses configuration
   */
  static getAPIResponses(): CompressionConfigDefaults {
    return {
      algorithm: CompressionAlgorithm.createGzip(),
      threshold: new CompressionThreshold({
        minSize: 1024,
        maxSize: 5 * 1024 * 1024,
        minCompressionRatio: 0.8,
        maxCompressionTime: 500,
        enableDynamicCompression: true,
      }),
      enableMetrics: true,
      enableLogging: true,
      defaultLevel: 6,
    };
  }
}
