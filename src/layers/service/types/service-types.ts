/**
 * Service Layer Types
 * 
 * This module defines all type definitions for the Service Layer,
 * including business logic, use cases, and domain operations.
 */

/**
 * Service operation result
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}

/**
 * Service error
 */
export interface ServiceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Service context
 */
export interface ServiceContext {
  userId?: string;
  correlationId: string;
  requestId: string;
  timestamp: Date;
}

/**
 * Use case definition
 */
export interface UseCase<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  enableCaching: boolean;
  cacheTimeout: number;
  enableRetry: boolean;
  maxRetries: number;
}
