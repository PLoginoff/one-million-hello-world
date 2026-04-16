/**
 * Pagination Engine Layer Types
 * 
 * Type definitions for applying pagination to data collections.
 */

import { ParsedPagination } from '../../query-parser/types/query-parser-types';

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMetadata;
  error?: PaginationError;
}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  total: number;
  limit: number;
  offset: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Pagination error
 */
export interface PaginationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  defaultLimit: number;
  maxLimit: number;
  enableCursorPagination: boolean;
  enableOffsetPagination: boolean;
}

/**
 * Cursor information
 */
export interface CursorInfo {
  value: string;
  field: string;
  direction: 'FORWARD' | 'BACKWARD';
}

/**
 * Page information
 */
export interface PageInfo {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Pagination statistics
 */
export interface PaginationStats {
  totalPaginations: number;
  averagePageSize: number;
  averageExecutionTime: number;
}
