/**
 * Default Network Configurations
 * 
 * Pre-configured settings for common network scenarios.
 */

import { ConnectionPriorityEnum } from '../../domain/value-objects/ConnectionPriority';
import { ConnectionTypeEnum } from '../../domain/value-objects/ConnectionType';

export interface NetworkConfigOptions {
  maxConnections: number;
  defaultTimeout: number;
  keepAlive: boolean;
  keepAliveInitialDelay: number;
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  priority: ConnectionPriorityEnum;
  connectionType: ConnectionTypeEnum;
  enableCompression: boolean;
  enableEncryption: boolean;
  bandwidthLimit: number;
  enableMetrics: boolean;
  enableLogging: boolean;
}

export const DefaultConfigs = {
  /**
   * Default configuration for general use
   */
  DEFAULT: {
    maxConnections: 100,
    defaultTimeout: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 1000,
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    priority: ConnectionPriorityEnum.NORMAL,
    connectionType: ConnectionTypeEnum.TCP,
    enableCompression: false,
    enableEncryption: false,
    bandwidthLimit: 0,
    enableMetrics: true,
    enableLogging: true,
  } as NetworkConfigOptions,

  /**
   * High-performance configuration
   */
  HIGH_PERFORMANCE: {
    maxConnections: 1000,
    defaultTimeout: 10000,
    keepAlive: true,
    keepAliveInitialDelay: 500,
    maxRetries: 1,
    retryDelay: 500,
    backoffMultiplier: 1.5,
    priority: ConnectionPriorityEnum.HIGH,
    connectionType: ConnectionTypeEnum.TCP,
    enableCompression: true,
    enableEncryption: false,
    bandwidthLimit: 1024 * 1024 * 100, // 100 MB/s
    enableMetrics: true,
    enableLogging: false,
  } as NetworkConfigOptions,

  /**
   * Secure configuration with TLS
   */
  SECURE: {
    maxConnections: 50,
    defaultTimeout: 60000,
    keepAlive: true,
    keepAliveInitialDelay: 2000,
    maxRetries: 5,
    retryDelay: 2000,
    backoffMultiplier: 2,
    priority: ConnectionPriorityEnum.HIGH,
    connectionType: ConnectionTypeEnum.TLS,
    enableCompression: true,
    enableEncryption: true,
    bandwidthLimit: 1024 * 1024 * 10, // 10 MB/s
    enableMetrics: true,
    enableLogging: true,
  } as NetworkConfigOptions,

  /**
   * Development configuration
   */
  DEVELOPMENT: {
    maxConnections: 10,
    defaultTimeout: 5000,
    keepAlive: false,
    keepAliveInitialDelay: 0,
    maxRetries: 0,
    retryDelay: 0,
    backoffMultiplier: 1,
    priority: ConnectionPriorityEnum.LOW,
    connectionType: ConnectionTypeEnum.TCP,
    enableCompression: false,
    enableEncryption: false,
    bandwidthLimit: 0,
    enableMetrics: true,
    enableLogging: true,
  } as NetworkConfigOptions,

  /**
   * Production configuration
   */
  PRODUCTION: {
    maxConnections: 500,
    defaultTimeout: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 1000,
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    priority: ConnectionPriorityEnum.NORMAL,
    connectionType: ConnectionTypeEnum.TLS,
    enableCompression: true,
    enableEncryption: true,
    bandwidthLimit: 1024 * 1024 * 50, // 50 MB/s
    enableMetrics: true,
    enableLogging: true,
  } as NetworkConfigOptions,
};
