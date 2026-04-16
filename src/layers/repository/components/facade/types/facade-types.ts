/**
 * Facade Layer Types
 * 
 * Type definitions for the repository facade that provides a unified interface.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import { ParsedQuery } from '../../query-parser/types/query-parser-types';
import { HandlerResult } from '../../handler/types/handler-types';

/**
 * Repository facade configuration
 */
export interface RepositoryFacadeConfig {
  enableCaching: boolean;
  enableMetrics: boolean;
  enableValidation: boolean;
  enableTransactions: boolean;
  enableMiddleware: boolean;
  defaultTimeout: number;
  maxConnections: number;
}

/**
 * Repository facade result
 */
export interface RepositoryFacadeResult<T> {
  success: boolean;
  data?: T;
  error?: FacadeError;
  metadata: FacadeMetadata;
}

/**
 * Facade error
 */
export interface FacadeError {
  code: string;
  message: string;
  layer: string;
  details?: Record<string, unknown>;
  innerError?: Error;
}

/**
 * Facade metadata
 */
export interface FacadeMetadata {
  executionTime: number;
  cacheHit: boolean;
  transactionUsed: boolean;
  layersExecuted: string[];
  metrics: Record<string, number>;
}

/**
 * Query options for facade
 */
export interface FacadeQueryOptions {
  query?: ParsedQuery;
  timeout?: number;
  useCache?: boolean;
  useTransaction?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Bulk operation options
 */
export interface BulkOperationOptions {
  batchSize: number;
  continueOnError: boolean;
  useTransaction: boolean;
}

/**
 * Repository facade statistics
 */
export interface RepositoryFacadeStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  cacheHitRate: number;
  transactionRate: number;
  layerExecutionCounts: Map<string, number>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  layers: Map<string, LayerHealth>;
  overallStatus: HealthStatus;
}

/**
 * Layer health
 */
export interface LayerHealth {
  status: HealthStatus;
  message: string;
  lastCheck: Date;
  metrics: Record<string, number>;
}

/**
 * Health status
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN',
}
