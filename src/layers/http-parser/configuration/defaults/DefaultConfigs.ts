/**
 * Default Parser Configurations
 * 
 * Pre-configured settings for common use cases.
 */

import { HttpMethod, HttpVersion, ContentType } from '../../types/http-parser-types';

export interface ParserConfigOptions {
  maxHeaderSize: number;
  maxBodySize: number;
  strictMode: boolean;
  allowChunkedEncoding: boolean;
  maxHeaderCount: number;
  maxUrlLength: number;
  allowHttp2: boolean;
  enableValidation: boolean;
  timeout: number;
  keepAlive: boolean;
  maxConnections: number;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: ParserConfigOptions = {
    maxHeaderSize: 8192,
    maxBodySize: 10485760,
    strictMode: true,
    allowChunkedEncoding: true,
    maxHeaderCount: 100,
    maxUrlLength: 2048,
    allowHttp2: false,
    enableValidation: true,
    timeout: 30000,
    keepAlive: true,
    maxConnections: 100,
  };

  /**
   * High-performance configuration (minimal validation)
   */
  static HIGH_PERFORMANCE: ParserConfigOptions = {
    maxHeaderSize: 16384,
    maxBodySize: 52428800,
    strictMode: false,
    allowChunkedEncoding: true,
    maxHeaderCount: 200,
    maxUrlLength: 4096,
    allowHttp2: true,
    enableValidation: false,
    timeout: 60000,
    keepAlive: true,
    maxConnections: 1000,
  };

  /**
   * Strict security configuration
   */
  static STRICT_SECURITY: ParserConfigOptions = {
    maxHeaderSize: 4096,
    maxBodySize: 1048576,
    strictMode: true,
    allowChunkedEncoding: false,
    maxHeaderCount: 50,
    maxUrlLength: 1024,
    allowHttp2: false,
    enableValidation: true,
    timeout: 15000,
    keepAlive: false,
    maxConnections: 50,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: ParserConfigOptions = {
    maxHeaderSize: 16384,
    maxBodySize: 52428800,
    strictMode: false,
    allowChunkedEncoding: true,
    maxHeaderCount: 200,
    maxUrlLength: 4096,
    allowHttp2: true,
    enableValidation: false,
    timeout: 120000,
    keepAlive: true,
    maxConnections: 500,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: ParserConfigOptions = {
    maxHeaderSize: 8192,
    maxBodySize: 10485760,
    strictMode: true,
    allowChunkedEncoding: true,
    maxHeaderCount: 100,
    maxUrlLength: 2048,
    allowHttp2: false,
    enableValidation: true,
    timeout: 30000,
    keepAlive: true,
    maxConnections: 1000,
  };

  /**
   * HTTP/2 only configuration
   */
  static HTTP2_ONLY: ParserConfigOptions = {
    maxHeaderSize: 65536,
    maxBodySize: 52428800,
    strictMode: false,
    allowChunkedEncoding: true,
    maxHeaderCount: 200,
    maxUrlLength: 4096,
    allowHttp2: true,
    enableValidation: true,
    timeout: 60000,
    keepAlive: true,
    maxConnections: 1000,
  };

  /**
   * Minimal configuration for embedded systems
   */
  static MINIMAL: ParserConfigOptions = {
    maxHeaderSize: 2048,
    maxBodySize: 262144,
    strictMode: true,
    allowChunkedEncoding: false,
    maxHeaderCount: 20,
    maxUrlLength: 512,
    allowHttp2: false,
    enableValidation: true,
    timeout: 10000,
    keepAlive: false,
    maxConnections: 10,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<ParserConfigOptions>): ParserConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as ParserConfigOptions;
  }
}
