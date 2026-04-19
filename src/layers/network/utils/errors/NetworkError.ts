/**
 * Network Error
 * 
 * Base error class for network-related errors.
 */

export enum NetworkErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  INVALID_ENDPOINT = 'INVALID_ENDPOINT',
  INVALID_CONFIG = 'INVALID_CONFIG',
  POOL_EXHAUSTED = 'POOL_EXHAUSTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BANDWIDTH_EXCEEDED = 'BANDWIDTH_EXCEEDED',
  SSL_ERROR = 'SSL_ERROR',
  DNS_ERROR = 'DNS_ERROR',
  NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE',
}

export class NetworkError extends Error {
  readonly code: NetworkErrorCode;
  readonly connectionId?: string;
  readonly endpoint?: string;
  readonly timestamp: number;
  readonly retryable: boolean;

  constructor(
    code: NetworkErrorCode,
    message: string,
    connectionId?: string,
    endpoint?: string,
    retryable: boolean = true,
  ) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.connectionId = connectionId;
    this.endpoint = endpoint;
    this.timestamp = Date.now();
    this.retryable = retryable;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  /**
   * Create connection failed error
   */
  static connectionFailed(
    message: string,
    connectionId?: string,
    endpoint?: string,
  ): NetworkError {
    return new NetworkError(
      NetworkErrorCode.CONNECTION_FAILED,
      message,
      connectionId,
      endpoint,
      true,
    );
  }

  /**
   * Create connection timeout error
   */
  static connectionTimeout(
    message: string,
    connectionId?: string,
    endpoint?: string,
  ): NetworkError {
    return new NetworkError(
      NetworkErrorCode.CONNECTION_TIMEOUT,
      message,
      connectionId,
      endpoint,
      true,
    );
  }

  /**
   * Create connection refused error
   */
  static connectionRefused(
    message: string,
    connectionId?: string,
    endpoint?: string,
  ): NetworkError {
    return new NetworkError(
      NetworkErrorCode.CONNECTION_REFUSED,
      message,
      connectionId,
      endpoint,
      false,
    );
  }

  /**
   * Create invalid endpoint error
   */
  static invalidEndpoint(message: string, endpoint?: string): NetworkError {
    return new NetworkError(
      NetworkErrorCode.INVALID_ENDPOINT,
      message,
      undefined,
      endpoint,
      false,
    );
  }

  /**
   * Create invalid config error
   */
  static invalidConfig(message: string): NetworkError {
    return new NetworkError(
      NetworkErrorCode.INVALID_CONFIG,
      message,
      undefined,
      undefined,
      false,
    );
  }

  /**
   * Create pool exhausted error
   */
  static poolExhausted(message: string): NetworkError {
    return new NetworkError(
      NetworkErrorCode.POOL_EXHAUSTED,
      message,
      undefined,
      undefined,
      true,
    );
  }

  /**
   * Create SSL error
   */
  static sslError(
    message: string,
    connectionId?: string,
    endpoint?: string,
  ): NetworkError {
    return new NetworkError(
      NetworkErrorCode.SSL_ERROR,
      message,
      connectionId,
      endpoint,
      false,
    );
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Get error details
   */
  getDetails(): {
    code: NetworkErrorCode;
    message: string;
    connectionId?: string;
    endpoint?: string;
    timestamp: number;
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      connectionId: this.connectionId,
      endpoint: this.endpoint,
      timestamp: this.timestamp,
      retryable: this.retryable,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      connectionId: this.connectionId,
      endpoint: this.endpoint,
      timestamp: this.timestamp,
      retryable: this.retryable,
    };
  }
}
