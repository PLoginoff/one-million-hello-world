/**
 * Handler Layer Types
 * 
 * Type definitions for business logic handlers and operation orchestration.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import { ParsedQuery } from '../../query-parser/types/query-parser-types';

/**
 * Handler operation type
 */
export enum HandlerOperation {
  FIND = 'FIND',
  FIND_BY_ID = 'FIND_BY_ID',
  FIND_ONE = 'FIND_ONE',
  SAVE = 'SAVE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  DELETE_MANY = 'DELETE_MANY',
  COUNT = 'COUNT',
  EXISTS = 'EXISTS',
  AGGREGATE = 'AGGREGATE',
  BULK_SAVE = 'BULK_SAVE',
  BULK_DELETE = 'BULK_DELETE',
}

/**
 * Handler context
 */
export interface HandlerContext {
  operation: HandlerOperation;
  timestamp: Date;
  requestId: string;
  userId?: string;
  metadata: Record<string, unknown>;
  state: Map<string, unknown>;
}

/**
 * Handler result
 */
export interface HandlerResult<T> {
  success: boolean;
  data?: T;
  error?: HandlerError;
  metrics: HandlerMetrics;
  metadata: Record<string, unknown>;
}

/**
 * Handler error
 */
export interface HandlerError {
  code: string;
  message: string;
  operation: HandlerOperation;
  retryable: boolean;
  details?: Record<string, unknown>;
  innerError?: Error;
}

/**
 * Handler metrics
 */
export interface HandlerMetrics {
  executionTime: number;
  cacheHitRate: number;
  databaseCalls: number;
  validationTime: number;
  middlewareTime: number;
  memoryUsage: number;
}

/**
 * Handler configuration
 */
export interface HandlerConfig {
  enableMetrics: boolean;
  enableValidation: boolean;
  enableCaching: boolean;
  enableTransactions: boolean;
  enableRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
}

/**
 * Handler statistics
 */
export interface HandlerStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  retriedOperations: number;
  averageExecutionTime: number;
  operationCounts: Map<HandlerOperation, number>;
}

/**
 * Operation handler
 */
export interface OperationHandler<T extends DomainEntity> {
  operation: HandlerOperation;
  canHandle(operation: HandlerOperation): boolean;
  handle(context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;
}

/**
 * Handler pipeline
 */
export interface HandlerPipeline<T extends DomainEntity> {
  handlers: OperationHandler<T>[];
  preHandlers: OperationHandler<T>[];
  postHandlers: OperationHandler<T>[];
  execute(context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: HandlerError }>;
  totalCount: number;
  successCount: number;
  failureCount: number;
}
