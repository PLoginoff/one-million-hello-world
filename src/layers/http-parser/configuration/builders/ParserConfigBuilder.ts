/**
 * Parser Configuration Builder
 * 
 * Fluent builder for creating parser configurations.
 */

import { ParserConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { ParserConfigValidator } from '../validators/ParserConfigValidator';

export class ParserConfigBuilder {
  private config: ParserConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): ParserConfigBuilder {
    return new ParserConfigBuilder();
  }

  /**
   * Start with high-performance configuration
   */
  static highPerformance(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.HIGH_PERFORMANCE };
    return builder;
  }

  /**
   * Start with strict security configuration
   */
  static strictSecurity(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.STRICT_SECURITY };
    return builder;
  }

  /**
   * Start with development configuration
   */
  static development(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with HTTP/2 only configuration
   */
  static http2Only(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.HTTP2_ONLY };
    return builder;
  }

  /**
   * Start with minimal configuration
   */
  static minimal(): ParserConfigBuilder {
    const builder = new ParserConfigBuilder();
    builder.config = { ...DefaultConfigs.MINIMAL };
    return builder;
  }

  /**
   * Set max header size in bytes
   */
  withMaxHeaderSize(maxHeaderSize: number): ParserConfigBuilder {
    ParserConfigValidator.validateMaxHeaderSize(maxHeaderSize);
    this.config.maxHeaderSize = maxHeaderSize;
    return this;
  }

  /**
   * Set max body size in bytes
   */
  withMaxBodySize(maxBodySize: number): ParserConfigBuilder {
    ParserConfigValidator.validateMaxBodySize(maxBodySize);
    this.config.maxBodySize = maxBodySize;
    return this;
  }

  /**
   * Set max body size in megabytes
   */
  withMaxBodySizeMB(megabytes: number): ParserConfigBuilder {
    return this.withMaxBodySize(megabytes * 1024 * 1024);
  }

  /**
   * Enable or disable strict mode
   */
  withStrictMode(strictMode: boolean): ParserConfigBuilder {
    ParserConfigValidator.validateStrictMode(strictMode);
    this.config.strictMode = strictMode;
    return this;
  }

  /**
   * Enable or disable chunked encoding
   */
  withAllowChunkedEncoding(allowChunkedEncoding: boolean): ParserConfigBuilder {
    ParserConfigValidator.validateAllowChunkedEncoding(allowChunkedEncoding);
    this.config.allowChunkedEncoding = allowChunkedEncoding;
    return this;
  }

  /**
   * Set max header count
   */
  withMaxHeaderCount(maxHeaderCount: number): ParserConfigBuilder {
    ParserConfigValidator.validateMaxHeaderCount(maxHeaderCount);
    this.config.maxHeaderCount = maxHeaderCount;
    return this;
  }

  /**
   * Set max URL length
   */
  withMaxUrlLength(maxUrlLength: number): ParserConfigBuilder {
    ParserConfigValidator.validateMaxUrlLength(maxUrlLength);
    this.config.maxUrlLength = maxUrlLength;
    return this;
  }

  /**
   * Enable or disable HTTP/2
   */
  withAllowHttp2(allowHttp2: boolean): ParserConfigBuilder {
    ParserConfigValidator.validateAllowHttp2(allowHttp2);
    this.config.allowHttp2 = allowHttp2;
    return this;
  }

  /**
   * Enable or disable validation
   */
  withEnableValidation(enableValidation: boolean): ParserConfigBuilder {
    ParserConfigValidator.validateEnableValidation(enableValidation);
    this.config.enableValidation = enableValidation;
    return this;
  }

  /**
   * Set timeout in milliseconds
   */
  withTimeout(timeout: number): ParserConfigBuilder {
    ParserConfigValidator.validateTimeout(timeout);
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Set timeout in seconds
   */
  withTimeoutSeconds(seconds: number): ParserConfigBuilder {
    return this.withTimeout(seconds * 1000);
  }

  /**
   * Enable or disable keep-alive
   */
  withKeepAlive(keepAlive: boolean): ParserConfigBuilder {
    ParserConfigValidator.validateKeepAlive(keepAlive);
    this.config.keepAlive = keepAlive;
    return this;
  }

  /**
   * Set max connections
   */
  withMaxConnections(maxConnections: number): ParserConfigBuilder {
    ParserConfigValidator.validateMaxConnections(maxConnections);
    this.config.maxConnections = maxConnections;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): ParserConfigOptions {
    ParserConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): ParserConfigOptions {
    return { ...this.config };
  }
}
