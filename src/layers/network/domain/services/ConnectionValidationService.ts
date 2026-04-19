/**
 * Connection Validation Service
 * 
 * Domain service for validating network connection parameters.
 */

import { NetworkEndpoint } from '../entities/NetworkEndpoint';
import { ConnectionType } from '../value-objects/ConnectionType';
import { ConnectionState } from '../value-objects/ConnectionState';
import { BandwidthLimit } from '../value-objects/BandwidthLimit';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConnectionValidationService {
  /**
   * Validate network endpoint
   */
  static validateEndpoint(endpoint: NetworkEndpoint): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!endpoint.isValid()) {
      errors.push('Invalid endpoint configuration');
    }

    if (endpoint.isLocalhost()) {
      warnings.push('Connecting to localhost may not be suitable for production');
    }

    if (endpoint.getPort() < 1024 && !endpoint.isLocalhost()) {
      warnings.push('Using privileged port (< 1024) may require elevated permissions');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate connection type
   */
  static validateConnectionType(
    connectionType: ConnectionType,
    endpoint: NetworkEndpoint,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (connectionType.isSecureConnection() && !endpoint.isSecure()) {
      warnings.push('Connection type is secure but endpoint is not configured for TLS');
    }

    if (!connectionType.isSecureConnection() && endpoint.isSecure()) {
      warnings.push('Endpoint is configured for secure connection but connection type is not');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate connection state transition
   */
  static validateStateTransition(
    from: ConnectionState,
    to: ConnectionState,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!from.canTransitionTo(to.value)) {
      errors.push(
        `Invalid state transition from ${from.toString()} to ${to.toString()}`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate bandwidth limit
   */
  static validateBandwidthLimit(limit: BandwidthLimit): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (limit.isEnabled()) {
      if (limit.getMaxBytesPerSecond() < 1024) {
        warnings.push('Bandwidth limit is very low (< 1KB/s), may affect performance');
      }

      if (limit.getBucketSize() < limit.getMaxBytesPerSecond()) {
        warnings.push('Bucket size is smaller than max bytes per second');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate connection timeout
   */
  static validateTimeout(timeout: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (timeout < 0) {
      errors.push('Timeout cannot be negative');
    }

    if (timeout === 0) {
      warnings.push('Zero timeout means no timeout, connection may hang indefinitely');
    }

    if (timeout < 1000) {
      warnings.push('Timeout is very low (< 1s), may cause premature disconnections');
    }

    if (timeout > 300000) {
      warnings.push('Timeout is very high (> 5min), may delay error detection');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate max connections
   */
  static validateMaxConnections(max: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (max < 1) {
      errors.push('Max connections must be at least 1');
    }

    if (max > 100000) {
      warnings.push('Max connections is very high (> 100k), may cause resource exhaustion');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate keep-alive settings
   */
  static validateKeepAlive(
    keepAlive: boolean,
    keepAliveInitialDelay: number,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (keepAlive && keepAliveInitialDelay < 0) {
      errors.push('Keep-alive initial delay cannot be negative');
    }

    if (keepAlive && keepAliveInitialDelay > 60000) {
      warnings.push('Keep-alive initial delay is very high (> 60s)');
    }

    if (!keepAlive && keepAliveInitialDelay > 0) {
      warnings.push('Keep-alive initial delay is set but keep-alive is disabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate host address
   */
  static validateHost(host: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!host || host.length === 0) {
      errors.push('Host cannot be empty');
    }

    if (host.length > 253) {
      errors.push('Host cannot exceed 253 characters');
    }

    const ipv6Pattern = /^\[([a-fA-F0-9:]+)\]$/;
    if (ipv6Pattern.test(host)) {
      warnings.push('IPv6 address detected, ensure proper formatting');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate port number
   */
  static validatePort(port: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isInteger(port)) {
      errors.push('Port must be an integer');
    }

    if (port < 0 || port > 65535) {
      errors.push('Port must be between 0 and 65535');
    }

    if (port === 0) {
      warnings.push('Port 0 means system-assigned port, actual port may vary');
    }

    if (port < 1024) {
      warnings.push('Port is in privileged range (< 1024), may require elevated permissions');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
