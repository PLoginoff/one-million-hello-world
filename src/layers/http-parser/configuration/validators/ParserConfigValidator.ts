/**
 * Parser Configuration Validator
 * 
 * Validates parser configuration options.
 */

import { ParserConfigOptions } from '../defaults/DefaultConfigs';

export class ParserConfigValidator {
  private static readonly MAX_HEADER_SIZE = 65536;
  private static readonly MIN_HEADER_SIZE = 512;
  private static readonly MAX_BODY_SIZE = 1073741824;
  private static readonly MIN_BODY_SIZE = 0;
  private static readonly MAX_HEADER_COUNT = 1000;
  private static readonly MIN_HEADER_COUNT = 1;
  private static readonly MAX_URL_LENGTH = 8192;
  private static readonly MIN_URL_LENGTH = 1;
  private static readonly MAX_TIMEOUT = 300000;
  private static readonly MIN_TIMEOUT = 1000;
  private static readonly MAX_CONNECTIONS = 100000;
  private static readonly MIN_CONNECTIONS = 1;

  /**
   * Validate complete configuration
   */
  static validate(config: ParserConfigOptions): void {
    this.validateMaxHeaderSize(config.maxHeaderSize);
    this.validateMaxBodySize(config.maxBodySize);
    this.validateMaxHeaderCount(config.maxHeaderCount);
    this.validateMaxUrlLength(config.maxUrlLength);
    this.validateTimeout(config.timeout);
    this.validateMaxConnections(config.maxConnections);
  }

  /**
   * Validate max header size
   */
  static validateMaxHeaderSize(maxHeaderSize: number): void {
    if (typeof maxHeaderSize !== 'number' || isNaN(maxHeaderSize)) {
      throw new Error('maxHeaderSize must be a number');
    }
    if (maxHeaderSize < this.MIN_HEADER_SIZE) {
      throw new Error(`maxHeaderSize must be at least ${this.MIN_HEADER_SIZE} bytes`);
    }
    if (maxHeaderSize > this.MAX_HEADER_SIZE) {
      throw new Error(`maxHeaderSize cannot exceed ${this.MAX_HEADER_SIZE} bytes`);
    }
  }

  /**
   * Validate max body size
   */
  static validateMaxBodySize(maxBodySize: number): void {
    if (typeof maxBodySize !== 'number' || isNaN(maxBodySize)) {
      throw new Error('maxBodySize must be a number');
    }
    if (maxBodySize < this.MIN_BODY_SIZE) {
      throw new Error(`maxBodySize must be at least ${this.MIN_BODY_SIZE} bytes`);
    }
    if (maxBodySize > this.MAX_BODY_SIZE) {
      throw new Error(`maxBodySize cannot exceed ${this.MAX_BODY_SIZE} bytes`);
    }
  }

  /**
   * Validate max header count
   */
  static validateMaxHeaderCount(maxHeaderCount: number): void {
    if (typeof maxHeaderCount !== 'number' || isNaN(maxHeaderCount)) {
      throw new Error('maxHeaderCount must be a number');
    }
    if (!Number.isInteger(maxHeaderCount)) {
      throw new Error('maxHeaderCount must be an integer');
    }
    if (maxHeaderCount < this.MIN_HEADER_COUNT) {
      throw new Error(`maxHeaderCount must be at least ${this.MIN_HEADER_COUNT}`);
    }
    if (maxHeaderCount > this.MAX_HEADER_COUNT) {
      throw new Error(`maxHeaderCount cannot exceed ${this.MAX_HEADER_COUNT}`);
    }
  }

  /**
   * Validate max URL length
   */
  static validateMaxUrlLength(maxUrlLength: number): void {
    if (typeof maxUrlLength !== 'number' || isNaN(maxUrlLength)) {
      throw new Error('maxUrlLength must be a number');
    }
    if (!Number.isInteger(maxUrlLength)) {
      throw new Error('maxUrlLength must be an integer');
    }
    if (maxUrlLength < this.MIN_URL_LENGTH) {
      throw new Error(`maxUrlLength must be at least ${this.MIN_URL_LENGTH}`);
    }
    if (maxUrlLength > this.MAX_URL_LENGTH) {
      throw new Error(`maxUrlLength cannot exceed ${this.MAX_URL_LENGTH}`);
    }
  }

  /**
   * Validate timeout
   */
  static validateTimeout(timeout: number): void {
    if (typeof timeout !== 'number' || isNaN(timeout)) {
      throw new Error('timeout must be a number');
    }
    if (!Number.isInteger(timeout)) {
      throw new Error('timeout must be an integer');
    }
    if (timeout < this.MIN_TIMEOUT) {
      throw new Error(`timeout must be at least ${this.MIN_TIMEOUT}ms`);
    }
    if (timeout > this.MAX_TIMEOUT) {
      throw new Error(`timeout cannot exceed ${this.MAX_TIMEOUT}ms`);
    }
  }

  /**
   * Validate max connections
   */
  static validateMaxConnections(maxConnections: number): void {
    if (typeof maxConnections !== 'number' || isNaN(maxConnections)) {
      throw new Error('maxConnections must be a number');
    }
    if (!Number.isInteger(maxConnections)) {
      throw new Error('maxConnections must be an integer');
    }
    if (maxConnections < this.MIN_CONNECTIONS) {
      throw new Error(`maxConnections must be at least ${this.MIN_CONNECTIONS}`);
    }
    if (maxConnections > this.MAX_CONNECTIONS) {
      throw new Error(`maxConnections cannot exceed ${this.MAX_CONNECTIONS}`);
    }
  }

  /**
   * Validate boolean configuration option
   */
  static validateBooleanOption(value: boolean, optionName: string): void {
    if (typeof value !== 'boolean') {
      throw new Error(`${optionName} must be a boolean`);
    }
  }

  /**
   * Validate strict mode
   */
  static validateStrictMode(strictMode: boolean): void {
    this.validateBooleanOption(strictMode, 'strictMode');
  }

  /**
   * Validate allow chunked encoding
   */
  static validateAllowChunkedEncoding(allowChunkedEncoding: boolean): void {
    this.validateBooleanOption(allowChunkedEncoding, 'allowChunkedEncoding');
  }

  /**
   * Validate allow HTTP/2
   */
  static validateAllowHttp2(allowHttp2: boolean): void {
    this.validateBooleanOption(allowHttp2, 'allowHttp2');
  }

  /**
   * Validate enable validation
   */
  static validateEnableValidation(enableValidation: boolean): void {
    this.validateBooleanOption(enableValidation, 'enableValidation');
  }

  /**
   * Validate keep alive
   */
  static validateKeepAlive(keepAlive: boolean): void {
    this.validateBooleanOption(keepAlive, 'keepAlive');
  }
}
